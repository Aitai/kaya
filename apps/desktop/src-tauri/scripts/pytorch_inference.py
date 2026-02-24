#!/usr/bin/env python3
"""PyTorch GPU inference sidecar for Kaya.

Communicates via JSON lines over stdin/stdout.
Loads ONNX models via onnx2torch, runs inference on GPU via PyTorch ROCm/CUDA.

Protocol:
  Request:  {"cmd": "init", "model_path": "...", "batch_size": 8}
  Response: {"ok": true, "provider": "pytorch-rocm", "device": "...", "fp16": true}
  
  Request:  {"cmd": "infer", "bin_input": "<base64>", "global_input": "<base64>", "batch_size": 1}
  Response: {"ok": true, "policy": "<base64>", "value": "<base64>", "miscvalue": "<base64>", "ownership": "<base64>", "policy_dims": [...]}
  
  Request:  {"cmd": "dispose"}
  Response: {"ok": true}
  
  Request:  {"cmd": "benchmark", "iterations": 20}
  Response: {"ok": true, "single_ms": 5.2, "batch8_ms": 12.1}
"""

import sys
import json
import base64
import struct
import time
import os
import warnings

warnings.filterwarnings("ignore")

# Redirect stderr to avoid polluting the JSON protocol
_original_stderr = sys.stderr


def log(msg):
    """Log to stderr (not captured by Rust)."""
    print(f"[pytorch] {msg}", file=_original_stderr, flush=True)


def send(obj):
    """Send a JSON response."""
    print(json.dumps(obj), flush=True)


def encode_floats(data):
    """Encode float array as base64."""
    return base64.b64encode(struct.pack(f"{len(data)}f", *data)).decode()


def decode_floats(b64_str):
    """Decode base64 to float array."""
    raw = base64.b64decode(b64_str)
    return list(struct.unpack(f"{len(raw) // 4}f", raw))


def fix_same_upper_padding(model_path, output_path):
    """Fix SAME_UPPER auto_pad in ONNX model for onnx2torch compatibility."""
    import onnx

    model = onnx.load(model_path)
    fixed = 0
    for node in model.graph.node:
        if node.op_type in ("Conv", "AveragePool"):
            for attr in node.attribute:
                if attr.name == "auto_pad" and attr.s == b"SAME_UPPER":
                    attr.s = b"NOTSET"
                    kernel = [
                        a.ints for a in node.attribute if a.name == "kernel_shape"
                    ]
                    if kernel:
                        k = kernel[0]
                        pad = [(k[i] - 1) // 2 for i in range(len(k))]
                        pads = pad + pad
                        has_pads = False
                        for a in node.attribute:
                            if a.name == "pads":
                                a.ints[:] = pads
                                has_pads = True
                        if not has_pads:
                            node.attribute.append(
                                onnx.helper.make_attribute("pads", pads)
                            )
                    fixed += 1
    onnx.save(model, output_path)
    return fixed


class PyTorchEngine:
    def __init__(self):
        self.model = None
        self.device = None
        self.fp16 = False
        self.dtype = None

    def init(self, model_path, batch_size=8):
        import torch
        import onnx2torch

        # Determine device
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
            gpu_name = torch.cuda.get_device_name(0)
            hip_version = getattr(torch.version, "hip", None)
            if hip_version:
                provider = "pytorch-rocm"
            else:
                provider = "pytorch-cuda"
        else:
            self.device = torch.device("cpu")
            gpu_name = "CPU"
            provider = "pytorch-cpu"

        log(f"Using device: {self.device} ({gpu_name})")

        # Fix SAME_UPPER padding
        fixed_path = os.path.join(
            os.path.dirname(model_path), f".kaya_fixed_{os.path.basename(model_path)}"
        )
        if not os.path.exists(fixed_path):
            n = fix_same_upper_padding(model_path, fixed_path)
            log(f"Fixed {n} SAME_UPPER padding nodes")
        else:
            log(f"Using cached fixed model: {fixed_path}")

        # Detect if FP16 model
        import onnx

        onnx_model = onnx.load(fixed_path, load_external_data=False)
        input_type = onnx_model.graph.input[0].type.tensor_type.elem_type
        self.fp16 = input_type == onnx.TensorProto.FLOAT16

        # Convert to PyTorch
        log(f"Converting ONNX model (fp16={self.fp16})...")
        t0 = time.time()
        self.model = onnx2torch.convert(fixed_path)
        self.model = self.model.to(self.device).eval()

        if self.fp16:
            self.dtype = torch.float16
        else:
            self.dtype = torch.float32

        log(f"Model loaded in {time.time() - t0:.1f}s")

        # Warmup
        with torch.no_grad():
            b = torch.zeros(1, 22, 19, 19, device=self.device, dtype=self.dtype)
            g = torch.zeros(1, 19, device=self.device, dtype=self.dtype)
            for _ in range(3):
                self.model(b, g)
            if torch.cuda.is_available():
                torch.cuda.synchronize()

        log("Warmup complete")

        total_params = sum(p.numel() for p in self.model.parameters())
        return {
            "ok": True,
            "provider": provider,
            "device": gpu_name,
            "fp16": self.fp16,
            "params": total_params,
        }

    def infer(self, bin_input_b64, global_input_b64, batch_size):
        import torch

        # Decode inputs
        bin_data = decode_floats(bin_input_b64)
        global_data = decode_floats(global_input_b64)

        bin_tensor = torch.tensor(
            bin_data, dtype=self.dtype, device=self.device
        ).reshape(batch_size, 22, 19, 19)
        global_tensor = torch.tensor(
            global_data, dtype=self.dtype, device=self.device
        ).reshape(batch_size, 19)

        with torch.no_grad():
            outputs = self.model(bin_tensor, global_tensor)

        if torch.cuda.is_available():
            torch.cuda.synchronize()

        # Extract outputs (model returns a tuple of tensors)
        if isinstance(outputs, (list, tuple)):
            # KataGo model outputs: policy, value, miscvalue, moremiscvalue, ownership, ...
            result = {}
            output_names = [
                "policy",
                "value",
                "miscvalue",
                "moremiscvalue",
                "ownership",
            ]
            for i, name in enumerate(output_names):
                if i < len(outputs):
                    t = outputs[i].float().cpu()
                    result[name] = encode_floats(t.flatten().tolist())
                    if name == "policy":
                        result["policy_dims"] = list(t.shape)
            return {"ok": True, **result}
        else:
            # Single output
            t = outputs.float().cpu()
            return {"ok": True, "output": encode_floats(t.flatten().tolist())}

    def benchmark(self, iterations=20):
        import torch

        if self.model is None:
            return {"ok": False, "error": "Model not loaded"}

        results = {}

        with torch.no_grad():
            # Single inference
            b = torch.zeros(1, 22, 19, 19, device=self.device, dtype=self.dtype)
            g = torch.zeros(1, 19, device=self.device, dtype=self.dtype)
            for _ in range(5):
                self.model(b, g)
            if torch.cuda.is_available():
                torch.cuda.synchronize()

            times = []
            for _ in range(iterations):
                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                t0 = time.time()
                self.model(b, g)
                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                times.append((time.time() - t0) * 1000)
            results["single_ms"] = sum(times) / len(times)

            # Batch-8
            b8 = torch.zeros(8, 22, 19, 19, device=self.device, dtype=self.dtype)
            g8 = torch.zeros(8, 19, device=self.device, dtype=self.dtype)
            for _ in range(3):
                self.model(b8, g8)
            if torch.cuda.is_available():
                torch.cuda.synchronize()

            times = []
            for _ in range(iterations):
                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                t0 = time.time()
                self.model(b8, g8)
                if torch.cuda.is_available():
                    torch.cuda.synchronize()
                times.append((time.time() - t0) * 1000)
            results["batch8_ms"] = sum(times) / len(times)
            results["batch8_per_inf_ms"] = results["batch8_ms"] / 8
            results["batch8_inf_s"] = 8000 / results["batch8_ms"]

        results["ok"] = True
        return results

    def dispose(self):
        import torch

        self.model = None
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return {"ok": True}


def main():
    engine = PyTorchEngine()

    log("Ready, waiting for commands...")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            send({"ok": False, "error": f"Invalid JSON: {e}"})
            continue

        cmd = req.get("cmd")

        try:
            if cmd == "init":
                result = engine.init(
                    req["model_path"], req.get("batch_size", 8)
                )
                send(result)
            elif cmd == "infer":
                result = engine.infer(
                    req["bin_input"],
                    req["global_input"],
                    req.get("batch_size", 1),
                )
                send(result)
            elif cmd == "benchmark":
                result = engine.benchmark(req.get("iterations", 20))
                send(result)
            elif cmd == "dispose":
                result = engine.dispose()
                send(result)
            elif cmd == "ping":
                send({"ok": True, "pong": True})
            else:
                send({"ok": False, "error": f"Unknown command: {cmd}"})
        except Exception as e:
            log(f"Error handling {cmd}: {e}")
            import traceback

            traceback.print_exc(file=_original_stderr)
            send({"ok": False, "error": str(e)})


if __name__ == "__main__":
    main()

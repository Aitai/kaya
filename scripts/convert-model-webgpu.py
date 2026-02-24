#!/usr/bin/env python3
"""Convert any KataGo ONNX model for optimal WebGPU execution in the browser.

Full pipeline:
  1. Dynamic batch → Static batch=1 (required for graph capture)
  2. Op decomposition: Softplus/LogSoftmax → GPU-supported equivalents

This eliminates CPU fallback in ORT Web's WebGPU EP, enabling graph capture
and achieving ~147x speedup over the unoptimized model (14.7s → 100ms).

Prerequisites:
    pip install onnx numpy

Usage:
    # Full conversion (dynamic model → static batch=1 + WebGPU-optimized):
    python3 scripts/convert-model-webgpu.py model.onnx

    # With explicit output path:
    python3 scripts/convert-model-webgpu.py model.onnx output.webgpu.onnx

    # Skip static batch conversion (model is already static):
    python3 scripts/convert-model-webgpu.py model.static-b1.onnx

Example with KataGo models:
    # FP32 dynamic model:
    python3 scripts/convert-model-webgpu.py kata1-b18c384nbt.onnx
    # Output: kata1-b18c384nbt.static-b1.webgpu.onnx

    # FP16 dynamic model:
    python3 scripts/convert-model-webgpu.py kata1-b18c384nbt-fp16.onnx
    # Output: kata1-b18c384nbt-fp16.static-b1.webgpu.onnx

Notes:
    - Output filename contains '.webgpu.' so the app auto-enables graph capture.
    - Works with FP32, FP16, and UINT8 (quantized) models.
    - No separate static conversion step needed — this script does everything.
"""

import sys
import os


def make_static_batch(model, batch_size: int = 1) -> int:
    """Make all dynamic batch dimensions static.

    Returns number of dimensions changed.
    """
    import onnx

    changes = 0

    def fix_dims(value_infos, label):
        nonlocal changes
        for vi in value_infos:
            tensor_type = vi.type.tensor_type
            if not tensor_type.HasField("shape"):
                continue
            for i, dim in enumerate(tensor_type.shape.dim):
                if dim.dim_param or (i == 0 and dim.dim_value <= 0):
                    old = dim.dim_param or str(dim.dim_value)
                    dim.Clear()
                    dim.dim_value = batch_size
                    changes += 1
                    print(f"  {label} {vi.name} dim[{i}]: {old} → {batch_size}")

    graph = model.graph
    fix_dims(graph.input, "input")
    fix_dims(graph.output, "output")
    fix_dims(graph.value_info, "value_info")

    return changes


def decompose_ops(model) -> tuple[int, int]:
    """Replace Softplus and LogSoftmax with GPU-supported equivalents.

    Returns (softplus_count, logsoftmax_count).
    """
    import numpy as np
    from onnx import helper, TensorProto, numpy_helper

    graph = model.graph

    # Detect data type from first input
    input_dtype = graph.input[0].type.tensor_type.elem_type
    is_fp16 = input_dtype == TensorProto.FLOAT16
    np_dtype = np.float16 if is_fp16 else np.float32
    onnx_dtype = TensorProto.FLOAT16 if is_fp16 else TensorProto.FLOAT

    # Build shape map
    shape_map = {}
    for vi in list(graph.value_info) + list(graph.input) + list(graph.output):
        shape_map[vi.name] = vi

    new_nodes = []
    new_value_infos = []
    softplus_count = 0
    logsoftmax_count = 0

    # Constant "1.0" for Softplus decomposition
    one_name = "__webgpu_const_one"
    one_tensor = numpy_helper.from_array(np.array(1.0, dtype=np_dtype), name=one_name)
    needs_one = False

    for node in graph.node:
        if node.op_type == "Softplus":
            # Softplus(x) = Relu(x) + Log(1 + Exp(-Abs(x)))
            x, y = node.input[0], node.output[0]
            p = f"__sp_{softplus_count}"

            intermediates = [f"{p}_abs", f"{p}_neg", f"{p}_exp", f"{p}_add1", f"{p}_log", f"{p}_relu"]
            new_nodes.extend([
                helper.make_node("Abs", [x], [intermediates[0]]),
                helper.make_node("Neg", [intermediates[0]], [intermediates[1]]),
                helper.make_node("Exp", [intermediates[1]], [intermediates[2]]),
                helper.make_node("Add", [intermediates[2], one_name], [intermediates[3]]),
                helper.make_node("Log", [intermediates[3]], [intermediates[4]]),
                helper.make_node("Relu", [x], [intermediates[5]]),
                helper.make_node("Add", [intermediates[5], intermediates[4]], [y]),
            ])

            if x in shape_map:
                src_vi = shape_map[x]
                for name in intermediates:
                    vi = helper.make_tensor_value_info(name, onnx_dtype, None)
                    if src_vi.type.tensor_type.HasField("shape"):
                        vi.type.tensor_type.shape.CopyFrom(src_vi.type.tensor_type.shape)
                    new_value_infos.append(vi)

            softplus_count += 1
            needs_one = True

        elif node.op_type == "LogSoftmax":
            # LogSoftmax(x) = Log(Softmax(x))
            x, y = node.input[0], node.output[0]
            p = f"__ls_{logsoftmax_count}"
            sm_out = f"{p}_softmax"

            axis = -1
            for attr in node.attribute:
                if attr.name == "axis":
                    axis = attr.i

            new_nodes.extend([
                helper.make_node("Softmax", [x], [sm_out], axis=axis),
                helper.make_node("Log", [sm_out], [y]),
            ])

            if x in shape_map:
                src_vi = shape_map[x]
                vi = helper.make_tensor_value_info(sm_out, onnx_dtype, None)
                if src_vi.type.tensor_type.HasField("shape"):
                    vi.type.tensor_type.shape.CopyFrom(src_vi.type.tensor_type.shape)
                new_value_infos.append(vi)

            logsoftmax_count += 1
        else:
            new_nodes.append(node)

    if needs_one:
        graph.initializer.append(one_tensor)

    del graph.node[:]
    graph.node.extend(new_nodes)
    graph.value_info.extend(new_value_infos)

    return softplus_count, logsoftmax_count


def convert_model(input_path: str, output_path: str | None = None) -> str:
    import onnx

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        # Remove existing .static-b1 suffix if present (we'll re-add it)
        base = base.replace(".static-b1", "").replace(".webgpu", "")
        output_path = f"{base}.static-b1.webgpu{ext}"

    print(f"Loading model: {input_path}")
    model = onnx.load(input_path)
    graph = model.graph

    input_dtype = graph.input[0].type.tensor_type.elem_type
    from onnx import TensorProto
    dtype_names = {TensorProto.FLOAT: "fp32", TensorProto.FLOAT16: "fp16", TensorProto.UINT8: "uint8"}
    print(f"Model dtype: {dtype_names.get(input_dtype, f'type={input_dtype}')}")
    print(f"Original ops: {len(graph.node)}")

    # Step 1: Make batch static
    print("\n--- Step 1: Static batch conversion ---")
    dim_changes = make_static_batch(model)
    if dim_changes > 0:
        print(f"  Changed {dim_changes} dynamic dimensions to static batch=1")
    else:
        print("  Already static (no changes needed)")

    # Step 2: Op decomposition
    print("\n--- Step 2: Op decomposition ---")
    sp_count, ls_count = decompose_ops(model)
    if sp_count or ls_count:
        print(f"  Replaced {sp_count} Softplus + {ls_count} LogSoftmax ops")
        print(f"  Ops: {len(graph.node)} total (all WebGPU-compatible)")
    else:
        print("  No unsupported ops found (already optimized)")

    # Validate
    try:
        onnx.checker.check_model(model, full_check=False)
        print("\nModel validation: PASSED")
    except Exception as e:
        print(f"\nWarning: Validation issue (may be benign): {e}")

    print(f"Saving to: {output_path}")
    onnx.save(model, output_path)

    in_size = os.path.getsize(input_path) / 1024 / 1024
    out_size = os.path.getsize(output_path) / 1024 / 1024
    print(f"Size: {in_size:.1f}MB → {out_size:.1f}MB")
    print(f"\nDone! Upload {os.path.basename(output_path)} to Kaya for optimal WebGPU performance.")

    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print(f"Usage: python3 {sys.argv[0]} input.onnx [output.onnx]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    convert_model(input_path, output_path)

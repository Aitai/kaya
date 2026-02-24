/**
 * ONNX Runtime Web engine for KataGo analysis
 *
 * Uses the 'all' bundle which has JSEP enabled for proper WebGPU support.
 * NOTE: Requires ort-wasm-simd-threaded.jsep.wasm + .mjs to be served from /wasm/
 */
import * as ort from 'onnxruntime-web/all';
import { GoBoard, type Sign, type SignMap } from '@kaya/goboard';
import {
  Engine,
  type BaseEngineConfig,
  type EngineAnalysisOptions,
  type EngineCapabilities,
  type EngineRuntimeInfo,
} from './base-engine';
import type { AnalysisResult, MoveSuggestion } from './types';

/** Node in the MCTS search tree */
interface MCTSNode {
  N: number; // visit count
  W: number; // cumulative value (sum of Black's winrate)
  P: number; // prior probability (from parent's NN policy)
  children: Map<string, MCTSNode> | null;
  expanded: boolean;
}

export interface OnnxEngineConfig extends BaseEngineConfig {
  /** ArrayBuffer of the ONNX model */
  modelBuffer?: ArrayBuffer;

  /** URL to the ONNX model */
  modelUrl?: string;

  /** Execution providers to try (default: ['webgpu', 'wasm']) */
  executionProviders?: string[];

  /** Number of threads for WASM backend (default: 4) */
  numThreads?: number;

  /** Path to WASM files (default: '/wasm/') */
  wasmPath?: string;

  /** Enable verbose debug logging */
  debug?: boolean;

  /**
   * Enable WebGPU graph capture for static-shape models.
   * Captures all GPU dispatches in the first run and replays them, eliminating per-op overhead.
   * Requires ALL model ops to run on WebGPU EP (use a WebGPU-converted model).
   */
  enableGraphCapture?: boolean;

  /**
   * Static batch size of the model (e.g., 1 for static-b1 models).
   * When set, inference will chunk inputs to this batch size.
   * Auto-detected from model metadata when possible.
   */
  staticBatchSize?: number;
}

export class OnnxEngine extends Engine {
  private session: ort.InferenceSession | null = null;
  private boardSize: number = 19;
  private debugEnabled = false;
  private usedProviders: string[] = [];
  private requestedProviders: string[] = [];
  private inputDataType: 'float32' | 'float16' = 'float32';
  private didFallback: boolean = false;
  private graphCaptureEnabled: boolean = false;
  private useGpuInputs: boolean = false;
  /** Max batch size for inference (1 for static/graph-capture models) */
  private maxInferenceBatch: number = Infinity;

  // Pre-allocated GPU buffers for graph capture mode
  // Using 'any' for WebGPU types to avoid @webgpu/types dependency
  private gpuDevice: any = null;
  private gpuBinBuffer: any = null;
  private gpuGlobalBuffer: any = null;
  private gpuBinTensor: ort.Tensor | null = null;
  private gpuGlobalTensor: ort.Tensor | null = null;

  constructor(config: OnnxEngineConfig = {}) {
    super(config);
    this.debugEnabled = Boolean(config.debug);
  }

  private debugLog(message: string, payload?: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    if (payload) {
      console.log('[OnnxEngine][debug]', message, payload);
    } else {
      console.log('[OnnxEngine][debug]', message);
    }
  }

  private validateTensorData(buffer: Float32Array, label: string): void {
    if (!this.debugEnabled) return;
    for (let i = 0; i < buffer.length; i++) {
      const value = buffer[i];
      if (!Number.isFinite(value)) {
        throw new Error(`[OnnxEngine] Invalid ${label} value at index ${i}: ${value}`);
      }
    }
  }

  /**
   * Convert Float32Array to Float16 (stored as Uint16Array).
   * Uses the standard IEEE 754 half-precision format.
   */
  private float32ToFloat16(float32Array: Float32Array): Uint16Array {
    const float16Array = new Uint16Array(float32Array.length);
    const view = new DataView(new ArrayBuffer(4));

    for (let i = 0; i < float32Array.length; i++) {
      const val = float32Array[i];
      view.setFloat32(0, val, true);
      const f32 = view.getUint32(0, true);

      // Extract components from float32
      const sign = (f32 >>> 31) & 0x1;
      const exp = (f32 >>> 23) & 0xff;
      const frac = f32 & 0x7fffff;

      let f16: number;
      if (exp === 0) {
        // Zero or denormalized - map to zero in fp16
        f16 = sign << 15;
      } else if (exp === 255) {
        // Infinity or NaN
        f16 = (sign << 15) | 0x7c00 | (frac ? 0x200 : 0);
      } else {
        // Normalized number
        const newExp = exp - 127 + 15;
        if (newExp >= 31) {
          // Overflow to infinity
          f16 = (sign << 15) | 0x7c00;
        } else if (newExp <= 0) {
          // Underflow to zero or denorm
          if (newExp >= -10) {
            // Denormalized
            const mant = (frac | 0x800000) >> (1 - newExp + 13);
            f16 = (sign << 15) | (mant >> 10);
          } else {
            f16 = sign << 15;
          }
        } else {
          // Normal case
          f16 = (sign << 15) | (newExp << 10) | (frac >> 13);
        }
      }
      float16Array[i] = f16;
    }
    return float16Array;
  }

  /**
   * Create an ONNX tensor with the appropriate data type for this model.
   */
  private createTensor(data: Float32Array, dims: readonly number[]): ort.Tensor {
    if (this.inputDataType === 'float16') {
      const float16Data = this.float32ToFloat16(data);
      return new ort.Tensor('float16', float16Data, dims);
    }
    return new ort.Tensor('float32', data, dims);
  }

  /**
   * Pre-allocate GPU buffers for graph capture mode.
   * Graph capture requires external GPU buffers for all inputs.
   */
  private async allocateGpuBuffers(): Promise<void> {
    // Get the WebGPU device from ORT
    const device = (ort.env as any).webgpu?.device;
    if (!device) {
      throw new Error('WebGPU device not available from ORT');
    }
    this.gpuDevice = device;

    const size = 19; // board size
    const batchSize = 1; // static batch=1 for graph capture
    const bytesPerElement = this.inputDataType === 'float16' ? 2 : 4;
    const dataType = this.inputDataType === 'float16' ? 'float16' : 'float32';

    // GPUBufferUsage flags: COPY_SRC=4, COPY_DST=8, STORAGE=128
    const bufferUsage = 4 | 8 | 128;

    // Round up to multiple of 4 bytes (WebGPU requirement)
    const align4 = (n: number) => Math.ceil(n / 4) * 4;

    // bin_input: [1, 22, 19, 19]
    const binSize = align4(batchSize * 22 * size * size * bytesPerElement);
    this.gpuBinBuffer = device.createBuffer({
      size: binSize,
      usage: bufferUsage,
    });
    this.gpuBinTensor = ort.Tensor.fromGpuBuffer(this.gpuBinBuffer, {
      dataType,
      dims: [batchSize, 22, size, size],
    });

    // global_input: [1, 19]
    const globalSize = align4(batchSize * 19 * bytesPerElement);
    this.gpuGlobalBuffer = device.createBuffer({
      size: globalSize,
      usage: bufferUsage,
    });
    this.gpuGlobalTensor = ort.Tensor.fromGpuBuffer(this.gpuGlobalBuffer, {
      dataType,
      dims: [batchSize, 19],
    });

    console.log('[OnnxEngine] GPU buffers allocated for graph capture');
  }

  /**
   * Upload CPU data to pre-allocated GPU buffers and return GPU tensors.
   */
  private uploadToGpu(
    binData: Float32Array | Uint16Array,
    globalData: Float32Array | Uint16Array
  ): { binTensor: ort.Tensor; globalTensor: ort.Tensor } {
    if (!this.gpuDevice || !this.gpuBinBuffer || !this.gpuGlobalBuffer) {
      throw new Error('GPU buffers not allocated');
    }

    // WebGPU writeBuffer requires byte size to be a multiple of 4.
    // For FP16, global_input is [1,19] × 2 bytes = 38 bytes — must pad to 40.
    const align4Write = (device: any, buffer: any, data: Float32Array | Uint16Array) => {
      const byteLen = data.byteLength;
      if (byteLen % 4 === 0) {
        device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, byteLen);
      } else {
        // Pad to 4-byte alignment
        const padded = new Uint8Array(Math.ceil(byteLen / 4) * 4);
        padded.set(new Uint8Array(data.buffer, data.byteOffset, byteLen));
        device.queue.writeBuffer(buffer, 0, padded.buffer, 0, padded.byteLength);
      }
    };

    align4Write(this.gpuDevice, this.gpuBinBuffer, binData);
    align4Write(this.gpuDevice, this.gpuGlobalBuffer, globalData);

    return {
      binTensor: this.gpuBinTensor!,
      globalTensor: this.gpuGlobalTensor!,
    };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = this.config as OnnxEngineConfig;

    try {
      // Check cross-origin isolation (required for SharedArrayBuffer/threads)
      const isCrossOriginIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;

      const numThreads = isCrossOriginIsolated
        ? config.numThreads ||
          Math.min(8, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4)
        : 1;

      this.debugLog('Initializing session', {
        requestedProviders: config.executionProviders,
        wasmPath: config.wasmPath,
        numThreads,
        crossOriginIsolated: isCrossOriginIsolated,
      });

      // Configure ONNX Runtime
      ort.env.wasm.numThreads = numThreads;
      ort.env.wasm.simd = true;
      ort.env.wasm.proxy = false;

      const wasmBasePath = config.wasmPath || '/wasm/';
      ort.env.wasm.wasmPaths = wasmBasePath;

      // Check WebGPU availability
      let webgpuAvailable = false;
      let webgpuAdapter: any = null;

      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          webgpuAdapter = await (navigator as any).gpu.requestAdapter({
            powerPreference: 'high-performance',
          });
          if (webgpuAdapter) {
            webgpuAvailable = true;
            // Pass adapter to ONNX Runtime
            // @ts-ignore
            ort.env.webgpu = ort.env.webgpu || {};
            // @ts-ignore
            ort.env.webgpu.adapter = webgpuAdapter;
            // @ts-ignore
            ort.env.webgpu.powerPreference = 'high-performance';
          }
        } catch {
          // WebGPU not available
        }
      }

      // Disable debug logging
      ort.env.debug = false;
      ort.env.logLevel = 'warning';

      // Build provider list (may include objects for WebNN config)
      let providers = config.executionProviders || ['webgpu', 'wasm'];
      providers = providers.filter(p => {
        const name = typeof p === 'string' ? p : (p as any).name;
        return name !== 'webgl'; // WebGL doesn't work in workers
      });

      // Store the originally requested providers for fallback detection
      this.requestedProviders = providers.map(p => (typeof p === 'string' ? p : (p as any).name));

      const hasWebgpu = this.requestedProviders.includes('webgpu');
      const hasWebnn = this.requestedProviders.includes('webnn');

      if (!webgpuAvailable) {
        providers = providers.filter(p => {
          const name = typeof p === 'string' ? p : (p as any).name;
          return name !== 'webgpu';
        });
      }

      // Check WebNN availability (Chrome only)
      if (hasWebnn && typeof navigator !== 'undefined' && !('ml' in navigator)) {
        providers = providers.filter(p => {
          const name = typeof p === 'string' ? p : (p as any).name;
          return name !== 'webnn';
        });
      }

      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
        logSeverityLevel: 2,
        intraOpNumThreads: numThreads,
        interOpNumThreads: numThreads,
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: 'sequential',
      };

      // WebGPU optimization: keep outputs on GPU + enable graph capture
      const effectiveProviders = providers.map(p => (typeof p === 'string' ? p : (p as any).name));
      if (effectiveProviders.includes('webgpu')) {
        sessionOptions.preferredOutputLocation = 'gpu-buffer';
        if (config.enableGraphCapture) {
          (sessionOptions as any).enableGraphCapture = true;
          this.graphCaptureEnabled = true;
          this.useGpuInputs = true;
          console.log('[OnnxEngine] Graph capture enabled for WebGPU');
        }
      }

      const createStart = performance.now();
      let usedProviderNames = [...effectiveProviders];

      const createSession = async (opts: ort.InferenceSession.SessionOptions) => {
        if (config.modelBuffer) {
          return await ort.InferenceSession.create(config.modelBuffer, opts);
        } else if (config.modelUrl) {
          return await ort.InferenceSession.create(config.modelUrl, opts);
        }
        throw new Error('No model provided');
      };

      try {
        this.session = await createSession(sessionOptions);
      } catch (initialError) {
        // Fallback: remove GPU providers and retry with WASM only
        const gpuProviders = ['webgpu', 'webnn'];
        const hasGpu = effectiveProviders.some(p => gpuProviders.includes(p));
        if (hasGpu && effectiveProviders.length > 1) {
          const failedGpu = effectiveProviders.filter(p => gpuProviders.includes(p)).join('+');
          console.warn(`[OnnxEngine] ${failedGpu} failed, falling back to WASM`);
          usedProviderNames = effectiveProviders.filter(p => !gpuProviders.includes(p));
          if (usedProviderNames.length === 0) usedProviderNames = ['wasm'];
          this.didFallback = true;
          this.graphCaptureEnabled = false;
          this.useGpuInputs = false;
          this.session = await createSession({
            ...sessionOptions,
            executionProviders: usedProviderNames,
            enableGraphCapture: false,
            preferredOutputLocation: undefined,
          } as any);
        } else {
          throw initialError;
        }
      }

      const createTime = performance.now() - createStart;
      this.initialized = true;
      this.usedProviders = usedProviderNames;

      // Detect static batch size from model input shapes
      if (config.staticBatchSize && config.staticBatchSize > 0) {
        this.maxInferenceBatch = config.staticBatchSize;
        console.log(`[OnnxEngine] Static batch size from config: ${this.maxInferenceBatch}`);
      } else {
        try {
          const handler = (this.session as any).handler;
          if (handler?.inputMetadata) {
            const binMeta = handler.inputMetadata.find(
              (m: any) => m.name === 'bin_input' || m.name === this.session!.inputNames[0]
            );
            if (binMeta?.dims && binMeta.dims[0] > 0) {
              this.maxInferenceBatch = binMeta.dims[0];
              console.log(
                `[OnnxEngine] Static batch model detected: batch=${this.maxInferenceBatch}`
              );
            }
          }
        } catch {
          // Not available
        }
      }
      // enableGraphCapture implies static batch=1
      if (this.graphCaptureEnabled && this.maxInferenceBatch > 1) {
        this.maxInferenceBatch = 1;
      }

      // Check if we fell back
      if (
        this.requestedProviders.some(p => ['webgpu', 'webnn'].includes(p)) &&
        !usedProviderNames.some(p => ['webgpu', 'webnn'].includes(p))
      ) {
        this.didFallback = true;
      }

      // Detect input data type from model metadata
      // ONNX Runtime Web exposes input metadata through the handler
      let detectedFp16 = false;
      try {
        // Try to access input metadata through handler (internal API)
        const handler = (this.session as any).handler;
        if (handler?.inputMetadata) {
          const binInputMeta = handler.inputMetadata.find(
            (m: any) => m.name === 'bin_input' || m.name === this.session!.inputNames[0]
          );
          if (binInputMeta?.type === 'float16') {
            detectedFp16 = true;
          }
        }
      } catch {
        // Fallback: we'll detect at runtime if needed
      }

      if (detectedFp16) {
        this.inputDataType = 'float16';

        // Warn if using FP16 on CPU/WASM - it's not well supported
        const isWasmOnly = usedProviderNames.every(p => p === 'wasm' || p === 'cpu');
        if (isWasmOnly) {
          console.warn(
            '[OnnxEngine] FP16 model detected on CPU/WASM backend. ' +
              'FP16 is not fully supported on CPU - you may experience errors. ' +
              'Consider using an FP32 model or WebGPU backend for better compatibility.'
          );
        }
      } else {
        this.inputDataType = 'float32';
      }

      // Pre-allocate GPU buffers for graph capture mode
      if (this.graphCaptureEnabled) {
        try {
          await this.allocateGpuBuffers();
        } catch (e) {
          console.warn('[OnnxEngine] GPU buffer allocation failed, disabling graph capture:', e);
          this.graphCaptureEnabled = false;
          this.useGpuInputs = false;
        }
      }

      // Log model loaded info (always visible)
      const backendInfo = usedProviderNames.join('/').toUpperCase();
      const threadInfo = numThreads > 1 ? ` (${numThreads} threads)` : '';
      const dtypeInfo = this.inputDataType === 'float16' ? ' [FP16]' : '';
      const gcInfo = this.graphCaptureEnabled ? ' [GraphCapture]' : '';
      const timeStr =
        createTime >= 1000 ? `${(createTime / 1000).toFixed(1)}s` : `${createTime.toFixed(0)}ms`;
      console.log(
        `[AI] Model loaded: ${backendInfo}${threadInfo}${dtypeInfo}${gcInfo} in ${timeStr}`
      );

      this.debugLog('Session ready', {
        providers: usedProviderNames,
        createTimeMs: createTime,
        numThreads,
        graphCapture: this.graphCaptureEnabled,
      });
    } catch (e) {
      console.error('[OnnxEngine] Failed to initialize:', e);
      throw e;
    }
  }

  getCapabilities(): EngineCapabilities {
    return {
      name: 'KataGo (ONNX)',
      version: '1.0.0',
      supportedBoardSizes: [],
      supportsParallel: false,
      providesPV: false,
      providesWinRate: false,
      providesScoreLead: true,
    };
  }

  /**
   * Get runtime information about the engine, including fallback status
   */
  getRuntimeInfo(): EngineRuntimeInfo {
    // Determine the actual backend used
    let backend = 'wasm';
    if (this.usedProviders.includes('webgpu')) {
      backend = this.graphCaptureEnabled ? 'webgpu-gc' : 'webgpu';
    } else if (this.usedProviders.includes('webnn')) {
      backend = 'webnn';
    } else if (this.usedProviders.includes('wasm')) {
      backend = 'wasm';
    } else if (this.usedProviders.length > 0) {
      backend = this.usedProviders[0];
    }

    // Determine what was originally requested
    let requestedBackend: string | undefined;
    if (this.didFallback && this.requestedProviders.length > 0) {
      const gpuRequested = this.requestedProviders.find(p => ['webgpu', 'webnn'].includes(p));
      requestedBackend = gpuRequested || this.requestedProviders[0];
    }

    return {
      backend,
      inputDataType: this.inputDataType,
      didFallback: this.didFallback,
      requestedBackend,
    };
  }

  protected async analyzePosition(
    signMap: SignMap,
    options: EngineAnalysisOptions
  ): Promise<AnalysisResult> {
    if (!this.session) throw new Error('Engine not initialized');

    const board = new GoBoard(signMap);
    const size = board.width;
    this.boardSize = size;

    // Determine current player
    let nextPla: Sign = 1;
    if (options.nextToPlay) {
      nextPla = options.nextToPlay === 'W' ? -1 : 1;
    } else {
      let blackStones = 0,
        whiteStones = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = board.get([x, y]);
          if (s === 1) blackStones++;
          else if (s === -1) whiteStones++;
        }
      }
      nextPla = blackStones === whiteStones ? 1 : -1;
    }

    const komi = options.komi ?? 7.5;
    const history = options.history || [];
    const numVisits: number = (options as any).numVisits ?? 1;

    // Restore ko state so MCTS and featurization respect the current ko restriction.
    // GoBoard created from signMap always resets _koInfo, so we re-apply it from options.
    const koInfo = (options as any).koInfo as { sign: Sign; vertex: [number, number] } | undefined;
    if (koInfo && (koInfo.sign as number) !== 0) {
      board._koInfo = { sign: koInfo.sign, vertex: koInfo.vertex };
    }

    // Run MCTS if more than 1 visit is requested
    if (numVisits > 1) {
      return this._runMCTS(board, nextPla, komi, history, numVisits, size);
    }

    // Single-pass NN inference (default, fastest)
    const analysisStart = performance.now();
    this.debugLog('Single analysis prepared', {
      nextPla,
      komi,
      historyLength: history.length,
      boardSize: size,
    });

    const analysisResult = await this._evaluateSingle(board, nextPla, komi, history, size);
    const totalTime = performance.now() - analysisStart;

    this.debugLog('Single analysis complete', { totalTimeMs: totalTime });

    return analysisResult;
  }

  /**
   * Run a single NN inference on the given board position.
   * Used by both analyzePosition (1 visit) and _runMCTS (leaf evaluation).
   */
  private async _evaluateSingle(
    board: GoBoard,
    nextPla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    size: number
  ): Promise<AnalysisResult> {
    const { bin_input, global_input } = this.featurize(board, nextPla, komi, history, size);
    this.validateTensorData(bin_input, 'bin_input');
    this.validateTensorData(global_input, 'global_input');

    let binTensor: ort.Tensor;
    let globalTensor: ort.Tensor;
    let usingGpuBuffers = false;

    if (this.useGpuInputs && this.gpuDevice) {
      const binData =
        this.inputDataType === 'float16' ? this.float32ToFloat16(bin_input) : bin_input;
      const globalData =
        this.inputDataType === 'float16' ? this.float32ToFloat16(global_input) : global_input;
      const gpuTensors = this.uploadToGpu(binData, globalData);
      binTensor = gpuTensors.binTensor;
      globalTensor = gpuTensors.globalTensor;
      usingGpuBuffers = true;
    } else {
      binTensor = this.createTensor(bin_input, [1, 22, size, size]);
      globalTensor = this.createTensor(global_input, [1, 19]);
    }

    const inferenceStart = performance.now();
    let results: ort.InferenceSession.OnnxValueMapType;

    try {
      results = await this.session!.run({ bin_input: binTensor, global_input: globalTensor });
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes('expected: (tensor(float16))') && this.inputDataType === 'float32') {
        console.warn('[OnnxEngine] Detected FP16 model at runtime, switching input type');
        this.inputDataType = 'float16';
        if (!usingGpuBuffers) {
          binTensor.dispose();
          globalTensor.dispose();
        }
        binTensor = this.createTensor(bin_input, [1, 22, size, size]);
        globalTensor = this.createTensor(global_input, [1, 19]);
        usingGpuBuffers = false;
        results = await this.session!.run({ bin_input: binTensor, global_input: globalTensor });
      } else {
        throw error;
      }
    }

    this.debugLog('NN inference', { ms: performance.now() - inferenceStart });
    if (!usingGpuBuffers) {
      binTensor.dispose();
      globalTensor.dispose();
    }

    const analysisResult = await this.processResults(results, nextPla, size);
    return this._filterKoMoves(analysisResult, board, nextPla, size);
  }

  /**
   * Same as _evaluateSingle but reuses pre-allocated buffers to avoid GC pressure.
   * Used in the MCTS hot loop where we do many sequential evaluations.
   */
  private async _evaluateSingleBuffered(
    board: GoBoard,
    nextPla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    size: number,
    bin_input: Float32Array,
    global_input: Float32Array
  ): Promise<AnalysisResult> {
    // Zero out buffers and fill in-place
    bin_input.fill(0);
    global_input.fill(0);
    this.featurizeToBuffer(board, nextPla, komi, history, bin_input, global_input, 0, size);

    let binTensor: ort.Tensor;
    let globalTensor: ort.Tensor;
    let usingGpuBuffers = false;

    if (this.useGpuInputs && this.gpuDevice) {
      const binData =
        this.inputDataType === 'float16' ? this.float32ToFloat16(bin_input) : bin_input;
      const globalData =
        this.inputDataType === 'float16' ? this.float32ToFloat16(global_input) : global_input;
      const gpuTensors = this.uploadToGpu(binData, globalData);
      binTensor = gpuTensors.binTensor;
      globalTensor = gpuTensors.globalTensor;
      usingGpuBuffers = true;
    } else {
      binTensor = this.createTensor(bin_input, [1, 22, size, size]);
      globalTensor = this.createTensor(global_input, [1, 19]);
    }

    const inferenceStart = performance.now();
    let results: ort.InferenceSession.OnnxValueMapType;

    try {
      results = await this.session!.run({ bin_input: binTensor, global_input: globalTensor });
    } catch (error) {
      const errorMsg = String(error);
      if (errorMsg.includes('expected: (tensor(float16))') && this.inputDataType === 'float32') {
        this.inputDataType = 'float16';
        if (!usingGpuBuffers) {
          binTensor.dispose();
          globalTensor.dispose();
        }
        binTensor = this.createTensor(bin_input, [1, 22, size, size]);
        globalTensor = this.createTensor(global_input, [1, 19]);
        usingGpuBuffers = false;
        results = await this.session!.run({ bin_input: binTensor, global_input: globalTensor });
      } else {
        throw error;
      }
    }

    this.debugLog('NN inference', { ms: performance.now() - inferenceStart });
    if (!usingGpuBuffers) {
      binTensor.dispose();
      globalTensor.dispose();
    }

    const analysisResult = await this.processResults(results, nextPla, size);
    return this._filterKoMoves(analysisResult, board, nextPla, size);
  }

  /**
   * Run PUCT MCTS search from the given position.
   * Each visit expands a leaf node using NN evaluation and backs up the value.
   */
  private async _runMCTS(
    rootBoard: GoBoard,
    nextPla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    numVisits: number,
    size: number
  ): Promise<AnalysisResult> {
    const CPUCT = 1.5;

    // Pre-allocate reusable buffers for featurization (avoids GC pressure in hot loop)
    const reuseBin = new Float32Array(22 * size * size);
    const reuseGlobal = new Float32Array(19);

    const root: MCTSNode = { N: 0, W: 0, P: 1, children: null, expanded: false };
    let rootEval: AnalysisResult | null = null;

    for (let v = 0; v < numVisits; v++) {
      // Selection: descend tree by PUCT until reaching an unexpanded leaf
      type Step = { node: MCTSNode; board: GoBoard; pla: Sign; hist: typeof history };
      const path: Step[] = [{ node: root, board: rootBoard, pla: nextPla, hist: history }];

      while (true) {
        const { node, board, pla, hist } = path[path.length - 1];
        if (!node.expanded || !node.children || node.children.size === 0) break;

        // Check for game-end (2 consecutive passes)
        const len = hist.length;
        if (len >= 2 && hist[len - 1].x < 0 && hist[len - 2].x < 0) break;

        // PUCT selection
        let bestScore = -Infinity;
        let bestMove = '';
        let bestChild: MCTSNode | null = null;

        for (const [move, child] of node.children) {
          // Q from current player's perspective (all W values stored as Black's winrate)
          const q = child.N > 0 ? (pla === 1 ? child.W / child.N : 1 - child.W / child.N) : 0;
          const u = (CPUCT * child.P * Math.sqrt(Math.max(node.N, 1))) / (1 + child.N);
          if (q + u > bestScore) {
            bestScore = q + u;
            bestMove = move;
            bestChild = child;
          }
        }
        if (!bestChild) break;

        // Apply the selected move
        let newBoard: GoBoard;
        let newHist: typeof history;
        if (bestMove === 'PASS') {
          // Pass: create new board object to reset ko state
          newBoard = new GoBoard(board.signMap.map(row => [...row] as Sign[]));
          newHist = [...hist.slice(-4), { color: pla, x: -1, y: -1 }];
        } else {
          const parsed = this._parseMoveStr(bestMove, size);
          if (!parsed) break;
          try {
            newBoard = board.makeMove(pla, parsed, {});
          } catch {
            break;
          }
          newHist = [...hist.slice(-4), { color: pla, x: parsed[0], y: parsed[1] }];
        }

        path.push({
          node: bestChild,
          board: newBoard,
          pla: (pla === 1 ? -1 : 1) as Sign,
          hist: newHist,
        });
      }

      // Expansion + evaluation of the leaf node
      const leaf = path[path.length - 1];
      let value: number;

      if (!leaf.node.expanded) {
        const leafEval = await this._evaluateSingleBuffered(
          leaf.board,
          leaf.pla,
          komi,
          leaf.hist,
          size,
          reuseBin,
          reuseGlobal
        );
        this._expandNode(leaf.node, leafEval, leaf.board, leaf.pla, size);
        value = leafEval.winRate;
        if (leaf.node === root) rootEval = leafEval;
      } else {
        // Terminal or childless: use running average as value estimate
        value = leaf.node.N > 0 ? leaf.node.W / leaf.node.N : 0.5;
      }

      // Backup: propagate value (Black's winrate) up to root
      for (const { node } of path) {
        node.N++;
        node.W += value;
      }
    }

    // Ensure we have a root evaluation (should always be set after ≥1 visit)
    if (!rootEval) {
      rootEval = await this._evaluateSingle(rootBoard, nextPla, komi, history, size);
    }

    // Build AnalysisResult from MCTS visit counts
    const moveSuggestions: MoveSuggestion[] = [];
    if (root.children && root.children.size > 0) {
      const totalChildVisits = [...root.children.values()].reduce((s, c) => s + c.N, 0);
      const sorted = [...root.children.entries()].sort(([, a], [, b]) => b.N - a.N);
      for (const [move, child] of sorted.slice(0, 10)) {
        moveSuggestions.push({
          move,
          probability: totalChildVisits > 0 ? child.N / totalChildVisits : child.P,
        });
      }
    }

    const winRate = root.N > 0 ? root.W / root.N : rootEval.winRate;
    this.debugLog('MCTS complete', { visits: root.N, winRate });

    return {
      moveSuggestions,
      winRate,
      scoreLead: rootEval.scoreLead,
      currentTurn: nextPla === 1 ? 'B' : 'W',
      visits: root.N,
      ownership: rootEval.ownership,
    };
  }

  /** Expand a node: create children from NN policy, skipping occupied and ko-illegal intersections. */
  private _expandNode(
    node: MCTSNode,
    eval_: AnalysisResult,
    board: GoBoard,
    pla: Sign,
    size: number
  ): void {
    node.children = new Map();
    const koVertex = this._getKoVertex(board, pla, size);
    for (const suggestion of eval_.moveSuggestions) {
      const move = suggestion.move;
      if (move !== 'PASS') {
        if (koVertex && move === koVertex) continue;
        const parsed = this._parseMoveStr(move, size);
        if (!parsed) continue;
        // Skip occupied intersections
        const stone = board.get(parsed);
        if (stone !== 0) continue;
      }
      node.children.set(move, {
        N: 0,
        W: 0,
        P: suggestion.probability,
        children: null,
        expanded: false,
      });
    }
    node.expanded = true;
  }

  /** Parse a GTP move string (e.g. "D4", "Q16", "PASS") to board [x, y] or null for pass. */
  private _parseMoveStr(move: string, size: number): [number, number] | null {
    if (!move || move === 'PASS') return null;
    const letters = 'ABCDEFGHJKLMNOPQRST';
    const x = letters.indexOf(move[0].toUpperCase());
    const y = size - parseInt(move.slice(1), 10);
    if (x < 0 || y < 0 || y >= size) return null;
    return [x, y];
  }

  /** Get the GTP string for the ko-forbidden vertex, or null if no ko. */
  private _getKoVertex(board: GoBoard, pla: Sign, size: number): string | null {
    const koInfo = board._koInfo;
    if (!koInfo || koInfo.sign !== pla || koInfo.vertex[0] === -1) return null;
    const letters = 'ABCDEFGHJKLMNOPQRST';
    return `${letters[koInfo.vertex[0]]}${size - koInfo.vertex[1]}`;
  }

  /** Remove the ko-forbidden move from suggestions and renormalise probabilities. */
  private _filterKoMoves(
    result: AnalysisResult,
    board: GoBoard,
    pla: Sign,
    size: number
  ): AnalysisResult {
    const koMove = this._getKoVertex(board, pla, size);
    if (!koMove) return result;
    const filtered = result.moveSuggestions.filter(s => s.move !== koMove);
    const total = filtered.reduce((sum, s) => sum + s.probability, 0);
    if (total > 0) {
      for (const s of filtered) s.probability /= total;
    }
    return { ...result, moveSuggestions: filtered };
  }

  async analyzeBatch(
    inputs: { signMap: SignMap; options?: EngineAnalysisOptions }[]
  ): Promise<AnalysisResult[]> {
    if (!this.initialized || !this.session) {
      throw new Error('Engine not initialized');
    }

    if (inputs.length === 0) return [];

    // When MCTS is requested (numVisits > 1), use sequential analyze() which routes through
    // analyzePosition → _runMCTS. Batch NN inference can't be used for MCTS.
    const hasMultiVisit = inputs.some(i => ((i.options as any)?.numVisits ?? 1) > 1);
    if (hasMultiVisit) {
      const results: AnalysisResult[] = [];
      for (const input of inputs) {
        results.push(await this.analyze(input.signMap, input.options));
      }
      return results;
    }

    // Always use the actual board size from the first input's signMap
    const size = inputs[0].signMap.length;
    this.boardSize = size;
    const numPlanes = 22;

    // Check cache
    const results: (AnalysisResult | null)[] = new Array(inputs.length).fill(null);
    const uncachedInputs: {
      originalIndex: number;
      signMap: SignMap;
      options: EngineAnalysisOptions;
      board: GoBoard;
      nextPla: Sign;
    }[] = [];

    const useCache = this.config.enableCache;
    for (let i = 0; i < inputs.length; i++) {
      const { signMap, options = {} } = inputs[i];
      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          results[i] = cached;
          continue;
        }
      }
      const board = new GoBoard(signMap);
      const nextPla: Sign = options.nextToPlay === 'W' ? -1 : 1;
      // Restore ko state from options so featurization includes the ko feature
      const koInfo = (options as any).koInfo as
        | { sign: Sign; vertex: [number, number] }
        | undefined;
      if (koInfo && (koInfo.sign as number) !== 0) {
        board._koInfo = { sign: koInfo.sign, vertex: koInfo.vertex };
      }
      uncachedInputs.push({ originalIndex: i, signMap, options, board, nextPla });
    }

    if (uncachedInputs.length === 0) {
      this.debugLog('Batch request resolved from cache', { requested: inputs.length });
      return results as AnalysisResult[];
    }

    const actualBatchSize = uncachedInputs.length;
    const batchStart = performance.now();

    // Prepare per-position feature buffers
    const perPosBinSize = numPlanes * size * size;
    const bin_input = new Float32Array(actualBatchSize * perPosBinSize);
    const global_input = new Float32Array(actualBatchSize * 19);
    const plas: Sign[] = [];

    // Fill real data (boards already have ko info restored)
    for (let b = 0; b < actualBatchSize; b++) {
      const { options, board, nextPla } = uncachedInputs[b];
      const komi = options.komi ?? 7.5;
      plas.push(nextPla);
      const history = options.history || [];
      this.featurizeToBuffer(board, nextPla, komi, history, bin_input, global_input, b, size);
    }

    this.validateTensorData(bin_input, 'bin_input(batch)');
    this.validateTensorData(global_input, 'global_input(batch)');

    if (this.debugEnabled) {
      const historyLengths = uncachedInputs.map(item => item.options.history?.length ?? 0);
      const historyStats = historyLengths.reduce(
        (acc, len) => {
          return {
            min: Math.min(acc.min, len),
            max: Math.max(acc.max, len),
            sum: acc.sum + len,
          };
        },
        { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, sum: 0 }
      );
      const avgHistory = historyLengths.length ? historyStats.sum / historyLengths.length : 0;
      const plaCounts = plas.reduce(
        (acc, pla) => {
          if (pla === 1) acc.black += 1;
          else acc.white += 1;
          return acc;
        },
        { black: 0, white: 0 }
      );
      const sampleKeys = uncachedInputs.map(({ signMap, options }) =>
        this.getCacheKey(signMap, options).slice(0, 16)
      );
      this.debugLog('Running batch inference', {
        batchSize: actualBatchSize,
        maxInferenceBatch: this.maxInferenceBatch,
        boardSize: size,
        providers: this.usedProviders,
        historyStats: {
          min: Number.isFinite(historyStats.min) ? historyStats.min : 0,
          max: Number.isFinite(historyStats.max) ? historyStats.max : 0,
          avg: Number(avgHistory.toFixed(2)),
        },
        plaCounts,
        sampleKeys,
      });
    }

    // Run inference — chunk if model has limited batch size
    const chunkSize = Math.min(actualBatchSize, this.maxInferenceBatch);
    const allBatchResults: AnalysisResult[] = [];
    let totalInferenceTime = 0;

    for (let chunkStart = 0; chunkStart < actualBatchSize; chunkStart += chunkSize) {
      const chunkEnd = Math.min(chunkStart + chunkSize, actualBatchSize);
      const thisBatch = chunkEnd - chunkStart;
      const chunkPlas = plas.slice(chunkStart, chunkEnd);

      // Extract chunk data
      const chunkBin = bin_input.subarray(chunkStart * perPosBinSize, chunkEnd * perPosBinSize);
      const chunkGlobal = global_input.subarray(chunkStart * 19, chunkEnd * 19);

      let binTensor: ort.Tensor;
      let globalTensor: ort.Tensor;
      let usingGpuBuffers = false;

      if (this.useGpuInputs && this.gpuDevice && thisBatch === 1) {
        // Graph capture mode: upload to pre-allocated GPU buffers
        const binData =
          this.inputDataType === 'float16'
            ? this.float32ToFloat16(new Float32Array(chunkBin))
            : new Float32Array(chunkBin);
        const globalData =
          this.inputDataType === 'float16'
            ? this.float32ToFloat16(new Float32Array(chunkGlobal))
            : new Float32Array(chunkGlobal);
        const gpuTensors = this.uploadToGpu(binData, globalData);
        binTensor = gpuTensors.binTensor;
        globalTensor = gpuTensors.globalTensor;
        usingGpuBuffers = true;
      } else {
        binTensor = this.createTensor(new Float32Array(chunkBin), [thisBatch, 22, size, size]);
        globalTensor = this.createTensor(new Float32Array(chunkGlobal), [thisBatch, 19]);
      }

      const inferenceStart = performance.now();
      const inferenceResults = await this.session.run({
        bin_input: binTensor,
        global_input: globalTensor,
      });
      totalInferenceTime += performance.now() - inferenceStart;

      if (!usingGpuBuffers) {
        binTensor.dispose();
        globalTensor.dispose();
      }

      const chunkResults = await this.processBatchResults(
        inferenceResults,
        chunkPlas,
        size,
        thisBatch
      );
      allBatchResults.push(...chunkResults);
    }

    this.debugLog('Batch inference finished', {
      actualBatchSize,
      chunks: Math.ceil(actualBatchSize / chunkSize),
      totalInferenceTime,
    });

    // Store in cache; filter ko moves
    for (let b = 0; b < actualBatchSize; b++) {
      const { originalIndex, signMap, options, board, nextPla } = uncachedInputs[b];
      const result = this._filterKoMoves(allBatchResults[b], board, nextPla, size);
      results[originalIndex] = result;

      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        this.cache.set(cacheKey, result);
        if (this.cache.size > (this.config.maxCacheSize ?? 1000)) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
      }
    }

    const totalTime = performance.now() - batchStart;
    const msPerPos = totalTime / actualBatchSize;

    this.debugLog('Batch analysis complete', {
      actualBatchSize,
      totalTimeMs: totalTime,
      msPerPos,
      inferenceTimeMs: totalInferenceTime,
      paddedTo: undefined,
    });

    return results as AnalysisResult[];
  }

  private disposeTensors(results: ort.InferenceSession.ReturnType): void {
    for (const key of Object.keys(results)) {
      try {
        results[key]?.dispose?.();
      } catch {
        // Ignore
      }
    }
  }

  private featurize(
    board: GoBoard,
    pla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    size: number
  ) {
    const bin_input = new Float32Array(22 * size * size);
    const global_input = new Float32Array(19);
    this.featurizeToBuffer(board, pla, komi, history, bin_input, global_input, 0, size);
    return { bin_input, global_input };
  }

  private featurizeToBuffer(
    board: GoBoard,
    pla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    bin_input: Float32Array,
    global_input: Float32Array,
    batchIndex: number,
    size: number
  ) {
    const numPlanes = 22;
    const opp: Sign = pla === 1 ? -1 : 1;
    const batchOffset = batchIndex * numPlanes * size * size;

    const set = (c: number, h: number, w: number, val: number) => {
      bin_input[batchOffset + c * size * size + h * size + w] = val;
    };

    // Pre-compute liberty counts once per group (avoids redundant BFS per stone)
    const libertyCount = new Int8Array(size * size); // 0 = empty/uncomputed
    const groupVisited = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        if (groupVisited[idx]) continue;
        const color = board.signMap[y][x];
        if (color === 0) continue;
        // BFS to find group and count liberties in one pass
        const chain = board.getChain([x, y]);
        const libSet = new Set<number>();
        for (const [cx, cy] of chain) {
          groupVisited[cy * size + cx] = 1;
          // Check neighbors for liberties
          if (cx > 0 && board.signMap[cy][cx - 1] === 0) libSet.add(cy * size + (cx - 1));
          if (cx < size - 1 && board.signMap[cy][cx + 1] === 0) libSet.add(cy * size + (cx + 1));
          if (cy > 0 && board.signMap[cy - 1][cx] === 0) libSet.add((cy - 1) * size + cx);
          if (cy < size - 1 && board.signMap[cy + 1][cx] === 0) libSet.add((cy + 1) * size + cx);
        }
        const libs = Math.min(libSet.size, 4); // clamp to 4 (we only care about 1/2/3)
        for (const [cx, cy] of chain) {
          libertyCount[cy * size + cx] = libs;
        }
      }
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        set(0, y, x, 1.0); // Ones

        const color = board.signMap[y][x];
        if (color === pla) set(1, y, x, 1.0);
        else if (color === opp) set(2, y, x, 1.0);

        if (color !== 0) {
          const libs = libertyCount[y * size + x];
          if (libs === 1) set(3, y, x, 1.0);
          if (libs === 2) set(4, y, x, 1.0);
          if (libs === 3) set(5, y, x, 1.0);
        }
      }
    }

    // Ko
    const koInfo = board._koInfo;
    if (koInfo && koInfo.sign === pla && koInfo.vertex[0] !== -1) {
      set(6, koInfo.vertex[1], koInfo.vertex[0], 1.0);
    }

    // History features (last 5 moves)
    const len = history.length;
    const setHistory = (moveIdx: number, featureIdx: number) => {
      if (len >= moveIdx) {
        const m = history[len - moveIdx];
        if (m.x >= 0 && m.x < size && m.y >= 0 && m.y < size) {
          set(featureIdx, m.y, m.x, 1.0);
        }
      }
    };
    setHistory(1, 9);
    setHistory(2, 10);
    setHistory(3, 11);
    setHistory(4, 12);
    setHistory(5, 13);

    // Global input
    const globalOffset = batchIndex * 19;
    const setGlobal = (idx: number, val: number) => {
      global_input[globalOffset + idx] = val;
    };

    // Pass history
    if (len >= 1 && history[len - 1].x < 0) setGlobal(0, 1.0);
    if (len >= 2 && history[len - 2].x < 0) setGlobal(1, 1.0);
    if (len >= 3 && history[len - 3].x < 0) setGlobal(2, 1.0);
    if (len >= 4 && history[len - 4].x < 0) setGlobal(3, 1.0);
    if (len >= 5 && history[len - 5].x < 0) setGlobal(4, 1.0);

    // Komi
    setGlobal(5, komi / 20.0);
  }

  private async processBatchResults(
    results: ort.InferenceSession.ReturnType,
    plas: Sign[],
    size: number,
    batchSize: number
  ): Promise<AnalysisResult[]> {
    const getData = async (tensor: ort.Tensor): Promise<Float32Array> => {
      if (typeof tensor.getData === 'function') {
        try {
          return (await tensor.getData()) as Float32Array;
        } catch {
          return tensor.data as Float32Array;
        }
      }
      return tensor.data as Float32Array;
    };

    const [policyData, valueData, miscvalueData, ownershipData] = await Promise.all([
      getData(results.policy),
      getData(results.value),
      getData(results.miscvalue),
      results.ownership ? getData(results.ownership) : Promise.resolve(undefined),
    ]);

    // Capture dims before disposing tensors (dims may be inaccessible after dispose on GPU)
    const policyDims = results.policy.dims;
    const valueDims = results.value.dims;
    const miscvalueDims = results.miscvalue.dims;

    this.disposeTensors(results);

    const numPolicyHeads = policyDims.length === 3 ? Number(policyDims[1]) : 1;
    const numMoves = policyDims.length === 3 ? Number(policyDims[2]) : Number(policyDims[1]);
    const policyStride = numPolicyHeads * numMoves;
    const valueStride = valueDims.length > 1 ? Number(valueDims[1]) : 3;
    const miscvalueStride = miscvalueDims.length > 1 ? Number(miscvalueDims[1]) : 10;
    const ownershipStride = size * size;

    const analysisResults: AnalysisResult[] = [];
    const letters = 'ABCDEFGHJKLMNOPQRST';

    for (let b = 0; b < batchSize; b++) {
      const pla = plas[b];

      // Extract data for this batch item
      const policy = policyData.subarray(b * policyStride, b * policyStride + numMoves);
      const value = valueData.subarray(b * valueStride, (b + 1) * valueStride);
      const miscvalue = miscvalueData.subarray(b * miscvalueStride, (b + 1) * miscvalueStride);
      const ownership = ownershipData
        ? ownershipData.subarray(b * ownershipStride, (b + 1) * ownershipStride)
        : undefined;

      // Win rate from value head (from current player's perspective)
      const expValue = [Math.exp(value[0]), Math.exp(value[1]), Math.exp(value[2])];
      const sumValue = expValue[0] + expValue[1] + expValue[2];
      const winrateCurrentPlayer = expValue[0] / sumValue;

      // Convert to Black's perspective: if Black to play, keep as-is; if White to play, flip
      const blackWinrate = pla === 1 ? winrateCurrentPlayer : 1 - winrateCurrentPlayer;

      // Score values from miscvalue head (from current player's perspective)
      // miscvalue[0] = scoreMean, miscvalue[1] = scoreStdev (pre-softplus), miscvalue[2] = lead
      const leadCurrentPlayer = miscvalue[2] * 20.0;

      // Convert lead to Black's perspective
      const blackLead = leadCurrentPlayer * pla;

      // Policy softmax
      let maxLogit = -Infinity;
      for (let i = 0; i < numMoves; i++) {
        if (policy[i] > maxLogit) maxLogit = policy[i];
      }

      const probs = new Float32Array(numMoves);
      let sumProbs = 0;
      for (let i = 0; i < numMoves; i++) {
        probs[i] = Math.exp(policy[i] - maxLogit);
        sumProbs += probs[i];
      }
      for (let i = 0; i < numMoves; i++) probs[i] /= sumProbs;

      // Top moves
      const indices = Array.from({ length: numMoves }, (_, i) => i);
      indices.sort((a, b) => probs[b] - probs[a]);

      const moveSuggestions: MoveSuggestion[] = [];
      for (let i = 0; i < 10; i++) {
        const idx = indices[i];
        const prob = probs[idx];
        let moveStr = '';

        if (idx === size * size) {
          moveStr = 'PASS';
        } else {
          const y = Math.floor(idx / size);
          const x = idx % size;
          moveStr = `${letters[x]}${size - y}`;
        }

        moveSuggestions.push({ move: moveStr, probability: prob });
      }

      analysisResults.push({
        moveSuggestions,
        // Winrate from Black's perspective
        winRate: blackWinrate,
        // Score lead from Black's perspective (positive = Black ahead)
        scoreLead: blackLead,
        currentTurn: pla === 1 ? 'B' : 'W',
        ownership: ownership ? Array.from(ownership).map(v => v * pla) : undefined,
      });
    }

    return analysisResults;
  }

  private async processResults(
    results: ort.InferenceSession.ReturnType,
    pla: Sign,
    size: number
  ): Promise<AnalysisResult> {
    const batchResults = await this.processBatchResults(results, [pla], size, 1);
    return batchResults[0];
  }

  async dispose(): Promise<void> {
    // Clean up GPU buffers
    if (this.gpuBinBuffer) {
      this.gpuBinBuffer.destroy();
      this.gpuBinBuffer = null;
    }
    if (this.gpuGlobalBuffer) {
      this.gpuGlobalBuffer.destroy();
      this.gpuGlobalBuffer = null;
    }
    this.gpuBinTensor = null;
    this.gpuGlobalTensor = null;
    this.gpuDevice = null;

    if (this.session) {
      try {
        // @ts-ignore
        await this.session.release?.();
      } catch {
        // Ignore
      }
      this.session = null;
    }
    await super.dispose();
  }
}

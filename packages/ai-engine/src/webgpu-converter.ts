/**
 * WebGPU Model Converter
 *
 * Automatically converts ONNX models for optimal WebGPU execution:
 * 1. Makes batch dimension static (required for graph capture)
 * 2. Decomposes unsupported ops (Softplus, LogSoftmax) into GPU-supported equivalents
 *
 * This runs entirely in the browser using protobufjs (already bundled with onnxruntime-web).
 * No Python or external tools required.
 */

import protobuf from 'protobufjs';

// Minimal ONNX protobuf schema (only types needed for model conversion)
const ONNX_SCHEMA = {
  nested: {
    onnx: {
      nested: {
        ModelProto: {
          fields: {
            irVersion: { type: 'int64', id: 1 },
            opsetImport: { rule: 'repeated', type: 'OperatorSetIdProto', id: 8 },
            producerName: { type: 'string', id: 2 },
            producerVersion: { type: 'string', id: 3 },
            domain: { type: 'string', id: 4 },
            modelVersion: { type: 'int64', id: 5 },
            docString: { type: 'string', id: 6 },
            graph: { type: 'GraphProto', id: 7 },
            metadataProps: { rule: 'repeated', type: 'StringStringEntryProto', id: 14 },
            trainingInfo: { rule: 'repeated', type: 'TrainingInfoProto', id: 20 },
            functions: { rule: 'repeated', type: 'FunctionProto', id: 25 },
          },
        },
        GraphProto: {
          fields: {
            node: { rule: 'repeated', type: 'NodeProto', id: 1 },
            name: { type: 'string', id: 2 },
            initializer: { rule: 'repeated', type: 'TensorProto', id: 5 },
            sparseInitializer: { rule: 'repeated', type: 'SparseTensorProto', id: 15 },
            docString: { type: 'string', id: 10 },
            input: { rule: 'repeated', type: 'ValueInfoProto', id: 11 },
            output: { rule: 'repeated', type: 'ValueInfoProto', id: 12 },
            valueInfo: { rule: 'repeated', type: 'ValueInfoProto', id: 13 },
            quantizationAnnotation: {
              rule: 'repeated',
              type: 'TensorAnnotation',
              id: 14,
            },
          },
        },
        NodeProto: {
          fields: {
            input: { rule: 'repeated', type: 'string', id: 1 },
            output: { rule: 'repeated', type: 'string', id: 2 },
            name: { type: 'string', id: 3 },
            opType: { type: 'string', id: 4 },
            domain: { type: 'string', id: 7 },
            attribute: { rule: 'repeated', type: 'AttributeProto', id: 5 },
            docString: { type: 'string', id: 6 },
          },
        },
        AttributeProto: {
          fields: {
            name: { type: 'string', id: 1 },
            refAttrName: { type: 'string', id: 21 },
            docString: { type: 'string', id: 13 },
            type: { type: 'int32', id: 20 },
            f: { type: 'float', id: 2 },
            i: { type: 'int64', id: 3 },
            s: { type: 'bytes', id: 4 },
            t: { type: 'TensorProto', id: 5 },
            g: { type: 'GraphProto', id: 6 },
            sparseTensor: { type: 'SparseTensorProto', id: 22 },
            tp: { type: 'TypeProto', id: 14 },
            floats: { rule: 'repeated', type: 'float', id: 7 },
            ints: { rule: 'repeated', type: 'int64', id: 8 },
            strings: { rule: 'repeated', type: 'bytes', id: 9 },
            tensors: { rule: 'repeated', type: 'TensorProto', id: 10 },
            graphs: { rule: 'repeated', type: 'GraphProto', id: 11 },
            sparseTensors: { rule: 'repeated', type: 'SparseTensorProto', id: 23 },
            typeProtos: { rule: 'repeated', type: 'TypeProto', id: 15 },
          },
        },
        TensorProto: {
          fields: {
            dims: { rule: 'repeated', type: 'int64', id: 1 },
            dataType: { type: 'int32', id: 2 },
            segment: { type: 'Segment', id: 3 },
            floatData: { rule: 'repeated', type: 'float', id: 4, options: { packed: true } },
            int32Data: { rule: 'repeated', type: 'int32', id: 5, options: { packed: true } },
            stringData: { rule: 'repeated', type: 'bytes', id: 6 },
            int64Data: { rule: 'repeated', type: 'int64', id: 7, options: { packed: true } },
            name: { type: 'string', id: 8 },
            docString: { type: 'string', id: 12 },
            rawData: { type: 'bytes', id: 9 },
            externalData: { rule: 'repeated', type: 'StringStringEntryProto', id: 13 },
            dataLocation: { type: 'int32', id: 14 },
            doubleData: { rule: 'repeated', type: 'double', id: 10, options: { packed: true } },
            uint64Data: {
              rule: 'repeated',
              type: 'uint64',
              id: 11,
              options: { packed: true },
            },
          },
          nested: {
            Segment: {
              fields: {
                begin: { type: 'int64', id: 1 },
                end: { type: 'int64', id: 2 },
              },
            },
          },
        },
        ValueInfoProto: {
          fields: {
            name: { type: 'string', id: 1 },
            type: { type: 'TypeProto', id: 2 },
            docString: { type: 'string', id: 3 },
          },
        },
        TypeProto: {
          oneofs: {
            value: {
              oneof: ['tensorType', 'sequenceType', 'mapType', 'optionalType', 'sparseTensorType'],
            },
          },
          fields: {
            tensorType: { type: 'Tensor', id: 1 },
            sequenceType: { type: 'Sequence', id: 4 },
            mapType: { type: 'Map', id: 5 },
            optionalType: { type: 'Optional', id: 9 },
            sparseTensorType: { type: 'SparseTensor', id: 8 },
            denotation: { type: 'string', id: 6 },
          },
          nested: {
            Tensor: {
              fields: {
                elemType: { type: 'int32', id: 1 },
                shape: { type: 'TensorShapeProto', id: 2 },
              },
            },
            Sequence: {
              fields: {
                elemType: { type: 'TypeProto', id: 1 },
              },
            },
            Map: {
              fields: {
                keyType: { type: 'int32', id: 1 },
                valueType: { type: 'TypeProto', id: 2 },
              },
            },
            Optional: {
              fields: {
                elemType: { type: 'TypeProto', id: 1 },
              },
            },
            SparseTensor: {
              fields: {
                elemType: { type: 'int32', id: 1 },
                shape: { type: 'TensorShapeProto', id: 2 },
              },
            },
          },
        },
        TensorShapeProto: {
          fields: {
            dim: { rule: 'repeated', type: 'Dimension', id: 1 },
          },
          nested: {
            Dimension: {
              oneofs: { value: { oneof: ['dimValue', 'dimParam'] } },
              fields: {
                dimValue: { type: 'int64', id: 1 },
                dimParam: { type: 'string', id: 2 },
                denotation: { type: 'string', id: 3 },
              },
            },
          },
        },
        SparseTensorProto: {
          fields: {
            dims: { rule: 'repeated', type: 'int64', id: 1 },
            indices: { type: 'TensorProto', id: 2 },
            values: { type: 'TensorProto', id: 3 },
          },
        },
        OperatorSetIdProto: {
          fields: {
            domain: { type: 'string', id: 1 },
            version: { type: 'int64', id: 2 },
          },
        },
        StringStringEntryProto: {
          fields: {
            key: { type: 'string', id: 1 },
            value: { type: 'string', id: 2 },
          },
        },
        TensorAnnotation: {
          fields: {
            tensorName: { type: 'string', id: 1 },
            quantParameterTensorNames: {
              rule: 'repeated',
              type: 'StringStringEntryProto',
              id: 2,
            },
          },
        },
        TrainingInfoProto: {
          fields: {
            initialization: { type: 'GraphProto', id: 1 },
            algorithm: { type: 'GraphProto', id: 2 },
            initializationBinding: {
              rule: 'repeated',
              type: 'StringStringEntryProto',
              id: 3,
            },
            updateBinding: { rule: 'repeated', type: 'StringStringEntryProto', id: 4 },
          },
        },
        FunctionProto: {
          fields: {
            name: { type: 'string', id: 1 },
            input: { rule: 'repeated', type: 'string', id: 4 },
            output: { rule: 'repeated', type: 'string', id: 5 },
            attribute: { rule: 'repeated', type: 'string', id: 6 },
            attributeProto: { rule: 'repeated', type: 'AttributeProto', id: 11 },
            node: { rule: 'repeated', type: 'NodeProto', id: 7 },
            docString: { type: 'string', id: 8 },
            opsetImport: { rule: 'repeated', type: 'OperatorSetIdProto', id: 9 },
            domain: { type: 'string', id: 10 },
          },
        },
      },
    },
  },
};

// ONNX TensorProto data types
const ONNX_FLOAT = 1;
const ONNX_FLOAT16 = 10;

// Lazily initialized protobuf root
let _root: protobuf.Root | null = null;
function getRoot(): protobuf.Root {
  if (!_root) {
    _root = protobuf.Root.fromJSON(ONNX_SCHEMA);
  }
  return _root;
}

/**
 * Default batch size for WebGPU graph capture.
 * Larger batches amortize GPU↔CPU sync overhead (~80ms) over more positions.
 * batch=8: ~12ms/pos in batch analysis vs ~100ms/pos with batch=1.
 */
export const WEBGPU_BATCH_SIZE = 8;

/** Result of model conversion */
export interface ConversionResult {
  buffer: ArrayBuffer;
  wasConverted: boolean;
  changes: string[];
  batchSize: number;
}

/**
 * Check if an ONNX model needs WebGPU conversion.
 * Returns the list of issues found (empty = already optimized).
 */
export function checkModelNeedsConversion(modelBuffer: ArrayBuffer): string[] {
  const bytes = new Uint8Array(modelBuffer);
  const issues: string[] = [];

  // Quick binary scan for unsupported op names
  const scanFor = (opName: string): boolean => {
    const opBytes = new TextEncoder().encode(opName);
    for (let i = 0; i < bytes.length - opBytes.length; i++) {
      let match = true;
      for (let j = 0; j < opBytes.length; j++) {
        if (bytes[i + j] !== opBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    return false;
  };

  if (scanFor('Softplus')) issues.push('Has Softplus ops (unsupported on WebGPU)');
  if (scanFor('LogSoftmax')) issues.push('Has LogSoftmax ops (unsupported on WebGPU)');

  return issues;
}

/**
 * Check if a model filename indicates it's already WebGPU-optimized.
 */
export function isWebGPUOptimized(modelName: string): boolean {
  return modelName.includes('.webgpu.');
}

/**
 * Convert an ONNX model for optimal WebGPU execution.
 *
 * Performs two transformations:
 * 1. Makes batch dimension static (default batch=8) for graph capture
 * 2. Decomposes Softplus/LogSoftmax into GPU-supported equivalents
 *
 * Works with both FP32 and FP16 models. No external tools needed.
 *
 * @param modelBuffer - Raw ONNX model bytes
 * @param options - Conversion options
 * @param options.batchSize - Static batch size (default: WEBGPU_BATCH_SIZE=8).
 *   Larger batches amortize GPU sync overhead for batch analysis.
 */
export async function convertModelForWebGPU(
  modelBuffer: ArrayBuffer,
  options?: { batchSize?: number }
): Promise<ConversionResult> {
  const batchSize = options?.batchSize ?? WEBGPU_BATCH_SIZE;
  const root = getRoot();
  const ModelProto = root.lookupType('onnx.ModelProto');

  console.log('[WebGPU Converter] Parsing model...');
  const startTime = performance.now();

  // Decode the model
  const model = ModelProto.decode(new Uint8Array(modelBuffer)) as any;
  const graph = model.graph;
  if (!graph) throw new Error('Model has no graph');

  const changes: string[] = [];

  // Detect model data type from first input
  let isFp16 = false;
  if (graph.input?.length > 0) {
    const elemType = graph.input[0]?.type?.tensorType?.elemType;
    if (elemType === ONNX_FLOAT16) isFp16 = true;
  }

  // Step 1: Make batch dimension static
  const makeStatic = (valueInfos: any[], label: string) => {
    if (!valueInfos) return;
    for (const vi of valueInfos) {
      const dims = vi.type?.tensorType?.shape?.dim;
      if (!dims || dims.length === 0) continue;
      const firstDim = dims[0];
      if (firstDim.dimParam || !firstDim.dimValue || Number(firstDim.dimValue) <= 0) {
        const oldVal = firstDim.dimParam || String(firstDim.dimValue || '?');
        firstDim.dimValue = batchSize;
        delete firstDim.dimParam;
        changes.push(`${label} ${vi.name}: batch ${oldVal} → ${batchSize}`);
      }
    }
  };

  makeStatic(graph.input, 'input');
  makeStatic(graph.output, 'output');
  makeStatic(graph.valueInfo, 'value_info');

  // Step 2: Replace unsupported ops
  const newNodes: any[] = [];
  const newValueInfos: any[] = [];
  let softplusCount = 0;
  let logsoftmaxCount = 0;

  // Create constant "1.0" initializer for Softplus decomposition
  const oneName = '__webgpu_const_one';
  const oneBytes = new Uint8Array(isFp16 ? 2 : 4);
  if (isFp16) {
    // FP16 encoding of 1.0 = 0x3C00
    oneBytes[0] = 0x00;
    oneBytes[1] = 0x3c;
  } else {
    // FP32 encoding of 1.0
    new DataView(oneBytes.buffer).setFloat32(0, 1.0, true);
  }

  let needsOneConst = false;

  for (const node of graph.node) {
    if (node.opType === 'Softplus') {
      // Softplus(x) = Relu(x) + Log(1 + Exp(-Abs(x)))
      const x = node.input[0];
      const y = node.output[0];
      const p = `__sp_${softplusCount}`;

      newNodes.push(
        { input: [x], output: [`${p}_abs`], opType: 'Abs' },
        { input: [`${p}_abs`], output: [`${p}_neg`], opType: 'Neg' },
        { input: [`${p}_neg`], output: [`${p}_exp`], opType: 'Exp' },
        { input: [`${p}_exp`, oneName], output: [`${p}_add1`], opType: 'Add' },
        { input: [`${p}_add1`], output: [`${p}_log`], opType: 'Log' },
        { input: [x], output: [`${p}_relu`], opType: 'Relu' },
        { input: [`${p}_relu`, `${p}_log`], output: [y], opType: 'Add' }
      );

      // Add value_info for intermediates (copy shape from input if available)
      const srcVi = [...(graph.valueInfo || []), ...(graph.input || [])].find(
        (vi: any) => vi.name === x
      );
      if (srcVi?.type) {
        for (const name of [
          `${p}_abs`,
          `${p}_neg`,
          `${p}_exp`,
          `${p}_add1`,
          `${p}_log`,
          `${p}_relu`,
        ]) {
          newValueInfos.push({
            name,
            type: JSON.parse(JSON.stringify(srcVi.type)),
          });
        }
      }

      softplusCount++;
      needsOneConst = true;
    } else if (node.opType === 'LogSoftmax') {
      // LogSoftmax(x) = Log(Softmax(x))
      const x = node.input[0];
      const y = node.output[0];
      const p = `__ls_${logsoftmaxCount}`;

      // Preserve axis attribute
      const attrs = node.attribute?.filter((a: any) => a.name === 'axis') || [];

      newNodes.push(
        { input: [x], output: [`${p}_sm`], opType: 'Softmax', attribute: attrs },
        { input: [`${p}_sm`], output: [y], opType: 'Log' }
      );

      const srcVi = [...(graph.valueInfo || []), ...(graph.input || [])].find(
        (vi: any) => vi.name === x
      );
      if (srcVi?.type) {
        newValueInfos.push({
          name: `${p}_sm`,
          type: JSON.parse(JSON.stringify(srcVi.type)),
        });
      }

      logsoftmaxCount++;
    } else {
      newNodes.push(node);
    }
  }

  if (softplusCount > 0) {
    changes.push(`Replaced ${softplusCount} Softplus ops`);
  }
  if (logsoftmaxCount > 0) {
    changes.push(`Replaced ${logsoftmaxCount} LogSoftmax ops`);
  }

  // Add constant initializer if needed
  if (needsOneConst) {
    if (!graph.initializer) graph.initializer = [];
    graph.initializer.push({
      dims: [],
      dataType: isFp16 ? ONNX_FLOAT16 : ONNX_FLOAT,
      rawData: oneBytes,
      name: oneName,
    });
  }

  // Update graph
  graph.node = newNodes;
  if (newValueInfos.length > 0) {
    if (!graph.valueInfo) graph.valueInfo = [];
    graph.valueInfo.push(...newValueInfos);
  }

  // Encode back
  const errMsg = ModelProto.verify(model);
  if (errMsg) {
    console.warn('[WebGPU Converter] Verification warning:', errMsg);
  }

  const encoded = ModelProto.encode(model).finish();
  const elapsed = performance.now() - startTime;

  const origMB = (modelBuffer.byteLength / 1024 / 1024).toFixed(1);
  const newMB = (encoded.byteLength / 1024 / 1024).toFixed(1);
  console.log(
    `[WebGPU Converter] Done in ${elapsed.toFixed(0)}ms: ${origMB}MB → ${newMB}MB, ` +
      `${changes.length} changes (${graph.node.length} ops)`
  );

  return {
    buffer: encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength
    ) as ArrayBuffer,
    wasConverted: changes.length > 0,
    changes,
    batchSize,
  };
}

/**
 * Create ORT session options optimized for WebGPU execution.
 */
export function getWebGPUSessionOptions(
  enableGraphCapture: boolean = true
): Record<string, unknown> {
  return {
    executionProviders: ['webgpu'],
    graphOptimizationLevel: 'all',
    enableGraphCapture,
    preferredOutputLocation: 'gpu-buffer',
    executionMode: 'sequential',
  };
}

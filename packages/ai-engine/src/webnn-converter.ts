/**
 * WebNN Model Converter
 *
 * Converts ONNX models for WebNN execution by:
 * 1. Making the batch dimension static — WebNN's MLGraph (like WebGPU graph capture)
 *    requires static shapes to compile. Without this, ORT's WebNN EP can only claim
 *    ~66/1600 nodes (those with no dynamic dims), causing crashes during MLGraph.build().
 * 2. Decomposes Softplus/LogSoftmax into WebNN-supported primitives.
 *
 * Uses the same protobufjs approach as webgpu-converter.ts.
 */

import protobuf from 'protobufjs';

// Reuse the ONNX schema from webgpu-converter by importing the shared bits
// (protobufjs schema is duplicated here to keep the file self-contained)
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
            quantizationAnnotation: { rule: 'repeated', type: 'TensorAnnotation', id: 14 },
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
            uint64Data: { rule: 'repeated', type: 'uint64', id: 11, options: { packed: true } },
          },
          nested: {
            Segment: {
              fields: { begin: { type: 'int64', id: 1 }, end: { type: 'int64', id: 2 } },
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
            Sequence: { fields: { elemType: { type: 'TypeProto', id: 1 } } },
            Map: {
              fields: {
                keyType: { type: 'int32', id: 1 },
                valueType: { type: 'TypeProto', id: 2 },
              },
            },
            Optional: { fields: { elemType: { type: 'TypeProto', id: 1 } } },
            SparseTensor: {
              fields: {
                elemType: { type: 'int32', id: 1 },
                shape: { type: 'TensorShapeProto', id: 2 },
              },
            },
          },
        },
        TensorShapeProto: {
          fields: { dim: { rule: 'repeated', type: 'Dimension', id: 1 } },
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
          fields: { domain: { type: 'string', id: 1 }, version: { type: 'int64', id: 2 } },
        },
        StringStringEntryProto: {
          fields: { key: { type: 'string', id: 1 }, value: { type: 'string', id: 2 } },
        },
        TensorAnnotation: {
          fields: {
            tensorName: { type: 'string', id: 1 },
            quantParameterTensorNames: { rule: 'repeated', type: 'StringStringEntryProto', id: 2 },
          },
        },
        TrainingInfoProto: {
          fields: {
            initialization: { type: 'GraphProto', id: 1 },
            algorithm: { type: 'GraphProto', id: 2 },
            initializationBinding: { rule: 'repeated', type: 'StringStringEntryProto', id: 3 },
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

// ONNX data types
const ONNX_FLOAT = 1;
const ONNX_FLOAT16 = 10;

let _root: protobuf.Root | null = null;
function getRoot(): protobuf.Root {
  if (!_root) _root = protobuf.Root.fromJSON(ONNX_SCHEMA);
  return _root;
}

export interface WebNNConversionResult {
  buffer: ArrayBuffer;
  wasConverted: boolean;
  changes: string[];
  batchSize: number;
}

/**
 * Check if a model filename indicates it's already WebNN-optimized.
 */
export function isWebNNOptimized(modelName: string): boolean {
  return modelName.includes('.webnn.');
}

/**
 * Convert an ONNX model for WebNN execution.
 *
 * WebNN's MLGraph compiler (like WebGPU graph capture) requires static shapes
 * to compile op partitions. Without a static batch dim, ORT's WebNN EP can only
 * claim a handful of nodes where shapes happen to be fully static, crashing or
 * falling back entirely to WASM.
 *
 * Transformations applied:
 * 1. Make batch, height, width dimensions static (batch=1, boardSize×boardSize).
 *    freeDimensionOverrides is also set at session-creation time as a belt-and-suspenders
 *    approach — together these give 100% GPU coverage (1 MLGraph partition).
 * 2. Decompose Softplus → Relu + Log(1 + Exp(-Abs(x)))
 * 3. Decompose LogSoftmax → Log(Softmax(x))
 *
 * Works with both FP32 and FP16 models.
 */
export async function convertModelForWebNN(
  modelBuffer: ArrayBuffer,
  options?: { batchSize?: number; boardSize?: number }
): Promise<WebNNConversionResult> {
  const batchSize = options?.batchSize ?? 1;
  const boardSize = options?.boardSize ?? 19;
  const root = getRoot();
  const ModelProto = root.lookupType('onnx.ModelProto');

  console.log('[WebNN Converter] Parsing model...');
  const startTime = performance.now();

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

  // Step 1: Make all dynamic spatial dims static.
  // WebNN MLGraph.build() requires static shapes to assign nodes to GPU partitions.
  // Batching improves per-move throughput (batch=4 gives ~4x speedup per move).
  // height/width = boardSize (must match the actual board being analyzed).
  const STATIC_DIMS: Record<string, number> = {
    batch_size: batchSize,
    height: boardSize,
    width: boardSize,
  };
  const makeStatic = (valueInfos: any[], label: string) => {
    if (!valueInfos) return;
    for (const vi of valueInfos) {
      const dims = vi.type?.tensorType?.shape?.dim;
      if (!dims || dims.length === 0) continue;
      for (const dim of dims) {
        const name = dim.dimParam;
        if (name && STATIC_DIMS[name] !== undefined) {
          dim.dimValue = STATIC_DIMS[name];
          delete dim.dimParam;
          changes.push(`${label} ${vi.name}: ${name} → ${STATIC_DIMS[name]}`);
        } else if (!dim.dimParam && (!dim.dimValue || Number(dim.dimValue) <= 0)) {
          dim.dimValue = 1;
          delete dim.dimParam;
          changes.push(`${label} ${vi.name}: unknown → 1`);
        }
      }
    }
  };

  makeStatic(graph.input, 'input');
  makeStatic(graph.output, 'output');
  makeStatic(graph.valueInfo, 'value_info');

  // Step 2: Decompose ops unsupported by WebNN
  const newNodes: any[] = [];
  const newValueInfos: any[] = [];
  let softplusCount = 0;
  let logsoftmaxCount = 0;

  // Constant "1.0" initializer for Softplus decomposition
  const oneName = '__webnn_const_one';
  const oneBytes = new Uint8Array(isFp16 ? 2 : 4);
  if (isFp16) {
    oneBytes[0] = 0x00;
    oneBytes[1] = 0x3c; // FP16 1.0
  } else {
    new DataView(oneBytes.buffer).setFloat32(0, 1.0, true);
  }
  let needsOneConst = false;

  for (const node of graph.node) {
    if (node.opType === 'Softplus') {
      // Softplus(x) = Relu(x) + Log(1 + Exp(-Abs(x)))
      const x = node.input[0];
      const y = node.output[0];
      const p = `__wnsp_${softplusCount}`;

      newNodes.push(
        { input: [x], output: [`${p}_abs`], opType: 'Abs' },
        { input: [`${p}_abs`], output: [`${p}_neg`], opType: 'Neg' },
        { input: [`${p}_neg`], output: [`${p}_exp`], opType: 'Exp' },
        { input: [`${p}_exp`, oneName], output: [`${p}_add1`], opType: 'Add' },
        { input: [`${p}_add1`], output: [`${p}_log`], opType: 'Log' },
        { input: [x], output: [`${p}_relu`], opType: 'Relu' },
        { input: [`${p}_relu`, `${p}_log`], output: [y], opType: 'Add' }
      );

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
          newValueInfos.push({ name, type: JSON.parse(JSON.stringify(srcVi.type)) });
        }
      }

      softplusCount++;
      needsOneConst = true;
    } else if (node.opType === 'LogSoftmax') {
      // LogSoftmax(x) = Log(Softmax(x))
      const x = node.input[0];
      const y = node.output[0];
      const p = `__wnls_${logsoftmaxCount}`;
      const attrs = node.attribute?.filter((a: any) => a.name === 'axis') || [];

      newNodes.push(
        { input: [x], output: [`${p}_sm`], opType: 'Softmax', attribute: attrs },
        { input: [`${p}_sm`], output: [y], opType: 'Log' }
      );

      const srcVi = [...(graph.valueInfo || []), ...(graph.input || [])].find(
        (vi: any) => vi.name === x
      );
      if (srcVi?.type) {
        newValueInfos.push({ name: `${p}_sm`, type: JSON.parse(JSON.stringify(srcVi.type)) });
      }

      logsoftmaxCount++;
    } else {
      newNodes.push(node);
    }
  }

  if (softplusCount > 0) changes.push(`Replaced ${softplusCount} Softplus ops`);
  if (logsoftmaxCount > 0) changes.push(`Replaced ${logsoftmaxCount} LogSoftmax ops`);

  if (needsOneConst) {
    if (!graph.initializer) graph.initializer = [];
    graph.initializer.push({
      dims: [],
      dataType: isFp16 ? ONNX_FLOAT16 : ONNX_FLOAT,
      rawData: oneBytes,
      name: oneName,
    });
  }

  graph.node = newNodes;
  if (newValueInfos.length > 0) {
    if (!graph.valueInfo) graph.valueInfo = [];
    graph.valueInfo.push(...newValueInfos);
  }

  const encoded = ModelProto.encode(model).finish();
  const elapsed = performance.now() - startTime;

  const origMB = (modelBuffer.byteLength / 1024 / 1024).toFixed(1);
  const newMB = (encoded.byteLength / 1024 / 1024).toFixed(1);
  console.log(
    `[WebNN Converter] Done in ${elapsed.toFixed(0)}ms: ${origMB}MB → ${newMB}MB, ` +
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

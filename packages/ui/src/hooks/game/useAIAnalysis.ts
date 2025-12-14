import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  loadModelData,
  saveModelData,
  deleteModelData,
  loadModelLibrary,
  saveModelLibrary,
  loadSelectedModelId,
  saveSelectedModelId,
  getStoredModelIds,
  type StoredModelMetadata,
} from '../../services/modelStorage';
import { type AIModel, type AISettings, type GameInfo, type AIModelEntry } from '../../types/game';
import { GoBoard, Vertex } from '@kaya/goboard';
import { GameTreeNode } from '@kaya/gametree';
import { AnalysisResult } from '@kaya/ai-engine';
import { isTauriApp } from '../../services/fileSave';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const AI_SETTINGS_STORAGE_KEY = 'kaya-ai-settings';

// Predefined models - hosted on Hugging Face for reliable CORS support
const PREDEFINED_MODELS: Array<{
  id: string;
  name: string;
  description: string;
  url: string;
  size: string;
  predefinedId: string;
}> = [
  {
    id: 'katago-strongest',
    name: 'kata1-b28c512nbt-s11165M',
    description: 'Strongest network',
    url: 'https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-adam-s11165M-d5387M/kata1-b28c512nbt-adam-s11165M-d5387M.onnx',
    size: '~700 MB',
    predefinedId: 'strongest',
  },
  {
    id: 'katago-strongest-quant',
    name: 'kata1-b28c512nbt-s11165M (quantized)',
    description: 'Strongest network, reduced memory footprint',
    url: 'https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-adam-s11165M-d5387M/kata1-b28c512nbt-adam-s11165M-d5387M.quant.onnx',
    size: '~180 MB',
    predefinedId: 'strongest-quant',
  },
  {
    id: 'katago-latest',
    name: 'kata1-b28c512nbt-s12043M',
    description: 'Latest checkpoint (Dec 2025)',
    url: 'https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-s12043015936-d5616446734/kata1-b28c512nbt-s12043015936-d5616446734.onnx',
    size: '~700 MB',
    predefinedId: 'latest',
  },
  {
    id: 'katago-latest-quant',
    name: 'kata1-b28c512nbt-s12043M (quantized)',
    description: 'Latest checkpoint (Dec 2025), reduced memory footprint',
    url: 'https://huggingface.co/kaya-go/kaya/resolve/main/kata1-b28c512nbt-s12043015936-d5616446734/kata1-b28c512nbt-s12043015936-d5616446734.quant.onnx',
    size: '~180 MB',
    predefinedId: 'latest-quant',
  },
];

// Check if WebGPU is available
function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
}

// Check if running in Tauri (used for default backend selection)
function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Get default backend based on environment
function getDefaultBackend(): 'native' | 'wasm' {
  // In Tauri desktop, default to native for best performance
  if (isTauriDesktop()) {
    return 'native';
  }
  // In web, default to WASM (more stable than WebGPU)
  return 'wasm';
}

// Default AI settings
const DEFAULT_AI_SETTINGS: AISettings = {
  minProb: 0.01,
  maxTopMoves: 5, // Show up to 5 top moves by default
  // Default depends on environment - set dynamically
  backend: 'wasm', // This will be overridden by loadAISettings
  saveAnalysisToSgf: true,
};

// Load AI settings from localStorage
function loadAISettings(): AISettings {
  const hasGPU = isWebGPUAvailable();
  const isTauri = isTauriDesktop();
  const defaultBackend = getDefaultBackend();

  try {
    const stored = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate backend - if GPU was selected but not available, fallback to WASM
      let backend = parsed.backend;

      // 'native' and 'native-cpu' are only valid in Tauri desktop app
      // If we're on web and backend is 'native' or 'native-cpu', fallback to 'wasm'
      if ((backend === 'native' || backend === 'native-cpu') && !isTauri) {
        console.log('[AI Settings] Native backend not available on web, falling back to wasm');
        backend = 'wasm';
      } else if (!['native', 'native-cpu', 'webgpu', 'webgl', 'wasm'].includes(backend)) {
        backend = defaultBackend;
      } else if (backend === 'webgpu' && !hasGPU) {
        backend = 'wasm'; // GPU not available, fallback
      }

      return {
        minProb:
          typeof parsed.minProb === 'number' && parsed.minProb >= 0 && parsed.minProb <= 1
            ? parsed.minProb
            : DEFAULT_AI_SETTINGS.minProb,
        maxTopMoves:
          typeof parsed.maxTopMoves === 'number' &&
          parsed.maxTopMoves >= 1 &&
          parsed.maxTopMoves <= 10
            ? parsed.maxTopMoves
            : DEFAULT_AI_SETTINGS.maxTopMoves,
        backend,
        saveAnalysisToSgf:
          typeof parsed.saveAnalysisToSgf === 'boolean'
            ? parsed.saveAnalysisToSgf
            : DEFAULT_AI_SETTINGS.saveAnalysisToSgf,
      };
    }
  } catch (e) {
    console.warn('Failed to load AI settings from localStorage:', e);
  }
  // Return defaults with environment-specific backend
  return {
    ...DEFAULT_AI_SETTINGS,
    backend: defaultBackend,
  };
}

// Save AI settings to localStorage
function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('Failed to save AI settings to localStorage:', e);
  }
}

interface UseAIAnalysisProps {
  currentBoard: GoBoard;
  gameInfo: GameInfo;
  currentNode: GameTreeNode | null;
}

// Helper to parse GTP vertex
function parseGTPVertex(coord: string, boardSize: number): Vertex | null {
  if (coord.toLowerCase() === 'pass') return null;
  const alpha = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  if (coord.length < 2) return null;

  const x = alpha.indexOf(coord[0].toUpperCase());
  const y = boardSize - parseInt(coord.slice(1), 10);

  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return null;
  return [x, y];
}

export function useAIAnalysis({ currentBoard }: UseAIAnalysisProps) {
  // Legacy model state (for backward compatibility with AIAnalysisOverlay)
  const [customAIModel, setCustomAIModel] = useState<AIModel | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isAIConfigOpen, setAIConfigOpen] = useState(false);
  const [analysisMode, setAnalysisMode] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResultState, setAnalysisResultState] = useState<any | null>(null);
  const [aiSettings, setAISettingsState] = useState<AISettings>(loadAISettings);

  // Simple wrapper for consistency with context API
  const setAnalysisResult = useCallback((result: any | null) => {
    setAnalysisResultState(result);
  }, []);
  const analysisResult = analysisResultState;
  const [engineState, setEngineState] = useState<string>('ready');

  // Analysis cache (persisted across renders)
  const analysisCache = useRef<Map<string, AnalysisResult>>(new Map());

  // Shared cache size state - updated by all components that modify the cache
  const [analysisCacheSize, setAnalysisCacheSize] = useState<number>(0);

  // Function to sync cache size with actual cache
  const updateAnalysisCacheSize = useCallback(() => {
    setAnalysisCacheSize(analysisCache.current.size);
  }, []);

  // Model Library state
  const [modelLibrary, setModelLibrary] = useState<AIModelEntry[]>([]);
  const [selectedModelId, setSelectedModelIdState] = useState<string | null>(null);
  const downloadingRef = useRef<Set<string>>(new Set());

  // Initialize model library on mount
  useEffect(() => {
    const initModelLibrary = async () => {
      try {
        // Load stored model metadata
        const storedMetadata = await loadModelLibrary();
        const storedIds = await getStoredModelIds();
        const savedSelectedId = await loadSelectedModelId();

        // Build library from predefined models + stored user models
        const library: AIModelEntry[] = [];

        // Add predefined models
        for (const preset of PREDEFINED_MODELS) {
          const storedMeta = storedMetadata.find(m => m.id === preset.id);
          const isDownloaded = storedIds.includes(preset.id);

          library.push({
            id: preset.id,
            name: preset.name,
            description: preset.description,
            url: preset.url,
            predefinedId: preset.predefinedId,
            isDownloaded,
            size: storedMeta?.size,
            date: storedMeta?.date,
          });
        }

        // Add user-uploaded models
        const userModels = storedMetadata.filter(m => m.isUserModel);
        for (const userModel of userModels) {
          const isDownloaded = storedIds.includes(userModel.id);
          if (isDownloaded) {
            library.push({
              id: userModel.id,
              name: userModel.name,
              description: userModel.description,
              size: userModel.size,
              date: userModel.date,
              isDownloaded: true,
              isUserModel: true,
            });
          }
        }

        setModelLibrary(library);

        // Set selected model
        if (savedSelectedId && library.some(m => m.id === savedSelectedId && m.isDownloaded)) {
          setSelectedModelIdState(savedSelectedId);
        } else {
          // Default to strongest model if downloaded, otherwise first downloaded
          const defaultModel = library.find(m => m.predefinedId === 'strongest' && m.isDownloaded)
            || library.find(m => m.isDownloaded);
          if (defaultModel) {
            setSelectedModelIdState(defaultModel.id);
            await saveSelectedModelId(defaultModel.id);
          }
        }

        setIsModelLoaded(true);
      } catch (err) {
        console.error('Failed to initialize model library:', err);
        setIsModelLoaded(true);
      }
    };

    initModelLibrary();
  }, []);

  // Sync customAIModel metadata with selectedModelId for backward compatibility
  // IMPORTANT: We do NOT load the actual model data here to avoid keeping ~700MB in memory.
  // The data is loaded on-demand when analysis starts (in AIAnalysisOverlay).
  useEffect(() => {
    if (!selectedModelId || !isModelLoaded) {
      setCustomAIModel(null);
      return;
    }

    const model = modelLibrary.find(m => m.id === selectedModelId);
    if (model && model.isDownloaded) {
      // Only store metadata - NOT the actual ArrayBuffer data
      // Use selectedModelId as a marker that data should be loaded on-demand
      setCustomAIModel({
        data: selectedModelId, // This is now just an ID reference, not actual data
        name: model.name,
        size: model.size,
        date: model.date,
      });
    } else {
      setCustomAIModel(null);
    }
  }, [selectedModelId, isModelLoaded, modelLibrary]);

  // Download a model
  const downloadModel = useCallback(
    async (id: string) => {
      const model = modelLibrary.find(m => m.id === id);
      if (!model || !model.url || downloadingRef.current.has(id)) return;

      downloadingRef.current.add(id);

      // Update library to show downloading state
      setModelLibrary(prev =>
        prev.map(m => (m.id === id ? { ...m, isDownloading: true, downloadProgress: 0 } : m))
      );

      try {
        let response: Response | null = null;
        let lastError: any = null;

        if (isTauriApp()) {
          try {
            response = await tauriFetch(model.url);
          } catch (e) {
            lastError = e;
          }
        } else {
          // Web environment: Direct download from Hugging Face (CORS enabled)
          try {
            console.log(`[ModelDownload] Downloading: ${model.url}`);
            const res = await fetch(model.url);
            if (res.ok) {
              console.log(`[ModelDownload] Success`);
              response = res;
            } else {
              console.warn(`[ModelDownload] Failed: ${res.status} ${res.statusText}`);
            }
          } catch (e) {
            lastError = e;
            console.warn(`[ModelDownload] Network error:`, e);
          }
        }

        if (!response || !response.ok) {
          throw new Error(
            `Failed to download: ${response?.statusText || lastError?.message || 'Unknown error'}`
          );
        }

        const contentLength = response.headers.get('Content-Length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let loaded = 0;

        const reader = response.body?.getReader();
        if (!reader) throw new Error('ReadableStream not supported');

        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;
          if (total) {
            const progress = Math.round((loaded / total) * 100);
            setModelLibrary(prev =>
              prev.map(m => (m.id === id ? { ...m, downloadProgress: progress } : m))
            );
          }
        }

        // Concatenate chunks directly into a single ArrayBuffer to avoid memory bloat
        // (Blob + arrayBuffer() creates multiple copies and can crash the browser)
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = new ArrayBuffer(totalLength);
        const view = new Uint8Array(buffer);
        let offset = 0;
        for (const chunk of chunks) {
          view.set(chunk, offset);
          offset += chunk.length;
        }
        // Free chunks memory immediately
        chunks.length = 0;

        // Save to storage
        await saveModelData(id, buffer);

        // Update metadata
        const storedMetadata = await loadModelLibrary();
        const newMetadata: StoredModelMetadata = {
          id,
          name: model.name,
          description: model.description,
          size: buffer.byteLength,
          date: Date.now(),
          predefinedId: model.predefinedId,
          url: model.url,
        };

        const existingIndex = storedMetadata.findIndex(m => m.id === id);
        if (existingIndex >= 0) {
          storedMetadata[existingIndex] = newMetadata;
        } else {
          storedMetadata.push(newMetadata);
        }
        await saveModelLibrary(storedMetadata);

        // Update library state
        setModelLibrary(prev =>
          prev.map(m =>
            m.id === id
              ? {
                  ...m,
                  isDownloaded: true,
                  isDownloading: false,
                  downloadProgress: undefined,
                  size: buffer.byteLength,
                  date: Date.now(),
                }
              : m
          )
        );

        // Auto-select if this is the first downloaded model
        const hasSelected = modelLibrary.some(m => m.id === selectedModelId && m.isDownloaded);
        if (!hasSelected) {
          setSelectedModelIdState(id);
          await saveSelectedModelId(id);
        }

        // Use default toast if available (not available in hook, relying on UI feedback)
      } catch (err) {
        console.error('Failed to download model:', err);
        setModelLibrary(prev =>
          prev.map(m =>
            m.id === id ? { ...m, isDownloading: false, downloadProgress: undefined } : m
          )
        );
        throw err;
      } finally {
        downloadingRef.current.delete(id);
      }
    },
    [modelLibrary, selectedModelId]
  );

  // Delete a model
  const deleteModel = useCallback(
    async (id: string) => {
      try {
        // Delete data from storage
        await deleteModelData(id);

        // Update metadata
        const storedMetadata = await loadModelLibrary();
        const model = modelLibrary.find(m => m.id === id);

        if (model?.isUserModel) {
          // Remove user model entirely from metadata
          const filtered = storedMetadata.filter(m => m.id !== id);
          await saveModelLibrary(filtered);

          // Remove from library
          setModelLibrary(prev => prev.filter(m => m.id !== id));
        } else {
          // Keep predefined model in library but mark as not downloaded
          setModelLibrary(prev =>
            prev.map(m =>
              m.id === id ? { ...m, isDownloaded: false, size: undefined, date: undefined } : m
            )
          );
        }

        // If this was the selected model, clear selection
        if (selectedModelId === id) {
          setSelectedModelIdState(null);
          await saveSelectedModelId(null);
          setCustomAIModel(null);
        }
      } catch (err) {
        console.error('Failed to delete model:', err);
        throw err;
      }
    },
    [modelLibrary, selectedModelId]
  );

  // Upload a model
  const uploadModel = useCallback(async (file: File) => {
    const id = `user-${Date.now()}-${file.name}`;
    const buffer = await file.arrayBuffer();

    // Save to storage
    await saveModelData(id, buffer);

    // Update metadata
    const storedMetadata = await loadModelLibrary();
    const newMetadata: StoredModelMetadata = {
      id,
      name: file.name,
      description: 'User uploaded model',
      size: file.size,
      date: Date.now(),
      isUserModel: true,
    };
    storedMetadata.push(newMetadata);
    await saveModelLibrary(storedMetadata);

    // Add to library
    const newEntry: AIModelEntry = {
      id,
      name: file.name,
      description: 'User uploaded model',
      size: file.size,
      date: Date.now(),
      isDownloaded: true,
      isUserModel: true,
    };

    setModelLibrary(prev => [...prev, newEntry]);

    // Auto-select the uploaded model
    setSelectedModelIdState(id);
    await saveSelectedModelId(id);
  }, []);

  // Set selected model ID with persistence
  const setSelectedModelId = useCallback(async (id: string | null) => {
    setSelectedModelIdState(id);
    await saveSelectedModelId(id);
  }, []);

  // Legacy wrapper for setCustomAIModel (for backward compatibility)
  const handleSetCustomAIModel = useCallback(
    async (model: AIModel | null) => {
      // This is now handled through the model library
      // But we keep it for backward compatibility
      if (model && model.data instanceof File) {
        await uploadModel(model.data);
      } else if (!model) {
        // Clear selection
        setSelectedModelIdState(null);
        await saveSelectedModelId(null);
        setCustomAIModel(null);
      }
    },
    [uploadModel]
  );

  const setAISettings = useCallback((settings: Partial<AISettings>) => {
    setAISettingsState(prev => {
      const newSettings = { ...prev, ...settings };
      saveAISettings(newSettings);
      return newSettings;
    });
  }, []);

  // Derived values
  // Ownership heatmap state
  const [showOwnership, setShowOwnership] = useState(false);
  const toggleOwnership = useCallback(() => {
    setShowOwnership(prev => {
      const newValue = !prev;
      // When enabling ownership view, also enable analysis mode to start the engine
      if (newValue && !analysisMode) {
        setAnalysisMode(true);
      }
      return newValue;
    });
  }, [analysisMode, setAnalysisMode]);

  // Top moves heatmap state (default OFF - user must enable)
  const [showTopMoves, setShowTopMoves] = useState(false);
  const toggleTopMoves = useCallback(() => {
    setShowTopMoves(prev => {
      const newValue = !prev;
      // When enabling top moves view, also enable analysis mode to start the engine
      if (newValue && !analysisMode) {
        setAnalysisMode(true);
      }
      return newValue;
    });
  }, [analysisMode, setAnalysisMode]);

  // Analysis bar visibility (independent from analysisMode which controls engine)
  const [showAnalysisBar, setShowAnalysisBar] = useState(false);
  const toggleShowAnalysisBar = useCallback(() => {
    setShowAnalysisBar(prev => {
      const newValue = !prev;
      // Sync showTopMoves with showAnalysisBar:
      // - When enabling analysis bar, also enable top moves
      // - When disabling analysis bar, also disable top moves
      setShowTopMoves(newValue);
      // Sync analysisMode with showAnalysisBar:
      // - When enabling analysis bar, enable analysisMode to trigger live analysis
      // - When disabling analysis bar, disable analysisMode to stop live analysis
      // This ensures that navigating to positions without cached results only triggers
      // computation when the analysis bar is visible
      if (newValue && !analysisMode) {
        setAnalysisMode(true);
      } else if (!newValue && analysisMode) {
        setAnalysisMode(false);
      }
      return newValue;
    });
  }, [analysisMode, setAnalysisMode]);

  const winRate = useMemo(() => analysisResult?.winRate ?? null, [analysisResult]);
  const scoreLead = useMemo(() => analysisResult?.scoreLead ?? null, [analysisResult]);
  const bestMove = useMemo(() => {
    if (!analysisResult?.moveSuggestions?.[0]?.move) return null;
    return parseGTPVertex(analysisResult.moveSuggestions[0].move, currentBoard.width);
  }, [analysisResult, currentBoard.width]);

  return {
    customAIModel,
    setCustomAIModel: handleSetCustomAIModel,
    isModelLoaded,
    isAIConfigOpen,
    setAIConfigOpen,
    analysisMode,
    setAnalysisMode,
    isAnalyzing,
    setIsAnalyzing,
    analysisResult,
    setAnalysisResult,
    showOwnership,
    toggleOwnership,
    showTopMoves,
    toggleTopMoves,
    showAnalysisBar,
    setShowAnalysisBar,
    toggleShowAnalysisBar,
    aiSettings,
    setAISettings,
    winRate,
    scoreLead,
    bestMove,
    engineState,
    analysisCache,
    analysisCacheSize,
    updateAnalysisCacheSize,
    // Model Library
    modelLibrary,
    selectedModelId,
    setSelectedModelId,
    downloadModel,
    deleteModel,
    uploadModel,
  };
}

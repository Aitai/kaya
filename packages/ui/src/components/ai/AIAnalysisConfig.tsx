import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  LuX,
  LuBrain,
  LuSettings,
  LuTrash2,
  LuUpload,
  LuCpu,
  LuDownload,
  LuCheck,
  LuLoader,
} from 'react-icons/lu';
import { useGameTree } from '../../contexts/GameTreeContext';
import { useToast } from '../ui/Toast';
import { isTauriApp } from '../../services/fileSave';
import './AIAnalysisConfig.css';

export const AIAnalysisConfig: React.FC = () => {
  const { t } = useTranslation();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const {
    aiSettings,
    setAISettings,
    isAIConfigOpen,
    setAIConfigOpen,
    modelLibrary,
    selectedModelId,
    setSelectedModelId,
    downloadModel,
    deleteModel,
    uploadModel,
  } = useGameTree();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve portal container after mount to avoid SSR issues
  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isAIConfigOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAIConfigOpen]);

  // Close modal on Escape to mimic native dialogs
  useEffect(() => {
    if (!isAIConfigOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAIConfigOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isAIConfigOpen, setAIConfigOpen]);

  const closeModal = () => setAIConfigOpen(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await uploadModel(file);
        showToast(t('aiConfig.modelUploadedSuccess'), 'success');
      } catch (err) {
        showToast(t('aiConfig.modelUploadFailed'), 'error');
      }
    }
    // Reset input so the same file can be selected again
    event.target.value = '';
  };

  const handleDownload = async (id: string) => {
    try {
      await downloadModel(id);
      showToast(t('aiConfig.modelDownloadedSuccess'), 'success');
    } catch (err) {
      showToast(t('aiConfig.modelDownloadFailed'), 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteModel(id);
      showToast(t('aiConfig.modelDeletedSuccess'), 'success');
    } catch (err) {
      showToast(t('aiConfig.modelDeleteFailed'), 'error');
    }
  };

  const handleSelect = async (id: string) => {
    const model = modelLibrary.find(m => m.id === id);
    if (model?.isDownloaded) {
      await setSelectedModelId(id);
    }
  };

  // Check if any model is currently downloading
  const isAnyDownloading = modelLibrary.some(m => m.isDownloading);

  const modalContent = (
    <div
      className="ai-info-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Analysis configuration"
      onClick={closeModal}
    >
      <div
        className="ai-info-modal"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
      >
        <div className="ai-info-header">
          <div className="ai-info-title">
            <LuBrain className="ai-info-icon-main" />
            <h2>{t('aiConfig.title')}</h2>
          </div>
          <button
            className="ai-info-close"
            onClick={closeModal}
            aria-label="Close analysis config dialog"
          >
            <LuX />
          </button>
        </div>

        <div className="ai-info-content">
          <div className="ai-config-container">
            {/* Model Library Section */}
            <section className="ai-config-section">
              <div className="section-header">
                <LuBrain className="section-icon" />
                <h3>{t('aiConfig.modelLibrary')}</h3>
              </div>
              <div className="config-note" style={{ marginBottom: '12px' }}>
                {t('aiConfig.modelLibraryDescription')}
              </div>

              <div className="model-library-list">
                {modelLibrary.map(model => (
                  <div
                    key={model.id}
                    className={`model-library-item ${model.isDownloaded ? 'downloaded' : ''} ${
                      selectedModelId === model.id ? 'selected' : ''
                    }`}
                    onClick={() => model.isDownloaded && handleSelect(model.id)}
                    role={model.isDownloaded ? 'button' : undefined}
                    tabIndex={model.isDownloaded ? 0 : undefined}
                  >
                    <div className="model-library-info">
                      <div className="model-library-name">
                        {model.name}
                        {model.recommended && (
                          <span className="model-recommended-badge">{t('aiConfig.recommended')}</span>
                        )}
                        {model.isDefault && (
                          <span className="model-default-badge">{t('aiConfig.default')}</span>
                        )}
                        {selectedModelId === model.id && (
                          <span className="model-active-badge">
                            <LuCheck size={12} /> {t('aiConfig.active')}
                          </span>
                        )}
                      </div>
                      <div className="model-library-meta">
                        <span className="model-library-desc">{model.description}</span>
                        {model.size && (
                          <span className="model-library-size">
                            {(model.size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="model-library-actions">
                      {model.isDownloading ? (
                        <div className="model-download-progress">
                          <LuLoader className="spinning" size={16} />
                          <span>{model.downloadProgress ?? 0}%</span>
                        </div>
                      ) : model.isDownloaded ? (
                        <button
                          className="model-action-btn danger"
                          onClick={e => {
                            e.stopPropagation();
                            handleDelete(model.id);
                          }}
                          title={t('aiConfig.deleteModel')}
                        >
                          <LuTrash2 size={16} />
                        </button>
                      ) : (
                        <button
                          className="model-action-btn primary"
                          onClick={e => {
                            e.stopPropagation();
                            handleDownload(model.id);
                          }}
                          disabled={isAnyDownloading}
                          title={t('aiConfig.downloadModel')}
                        >
                          <LuDownload size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Upload Button */}
              <div className="model-upload-section">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept=".onnx,.bin"
                  style={{ display: 'none' }}
                />
                <button
                  className="model-upload-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnyDownloading}
                >
                  <LuUpload size={16} /> {t('aiConfig.uploadCustomModel')}
                </button>
              </div>
            </section>

            {/* Settings Section */}
            <section className="ai-config-section">
              <div className="section-header">
                <LuSettings className="section-icon" />
                <h3>{t('aiConfig.settings')}</h3>
              </div>

              <div className="settings-list">
                {/* Backend Selection - Full width */}
                <div className="setting-item setting-item-full">
                  <div className="setting-info">
                    <label htmlFor="backend-select" className="setting-label">
                      {t('aiConfig.inferenceBackend')}
                    </label>
                    <p className="setting-description">
                      {t('aiConfig.inferenceBackendDescription')}
                    </p>
                  </div>
                  <select
                    id="backend-select"
                    value={
                      // If GPU was selected but not available, show WASM as selected
                      aiSettings.backend === 'webgpu' &&
                      !(typeof navigator !== 'undefined' && (navigator as any).gpu)
                        ? 'wasm'
                        : aiSettings.backend
                    }
                    onChange={e => setAISettings({ backend: e.target.value as any })}
                    className="ai-select"
                  >
                    {/* Native backends: fastest, only available in Tauri desktop app */}
                    {isTauriApp() && (
                      <>
                        <option value="native">{t('aiConfig.nativeAuto')}</option>
                        <option value="native-cpu">{t('aiConfig.nativeCpu')}</option>
                      </>
                    )}
                    {/* Only show WebGPU if supported */}
                    {typeof navigator !== 'undefined' && (navigator as any).gpu && (
                      <option value="webgpu">{t('aiConfig.webgpu')}</option>
                    )}
                    <option value="wasm">{t('aiConfig.wasm')}</option>
                  </select>
                </div>

                {/* Max Top Moves - Left column */}
                <div className="setting-item">
                  <div className="setting-info">
                    <label htmlFor="max-top-moves-slider" className="setting-label">
                      {t('aiConfig.maxTopMoves')}
                      <span className="setting-value">{aiSettings.maxTopMoves}</span>
                    </label>
                    <p className="setting-description">{t('aiConfig.maxTopMovesDescription')}</p>
                  </div>
                  <input
                    id="max-top-moves-slider"
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={aiSettings.maxTopMoves}
                    onChange={e => setAISettings({ maxTopMoves: parseInt(e.target.value) })}
                    className="ai-slider"
                  />
                </div>

                {/* Min Probability - Right column */}
                <div className="setting-item">
                  <div className="setting-info">
                    <label htmlFor="min-prob-slider" className="setting-label">
                      {t('aiConfig.minProbability')}
                      <span className="setting-value">
                        {(aiSettings.minProb * 100).toFixed(0)}%
                      </span>
                    </label>
                    <p className="setting-description">{t('aiConfig.minProbabilityDescription')}</p>
                  </div>
                  <input
                    id="min-prob-slider"
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.01"
                    value={aiSettings.minProb}
                    onChange={e => setAISettings({ minProb: parseFloat(e.target.value) })}
                    className="ai-slider"
                  />
                </div>

                {/* Save Analysis to SGF - Full width toggle */}
                <div className="setting-item setting-item-toggle setting-item-full">
                  <div className="setting-info">
                    <label htmlFor="save-analysis-check" className="setting-label">
                      {t('aiConfig.saveAnalysisToSgf')}
                    </label>
                    <p className="setting-description">
                      {t('aiConfig.saveAnalysisToSgfDescription')}
                    </p>
                  </div>
                  <button
                    id="save-analysis-check"
                    type="button"
                    role="switch"
                    aria-checked={aiSettings.saveAnalysisToSgf}
                    className={`toggle-switch ${aiSettings.saveAnalysisToSgf ? 'active' : ''}`}
                    onClick={() =>
                      setAISettings({ saveAnalysisToSgf: !aiSettings.saveAnalysisToSgf })
                    }
                  >
                    <span className="toggle-switch-handle" />
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        className="ai-info-trigger"
        onClick={() => setAIConfigOpen(true)}
        title={t('aiConfig.title')}
        aria-label={t('aiConfig.title')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '4px',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        <LuCpu size={20} />
      </button>

      {isAIConfigOpen && portalContainer && createPortal(modalContent, portalContainer)}
    </>
  );
};

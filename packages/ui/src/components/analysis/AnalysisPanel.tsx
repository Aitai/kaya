/**
 * Analysis Panel with Tabs
 *
 * Container component that provides tabbed navigation between
 * the analysis graph and performance report views.
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LuChartLine, LuChartBar } from 'react-icons/lu';
import { AnalysisGraphPanel } from './AnalysisGraphPanel';
import { PerformanceReportTab } from './PerformanceReportTab';
import './AnalysisPanel.css';

export type AnalysisPanelTab = 'graph' | 'report';

export interface AnalysisPanelProps {
  className?: string;
  defaultTab?: AnalysisPanelTab;
}

/**
 * Tabbed analysis panel containing graph and report views
 */
export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  className = '',
  defaultTab = 'graph',
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<AnalysisPanelTab>(defaultTab);

  const handleTabChange = useCallback((tab: AnalysisPanelTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <div className={`analysis-panel ${className}`}>
      <div className="analysis-panel-tabs">
        <button
          className={`analysis-panel-tab ${activeTab === 'graph' ? 'active' : ''}`}
          onClick={() => handleTabChange('graph')}
          title={t('analysisPanel.graphTab')}
          aria-selected={activeTab === 'graph'}
          role="tab"
        >
          <LuChartLine size={14} />
          <span>{t('analysisPanel.graphTab')}</span>
        </button>
        <button
          className={`analysis-panel-tab ${activeTab === 'report' ? 'active' : ''}`}
          onClick={() => handleTabChange('report')}
          title={t('analysisPanel.reportTab')}
          aria-selected={activeTab === 'report'}
          role="tab"
        >
          <LuChartBar size={14} />
          <span>{t('analysisPanel.reportTab')}</span>
        </button>
      </div>

      <div className="analysis-panel-content" role="tabpanel">
        {activeTab === 'graph' && <AnalysisGraphPanel />}
        {activeTab === 'report' && <PerformanceReportTab />}
      </div>
    </div>
  );
};

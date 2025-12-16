import React, { useState, useEffect } from 'react';
import { shouldShowEngineControl, getCurrentEnvironment, isDevelopment } from '../utils/environment';

interface PDFEngineConfig {
  engine: string;
  documentAIEnabled: boolean;
  fallbackEnabled: boolean;
  maxFileSize: number;
  qualityThreshold: number;
}

interface PDFEngineAvailability {
  'pdf-parse': boolean;
  'document-ai': boolean;
}

interface PDFEngineStatus {
  config: PDFEngineConfig;
  availability: PDFEngineAvailability;
  recommendations: {
    recommended: string;
    reason: string;
  };
}

const PDFEngineControl: React.FC = () => {
  const [status, setStatus] = useState<PDFEngineStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  
  // 環境設定を取得
  const environment = getCurrentEnvironment();
  
  // 環境に応じてコンポーネント表示を制御
  if (!shouldShowEngineControl()) {
    return null; // 非表示
  }

  // 現在の状態を取得
  const fetchStatus = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/pdf-engine/config`);
      if (!response.ok) {
        throw new Error('設定の取得に失敗しました');
      }
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  useEffect(() => {
    fetchStatus();
    // 30秒ごとに状態を更新
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const getEngineDisplayName = (engine: string) => {
    switch (engine) {
      case 'pdf-parse':
        return '通常モード';
      case 'document-ai':
        return '高性能モード';
      case 'auto':
        return '自動選択';
      default:
        return engine;
    }
  };

  const getEngineDescription = (engine: string) => {
    switch (engine) {
      case 'pdf-parse':
        return '基本的なPDF解析（高速・軽量）';
      case 'document-ai':
        return 'Google Document AI（高精度・構造化）';
      default:
        return '';
    }
  };

  const getStatusColor = (available: boolean) => {
    return available ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (available: boolean) => {
    return available ? '✓' : '✗';
  };

  if (!status) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* ヘッダー部分（常に表示） */}
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">PDFエンジン設定</h3>
          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
            高性能モード優先
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchStatus();
            }}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium p-1"
            title="更新"
          >
            🔄
          </button>
          <span className={`transform transition-transform ${isCollapsed ? '' : 'rotate-180'}`}>
            ▼
          </span>
        </div>
      </div>

      {/* 詳細部分（折りたたみ可能） */}
      {!isCollapsed && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 動作説明 */}
          <div className="mb-6 mt-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-sm font-medium text-blue-800 mb-2">動作モード</h4>
              <p className="text-sm text-blue-700">
                常に高性能モード（Document AI）で分析を開始し、エラーが発生した場合は自動的に通常モード（pdf-parse）にフォールバックします。
              </p>
            </div>
          </div>

          {/* エンジン可用性 */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">エンジン可用性</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">高性能モード (Document AI)</span>
                <span className={`text-sm font-medium ${getStatusColor(status.availability['document-ai'])}`}>
                  {getStatusIcon(status.availability['document-ai'])} 
                  {status.availability['document-ai'] ? '利用可能' : '利用不可'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">通常モード (pdf-parse)</span>
                <span className={`text-sm font-medium ${getStatusColor(status.availability['pdf-parse'])}`}>
                  {getStatusIcon(status.availability['pdf-parse'])} 
                  {status.availability['pdf-parse'] ? '利用可能' : '利用不可'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFEngineControl; 
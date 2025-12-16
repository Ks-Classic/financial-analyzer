import React, { useState, useMemo } from 'react';
import { AnalysisResult } from '../types';

interface ResultsDisplayProps {
  results: AnalysisResult[];
  analysisInfo?: {
    engineUsed?: string;
    engineInfo?: string;
    fallbackReason?: string;
    timestamp?: string;
  };
  pdfFile?: File | null;
}

const CATEGORIES = [
  '数値計算の誤り',
  '表示・記載の誤り', 
  '事実関係の誤り',
  '重要事項の遺漏',
  '品質管理上の問題'
] as const;

type CategoryType = typeof CATEGORIES[number];

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results, pdfFile }) => {
  const [selectedCategories, setSelectedCategories] = useState<string[]>(CATEGORIES.slice());
  
  // デバッグ: 初期状態を確認
  console.log('=== ResultsDisplay 初期化 ===');
  console.log('CATEGORIES:', CATEGORIES);
  console.log('初期selectedCategories:', selectedCategories);
  const [showExportSection, setShowExportSection] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    categories: CATEGORIES.slice(),
    includeStatistics: true,
    format: 'full' as 'full' | 'summary',
    title: '財務レポート分析結果'
  });

  // フィルタリングされた結果
  const filteredResults = useMemo(() => {
    const filtered = results.filter(result => selectedCategories.includes(result.type));
    
    // デバッグログ: フィルタリング状況を確認
    console.log('=== ResultsDisplay フィルタリング状況 ===');
    console.log('全結果数:', results.length);
    console.log('選択中カテゴリ:', selectedCategories);
    console.log('フィルタ後結果数:', filtered.length);
    
    if (results.length > 0) {
      console.log('全結果のtype一覧:');
      results.forEach((result, index) => {
        const isIncluded = selectedCategories.includes(result.type);
        console.log(`結果${index + 1}: type="${result.type}" ${isIncluded ? '✓' : '✗'}`);
      });
    }
    
    return filtered;
  }, [results, selectedCategories]);

  // カテゴリ別の件数を計算
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    CATEGORIES.forEach(category => {
      counts[category] = results.filter(r => r.type === category).length;
    });
    return counts;
  }, [results]);

  const handleCategoryToggle = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case '数値計算の誤り':
        return 'bg-red-100 text-red-800 border-red-200';
      case '表示・記載の誤り':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case '事実関係の誤り':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case '重要事項の遺漏':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case '品質管理上の問題':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case '数値計算の誤り':
        return '🧮';
      case '表示・記載の誤り':
        return '📈';
      case '事実関係の誤り':
        return '❌';
      case '重要事項の遺漏':
        return '⚠️';
      case '品質管理上の問題':
        return '📝';
      default:
        return '📋';
    }
  };

  const getCategoryButtonStyle = (category: string) => {
    const isSelected = selectedCategories.includes(category);
    const baseStyle = "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all duration-200 flex items-center gap-1.5 hover:shadow-sm";
    
    switch (category) {
      case '数値計算の誤り':
        return `${baseStyle} ${isSelected 
          ? 'bg-red-500 text-white border-red-600 shadow-md' 
          : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`;
      case '表示・記載の誤り':
        return `${baseStyle} ${isSelected 
          ? 'bg-orange-500 text-white border-orange-600 shadow-md' 
          : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`;
      case '事実関係の誤り':
        return `${baseStyle} ${isSelected 
          ? 'bg-yellow-500 text-white border-yellow-600 shadow-md' 
          : 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'}`;
      case '重要事項の遺漏':
        return `${baseStyle} ${isSelected 
          ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
          : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`;
      case '品質管理上の問題':
        return `${baseStyle} ${isSelected 
          ? 'bg-purple-500 text-white border-purple-600 shadow-md' 
          : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'}`;
      default:
        return `${baseStyle} ${isSelected 
          ? 'bg-gray-500 text-white border-gray-600 shadow-md' 
          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`;
    }
  };

  const formatLocationInfo = (location?: AnalysisResult['location']) => {
    if (!location) return null;
    
    const parts = [];
    if (location.tableTitle) parts.push(location.tableTitle);
    if (location.sectionName) parts.push(location.sectionName);
    if (location.rowName) parts.push(location.rowName);
    if (location.columnName) parts.push(location.columnName);
    
    return parts.length > 0 ? parts.join(' • ') : null;
  };

  const [exportError, setExportError] = useState<string | null>(null);

  const handleExportPDF = async () => {
    if (results.length === 0) {
      alert('エクスポートする分析結果がありません');
      return;
    }

    setIsExporting(true);
    setExportError(null); // エクスポート開始時に前回のエラーをクリア
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      
      console.log('=== PDF エクスポート開始 ===');
      console.log('結果数:', results.length);
      console.log('エクスポートオプション:', exportOptions);
      
      const response = await fetch(`${apiUrl}/api/export/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results,
          options: exportOptions
        }),
      });

      if (!response.ok) {
        // エラーレスポンスをテキストとして取得
        const errorText = await response.text();
        console.error('サーバーからのエラーレスポンス:', errorText);
        // JSON形式のエラーを試みるが、失敗したらテキストをそのまま使う
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.message || errorText);
        } catch {
          throw new Error(errorText);
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `財務レポート分析結果_${timestamp}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      console.log('PDF ダウンロード完了');
      
    } catch (error) {
      const err = error as Error;
      console.error('PDF エクスポートエラー:', err);
      // エラーメッセージをstateに保存してUIに表示
      setExportError(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handlePreviewHTML = async () => {
    if (results.length === 0) {
      alert('プレビューする分析結果がありません');
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      
      const response = await fetch(`${apiUrl}/api/export/html-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results,
          options: exportOptions
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      // Blobを使用して文字コードを明示的に指定し、文字化けを防ぐ
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const newWindow = window.open(url);
      if (newWindow) {
        // 新しいウィンドウが開いたら、URLを解放する（メモリリーク防止）
        newWindow.onload = () => {
          URL.revokeObjectURL(url);
        };
      }
      
    } catch (error) {
      console.error('HTML プレビューエラー:', error);
      alert(`HTMLプレビューに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleExportCategoryChange = (category: string, checked: boolean) => {
    setExportOptions(prev => ({
      ...prev,
      categories: checked 
        ? [...prev.categories, category as CategoryType]
        : prev.categories.filter(c => c !== category)
    }));
  };

  if (results.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">分析結果なし</h3>
          <p className="text-gray-500">分析を実行すると結果がここに表示されます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 固定ヘッダー - フィルタとエクスポート */}
      <div className="flex-shrink-0 border-b border-gray-200 pb-4 mb-4">
        {/* カテゴリフィルタ */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-4">
              <h4 className="text-sm font-medium text-gray-700">カテゴリフィルタ</h4>
              <span className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                全{results.length}件の指摘
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedCategories(CATEGORIES.slice())}
                className="text-xs text-blue-600 hover:text-blue-700 underline"
              >
                全選択
              </button>
              <button
                onClick={() => setSelectedCategories([])}
                className="text-xs text-gray-600 hover:text-gray-700 underline"
              >
                全解除
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => handleCategoryToggle(category)}
                className={getCategoryButtonStyle(category)}
              >
                <span>{getTypeIcon(category)}</span>
                <span>{category}</span>
                <span className="text-xs opacity-75">({categoryCounts[category]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* エクスポートボタン */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowExportSection(!showExportSection)}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1"
          >
            📤 エクスポート
            <svg className={`w-3 h-3 transform transition-transform ${showExportSection ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {filteredResults.length !== results.length && (
            <span className="text-xs text-gray-500">
              {results.length - filteredResults.length}件がフィルタで非表示
            </span>
          )}
        </div>

        {/* エクスポートオプション */}
        {showExportSection && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-gray-700 font-medium mb-1">エクスポート形式:</label>
                <select
                  value={exportOptions.format}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, format: e.target.value as 'full' | 'summary' }))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                >
                  <option value="full">詳��版</option>
                  <option value="summary">サマリー版</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-medium mb-1">タイトル:</label>
                <input
                  type="text"
                  value={exportOptions.title}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {isExporting ? '生成中...' : 'PDF保存'}
              </button>
              <button
                onClick={handlePreviewHTML}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
              >
                HTMLプレビュー
              </button>
            </div>
            {/* エクスポートエラー表示 */}
            {exportError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">エクスポートエラー</p>
                <pre className="mt-2 text-xs text-red-700 whitespace-pre-wrap font-mono bg-white p-2 rounded">
                  {exportError}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* スクロール可能な結果一覧 */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        <div className="space-y-3">
          {filteredResults.map((result, index) => {
            const locationInfo = formatLocationInfo(result.location);
            
            return (
              <div
                key={`${result.type}-${index}`}
                className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-all duration-200"
              >
                 {/* 結果ヘッダー */}
                 <div className="flex items-start justify-between mb-4">
                   <div className="flex items-center gap-3">
                     <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium border ${getTypeColor(result.type)}`}>
                       {getTypeIcon(result.type)} {result.type}
                     </span>

                     <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                       P.{result.page} {result.pageTitle && `・${result.pageTitle}`}
                     </span>
                   </div>
                 </div>

                 {/* 場所情報と該当テキストを統合 */}
                 {(locationInfo || result.highlightText) && (
                   <div className="mb-3 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                     {locationInfo && (
                       <div className="mb-2">
                         📍 <strong>該当箇所:</strong> {locationInfo}
                       </div>
                     )}
                     {result.highlightText && (
                       <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                         <div className="text-xs font-medium text-gray-600 mb-1">該当テキスト:</div>
                         <div className="font-mono text-sm text-gray-800">
                           "{result.highlightText}"
                         </div>
                       </div>
                     )}
                   </div>
                 )}

                 {/* サマリー */}
                 <div className="mb-4">
                                       <h4 className="font-semibold text-gray-900 mb-2 text-base flex items-center gap-2">
                     🔍 <span>指摘事項</span>
                   </h4>
                   <p className="text-sm text-gray-800 leading-relaxed font-medium bg-gray-50 p-3 rounded-lg border border-gray-200">
                     {result.summary}
                   </p>
                 </div>

                 {/* 詳細説明 */}
                 {result.details && (
                   <div className="mb-4">
                     <h4 className="font-semibold text-gray-900 mb-2 text-base flex items-center gap-2">
                       📋 <span>詳細</span>
                     </h4>
                     <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-200">
                       {result.details}
                     </p>
                   </div>
                 )}

                 {/* 数値計算エラーの場合の詳細情報 */}
                 {result.type === '数値計算の誤り' && (result.reportedValue || result.correctValue || result.calculationFormula) && (
                   <div className="mb-4">
                     <h4 className="font-semibold text-gray-900 mb-2 text-base flex items-center gap-2">
                       🧮 <span>計算検証</span>
                     </h4>
                     <div className="bg-red-50 p-4 rounded-lg border border-red-200 space-y-3">
                       {result.reportedValue && (
                         <div className="text-sm">
                           <span className="text-red-700 font-semibold">レポート記載値: </span>
                           <span className="font-mono bg-white px-2 py-1 rounded border">{result.reportedValue}</span>
                         </div>
                       )}
                       {result.correctValue && (
                         <div className="text-sm">
                           <span className="text-green-700 font-semibold">正しい値: </span>
                           <span className="font-mono bg-white px-2 py-1 rounded border">{result.correctValue}</span>
                         </div>
                       )}
                       {result.calculationFormula && (
                         <div className="text-sm">
                           <span className="text-blue-700 font-semibold">正しい計算式: </span>
                           <div className="font-mono bg-white p-2 rounded border mt-1">{result.calculationFormula}</div>
                         </div>
                       )}
                     </div>
                   </div>
                 )}


              </div>
            );
          })}
        </div>

        {/* フィルタ結果が空の場合 */}
        {filteredResults.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-3">🔍</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">該当する結果なし</h3>
              <p className="text-gray-500">選択したカテゴリに該当する分析結果がありません。</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultsDisplay; 
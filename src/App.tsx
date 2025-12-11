import React, { useState, useCallback, useEffect } from 'react';
import ResultsDisplay from './components/ResultsDisplay';
import MonthlyComparisonTab from './components/MonthlyComparisonTab';
import { AnalysisResult } from './types';
import { getCurrentEnvironment } from './utils/environment';

// 🎨 サンプルデータ（UI確認用）
  const SAMPLE_RESULTS: AnalysisResult[] = [
  {
    page: 1,
    pageTitle: '連結損益計算書',
    type: '数値計算の誤り',
    summary: '売上高の合計計算に100,000千円の差異',
    details: '第1四半期から第4四半期までの売上高を合計した際、第3四半期の数値が重複して計算されています。正しい合計は1,234,567千円ですが、レポートでは1,334,567千円と記載されており、100,000千円の差異があります。計算の見直しをお勧めします。',
    reportedValue: '1,334,567千円',
    correctValue: '1,234,567千円',
    calculationFormula: '308,450 + 342,100 + 284,017 + 300,000 = 1,234,567千円',
    highlightText: '年間売上高合計: 1,334,567千円',
    location: {
      tableTitle: '四半期売上高推移表',
      sectionName: '業績概要',
      rowName: '売上高合計',
      columnName: '年間合計'
    }
  },
  {
    page: 2,
    pageTitle: '業績分析',
    type: '表示・記載の誤り',
    summary: '前年同期比分析の記述と数値の矛盾',
    details: '売上高が前年同期比で15%増加している客観的事実に対し、文章では「大幅な減少」と記載されています。数値データは明確な増加傾向を示しており、記述の見直しをお勧めします。',
    highlightText: '売上高は前年同期と比較して大幅な減少となりました',
    location: {
      sectionName: '経営成績の分析',
      tableTitle: '売上分析表'
    }
  },
  {
    page: 3,
    pageTitle: '企業集団の状況',
    type: '事実関係の誤り',
    summary: '子会社の設立年月日に1年の誤り',
    details: '株式会社サンプル商事の設立年月日が「2023年4月1日」と記載されていますが、実際の設立は「2022年4月1日」です。1年のずれが生じており、確認をお勧めします。',
    highlightText: '株式会社サンプル商事（2023年4月1日設立）',
    location: {
      sectionName: '子会社の状況',
      tableTitle: '主要子会社一覧'
    }
  },
  {
    page: 4,
    pageTitle: '関連当事者情報',
    type: '重要事項の遺漏',
    summary: '重要な関連当事者取引500,000千円の開示漏れ',
    details: '親会社からの借入金500,000千円について、関連当事者取引として適切な開示が行われていません。該当セクションでの記載が不足しているため、開示の追加をご検討ください。',
    location: {
      sectionName: '関連当事者情報',
      tableTitle: '関連当事者取引の概要'
    }
  },
  {
    page: 5,
    pageTitle: '会計方針',
    type: '品質管理上の問題',
    summary: '脚注参照番号の不整合',
    details: '本文中で「注1参照」と記載されているにも関わらず、該当する脚注が「注3」として記載されています。脚注番号の統一をお勧めします。',
    highlightText: '詳細については注1を参照してください',
    location: {
      sectionName: '重要な会計方針'
    }
  }
];

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<{
    engineUsed?: string;
    engineInfo?: string;
    fallbackReason?: string;
    timestamp?: string;
  }>({});
  const [asyncStatus, setAsyncStatus] = useState<{
    operationId?: string;
    status?: string;
    progress?: number;
  }>({});
  const [processingMode] = useState<'pdf-parse' | 'document-ai'>('pdf-parse');
  const [isUploadSectionCollapsed, setIsUploadSectionCollapsed] = useState(false);
  
  // 🎨 サンプルデータ表示状態
  const [showSampleData, setShowSampleData] = useState(false);
  const isDevelopment = getCurrentEnvironment().name === 'development';

  // タブ管理
  const [activeTab, setActiveTab] = useState<'analysis' | 'comparison'>('analysis');

  // 環境に応じたデフォルト処理モード設定（通常モード固定）
  // useEffect(() => {
  //   const defaultEngine = getDefaultEngine();
  //   setProcessingMode(defaultEngine);
  // }, []);

  // 🎨 サンプルデータ表示機能
  const handleShowSampleData = useCallback(() => {
    setShowSampleData(true);
    setResults(SAMPLE_RESULTS);
    setAnalysisInfo({
      engineUsed: 'sample-data',
      engineInfo: 'UI確認用サンプルデータ',
      timestamp: new Date().toISOString()
    });
    setError(null);
    setIsAnalyzing(false);
  }, []);

  const handleClearSampleData = useCallback(() => {
    setShowSampleData(false);
    setResults([]);
    setAnalysisInfo({});
    setError(null);
  }, []);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      // ファイル選択時にサンプルデータをクリア（折りたたみはしない）
      if (showSampleData) {
        handleClearSampleData();
      }
    } else {
      setError('PDFファイルを選択してください');
      setFile(null);
    }
  }, [showSampleData, handleClearSampleData]);

  const analyzeDocument = useCallback(async () => {
    if (!file) {
      setError('ファイルが選択されていません');
      return;
    }

    // サンプルデータ表示中の場合はクリア
    if (showSampleData) {
      handleClearSampleData();
    }

    setIsAnalyzing(true);
    setError(null);
    setResults([]);
    setAnalysisInfo({});
    setAsyncStatus({});

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      const actualProcessingMode = processingMode === 'pdf-parse' ? 'pdf-parse' : 'document-ai';
      formData.append('processingMode', actualProcessingMode);

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      const requestUrl = `${apiUrl}/api/analysis/analyze-async`;
      
      console.log('=== 非同期分析開始 ===');
      console.log('リクエストURL:', requestUrl);
      console.log('ファイル名:', file.name);
      console.log('ファイルサイズ:', file.size);
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('レスポンスステータス:', response.status);
      console.log('レスポンスOK:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('エラーレスポンス:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      console.log('非同期処理開始レスポンス:', data);
      
      if (data.success && data.operationId) {
        setAsyncStatus({
          operationId: data.operationId,
          status: 'RUNNING',
          progress: 0
        });
        
        // ポーリング開始
        pollAsyncStatus(data.operationId);
      } else {
        throw new Error(data.message || '非同期処理の開始に失敗しました');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      setError(error instanceof Error ? error.message : '分析中にエラーが発生しました');
      setResults([]);
      setAnalysisInfo({});
      setIsAnalyzing(false);
    }
  }, [file, processingMode, showSampleData, handleClearSampleData]);

  const pollAsyncStatus = useCallback(async (operationId: string) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const statusUrl = `${apiUrl}/api/analysis/analyze-status/${operationId}`;
    
    const poll = async (isFirstCheck = false) => {
      try {
        const response = await fetch(statusUrl);
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('ステータス確認:', data);
        
        setAsyncStatus({
          operationId,
          status: data.status,
          progress: data.progress
        });
        
        if (data.status === 'SUCCEEDED') {
          // デバッグ: 受信した分析結果のtype一覧を確認
          console.log('=== フロントエンド: 受信した分析結果 ===');
          console.log('結果数:', data.results?.length || 0);
          if (data.results && data.results.length > 0) {
            console.log('結果のtype一覧:');
            data.results.forEach((result: AnalysisResult, index: number) => {
              console.log(`結果${index + 1}: type="${result.type}", summary="${result.summary?.substring(0, 50)}..."`);
            });
            
            // typeの重複を確認
            const typeCount = data.results.reduce((acc: Record<string, number>, result: AnalysisResult) => {
              acc[result.type] = (acc[result.type] || 0) + 1;
              return acc;
            }, {});
            console.log('フロントエンド type別件数:', typeCount);
          }
          
          setResults(data.results || []);
          setAnalysisInfo({
            engineUsed: data.engineUsed,
            engineInfo: data.engineInfo,
            timestamp: new Date().toISOString()
          });
          setIsAnalyzing(false);
          // 分析結果が出た時に自動で折りたたむ
          setIsUploadSectionCollapsed(true);
          
          // 🚀 pdf-parseの場合は即座完了をログ出力
          if (data.engineUsed === 'pdf-parse') {
            console.log('✅ pdf-parse 高速処理完了 - ポーリング不要でした');
          } else {
            console.log('✅ 非同期分析完了');
          }
        } else if (data.status === 'FAILED') {
          setError(data.error || '分析に失敗しました');
          setIsAnalyzing(false);
          console.error('非同期分析失敗:', data.error);
        } else if (data.status === 'RUNNING') {
          // 🔄 実際の非同期処理（主にDocument AI）の場合のみ継続ポーリング
          const pollingInterval = data.engineUsed === 'pdf-parse' ? 500 : 2000; // pdf-parseは短い間隔
          
          if (isFirstCheck && data.engineUsed === 'pdf-parse') {
            console.log('🚀 pdf-parse 高速処理中 - すぐに完了予定');
          }
          
          setTimeout(() => poll(false), pollingInterval);
        }
      } catch (error) {
        console.error('Status polling error:', error);
        setError('分析状態の確認に失敗しました');
        setIsAnalyzing(false);
      }
    };
    
    // 最初の状態確認を即座に実行
    poll(true);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden">
      {/* ヘッダー - コンパクト化 */}
      <header className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🏦</div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">AI財務レポートアナライザー</h1>
                <p className="text-xs text-gray-600">財務レポートの分析と検証</p>
              </div>
            </div>
            
            {/* 🎨 サンプルデータボタン (本番でも表示) */}
            <div className="flex items-center gap-2">
              {/* <div className="text-xs text-gray-500 mr-2">🛠️ 開発モード</div> */}
              {activeTab === 'analysis' && (
                !showSampleData ? (
                  <button
                    onClick={handleShowSampleData}
                    className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                  >
                    🎨 サンプル表示
                  </button>
                ) : (
                  <button
                    onClick={handleClearSampleData}
                    className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1"
                  >
                    🗑️ サンプルクリア
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* タブナビゲーション */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab('analysis')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'analysis'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              🔍 レポート分析
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'comparison'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              📈 前月比較
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'analysis' ? (
          <div className="h-full flex flex-col px-4 py-4 gap-4">
            
            {/* コンパクトなファイルアップロードセクション */}
            {!isUploadSectionCollapsed && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-shrink-0">
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-blue-600">📄</div>
                      <h2 className="text-lg font-semibold text-gray-800">財務レポート分析</h2>
                      {showSampleData && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                          🎨 サンプル表示中
                        </span>
                      )}
                    </div>
                    {file && (
                      <button
                        onClick={() => setIsUploadSectionCollapsed(!isUploadSectionCollapsed)}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <svg 
                          className={`w-5 h-5 transform transition-transform ${isUploadSectionCollapsed ? 'rotate-180' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                  </div>
                  
                  {/* ファイル選択 */}
                  <div className="mt-4">
                    <input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-500
                                 file:mr-4 file:py-2 file:px-4
                                 file:rounded-lg file:border-0
                                 file:text-sm file:font-medium
                                 file:bg-blue-50 file:text-blue-700
                                 hover:file:bg-blue-100
                                 file:cursor-pointer cursor-pointer"
                    />
                  </div>

                  {file && (
                    <div className="mt-3 flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                        <span className="text-sm font-medium text-green-700">{file.name}</span>
                        <span className="text-xs text-green-600">
                          ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                      <button
                        onClick={analyzeDocument}
                        disabled={isAnalyzing}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isAnalyzing ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            分析中...
                          </div>
                        ) : (
                          '分析開始'
                        )}
                      </button>
                    </div>
                  )}

                  {error && !analysisInfo.engineUsed && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* メインコンテンツエリア - 分析結果中心 */}
            <div className="flex-1 min-h-0 max-h-full">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 h-full flex flex-col">
                
                {/* 分析結果のヘッダー */}
                <div className="px-6 py-4 flex-shrink-0 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      🔍 分析結果
                      {results.length > 0 && (
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-sm rounded-full font-medium">
                          {results.length}件の指摘事項
                        </span>
                      )}
                    </h2>
                    {file && (
                      <button
                        onClick={() => setIsUploadSectionCollapsed(!isUploadSectionCollapsed)}
                        className="text-gray-500 hover:text-gray-700 transition-colors text-sm flex items-center gap-1"
                      >
                        {isUploadSectionCollapsed ? (
                          <>
                            📄 ファイル選択を表示
                            <svg className="w-3 h-3 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        ) : (
                          <>
                            ファイル選択を折りたたむ
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                
                {/* スクロール可能な分析結果エリア */}
                <div className="flex-1 min-h-0 px-6 py-4 overflow-y-auto">
                  {isAnalyzing && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center text-blue-600">
                        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-lg font-medium">AI分析を実行中...</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {asyncStatus.progress ? `${asyncStatus.progress.toFixed(0)}%完了` : '財務レポートを分析しています'}
                        </p>
                      </div>
                    </div>
                  )}
                  {error && (
                    <div className="h-full flex items-center justify-center">
                      <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg max-w-md">
                        <p className="font-medium">エラーが発生しました:</p>
                        <p className="text-sm mt-2">{error}</p>
                      </div>
                    </div>
                  )}
                  {results.length > 0 && (
                    <ResultsDisplay results={results} pdfFile={file} />
                  )}
                  {results.length === 0 && !isAnalyzing && !error && file && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-5xl mb-4">📋</div>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">分析待ち</h3>
                        <p className="text-gray-500">「分析開始」ボタンをクリックしてAI分析を実行してください。</p>
                      </div>
                    </div>
                  )}
                  {!file && (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-5xl mb-4">🏦</div>
                        <h3 className="text-xl font-medium text-gray-900 mb-3">AI財務レポートアナライザー</h3>
                        <p className="text-gray-600 mb-4">AIによる高精度な分析で、<br/>財務レポートの問題点を自動検出します。</p>
                        <div className="text-sm text-gray-500 space-y-1">
                          <p>✓ 数値計算の正確性検証</p>
                          <p>✓ 表示・記載の整合性確認</p>
                          <p>✓ 誤字脱字・時系列チェック</p>
                          <p>✓ 具体的な修正指示提供</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <MonthlyComparisonTab />
        )}
      </div>
    </div>
  );
};

export default App; 
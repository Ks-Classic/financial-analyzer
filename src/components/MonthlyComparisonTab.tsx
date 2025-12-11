import React, { useState, useCallback } from 'react';
import { MonthlyComparisonResult, FileUploadState } from '../types';

interface MonthlyComparisonTabProps {
  // 必要に応じて props を追加
}

const MonthlyComparisonTab: React.FC<MonthlyComparisonTabProps> = () => {
  const [fileState, setFileState] = useState<FileUploadState>({
    previousFile: null,
    currentFile: null,
    isAnalyzing: false,
    error: null
  });
  
  const [results, setResults] = useState<MonthlyComparisonResult[]>([]);
  const [selectedSignificance, setSelectedSignificance] = useState<'高' | '中' | '低' | '全て'>('全て');
  const [selectedCategory, setSelectedCategory] = useState<string>('全て');
  const [isFileSectionCollapsed, setIsFileSectionCollapsed] = useState(false);

  // サンプルデータ（UI確認用）
  const SAMPLE_RESULTS: MonthlyComparisonResult[] = [
    {
      id: 'sample-1',
      page: 1,
      pageTitle: '損益計算書(1/2)',
      comparisonType: '同軸比較',
      itemPath: '売上高 > ラボ',
      currentValue: '18,010千円',
      previousValue: '19,500千円',
      changeAmount: '-1,490千円',
      changePercentage: '-7.6%',
      comment: 'ラボ売上高は前月比で1,490千円（7.6%）減少しました。',
      generatedComment: 'ラボ売上高は前月比で1,490千円（7.6%）減少しました。Miracle Fit IおよびMiracle Fit Vの販売数量減少が主因ですが、単価の上昇により前年同月比では増加しています。季節的な需要変動の影響も考慮する必要があります。',
      reasoning: '同軸比較: 売上高の減少率が5%を超えており、重要な変化として判断。前月のコメントで言及されているMiracle Fit製品の動向を踏まえた分析を実施。',
      significance: '高',
      category: '売上',
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-2',
      page: 1,
      pageTitle: '損益計算書(1/2)',
      comparisonType: '同軸比較',
      itemPath: '売上高 > その他売上高',
      currentValue: '2,850千円',
      previousValue: '2,200千円',
      changeAmount: '+650千円',
      changePercentage: '+29.5%',
      comment: 'その他売上高は前月比で650千円（29.5%）増加しました。',
      generatedComment: 'その他売上高は前月比で650千円（29.5%）増加しました。健康食品・機器の販売数量増加、特にハチミツの販売好調が寄与しています。MD会員向け商品の需要拡大が背景にあります。',
      reasoning: '同軸比較: その他売上高の大幅な増加は注目すべき変化。前月のコメントで言及されている健康食品・機器の動向を踏まえた分析を実施。',
      significance: '高',
      category: '売上',
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-3',
      page: 1,
      pageTitle: '損益計算書(1/2)',
      comparisonType: '異軸比較',
      itemPath: '売上総利益 > 利益率',
      currentValue: '94.4%',
      previousValue: '93.8%',
      changeAmount: '+0.6%pt',
      changePercentage: '+0.6%',
      comment: '売上総利益率が前月比で0.6%pt改善しました。',
      generatedComment: '売上総利益率が前月比で0.6%pt改善し、94.4%となりました。義歯材料の仕入れ価格の安定化と、高付加価値商品の販売比率向上が寄与しています。前年度年間平均と同等の水準を維持しています。',
      reasoning: '異軸比較: 売上総利益率の改善は収益性向上の重要な指標。前月のコメントで言及されている材料費の動向を踏まえた分析を実施。',
      significance: '中',
      category: '利益',
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-4',
      page: 2,
      pageTitle: '損益計算書(2/2)',
      comparisonType: '同軸比較',
      itemPath: '販管費 > 給料手当',
      currentValue: '8,500千円',
      previousValue: '8,200千円',
      changeAmount: '+300千円',
      changePercentage: '+3.7%',
      comment: '給料手当は前月比で300千円（3.7%）増加しました。',
      generatedComment: '給料手当は前月比で300千円（3.7%）増加しました。新規採用による人員増加と、定期昇給の影響が主因です。売上高の伸びに伴う適切な人員配置として評価できます。',
      reasoning: '同軸比較: 給料手当の増加は人員拡大の指標。前月のコメントで言及されている採用活動の動向を踏まえた分析を実施。',
      significance: '中',
      category: '費用',
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-5',
      page: 3,
      pageTitle: '貸借対照表(1/2)',
      comparisonType: '同軸比較',
      itemPath: '流動資産 > 現金及び預金',
      currentValue: '45,200千円',
      previousValue: '42,800千円',
      changeAmount: '+2,400千円',
      changePercentage: '+5.6%',
      comment: '現金及び預金は前月比で2,400千円（5.6%）増加しました。',
      generatedComment: '現金及び預金は前月比で2,400千円（5.6%）増加しました。営業キャッシュフローの改善と、投資活動の抑制により、資金繰りが改善しています。流動性の向上により、今後の投資余力が拡大しています。',
      reasoning: '同軸比較: 現金及び預金の増加は流動性改善の指標。前月のコメントで言及されている資金繰りの動向を踏まえた分析を実施。',
      significance: '高',
      category: '資産',
      timestamp: new Date().toISOString()
    },
    {
      id: 'sample-6',
      page: 4,
      pageTitle: 'キャッシュフロー計算書',
      comparisonType: '累計推移',
      itemPath: '営業キャッシュフロー > 累計値',
      currentValue: '12,500千円',
      previousValue: '10,800千円',
      changeAmount: '+1,700千円',
      changePercentage: '+15.7%',
      comment: '営業キャッシュフローの累計値が前月比で1,700千円増加しました。',
      generatedComment: '営業キャッシュフローの累計値が前月比で1,700千円（15.7%）増加しました。売上高の伸びに加え、回収条件の改善により、現金化が加速しています。本業からの資金創出能力が向上しています。',
      reasoning: '累計推移: 営業キャッシュフローの累計値の変化を分析。売上と回収の両面から資金創出能力の向上を確認。',
      significance: '高',
      category: 'その他',
      timestamp: new Date().toISOString()
    }
  ];

  const handlePreviousFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFileState(prev => ({
        ...prev,
        previousFile: selectedFile,
        error: null
      }));
    } else {
      setFileState(prev => ({
        ...prev,
        error: '前月ファイルはPDF形式を選択してください',
        previousFile: null
      }));
    }
  }, []);

  const handleCurrentFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFileState(prev => ({
        ...prev,
        currentFile: selectedFile,
        error: null
      }));
    } else {
      setFileState(prev => ({
        ...prev,
        error: '当月ファイルはPDF形式を選択してください',
        currentFile: null
      }));
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!fileState.previousFile || !fileState.currentFile) {
      setFileState(prev => ({
        ...prev,
        error: '前月ファイルと当月ファイルの両方を選択してください'
      }));
      return;
    }

    setFileState(prev => ({ ...prev, isAnalyzing: true, error: null }));
    setResults([]);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
      
      // 前月比較分析を開始
      const formData = new FormData();
      formData.append('previousFile', fileState.previousFile);
      formData.append('currentFile', fileState.currentFile);

      console.log('=== 前月比較分析開始 ===');
      console.log('前月ファイル:', fileState.previousFile.name);
      console.log('当月ファイル:', fileState.currentFile.name);
      
      const response = await fetch(`${apiUrl}/api/monthly-comparison/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('エラーレスポンス:', errorText);
        throw new Error(`HTTP error! status: ${response.status}, response: ${errorText}`);
      }

      const data = await response.json();
      console.log('前月比較分析開始レスポンス:', data);
      
      if (data.success && data.operationId) {
        // ポーリング開始
        pollMonthlyComparisonStatus(data.operationId);
      } else {
        throw new Error(data.message || '前月比較分析の開始に失敗しました');
      }
    } catch (error) {
      console.error('前月比較分析エラー:', error);
      setFileState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '分析中にエラーが発生しました'
      }));
      setFileState(prev => ({ ...prev, isAnalyzing: false }));
    }
  }, [fileState.previousFile, fileState.currentFile]);

  const pollMonthlyComparisonStatus = useCallback(async (operationId: string) => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';
    const statusUrl = `${apiUrl}/api/monthly-comparison/status/${operationId}`;
    
    const poll = async (isFirstCheck = false) => {
      try {
        const response = await fetch(statusUrl);
        if (!response.ok) {
          throw new Error(`Status check failed: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('前月比較ステータス確認:', data);
        
        if (data.status === 'SUCCEEDED') {
          console.log('=== フロントエンド: 受信した前月比較結果 ===');
          console.log('結果数:', data.results?.length || 0);
          
          setResults(data.results || []);
          setFileState(prev => ({ ...prev, isAnalyzing: false }));
          
          console.log('✅ 前月比較分析完了');
        } else if (data.status === 'FAILED') {
          setFileState(prev => ({
            ...prev,
            error: data.error || '前月比較分析に失敗しました',
            isAnalyzing: false
          }));
          console.error('前月比較分析失敗:', data.error);
        } else if (data.status === 'RUNNING') {
          // 継続ポーリング
          setTimeout(() => poll(false), 2000);
        }
      } catch (error) {
        console.error('前月比較ステータスポーリングエラー:', error);
        setFileState(prev => ({
          ...prev,
          error: '前月比較分析状態の確認に失敗しました',
          isAnalyzing: false
        }));
      }
    };
    
    // 最初の状態確認を即座に実行
    poll(true);
  }, []);

  const handleShowSampleData = useCallback(() => {
    setResults(SAMPLE_RESULTS);
    setFileState(prev => ({ ...prev, error: null }));
  }, []);

  const handleClearResults = useCallback(() => {
    setResults([]);
    setFileState(prev => ({ ...prev, error: null }));
  }, []);

  // フィルタリングされた結果
  const filteredResults = results.filter(result => {
    const significanceMatch = selectedSignificance === '全て' || result.significance === selectedSignificance;
    const categoryMatch = selectedCategory === '全て' || result.category === selectedCategory;
    return significanceMatch && categoryMatch;
  });

  const getSignificanceColor = (significance: string) => {
    switch (significance) {
      case '高': return 'bg-red-100 text-red-800 border-red-200';
      case '中': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case '低': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case '売上': return 'bg-blue-100 text-blue-800 border-blue-200';
      case '利益': return 'bg-green-100 text-green-800 border-green-200';
      case '費用': return 'bg-orange-100 text-orange-800 border-orange-200';
      case '資産': return 'bg-purple-100 text-purple-800 border-purple-200';
      case '負債': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getComparisonTypeIcon = (type: string) => {
    switch (type) {
      case '同軸比較': return '📊';
      case '異軸比較': return '🔄';
      case '新規項目': return '🆕';
      case '削除項目': return '🗑️';
      case '累計推移': return '📈';
      default: return '📋';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-blue-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📈</div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">前月比較コメント生成</h1>
                <p className="text-xs text-gray-600">前月データと当月データを比較してコメントを自動生成</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {results.length === 0 ? (
                <button
                  onClick={handleShowSampleData}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1"
                >
                  🎨 サンプル表示
                </button>
              ) : (
                <button
                  onClick={handleClearResults}
                  className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1"
                >
                  🗑️ クリア
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-4 gap-4">
        {/* ファイルアップロードセクション */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-shrink-0">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                📄 ファイル選択
              </h2>
              {(fileState.previousFile || fileState.currentFile) && (
                <button
                  onClick={() => setIsFileSectionCollapsed(!isFileSectionCollapsed)}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <svg 
                    className={`w-5 h-5 transform transition-transform ${isFileSectionCollapsed ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </div>
            
            {!isFileSectionCollapsed && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 前月ファイル */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      前月ファイル（完成版）
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handlePreviousFileChange}
                      className="block w-full text-sm text-gray-500
                                 file:mr-4 file:py-2 file:px-4
                                 file:rounded-lg file:border-0
                                 file:text-sm file:font-medium
                                 file:bg-blue-50 file:text-blue-700
                                 hover:file:bg-blue-100
                                 file:cursor-pointer cursor-pointer"
                    />
                    {fileState.previousFile && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span className="text-sm text-green-700">{fileState.previousFile.name}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 当月ファイル */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      当月ファイル（コメントなし版）
                    </label>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleCurrentFileChange}
                      className="block w-full text-sm text-gray-500
                                 file:mr-4 file:py-2 file:px-4
                                 file:rounded-lg file:border-0
                                 file:text-sm file:font-medium
                                 file:bg-green-50 file:text-green-700
                                 hover:file:bg-green-100
                                 file:cursor-pointer cursor-pointer"
                    />
                    {fileState.currentFile && (
                      <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className="text-green-600">✓</span>
                          <span className="text-sm text-green-700">{fileState.currentFile.name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* エラー表示 */}
                {fileState.error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700">{fileState.error}</p>
                  </div>
                )}

                {/* 分析開始ボタン */}
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleAnalyze}
                    disabled={!fileState.previousFile || !fileState.currentFile || fileState.isAnalyzing}
                    className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {fileState.isAnalyzing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        分析中...
                      </>
                    ) : (
                      <>
                        🔍 コメント生成開始
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* 折りたたみ時のファイル情報表示 */}
            {isFileSectionCollapsed && (fileState.previousFile || fileState.currentFile) && (
              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-4">
                  {fileState.previousFile && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-600">📄</span>
                      <span className="text-sm text-gray-700">前月: {fileState.previousFile.name}</span>
                    </div>
                  )}
                  {fileState.currentFile && (
                    <div className="flex items-center gap-2">
                      <span className="text-green-600">📄</span>
                      <span className="text-sm text-gray-700">当月: {fileState.currentFile.name}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAnalyze}
                  disabled={!fileState.previousFile || !fileState.currentFile || fileState.isAnalyzing}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {fileState.isAnalyzing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      分析中...
                    </>
                  ) : (
                    <>
                      🔍 分析開始
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 結果表示エリア */}
        <div className="flex-1 min-h-0 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col">
          {/* フィルター */}
          {results.length > 0 && (
            <div className="p-4 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">重要度:</label>
                  <select
                    value={selectedSignificance}
                    onChange={(e) => setSelectedSignificance(e.target.value as any)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="全て">全て</option>
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700">カテゴリ:</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="px-2 py-1 border border-gray-300 rounded text-sm"
                  >
                    <option value="全て">全て</option>
                    <option value="売上">売上</option>
                    <option value="利益">利益</option>
                    <option value="費用">費用</option>
                    <option value="資産">資産</option>
                    <option value="負債">負債</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                
                <span className="text-sm text-gray-500">
                  {filteredResults.length}件表示中（全{results.length}件）
                </span>
              </div>
            </div>
          )}

          {/* 結果一覧 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            {fileState.isAnalyzing && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-blue-600">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-lg font-medium">前月比較分析を実行中...</p>
                  <p className="text-sm text-gray-500 mt-1">数値の変化を分析してコメントを生成しています</p>
                </div>
              </div>
            )}

            {results.length > 0 && filteredResults.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-3">🔍</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">該当する結果なし</h3>
                  <p className="text-gray-500">選択したフィルター条件に該当する結果がありません。</p>
                </div>
              </div>
            )}

            {results.length === 0 && !fileState.isAnalyzing && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl mb-4">📈</div>
                  <h3 className="text-xl font-medium text-gray-900 mb-3">前月比較コメント生成</h3>
                  <p className="text-gray-600 mb-4">前月の完成版と当月のコメントなし版を比較して、<br/>数値の変化に基づいたコメントを自動生成します。</p>
                  <div className="text-sm text-gray-500 space-y-1">
                    <p>✓ 同軸比較・異軸比較の自動判定</p>
                    <p>✓ 数値変化の要因分析</p>
                    <p>✓ 前月コメントを参考にした改善提案</p>
                    <p>✓ 重要度別の優先順位付け</p>
                  </div>
                </div>
              </div>
            )}

            {filteredResults.length > 0 && (
              <div className="space-y-4">
                {filteredResults.map((result) => (
                  <div
                    key={result.id}
                    className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-all duration-200"
                  >
                    {/* ヘッダー */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium border ${getSignificanceColor(result.significance)}`}>
                          {result.significance}
                        </span>
                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-sm font-medium border ${getCategoryColor(result.category)}`}>
                          {result.category}
                        </span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {getComparisonTypeIcon(result.comparisonType)} {result.comparisonType}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        P.{result.page} {result.pageTitle && `・${result.pageTitle}`}
                      </span>
                    </div>

                    {/* 数値比較 */}
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="font-semibold text-gray-900 mb-2 text-sm">数値比較</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">前月: </span>
                          <span className="font-mono bg-white px-2 py-1 rounded border">{result.previousValue}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">当月: </span>
                          <span className="font-mono bg-white px-2 py-1 rounded border">{result.currentValue}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">変化額: </span>
                          <span className="font-mono bg-white px-2 py-1 rounded border">{result.changeAmount}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">変化率: </span>
                          <span className="font-mono bg-white px-2 py-1 rounded border">{result.changePercentage}</span>
                        </div>
                      </div>
                    </div>

                    {/* 生成されたコメント */}
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2 text-sm flex items-center gap-2">
                        🤖 生成されたコメント
                      </h4>
                      <p className="text-sm text-gray-800 leading-relaxed bg-green-50 p-3 rounded-lg border border-green-200">
                        {result.generatedComment}
                      </p>
                    </div>

                    {/* AIの判断理由 */}
                    <div className="mb-4">
                      <h4 className="font-semibold text-gray-900 mb-2 text-sm flex items-center gap-2">
                        🧠 AIの判断理由
                      </h4>
                      <p className="text-sm text-gray-700 leading-relaxed bg-blue-50 p-3 rounded-lg border border-blue-200">
                        {result.reasoning}
                      </p>
                    </div>

                    {/* 項目パス */}
                    <div className="text-xs text-gray-500">
                      <strong>項目:</strong> {result.itemPath}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyComparisonTab;

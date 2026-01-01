import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
    SheetData,
    CellRange,
    PageTemplate,
    GeneratedComment,
    WorkflowStep
} from '../../types/comment-generator';

// ============================================================
// サンプルデータ（デモ用）
// ============================================================
const SAMPLE_PAGES: PageTemplate[] = [
    {
        id: 'bs',
        name: '貸借対照表',
        description: '資産・負債・純資産の状況',
        icon: '📊',
        ranges: [
            { id: 'assets', label: '資産の部', color: '#3B82F6' },
            { id: 'liabilities', label: '負債の部', color: '#10B981' },
            { id: 'equity', label: '純資産の部', color: '#8B5CF6' },
        ]
    },
    {
        id: 'pl',
        name: '損益計算書',
        description: '収益・費用・利益の状況',
        icon: '📈',
        ranges: [
            { id: 'revenue', label: '売上高', color: '#F59E0B' },
            { id: 'cost', label: '売上原価', color: '#EF4444' },
            { id: 'operating', label: '営業利益', color: '#06B6D4' },
        ]
    },
    {
        id: 'cf',
        name: 'キャッシュフロー',
        description: '現金の流れの分析',
        icon: '💰',
        ranges: [
            { id: 'operating_cf', label: '営業CF', color: '#22C55E' },
            { id: 'investing_cf', label: '投資CF', color: '#A855F7' },
            { id: 'financing_cf', label: '財務CF', color: '#EC4899' },
        ]
    },
    {
        id: 'segment',
        name: 'セグメント別',
        description: '事業セグメント分析',
        icon: '🏢',
        ranges: [
            { id: 'segment_sales', label: 'セグメント売上', color: '#14B8A6' },
            { id: 'segment_profit', label: 'セグメント利益', color: '#F97316' },
        ]
    },
];

// サンプルコメント
const SAMPLE_COMMENTS: Record<string, string> = {
    'bs': `【貸借対照表コメント】

■ 資産の部
当期末の総資産は前期末比10.2%増の15,234百万円となりました。主な増加要因として、売上拡大に伴う売掛金の増加（+423百万円）、設備投資による有形固定資産の増加（+215百万円）が挙げられます。

■ 負債の部
負債合計は前期末比5.8%増の8,456百万円となりました。短期借入金は運転資金需要の高まりから234百万円増加しましたが、長期借入金は計画的な返済により102百万円減少しています。

■ 純資産の部
自己資本比率は45.3%と前期の44.1%から1.2ポイント改善し、財務健全性は維持されています。`,

    'pl': `【損益計算書コメント】

■ 売上高
当期の売上高は12,456百万円（前期比+8.3%）となり、3期連続の増収を達成しました。主力製品Aの好調な販売に加え、新製品Bの市場投入が寄与しました。

■ 売上原価
売上原価は7,854百万円（売上原価率63.1%）となりました。原材料費の上昇により原価率は前期比0.8ポイント悪化しましたが、生産効率化により一部を吸収しています。

■ 営業利益
営業利益は1,234百万円（前期比+12.5%）、営業利益率は9.9%となりました。販管費の効率化が利益率改善に貢献しました。`,

    'cf': `【キャッシュフロー計算書コメント】

■ 営業活動によるキャッシュ・フロー
営業CFは1,567百万円の収入となりました。税引前利益の増加および減価償却費の計上により、安定したキャッシュ創出を実現しています。

■ 投資活動によるキャッシュ・フロー
投資CFは△423百万円の支出となりました。生産設備の更新投資（△312百万円）および本社移転費用（△111百万円）が主な内訳です。

■ 財務活動によるキャッシュ・フロー
財務CFは△234百万円の支出となりました。配当金の支払い（△156百万円）および借入金返済（△78百万円）によるものです。`,

    'segment': `【セグメント別コメント】

■ 国内事業セグメント
売上高8,123百万円（前期比+5.2%）、セグメント利益892百万円（前期比+8.1%）となりました。既存顧客向け販売が堅調に推移しました。

■ 海外事業セグメント
売上高4,333百万円（前期比+15.8%）、セグメント利益342百万円（前期比+23.5%）となりました。アジア市場の拡大が成長を牽引しています。`,
};

// ============================================================
// メインコンポーネント
// ============================================================
const CommentGeneratorTab: React.FC = () => {
    // ワークフロー状態
    const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');

    // ファイル関連
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // シートデータ
    const [sheets, setSheets] = useState<SheetData[]>([]);
    const [activeSheet, setActiveSheet] = useState<string>('');

    // マッピング
    const [selectedPage, setSelectedPage] = useState<PageTemplate | null>(null);
    const [activeRangeId, setActiveRangeId] = useState<string | null>(null);
    const [rangeSelections, setRangeSelections] = useState<Record<string, CellRange>>({});
    const [selectionStart, setSelectionStart] = useState<{ row: number, col: number } | null>(null);
    const [currentSelection, setCurrentSelection] = useState<CellRange | null>(null);

    // コメント生成
    const [generatedComments, setGeneratedComments] = useState<GeneratedComment[]>([]);
    const [generatingPage, setGeneratingPage] = useState<string | null>(null);

    // ============================================================
    // ファイルアップロード処理
    // ============================================================
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && (droppedFile.name.endsWith('.xlsx') || droppedFile.name.endsWith('.xls'))) {
            processExcelFile(droppedFile);
        }
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            processExcelFile(selectedFile);
        }
    }, []);

    const processExcelFile = useCallback((file: File) => {
        setFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const parsedSheets: SheetData[] = workbook.SheetNames.map(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as (string | number | null)[][];

                    // 空の行を除いてデータを整形
                    const cells = jsonData.map(row =>
                        (row as (string | number | null)[]).map(cell => ({
                            value: cell ?? '',
                            format: undefined,
                            style: undefined,
                        }))
                    );

                    return {
                        name: sheetName,
                        cells,
                        rowCount: cells.length,
                        colCount: Math.max(...cells.map(row => row.length), 0),
                    };
                });

                setSheets(parsedSheets);
                if (parsedSheets.length > 0) {
                    setActiveSheet(parsedSheets[0].name);
                }
                setCurrentStep('preview');
            } catch (error) {
                console.error('Excel parsing error:', error);
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    // ============================================================
    // 範囲選択処理
    // ============================================================
    const handleCellMouseDown = useCallback((row: number, col: number) => {
        if (!activeRangeId) return;
        setSelectionStart({ row, col });
        setCurrentSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }, [activeRangeId]);

    const handleCellMouseMove = useCallback((row: number, col: number) => {
        if (!selectionStart || !activeRangeId) return;
        setCurrentSelection({
            startRow: Math.min(selectionStart.row, row),
            startCol: Math.min(selectionStart.col, col),
            endRow: Math.max(selectionStart.row, row),
            endCol: Math.max(selectionStart.col, col),
        });
    }, [selectionStart, activeRangeId]);

    const handleCellMouseUp = useCallback(() => {
        if (currentSelection && activeRangeId) {
            setRangeSelections(prev => ({
                ...prev,
                [activeRangeId]: currentSelection,
            }));
        }
        setSelectionStart(null);
    }, [currentSelection, activeRangeId]);

    // ============================================================
    // コメント生成処理
    // ============================================================
    const handleGenerateComment = useCallback(async (page: PageTemplate) => {
        setGeneratingPage(page.id);

        // 生成中のコメントを追加
        setGeneratedComments(prev => [
            ...prev.filter(c => c.pageId !== page.id),
            {
                pageId: page.id,
                pageName: page.name,
                comment: '',
                rawData: {},
                status: 'generating',
            }
        ]);

        // デモ用：2秒待ってからサンプルコメントを表示
        await new Promise(resolve => setTimeout(resolve, 2000));

        setGeneratedComments(prev =>
            prev.map(c => c.pageId === page.id ? {
                ...c,
                comment: SAMPLE_COMMENTS[page.id] || 'コメントを生成しました。',
                status: 'completed',
                timestamp: new Date().toISOString(),
            } : c)
        );

        setGeneratingPage(null);
    }, []);

    const handleGenerateAll = useCallback(async () => {
        for (const page of SAMPLE_PAGES) {
            await handleGenerateComment(page);
        }
        setCurrentStep('result');
    }, [handleGenerateComment]);

    // ============================================================
    // レンダリング
    // ============================================================
    const currentSheet = sheets.find(s => s.name === activeSheet);

    const getCellStyle = (row: number, col: number) => {
        // 選択中の範囲
        if (currentSelection && activeRangeId) {
            const { startRow, startCol, endRow, endCol } = currentSelection;
            if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
                const rangeConfig = selectedPage?.ranges.find(r => r.id === activeRangeId);
                return { backgroundColor: rangeConfig?.color + '40', border: `2px solid ${rangeConfig?.color}` };
            }
        }

        // 保存済みの範囲
        for (const [rangeId, range] of Object.entries(rangeSelections)) {
            if (row >= range.startRow && row <= range.endRow &&
                col >= range.startCol && col <= range.endCol) {
                const rangeConfig = selectedPage?.ranges.find(r => r.id === rangeId);
                if (rangeConfig) {
                    return { backgroundColor: rangeConfig.color + '20', border: `1px solid ${rangeConfig.color}` };
                }
            }
        }

        return {};
    };

    // 列ヘッダー生成
    const getColumnLabel = (index: number): string => {
        let label = '';
        while (index >= 0) {
            label = String.fromCharCode(65 + (index % 26)) + label;
            index = Math.floor(index / 26) - 1;
        }
        return label;
    };

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-indigo-50">
            {/* 上部ステップインジケーター */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
                <div className="flex items-center justify-center gap-2">
                    {[
                        { step: 'upload', label: 'ファイル選択', icon: '📂' },
                        { step: 'preview', label: 'プレビュー', icon: '👁️' },
                        { step: 'mapping', label: '範囲設定', icon: '🎯' },
                        { step: 'generate', label: 'コメント生成', icon: '✨' },
                        { step: 'result', label: '結果確認', icon: '📋' },
                    ].map((item, index) => (
                        <React.Fragment key={item.step}>
                            <button
                                onClick={() => {
                                    // 完了したステップにのみ戻れる
                                    const steps: WorkflowStep[] = ['upload', 'preview', 'mapping', 'generate', 'result'];
                                    const currentIndex = steps.indexOf(currentStep);
                                    const targetIndex = steps.indexOf(item.step as WorkflowStep);
                                    if (targetIndex <= currentIndex) {
                                        setCurrentStep(item.step as WorkflowStep);
                                    }
                                }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentStep === item.step
                                    ? 'bg-indigo-600 text-white shadow-lg scale-105'
                                    : ['upload', 'preview', 'mapping', 'generate', 'result'].indexOf(item.step) <=
                                        ['upload', 'preview', 'mapping', 'generate', 'result'].indexOf(currentStep)
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-gray-100 text-gray-400'
                                    }`}
                            >
                                <span className="text-lg">{item.icon}</span>
                                <span className="text-sm font-medium">{item.label}</span>
                            </button>
                            {index < 4 && (
                                <div className={`w-8 h-0.5 ${['upload', 'preview', 'mapping', 'generate', 'result'].indexOf(item.step) <
                                    ['upload', 'preview', 'mapping', 'generate', 'result'].indexOf(currentStep)
                                    ? 'bg-indigo-400'
                                    : 'bg-gray-200'
                                    }`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="flex-1 min-h-0 p-6 overflow-auto">
                {/* ステップ1: ファイルアップロード */}
                {currentStep === 'upload' && (
                    <div className="h-full flex items-center justify-center">
                        <div className="w-full max-w-2xl">
                            <div
                                className={`p-12 rounded-2xl border-2 border-dashed transition-all cursor-pointer ${isDragging
                                    ? 'border-indigo-500 bg-indigo-50 scale-102'
                                    : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/50'
                                    }`}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <div className="text-center">
                                    <div className="text-6xl mb-6">📊</div>
                                    <h3 className="text-xl font-bold text-gray-800 mb-2">
                                        Excelファイルをドロップ
                                    </h3>
                                    <p className="text-gray-500 mb-6">
                                        または クリックしてファイルを選択
                                    </p>
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg">
                                        <span>📂</span>
                                        <span className="font-medium">ファイルを選択</span>
                                    </div>
                                    <p className="text-sm text-gray-400 mt-4">
                                        対応形式: .xlsx, .xls
                                    </p>
                                </div>
                            </div>

                            {/* サンプルファイルダウンロード */}
                            <div className="mt-6 p-4 bg-white rounded-xl border border-gray-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                            <span className="text-xl">📄</span>
                                        </div>
                                        <div>
                                            <p className="font-medium text-gray-700">サンプルファイルで試す</p>
                                            <p className="text-sm text-gray-500">財務諸表のサンプルデータ</p>
                                        </div>
                                    </div>
                                    <a
                                        href="/sample_financial_report.xlsx"
                                        download
                                        onClick={(e) => e.stopPropagation()}
                                        className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                    >
                                        <span>⬇️</span>
                                        <span>ダウンロード</span>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ2: プレビュー */}
                {currentStep === 'preview' && currentSheet && (
                    <div className="h-full flex flex-col gap-4">
                        {/* ファイル情報 */}
                        <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                                    <span className="text-2xl">📄</span>
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-800">{file?.name}</h3>
                                    <p className="text-sm text-gray-500">
                                        {sheets.length}シート / {(file?.size ?? 0 / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCurrentStep('mapping')}
                                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                            >
                                <span>範囲設定へ進む</span>
                                <span>→</span>
                            </button>
                        </div>

                        {/* シートタブ */}
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {sheets.map(sheet => (
                                <button
                                    key={sheet.name}
                                    onClick={() => setActiveSheet(sheet.name)}
                                    className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-all ${activeSheet === sheet.name
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'bg-white text-gray-600 hover:bg-indigo-50'
                                        }`}
                                >
                                    {sheet.name}
                                </button>
                            ))}
                        </div>

                        {/* スプレッドシートビューア */}
                        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden">
                            <div className="h-full overflow-auto">
                                <table className="border-collapse w-full">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="w-12 h-8 bg-gray-200 border border-gray-300 text-xs text-gray-500"></th>
                                            {Array.from({ length: currentSheet.colCount }).map((_, colIndex) => (
                                                <th
                                                    key={colIndex}
                                                    className="h-8 min-w-[80px] bg-gray-100 border border-gray-300 text-xs text-gray-600 font-medium"
                                                >
                                                    {getColumnLabel(colIndex)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentSheet.cells.slice(0, 100).map((row, rowIndex) => (
                                            <tr key={rowIndex}>
                                                <td className="w-12 h-8 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center font-medium">
                                                    {rowIndex + 1}
                                                </td>
                                                {Array.from({ length: currentSheet.colCount }).map((_, colIndex) => (
                                                    <td
                                                        key={colIndex}
                                                        className="h-8 min-w-[80px] border border-gray-200 text-sm px-2 truncate"
                                                    >
                                                        {row[colIndex]?.value ?? ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ3: 範囲設定・ページ紐づけ */}
                {currentStep === 'mapping' && currentSheet && (
                    <div className="h-full flex gap-4">
                        {/* 左パネル: ページ一覧 */}
                        <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm p-4 flex flex-col">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <span>📑</span> ページテンプレート
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-3">
                                {SAMPLE_PAGES.map(page => (
                                    <div
                                        key={page.id}
                                        onClick={() => {
                                            setSelectedPage(page);
                                            setActiveRangeId(null);
                                        }}
                                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPage?.id === page.id
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 mb-2">
                                            <span className="text-2xl">{page.icon}</span>
                                            <div>
                                                <h4 className="font-bold text-gray-800">{page.name}</h4>
                                                <p className="text-xs text-gray-500">{page.description}</p>
                                            </div>
                                        </div>
                                        {selectedPage?.id === page.id && (
                                            <div className="mt-3 space-y-2">
                                                {page.ranges.map(range => (
                                                    <button
                                                        key={range.id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveRangeId(activeRangeId === range.id ? null : range.id);
                                                        }}
                                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${activeRangeId === range.id
                                                            ? 'bg-white shadow-md ring-2'
                                                            : 'bg-gray-100 hover:bg-gray-200'
                                                            }`}
                                                        style={{
                                                            borderColor: range.color,
                                                            ...(activeRangeId === range.id ? { ringColor: range.color } : {})
                                                        }}
                                                    >
                                                        <div
                                                            className="w-4 h-4 rounded-full"
                                                            style={{ backgroundColor: range.color }}
                                                        />
                                                        <span className="text-gray-700">{range.label}</span>
                                                        {rangeSelections[range.id] && (
                                                            <span className="ml-auto text-xs text-green-600">✓</span>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setCurrentStep('generate')}
                                className="mt-4 w-full px-4 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>✨</span>
                                <span>コメント生成へ</span>
                            </button>
                        </div>

                        {/* 右パネル: スプレッドシート */}
                        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
                            {/* ヘッダー */}
                            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <h3 className="font-bold text-gray-800">シート: {activeSheet}</h3>
                                    {activeRangeId && (
                                        <div className="flex items-center gap-2 px-3 py-1 bg-indigo-100 rounded-lg">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: selectedPage?.ranges.find(r => r.id === activeRangeId)?.color }}
                                            />
                                            <span className="text-sm font-medium text-indigo-700">
                                                {selectedPage?.ranges.find(r => r.id === activeRangeId)?.label}を選択中
                                            </span>
                                        </div>
                                    )}
                                </div>
                                {currentSelection && (
                                    <div className="text-sm text-gray-500">
                                        選択: {getColumnLabel(currentSelection.startCol)}{currentSelection.startRow + 1}:
                                        {getColumnLabel(currentSelection.endCol)}{currentSelection.endRow + 1}
                                    </div>
                                )}
                            </div>

                            {/* スプレッドシート */}
                            <div className="flex-1 overflow-auto select-none">
                                <table className="border-collapse">
                                    <thead className="sticky top-0 z-10">
                                        <tr className="bg-gray-100">
                                            <th className="w-12 h-8 bg-gray-200 border border-gray-300"></th>
                                            {Array.from({ length: currentSheet.colCount }).map((_, colIndex) => (
                                                <th
                                                    key={colIndex}
                                                    className="h-8 min-w-[80px] bg-gray-100 border border-gray-300 text-xs text-gray-600 font-medium"
                                                >
                                                    {getColumnLabel(colIndex)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentSheet.cells.slice(0, 50).map((row, rowIndex) => (
                                            <tr key={rowIndex}>
                                                <td className="w-12 h-8 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center font-medium">
                                                    {rowIndex + 1}
                                                </td>
                                                {Array.from({ length: currentSheet.colCount }).map((_, colIndex) => (
                                                    <td
                                                        key={colIndex}
                                                        className={`h-8 min-w-[80px] border text-sm px-2 truncate cursor-crosshair ${activeRangeId ? 'hover:bg-indigo-50' : ''
                                                            }`}
                                                        style={getCellStyle(rowIndex, colIndex)}
                                                        onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                                                        onMouseMove={() => handleCellMouseMove(rowIndex, colIndex)}
                                                        onMouseUp={handleCellMouseUp}
                                                    >
                                                        {row[colIndex]?.value ?? ''}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ4: コメント生成 */}
                {currentStep === 'generate' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span>✨</span> AIコメント生成
                                    </h3>
                                    <p className="text-gray-500 mt-1">
                                        選択した範囲からページごとにコメントを生成します
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerateAll}
                                    disabled={generatingPage !== null}
                                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
                                >
                                    {generatingPage ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>生成中...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>🚀</span>
                                            <span>全ページ一括生成</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {SAMPLE_PAGES.map(page => {
                                    const comment = generatedComments.find(c => c.pageId === page.id);
                                    return (
                                        <div
                                            key={page.id}
                                            className={`p-4 rounded-xl border-2 transition-all ${comment?.status === 'completed'
                                                ? 'border-green-300 bg-green-50'
                                                : comment?.status === 'generating'
                                                    ? 'border-indigo-300 bg-indigo-50'
                                                    : 'border-gray-200 bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{page.icon}</span>
                                                    <h4 className="font-bold text-gray-800">{page.name}</h4>
                                                </div>
                                                {comment?.status === 'generating' ? (
                                                    <div className="flex items-center gap-2 text-indigo-600">
                                                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                                        <span className="text-sm">生成中...</span>
                                                    </div>
                                                ) : comment?.status === 'completed' ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                                        ✓ 完了
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleGenerateComment(page)}
                                                        disabled={generatingPage !== null}
                                                        className="px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                                    >
                                                        生成
                                                    </button>
                                                )}
                                            </div>
                                            {comment?.status === 'completed' && (
                                                <p className="text-sm text-gray-600 line-clamp-2">
                                                    {comment.comment.substring(0, 100)}...
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {generatedComments.some(c => c.status === 'completed') && (
                            <button
                                onClick={() => setCurrentStep('result')}
                                className="self-end px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                            >
                                <span>📋</span>
                                <span>結果を確認</span>
                            </button>
                        )}
                    </div>
                )}

                {/* ステップ5: 結果表示 */}
                {currentStep === 'result' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span>📋</span> 生成結果
                                    </h3>
                                    <p className="text-gray-500 mt-1">
                                        生成されたコメントを確認・編集できます
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            // 全コメントをクリップボードにコピー
                                            const allComments = generatedComments
                                                .filter(c => c.status === 'completed')
                                                .map(c => `【${c.pageName}】\n${c.comment}`)
                                                .join('\n\n' + '='.repeat(50) + '\n\n');
                                            navigator.clipboard.writeText(allComments);
                                        }}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
                                    >
                                        <span>📋</span>
                                        <span>全てコピー</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCurrentStep('upload');
                                            setFile(null);
                                            setSheets([]);
                                            setGeneratedComments([]);
                                            setRangeSelections({});
                                        }}
                                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                                    >
                                        <span>🔄</span>
                                        <span>新規作成</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {generatedComments
                                    .filter(c => c.status === 'completed')
                                    .map(comment => (
                                        <div
                                            key={comment.pageId}
                                            className="p-6 rounded-xl border border-gray-200 bg-gray-50"
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                                    <span>{SAMPLE_PAGES.find(p => p.id === comment.pageId)?.icon}</span>
                                                    <span>{comment.pageName}</span>
                                                </h4>
                                                <button
                                                    onClick={() => navigator.clipboard.writeText(comment.comment)}
                                                    className="px-3 py-1 bg-white text-gray-600 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1"
                                                >
                                                    <span>📋</span>
                                                    <span>コピー</span>
                                                </button>
                                            </div>
                                            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed bg-white p-4 rounded-lg border border-gray-200">
                                                {comment.comment}
                                            </pre>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentGeneratorTab;

import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker設定
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ============================================================
// 型定義
// ============================================================
interface PDFPage {
    pageNumber: number;
    title: string;
    thumbnail?: string;
    isSelected: boolean;
}

interface ExcelFile {
    id: string;
    name: string;
    sheets: SheetData[];
}

interface SheetData {
    name: string;
    cells: CellData[][];
    styles: CellStyle[][];
    rowCount: number;
    colCount: number;
    merges: MergeRange[];
}

interface CellData {
    value: string | number | null;
    formula?: string;
}

interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    fontColor?: string;
    bgColor?: string;
    borderTop?: string;
    borderBottom?: string;
    borderLeft?: string;
    borderRight?: string;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
}

interface MergeRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

interface CellRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

interface PageMapping {
    pageNumber: number;
    pageTitle: string;
    mappings: RangeMapping[];
}

interface RangeMapping {
    id: string;
    label: string;
    excelFileId?: string;
    sheetName?: string;
    range?: CellRange;
    color: string;
}

interface GeneratedComment {
    pageNumber: number;
    pageTitle: string;
    comment: string;
    status: 'pending' | 'generating' | 'completed' | 'error';
}

type WorkflowStep =
    | 'pdf-upload'     // PDFアップロード
    | 'page-select'    // ページ選択
    | 'excel-upload'   // Excelファイル追加
    | 'mapping'        // マッピング設定
    | 'generate'       // コメント生成
    | 'result';        // 結果表示

// ============================================================
// サンプルコメント
// ============================================================
const generateSampleComment = (pageTitle: string): string => {
    const templates: Record<string, string> = {
        '貸借対照表': `【${pageTitle}コメント】

■ 資産の部
当期末の総資産は前期末比10.2%増の15,234百万円となりました。
主な増加要因として、売上拡大に伴う売掛金の増加（+423百万円）、設備投資による有形固定資産の増加（+215百万円）が挙げられます。

■ 負債の部
負債合計は前期末比5.8%増の8,456百万円となりました。
短期借入金は運転資金需要の高まりから234百万円増加しました。

■ 純資産の部
自己資本比率は45.3%と前期の44.1%から1.2ポイント改善しています。`,
        '損益計算書': `【${pageTitle}コメント】

■ 売上高
当期の売上高は12,456百万円（前期比+8.3%）となり、3期連続の増収を達成しました。

■ 営業利益
営業利益は1,234百万円（前期比+12.5%）、営業利益率は9.9%となりました。
販管費の効率化が利益率改善に貢献しました。`,
    };

    // タイトルにマッチするテンプレートを探す
    for (const [key, template] of Object.entries(templates)) {
        if (pageTitle.includes(key)) {
            return template;
        }
    }

    return `【${pageTitle}コメント】

当期の実績は計画を上回る水準で推移しました。
詳細な分析結果は以下の通りです。

■ 主要ポイント
・前期比での改善が見られます
・計画対比でも良好な進捗です
・今後の課題として効率化推進が挙げられます`;
};

// ============================================================
// カラーパレット
// ============================================================
const RANGE_COLORS = [
    '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444',
    '#06B6D4', '#EC4899', '#22C55E', '#A855F7', '#F97316'
];

// ============================================================
// メインコンポーネント
// ============================================================
const CommentGeneratorTabV2: React.FC = () => {
    // ワークフロー状態
    const [currentStep, setCurrentStep] = useState<WorkflowStep>('pdf-upload');

    // PDF関連
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [pdfPages, setPdfPages] = useState<PDFPage[]>([]);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);

    // Excel関連
    const [excelFiles, setExcelFiles] = useState<ExcelFile[]>([]);
    const [activeExcelId, setActiveExcelId] = useState<string>('');
    const [activeSheetName, setActiveSheetName] = useState<string>('');

    // マッピング
    const [pageMappings, setPageMappings] = useState<PageMapping[]>([]);
    const [selectedPageIndex, setSelectedPageIndex] = useState<number>(0);
    const [activeRangeMappingId, setActiveRangeMappingId] = useState<string | null>(null);
    const [selectionStart, setSelectionStart] = useState<{ row: number, col: number } | null>(null);
    const [currentSelection, setCurrentSelection] = useState<CellRange | null>(null);

    // コメント生成
    const [generatedComments, setGeneratedComments] = useState<GeneratedComment[]>([]);
    const [generatingPage, setGeneratingPage] = useState<number | null>(null);

    // refs
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);


    // ============================================================
    // PDFアップロード・ページ抽出
    // ============================================================

    // よくある財務レポートのページタイトルパターン
    const TITLE_PATTERNS = [
        '貸借対照表', '損益計算書', 'キャッシュ・フロー', 'キャッシュフロー',
        '株主資本等変動計算書', '注記', '附属明細', 'セグメント',
        '連結財務諸表', '個別財務諸表', '経営成績', '財政状態',
        '業績', '売上', '利益', '資産', '負債', '純資産',
        '事業報告', '会社概要', '役員', '株式', '配当',
        'PL', 'BS', 'CF', '月次', '四半期', '年度',
        '概況', 'サマリー', '要約', '目次', '表紙',
        '前期比較', '計画比', '予算', '実績', '差異分析'
    ];

    // ページタイトルを推定する関数
    const extractPageTitle = (textItems: { str: string; transform?: number[]; height?: number; fontName?: string }[], pageNumber: number): string => {
        if (textItems.length === 0) {
            return `ページ ${pageNumber}`;
        }

        // 各テキストアイテムにメタデータを付与
        interface TextItemWithMeta {
            str: string;
            fontSize: number;
            y: number;
            x: number;
            isLikelyTitle: boolean;
        }

        const itemsWithMeta: TextItemWithMeta[] = textItems
            .filter(item => item.str && item.str.trim())
            .slice(0, 50) // 最初の50アイテムのみ分析
            .map(item => {
                // transformからフォントサイズと位置を取得
                // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
                const transform = item.transform || [1, 0, 0, 1, 0, 0];
                const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
                const x = transform[4] || 0;
                const y = transform[5] || 0;

                // タイトルらしいかどうかの判定
                const text = item.str.trim();
                const matchesPattern = TITLE_PATTERNS.some(pattern => text.includes(pattern));
                const isShortEnough = text.length <= 50;
                const hasNoNumbers = !/^\d+[,.\d]*$/.test(text); // 純粋な数値ではない

                return {
                    str: text,
                    fontSize,
                    y,
                    x,
                    isLikelyTitle: matchesPattern || (isShortEnough && hasNoNumbers && fontSize > 10)
                };
            });

        if (itemsWithMeta.length === 0) {
            return `ページ ${pageNumber}`;
        }

        // 戦略1: パターンマッチしたテキストを優先
        const patternMatched = itemsWithMeta.find(item =>
            TITLE_PATTERNS.some(pattern => item.str.includes(pattern))
        );
        if (patternMatched && patternMatched.str.length >= 2) {
            return patternMatched.str.substring(0, 40) + (patternMatched.str.length > 40 ? '...' : '');
        }

        // 戦略2: 最も大きいフォントサイズのテキストを探す
        const maxFontSize = Math.max(...itemsWithMeta.map(i => i.fontSize));
        const largestItems = itemsWithMeta.filter(i =>
            i.fontSize >= maxFontSize * 0.9 && // 最大サイズの90%以上
            i.str.length >= 2 &&
            i.str.length <= 50 &&
            !/^\d+[,.\d]*$/.test(i.str) // 数値のみは除外
        );

        if (largestItems.length > 0) {
            // 最も上にある（Y座標が大きい）ものを選ぶ
            const topItem = largestItems.reduce((a, b) => a.y > b.y ? a : b);
            // 同じY座標付近のテキストを結合
            const sameLineItems = largestItems
                .filter(i => Math.abs(i.y - topItem.y) < 5)
                .sort((a, b) => a.x - b.x);

            const combinedTitle = sameLineItems.map(i => i.str).join(' ').trim();
            if (combinedTitle.length >= 2) {
                return combinedTitle.substring(0, 40) + (combinedTitle.length > 40 ? '...' : '');
            }
        }

        // 戦略3: ページ上部のテキストを結合
        const topY = Math.max(...itemsWithMeta.slice(0, 10).map(i => i.y));
        const topTexts = itemsWithMeta
            .filter(i => i.y >= topY - 20 && i.str.length >= 2 && !/^\d+$/.test(i.str))
            .sort((a, b) => b.y - a.y || a.x - b.x)
            .slice(0, 3)
            .map(i => i.str)
            .join(' ')
            .trim();

        if (topTexts.length >= 2) {
            return topTexts.substring(0, 40) + (topTexts.length > 40 ? '...' : '');
        }

        // フォールバック: 最初の意味のあるテキスト
        const firstMeaningful = itemsWithMeta.find(i =>
            i.str.length >= 2 &&
            !/^\d+[,.\d]*$/.test(i.str) &&
            !/^[.\-_=]+$/.test(i.str)
        );

        if (firstMeaningful) {
            return firstMeaningful.str.substring(0, 40) + (firstMeaningful.str.length > 40 ? '...' : '');
        }

        return `ページ ${pageNumber}`;
    };

    const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPdfFile(file);
        setIsLoadingPdf(true);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pages: PDFPage[] = [];

            console.log(`PDF読み込み完了: ${pdf.numPages}ページ`);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // ページタイトル推定（改善版）
                const textItems = textContent.items as { str: string; transform?: number[]; height?: number; fontName?: string }[];
                const title = extractPageTitle(textItems, i);

                console.log(`ページ ${i}: "${title}"`);

                // サムネイル生成
                const scale = 0.3;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    await page.render({ canvasContext: ctx, viewport }).promise;
                }

                pages.push({
                    pageNumber: i,
                    title,
                    thumbnail: canvas.toDataURL(),
                    isSelected: i > 1, // 1ページ目(表紙)はデフォルトで除外
                });
            }

            setPdfPages(pages);
            setCurrentStep('page-select');
        } catch (error) {
            console.error('PDF loading error:', error);
            alert('PDFの読み込みに失敗しました。ファイルを確認してください。');
        } finally {
            setIsLoadingPdf(false);
        }
    }, []);

    // ============================================================
    // Excelアップロード
    // ============================================================
    const handleExcelUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellStyles: true });

                const sheets: SheetData[] = workbook.SheetNames.map(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as (string | number | null)[][];

                    // セルデータとスタイルを抽出
                    const cells: CellData[][] = [];
                    const styles: CellStyle[][] = [];
                    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

                    for (let r = 0; r <= range.e.r; r++) {
                        const rowCells: CellData[] = [];
                        const rowStyles: CellStyle[] = [];

                        for (let c = 0; c <= range.e.c; c++) {
                            const cellRef = XLSX.utils.encode_cell({ r, c });
                            const cell = worksheet[cellRef];

                            rowCells.push({
                                value: cell?.v ?? '',
                                formula: cell?.f,
                            });

                            // スタイル抽出（利用可能な場合）
                            const style: CellStyle = {};
                            if (cell?.s) {
                                if (cell.s.font?.bold) style.bold = true;
                                if (cell.s.font?.italic) style.italic = true;
                                if (cell.s.font?.color?.rgb) style.fontColor = `#${cell.s.font.color.rgb}`;
                                if (cell.s.fill?.fgColor?.rgb) style.bgColor = `#${cell.s.fill.fgColor.rgb}`;
                                if (cell.s.alignment?.horizontal) style.align = cell.s.alignment.horizontal as 'left' | 'center' | 'right';
                            }
                            rowStyles.push(style);
                        }

                        cells.push(rowCells);
                        styles.push(rowStyles);
                    }

                    // セル結合情報
                    const merges: MergeRange[] = (worksheet['!merges'] || []).map((m: XLSX.Range) => ({
                        startRow: m.s.r,
                        startCol: m.s.c,
                        endRow: m.e.r,
                        endCol: m.e.c,
                    }));

                    return {
                        name: sheetName,
                        cells,
                        styles,
                        rowCount: cells.length,
                        colCount: Math.max(...cells.map(row => row.length), 0),
                        merges,
                    };
                });

                const excelFile: ExcelFile = {
                    id: `excel-${Date.now()}`,
                    name: file.name,
                    sheets,
                };

                setExcelFiles(prev => [...prev, excelFile]);
                if (!activeExcelId) {
                    setActiveExcelId(excelFile.id);
                    if (sheets.length > 0) {
                        setActiveSheetName(sheets[0].name);
                    }
                }
            } catch (error) {
                console.error('Excel parsing error:', error);
            }
        };
        reader.readAsArrayBuffer(file);

        // inputをリセット
        if (excelInputRef.current) {
            excelInputRef.current.value = '';
        }
    }, [activeExcelId]);

    // ============================================================
    // ページ選択確定
    // ============================================================
    const handleConfirmPageSelection = useCallback(() => {
        const selectedPages = pdfPages.filter(p => p.isSelected);

        // マッピング初期化
        const mappings: PageMapping[] = selectedPages.map((page, index) => ({
            pageNumber: page.pageNumber,
            pageTitle: page.title,
            mappings: [
                {
                    id: `mapping-${page.pageNumber}-1`,
                    label: 'データ範囲1',
                    color: RANGE_COLORS[index % RANGE_COLORS.length],
                }
            ]
        }));

        setPageMappings(mappings);
        setCurrentStep('excel-upload');
    }, [pdfPages]);

    // ============================================================
    // 範囲選択処理
    // ============================================================
    const handleCellMouseDown = useCallback((row: number, col: number) => {
        if (!activeRangeMappingId) return;
        setSelectionStart({ row, col });
        setCurrentSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }, [activeRangeMappingId]);

    const handleCellMouseMove = useCallback((row: number, col: number) => {
        if (!selectionStart || !activeRangeMappingId) return;
        setCurrentSelection({
            startRow: Math.min(selectionStart.row, row),
            startCol: Math.min(selectionStart.col, col),
            endRow: Math.max(selectionStart.row, row),
            endCol: Math.max(selectionStart.col, col),
        });
    }, [selectionStart, activeRangeMappingId]);

    const handleCellMouseUp = useCallback(() => {
        if (currentSelection && activeRangeMappingId) {
            // 選択範囲を保存
            setPageMappings(prev => prev.map((pm, idx) => {
                if (idx !== selectedPageIndex) return pm;
                return {
                    ...pm,
                    mappings: pm.mappings.map(m => {
                        if (m.id !== activeRangeMappingId) return m;
                        return {
                            ...m,
                            excelFileId: activeExcelId,
                            sheetName: activeSheetName,
                            range: currentSelection,
                        };
                    })
                };
            }));
        }
        setSelectionStart(null);
    }, [currentSelection, activeRangeMappingId, selectedPageIndex, activeExcelId, activeSheetName]);

    // ============================================================
    // マッピング追加
    // ============================================================
    const handleAddRangeMapping = useCallback(() => {
        setPageMappings(prev => prev.map((pm, idx) => {
            if (idx !== selectedPageIndex) return pm;
            const newId = `mapping-${pm.pageNumber}-${pm.mappings.length + 1}`;
            return {
                ...pm,
                mappings: [
                    ...pm.mappings,
                    {
                        id: newId,
                        label: `データ範囲${pm.mappings.length + 1}`,
                        color: RANGE_COLORS[(pm.mappings.length) % RANGE_COLORS.length],
                    }
                ]
            };
        }));
    }, [selectedPageIndex]);

    // ============================================================
    // コメント生成
    // ============================================================
    const handleGenerateComment = useCallback(async (pageMapping: PageMapping) => {
        setGeneratingPage(pageMapping.pageNumber);

        setGeneratedComments(prev => [
            ...prev.filter(c => c.pageNumber !== pageMapping.pageNumber),
            {
                pageNumber: pageMapping.pageNumber,
                pageTitle: pageMapping.pageTitle,
                comment: '',
                status: 'generating',
            }
        ]);

        // デモ用：2秒待機
        await new Promise(resolve => setTimeout(resolve, 2000));

        setGeneratedComments(prev =>
            prev.map(c => c.pageNumber === pageMapping.pageNumber ? {
                ...c,
                comment: generateSampleComment(pageMapping.pageTitle),
                status: 'completed',
            } : c)
        );

        setGeneratingPage(null);
    }, []);

    const handleGenerateAll = useCallback(async () => {
        for (const mapping of pageMappings) {
            await handleGenerateComment(mapping);
        }
        setCurrentStep('result');
    }, [pageMappings, handleGenerateComment]);

    // ============================================================
    // ヘルパー関数
    // ============================================================
    const getColumnLabel = (index: number): string => {
        let label = '';
        let idx = index;
        while (idx >= 0) {
            label = String.fromCharCode(65 + (idx % 26)) + label;
            idx = Math.floor(idx / 26) - 1;
        }
        return label;
    };

    const getCurrentSheet = (): SheetData | null => {
        const excelFile = excelFiles.find(f => f.id === activeExcelId);
        return excelFile?.sheets.find(s => s.name === activeSheetName) || null;
    };

    const getCellStyle = (row: number, col: number): React.CSSProperties => {
        const currentSheet = getCurrentSheet();
        const baseStyle: React.CSSProperties = {};

        // Excelスタイル適用
        if (currentSheet?.styles[row]?.[col]) {
            const s = currentSheet.styles[row][col];
            if (s.bold) baseStyle.fontWeight = 'bold';
            if (s.italic) baseStyle.fontStyle = 'italic';
            if (s.fontColor) baseStyle.color = s.fontColor;
            if (s.bgColor && s.bgColor !== '#FFFFFF') baseStyle.backgroundColor = s.bgColor;
            if (s.align) baseStyle.textAlign = s.align;
        }

        // 選択中の範囲
        if (currentSelection && activeRangeMappingId) {
            const { startRow, startCol, endRow, endCol } = currentSelection;
            if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
                const currentPageMapping = pageMappings[selectedPageIndex];
                const rangeMapping = currentPageMapping?.mappings.find(m => m.id === activeRangeMappingId);
                if (rangeMapping) {
                    return {
                        ...baseStyle,
                        backgroundColor: rangeMapping.color + '40',
                        outline: `2px solid ${rangeMapping.color}`,
                    };
                }
            }
        }

        // 保存済みの範囲
        const currentPageMapping = pageMappings[selectedPageIndex];
        if (currentPageMapping) {
            for (const mapping of currentPageMapping.mappings) {
                if (mapping.range && mapping.excelFileId === activeExcelId && mapping.sheetName === activeSheetName) {
                    const r = mapping.range;
                    if (row >= r.startRow && row <= r.endRow && col >= r.startCol && col <= r.endCol) {
                        return {
                            ...baseStyle,
                            backgroundColor: mapping.color + '20',
                            outline: `1px solid ${mapping.color}`,
                        };
                    }
                }
            }
        }

        return baseStyle;
    };

    // ============================================================
    // レンダリング
    // ============================================================
    const steps = [
        { step: 'pdf-upload', label: 'PDFアップロード', icon: '📄' },
        { step: 'page-select', label: 'ページ選択', icon: '✓' },
        { step: 'excel-upload', label: 'Excel追加', icon: '📊' },
        { step: 'mapping', label: 'マッピング', icon: '🔗' },
        { step: 'generate', label: 'コメント生成', icon: '✨' },
        { step: 'result', label: '結果確認', icon: '📋' },
    ];

    const stepOrder: WorkflowStep[] = ['pdf-upload', 'page-select', 'excel-upload', 'mapping', 'generate', 'result'];
    const currentStepIndex = stepOrder.indexOf(currentStep);

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-indigo-50">
            {/* ステップインジケーター */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
                <div className="flex items-center justify-center gap-1">
                    {steps.map((item, index) => (
                        <React.Fragment key={item.step}>
                            <button
                                onClick={() => {
                                    if (index <= currentStepIndex) {
                                        setCurrentStep(item.step as WorkflowStep);
                                    }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${currentStep === item.step
                                    ? 'bg-indigo-600 text-white shadow-lg'
                                    : index < currentStepIndex
                                        ? 'bg-indigo-100 text-indigo-700 cursor-pointer hover:bg-indigo-200'
                                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <span>{item.icon}</span>
                                <span className="font-medium">{item.label}</span>
                            </button>
                            {index < steps.length - 1 && (
                                <div className={`w-6 h-0.5 ${index < currentStepIndex ? 'bg-indigo-400' : 'bg-gray-200'
                                    }`} />
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="flex-1 min-h-0 p-6 overflow-auto">

                {/* ステップ1: PDFアップロード */}
                {currentStep === 'pdf-upload' && (
                    <div className="h-full flex items-center justify-center">
                        <div className="w-full max-w-2xl">
                            <div
                                onClick={() => pdfInputRef.current?.click()}
                                className="p-12 rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer"
                            >
                                <input
                                    ref={pdfInputRef}
                                    type="file"
                                    accept=".pdf"
                                    onChange={handlePdfUpload}
                                    className="hidden"
                                />
                                <div className="text-center">
                                    {isLoadingPdf ? (
                                        <>
                                            <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                                            <p className="text-lg font-medium text-gray-700">PDFを解析中...</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-6xl mb-6">📄</div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">
                                                前月レポートPDFをアップロード
                                            </h3>
                                            <p className="text-gray-500 mb-6">
                                                コメント生成対象のページを自動抽出します
                                            </p>
                                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg">
                                                <span>📂</span>
                                                <span className="font-medium">PDFを選択</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ2: ページ選択 */}
                {currentStep === 'page-select' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800">コメント生成対象ページを選択</h3>
                                <p className="text-sm text-gray-500">
                                    表紙や不要なページのチェックを外してください（{pdfPages.filter(p => p.isSelected).length}/{pdfPages.length}ページ選択中）
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPdfPages(prev => prev.map(p => ({ ...p, isSelected: true })))}
                                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    全選択
                                </button>
                                <button
                                    onClick={() => setPdfPages(prev => prev.map(p => ({ ...p, isSelected: false })))}
                                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                >
                                    全解除
                                </button>
                                <button
                                    onClick={handleConfirmPageSelection}
                                    disabled={pdfPages.filter(p => p.isSelected).length === 0}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <span>次へ進む</span>
                                    <span>→</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto">
                            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                                {pdfPages.map(page => (
                                    <div
                                        key={page.pageNumber}
                                        onClick={() => {
                                            setPdfPages(prev => prev.map(p =>
                                                p.pageNumber === page.pageNumber
                                                    ? { ...p, isSelected: !p.isSelected }
                                                    : p
                                            ));
                                        }}
                                        className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${page.isSelected
                                            ? 'border-indigo-500 shadow-lg ring-2 ring-indigo-200'
                                            : 'border-gray-200 opacity-50 hover:opacity-75'
                                            }`}
                                    >
                                        {page.thumbnail && (
                                            <img
                                                src={page.thumbnail}
                                                alt={`Page ${page.pageNumber}`}
                                                className="w-full aspect-[3/4] object-cover bg-white"
                                            />
                                        )}
                                        <div className="absolute top-2 right-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${page.isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-600'
                                                }`}>
                                                {page.isSelected ? '✓' : ''}
                                            </div>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                            <p className="text-white text-xs font-medium truncate">{page.title}</p>
                                            <p className="text-white/70 text-xs">P.{page.pageNumber}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ3: Excelファイル追加 */}
                {currentStep === 'excel-upload' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">Excelファイルを追加</h3>
                                    <p className="text-sm text-gray-500">複数のExcelファイルをアップロードできます</p>
                                </div>
                                <button
                                    onClick={() => setCurrentStep('mapping')}
                                    disabled={excelFiles.length === 0}
                                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <span>マッピングへ</span>
                                    <span>→</span>
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                {excelFiles.map(file => (
                                    <div
                                        key={file.id}
                                        className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg"
                                    >
                                        <span>📊</span>
                                        <span className="font-medium">{file.name}</span>
                                        <span className="text-sm text-green-600">({file.sheets.length}シート)</span>
                                        <button
                                            onClick={() => setExcelFiles(prev => prev.filter(f => f.id !== file.id))}
                                            className="ml-2 text-green-600 hover:text-red-600"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}

                                <button
                                    onClick={() => excelInputRef.current?.click()}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
                                >
                                    <span>+</span>
                                    <span>Excelを追加</span>
                                </button>
                                <input
                                    ref={excelInputRef}
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={handleExcelUpload}
                                    className="hidden"
                                />
                            </div>
                        </div>

                        {/* サンプルファイル */}
                        <div className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                        <span className="text-xl">📄</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-700">サンプルExcelで試す</p>
                                        <p className="text-sm text-gray-500">財務諸表のサンプルデータ</p>
                                    </div>
                                </div>
                                <a
                                    href="/sample_financial_report.xlsx"
                                    download
                                    className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                                >
                                    <span>⬇️</span>
                                    <span>ダウンロード</span>
                                </a>
                            </div>
                        </div>

                        {/* Excelプレビュー */}
                        {excelFiles.length > 0 && (
                            <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
                                {/* ファイル/シート選択 */}
                                <div className="p-3 border-b border-gray-200 flex gap-4">
                                    <select
                                        value={activeExcelId}
                                        onChange={(e) => {
                                            setActiveExcelId(e.target.value);
                                            const file = excelFiles.find(f => f.id === e.target.value);
                                            if (file && file.sheets.length > 0) {
                                                setActiveSheetName(file.sheets[0].name);
                                            }
                                        }}
                                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                                    >
                                        {excelFiles.map(file => (
                                            <option key={file.id} value={file.id}>{file.name}</option>
                                        ))}
                                    </select>

                                    <div className="flex gap-1">
                                        {excelFiles.find(f => f.id === activeExcelId)?.sheets.map(sheet => (
                                            <button
                                                key={sheet.name}
                                                onClick={() => setActiveSheetName(sheet.name)}
                                                className={`px-3 py-1 rounded text-sm ${activeSheetName === sheet.name
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                    }`}
                                            >
                                                {sheet.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* スプレッドシート表示 */}
                                <div className="flex-1 overflow-auto">
                                    {getCurrentSheet() && (
                                        <table className="border-collapse">
                                            <thead className="sticky top-0 z-10">
                                                <tr>
                                                    <th className="w-10 h-7 bg-gray-200 border border-gray-300 text-xs text-gray-500"></th>
                                                    {Array.from({ length: getCurrentSheet()!.colCount }).map((_, colIndex) => (
                                                        <th
                                                            key={colIndex}
                                                            className="h-7 min-w-[80px] bg-gray-100 border border-gray-300 text-xs text-gray-600 font-medium"
                                                        >
                                                            {getColumnLabel(colIndex)}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {getCurrentSheet()!.cells.slice(0, 50).map((row, rowIndex) => (
                                                    <tr key={rowIndex}>
                                                        <td className="w-10 h-7 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center">
                                                            {rowIndex + 1}
                                                        </td>
                                                        {Array.from({ length: getCurrentSheet()!.colCount }).map((_, colIndex) => {
                                                            const cellStyle = getCurrentSheet()!.styles[rowIndex]?.[colIndex] || {};
                                                            return (
                                                                <td
                                                                    key={colIndex}
                                                                    className="h-7 min-w-[80px] border border-gray-200 text-sm px-1 truncate"
                                                                    style={{
                                                                        fontWeight: cellStyle.bold ? 'bold' : undefined,
                                                                        fontStyle: cellStyle.italic ? 'italic' : undefined,
                                                                        color: cellStyle.fontColor || undefined,
                                                                        backgroundColor: cellStyle.bgColor || undefined,
                                                                        textAlign: cellStyle.align || undefined,
                                                                    }}
                                                                >
                                                                    {row[colIndex]?.value ?? ''}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ステップ4: マッピング設定 */}
                {currentStep === 'mapping' && (
                    <div className="h-full flex gap-4">
                        {/* 左パネル: ページ一覧 */}
                        <div className="w-72 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-gray-200">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <span>📄</span> 対象ページ
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {pageMappings.map((pm, index) => (
                                    <div
                                        key={pm.pageNumber}
                                        onClick={() => setSelectedPageIndex(index)}
                                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${selectedPageIndex === index
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-gray-200 hover:border-indigo-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">📑</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-800 truncate">{pm.pageTitle}</p>
                                                <p className="text-xs text-gray-500">P.{pm.pageNumber} / {pm.mappings.length}範囲</p>
                                            </div>
                                            {pm.mappings.every(m => m.range) && (
                                                <span className="text-green-600">✓</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 border-t border-gray-200">
                                <button
                                    onClick={() => setCurrentStep('generate')}
                                    className="w-full px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2"
                                >
                                    <span>✨</span>
                                    <span>コメント生成へ</span>
                                </button>
                            </div>
                        </div>

                        {/* 中央パネル: マッピング設定 */}
                        <div className="w-64 flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
                            <div className="p-3 border-b border-gray-200">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <span>🔗</span> マッピング
                                </h3>
                            </div>
                            {pageMappings[selectedPageIndex] && (
                                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                    {pageMappings[selectedPageIndex].mappings.map(mapping => (
                                        <div
                                            key={mapping.id}
                                            onClick={() => setActiveRangeMappingId(
                                                activeRangeMappingId === mapping.id ? null : mapping.id
                                            )}
                                            className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${activeRangeMappingId === mapping.id
                                                ? 'border-indigo-500 bg-indigo-50 ring-2'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                            style={{
                                                borderColor: activeRangeMappingId === mapping.id ? mapping.color : undefined,
                                            }}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <div
                                                    className="w-4 h-4 rounded-full"
                                                    style={{ backgroundColor: mapping.color }}
                                                />
                                                <span className="font-medium text-gray-800">{mapping.label}</span>
                                            </div>
                                            {mapping.range ? (
                                                <div className="text-xs text-gray-600 bg-gray-100 rounded px-2 py-1">
                                                    {excelFiles.find(f => f.id === mapping.excelFileId)?.name?.substring(0, 15)}... /
                                                    {mapping.sheetName} /
                                                    {getColumnLabel(mapping.range.startCol)}{mapping.range.startRow + 1}:
                                                    {getColumnLabel(mapping.range.endCol)}{mapping.range.endRow + 1}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400">範囲未設定</p>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        onClick={handleAddRangeMapping}
                                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                                    >
                                        + 範囲を追加
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 右パネル: スプレッドシート */}
                        <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
                            {/* ファイル/シート選択 */}
                            <div className="p-3 border-b border-gray-200 flex items-center gap-4">
                                <select
                                    value={activeExcelId}
                                    onChange={(e) => {
                                        setActiveExcelId(e.target.value);
                                        const file = excelFiles.find(f => f.id === e.target.value);
                                        if (file && file.sheets.length > 0) {
                                            setActiveSheetName(file.sheets[0].name);
                                        }
                                    }}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                                >
                                    {excelFiles.map(file => (
                                        <option key={file.id} value={file.id}>{file.name}</option>
                                    ))}
                                </select>

                                <div className="flex gap-1 flex-1 overflow-x-auto">
                                    {excelFiles.find(f => f.id === activeExcelId)?.sheets.map(sheet => (
                                        <button
                                            key={sheet.name}
                                            onClick={() => setActiveSheetName(sheet.name)}
                                            className={`px-3 py-1 rounded text-sm whitespace-nowrap ${activeSheetName === sheet.name
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                        >
                                            {sheet.name}
                                        </button>
                                    ))}
                                </div>

                                {activeRangeMappingId && (
                                    <div className="flex items-center gap-2 px-3 py-1 bg-indigo-100 rounded-lg">
                                        <div
                                            className="w-3 h-3 rounded-full"
                                            style={{
                                                backgroundColor: pageMappings[selectedPageIndex]?.mappings
                                                    .find(m => m.id === activeRangeMappingId)?.color
                                            }}
                                        />
                                        <span className="text-sm font-medium text-indigo-700">範囲を選択中</span>
                                    </div>
                                )}
                            </div>

                            {/* スプレッドシート */}
                            <div className="flex-1 overflow-auto select-none">
                                {getCurrentSheet() && (
                                    <table className="border-collapse">
                                        <thead className="sticky top-0 z-10">
                                            <tr>
                                                <th className="w-10 h-7 bg-gray-200 border border-gray-300 text-xs text-gray-500"></th>
                                                {Array.from({ length: getCurrentSheet()!.colCount }).map((_, colIndex) => (
                                                    <th
                                                        key={colIndex}
                                                        className="h-7 min-w-[80px] bg-gray-100 border border-gray-300 text-xs text-gray-600 font-medium"
                                                    >
                                                        {getColumnLabel(colIndex)}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getCurrentSheet()!.cells.slice(0, 50).map((row, rowIndex) => (
                                                <tr key={rowIndex}>
                                                    <td className="w-10 h-7 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center">
                                                        {rowIndex + 1}
                                                    </td>
                                                    {Array.from({ length: getCurrentSheet()!.colCount }).map((_, colIndex) => (
                                                        <td
                                                            key={colIndex}
                                                            className={`h-7 min-w-[80px] border border-gray-200 text-sm px-1 truncate ${activeRangeMappingId ? 'cursor-crosshair hover:bg-indigo-50' : ''
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
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ステップ5: コメント生成 */}
                {currentStep === 'generate' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span>✨</span> AIコメント生成
                                    </h3>
                                    <p className="text-gray-500 mt-1">
                                        {pageMappings.length}ページのコメントを生成します
                                    </p>
                                </div>
                                <button
                                    onClick={handleGenerateAll}
                                    disabled={generatingPage !== null}
                                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
                                >
                                    {generatingPage !== null ? (
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

                            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                {pageMappings.map(pm => {
                                    const comment = generatedComments.find(c => c.pageNumber === pm.pageNumber);
                                    return (
                                        <div
                                            key={pm.pageNumber}
                                            className={`p-4 rounded-xl border-2 transition-all ${comment?.status === 'completed'
                                                ? 'border-green-300 bg-green-50'
                                                : comment?.status === 'generating'
                                                    ? 'border-indigo-300 bg-indigo-50'
                                                    : 'border-gray-200 bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xl">📑</span>
                                                    <div>
                                                        <h4 className="font-bold text-gray-800">{pm.pageTitle}</h4>
                                                        <p className="text-xs text-gray-500">P.{pm.pageNumber}</p>
                                                    </div>
                                                </div>
                                                {comment?.status === 'generating' ? (
                                                    <div className="flex items-center gap-2 text-indigo-600">
                                                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                                                        <span className="text-sm">生成中</span>
                                                    </div>
                                                ) : comment?.status === 'completed' ? (
                                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                                        ✓ 完了
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleGenerateComment(pm)}
                                                        disabled={generatingPage !== null}
                                                        className="px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                                    >
                                                        生成
                                                    </button>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {pm.mappings.filter(m => m.range).length}/{pm.mappings.length} 範囲設定済み
                                            </div>
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

                {/* ステップ6: 結果表示 */}
                {currentStep === 'result' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                        <span>📋</span> 生成結果
                                    </h3>
                                    <p className="text-gray-500 mt-1">
                                        {generatedComments.filter(c => c.status === 'completed').length}件のコメントを生成しました
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            const allComments = generatedComments
                                                .filter(c => c.status === 'completed')
                                                .map(c => `【P.${c.pageNumber} ${c.pageTitle}】\n${c.comment}`)
                                                .join('\n\n' + '='.repeat(50) + '\n\n');
                                            navigator.clipboard.writeText(allComments);
                                        }}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 flex items-center gap-2"
                                    >
                                        <span>📋</span>
                                        <span>全てコピー</span>
                                    </button>
                                    <button
                                        onClick={() => {
                                            setCurrentStep('pdf-upload');
                                            setPdfFile(null);
                                            setPdfPages([]);
                                            setExcelFiles([]);
                                            setPageMappings([]);
                                            setGeneratedComments([]);
                                        }}
                                        className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2"
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
                                            key={comment.pageNumber}
                                            className="p-6 rounded-xl border border-gray-200 bg-gray-50"
                                        >
                                            <div className="flex items-center justify-between mb-4">
                                                <h4 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                                    <span>📑</span>
                                                    <span>P.{comment.pageNumber} {comment.pageTitle}</span>
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

export default CommentGeneratorTabV2;

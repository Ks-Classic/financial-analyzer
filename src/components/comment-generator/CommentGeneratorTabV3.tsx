import React, { useState, useCallback, useRef, useMemo } from 'react';
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
    frozenRows: number;
    frozenCols: number;
}

interface CellData {
    value: string | number | null;
    formattedValue?: string;  // ¥1,234 や 12.34% などフォーマット済み
    formula?: string;
    numberFormat?: string;  // 元の数値フォーマット文字列
}

interface CellStyle {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    fontColor?: string;
    bgColor?: string;
    borderTop?: BorderStyle;
    borderBottom?: BorderStyle;
    borderLeft?: BorderStyle;
    borderRight?: BorderStyle;
    align?: 'left' | 'center' | 'right';
    valign?: 'top' | 'middle' | 'bottom';
    wrapText?: boolean;
}

interface BorderStyle {
    style: 'thin' | 'medium' | 'thick' | 'double' | 'dotted' | 'dashed';
    color: string;
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

type InputType = 'excel' | 'image';

interface PageWorkItem {
    pageNumber: number;
    pageTitle: string;
    thumbnail?: string;
    inputType: InputType;           // 'excel' or 'image'
    // Excel入力
    excelFileId?: string;
    sheetName?: string;
    range?: CellRange;
    targetMonthCol?: number;        // 当月列（0-indexed）
    // 画像入力
    tableImage?: string;            // Base64画像データ
    // 共通
    comment: string;
    status: 'pending' | 'generating' | 'completed';
}

type WorkflowStep =
    | 'pdf-upload'
    | 'page-select'
    | 'excel-upload'
    | 'page-work';  // 統合ワークビュー

// ============================================================
// よくある財務レポートのタイトルパターン
// ============================================================
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

// ============================================================
// サンプルコメント生成
// ============================================================
const generateSampleComment = (pageTitle: string, rangeData?: string[][]): string => {
    const templates: Record<string, string> = {
        '貸借対照表': `■ 資産の部
当期末の総資産は前期末比10.2%増の15,234百万円となりました。
主な増加要因として、売上拡大に伴う売掛金の増加（+423百万円）、設備投資による有形固定資産の増加（+215百万円）が挙げられます。

■ 負債の部
負債合計は前期末比5.8%増の8,456百万円となりました。

■ 純資産の部
自己資本比率は45.3%と前期の44.1%から1.2ポイント改善しています。`,
        '損益計算書': `■ 売上高
当期の売上高は12,456百万円（前期比+8.3%）となり、3期連続の増収を達成しました。

■ 営業利益
営業利益は1,234百万円（前期比+12.5%）、営業利益率は9.9%となりました。
販管費の効率化が利益率改善に貢献しました。`,
        'キャッシュ': `■ 営業CF
営業CFは1,567百万円の収入となりました。

■ 投資CF
投資CFは△423百万円の支出となりました。

■ 財務CF
財務CFは△234百万円の支出となりました。`,
    };

    for (const [key, template] of Object.entries(templates)) {
        if (pageTitle.includes(key)) {
            return template;
        }
    }

    return `当期の実績は計画を上回る水準で推移しました。

■ 主要ポイント
・前期比での改善が見られます
・計画対比でも良好な進捗です
・今後の課題として効率化推進が挙げられます`;
};

// ============================================================
// メインコンポーネント
// ============================================================
const CommentGeneratorTabV3: React.FC = () => {
    // ワークフロー状態
    const [currentStep, setCurrentStep] = useState<WorkflowStep>('pdf-upload');

    // PDF関連
    const [pdfPages, setPdfPages] = useState<PDFPage[]>([]);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);

    // Excel関連
    const [excelFiles, setExcelFiles] = useState<ExcelFile[]>([]);
    const [activeExcelId, setActiveExcelId] = useState<string>('');
    const [activeSheetName, setActiveSheetName] = useState<string>('');

    // ページ作業
    const [pageWorkItems, setPageWorkItems] = useState<PageWorkItem[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);

    // 範囲選択
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionStart, setSelectionStart] = useState<{ row: number, col: number } | null>(null);
    const [currentSelection, setCurrentSelection] = useState<CellRange | null>(null);

    // コメントパネルのリサイズ
    const [commentPanelWidth, setCommentPanelWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    // refs
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // ============================================================
    // ページタイトル抽出
    // ============================================================
    const extractPageTitle = useCallback((textItems: { str: string; transform?: number[] }[], pageNumber: number): string => {
        if (textItems.length === 0) return `ページ ${pageNumber}`;

        const itemsWithMeta = textItems
            .filter(item => item.str?.trim())
            .slice(0, 50)
            .map(item => {
                const transform = item.transform || [1, 0, 0, 1, 0, 0];
                const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
                return { str: item.str.trim(), fontSize, y: transform[5] || 0, x: transform[4] || 0 };
            });

        if (itemsWithMeta.length === 0) return `ページ ${pageNumber}`;

        // パターンマッチ優先
        const patternMatched = itemsWithMeta.find(item =>
            TITLE_PATTERNS.some(p => item.str.includes(p))
        );
        if (patternMatched) return patternMatched.str.substring(0, 40);

        // 最大フォントサイズのテキスト
        const maxFont = Math.max(...itemsWithMeta.map(i => i.fontSize));
        const largest = itemsWithMeta.find(i => i.fontSize >= maxFont * 0.9 && i.str.length >= 2 && !/^\d+$/.test(i.str));
        if (largest) return largest.str.substring(0, 40);

        // フォールバック
        const first = itemsWithMeta.find(i => i.str.length >= 2 && !/^\d+$/.test(i.str));
        return first?.str.substring(0, 40) || `ページ ${pageNumber}`;
    }, []);

    // ============================================================
    // PDFアップロード
    // ============================================================
    const handlePdfUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoadingPdf(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pages: PDFPage[] = [];

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const textItems = textContent.items as { str: string; transform?: number[] }[];
                const title = extractPageTitle(textItems, i);

                const scale = 0.4;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;

                pages.push({
                    pageNumber: i,
                    title,
                    thumbnail: canvas.toDataURL(),
                    isSelected: i > 1,
                });
            }

            setPdfPages(pages);
            setCurrentStep('page-select');
        } catch (error) {
            console.error('PDF loading error:', error);
            alert('PDFの読み込みに失敗しました');
        } finally {
            setIsLoadingPdf(false);
        }
    }, [extractPageTitle]);

    // ============================================================
    // Excelアップロード（スタイル強化版）
    // ============================================================
    const handleExcelUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellStyles: true, cellNF: true });

                const sheets: SheetData[] = workbook.SheetNames.map(sheetName => {
                    const ws = workbook.Sheets[sheetName];
                    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

                    const cells: CellData[][] = [];
                    const styles: CellStyle[][] = [];

                    for (let r = 0; r <= range.e.r; r++) {
                        const rowCells: CellData[] = [];
                        const rowStyles: CellStyle[] = [];

                        for (let c = 0; c <= range.e.c; c++) {
                            const cellRef = XLSX.utils.encode_cell({ r, c });
                            const cell = ws[cellRef];

                            // 数値フォーマット: cell.w はExcelのフォーマット適用済みテキスト
                            // cell.z は数値フォーマット文字列 (例: "¥#,##0", "0.00%")
                            rowCells.push({
                                value: cell?.v ?? '',
                                formattedValue: cell?.w,  // フォーマット適用済み
                                formula: cell?.f,
                                numberFormat: cell?.z,
                            });

                            // スタイル抽出（強化版）
                            const style: CellStyle = {};
                            if (cell?.s) {
                                const s = cell.s;
                                if (s.font?.bold) style.bold = true;
                                if (s.font?.italic) style.italic = true;
                                if (s.font?.underline) style.underline = true;
                                if (s.font?.sz) style.fontSize = s.font.sz;
                                if (s.font?.color?.rgb) style.fontColor = `#${s.font.color.rgb.slice(-6)}`;
                                if (s.fill?.fgColor?.rgb) {
                                    const rgb = s.fill.fgColor.rgb;
                                    if (rgb && rgb !== 'FFFFFF' && rgb !== '000000') {
                                        style.bgColor = `#${rgb.slice(-6)}`;
                                    }
                                }
                                if (s.alignment?.horizontal) style.align = s.alignment.horizontal as 'left' | 'center' | 'right';
                                if (s.alignment?.vertical) style.valign = s.alignment.vertical as 'top' | 'middle' | 'bottom';
                                if (s.alignment?.wrapText) style.wrapText = true;

                                // 罫線
                                if (s.border) {
                                    const parseBorder = (b: { style?: string; color?: { rgb?: string } }): BorderStyle | undefined => {
                                        if (!b?.style) return undefined;
                                        return {
                                            style: b.style as BorderStyle['style'],
                                            color: b.color?.rgb ? `#${b.color.rgb.slice(-6)}` : '#000000'
                                        };
                                    };
                                    style.borderTop = parseBorder(s.border.top);
                                    style.borderBottom = parseBorder(s.border.bottom);
                                    style.borderLeft = parseBorder(s.border.left);
                                    style.borderRight = parseBorder(s.border.right);
                                }
                            }
                            rowStyles.push(style);
                        }
                        cells.push(rowCells);
                        styles.push(rowStyles);
                    }

                    // セル結合
                    const merges: MergeRange[] = (ws['!merges'] || []).map((m: XLSX.Range) => ({
                        startRow: m.s.r, startCol: m.s.c, endRow: m.e.r, endCol: m.e.c,
                    }));

                    // 固定行/列
                    const freeze = (ws as { '!freeze'?: { xSplit?: number; ySplit?: number } })['!freeze'];
                    const frozenRows = freeze?.ySplit || 0;
                    const frozenCols = freeze?.xSplit || 0;

                    return {
                        name: sheetName,
                        cells,
                        styles,
                        rowCount: cells.length,
                        colCount: Math.max(...cells.map(r => r.length), 0),
                        merges,
                        frozenRows,
                        frozenCols,
                    };
                });

                const excelFile: ExcelFile = {
                    id: `excel-${Date.now()}`,
                    name: file.name,
                    sheets,
                };

                setExcelFiles(prev => [...prev, excelFile]);
                if (!activeExcelId && sheets.length > 0) {
                    setActiveExcelId(excelFile.id);
                    setActiveSheetName(sheets[0].name);
                }
            } catch (error) {
                console.error('Excel parsing error:', error);
            }
        };
        reader.readAsArrayBuffer(file);
        if (excelInputRef.current) excelInputRef.current.value = '';
    }, [activeExcelId]);

    // ============================================================
    // ページ選択確定 → ワークアイテム作成
    // ============================================================
    const handleConfirmPageSelection = useCallback(() => {
        const selected = pdfPages.filter(p => p.isSelected);
        const workItems: PageWorkItem[] = selected.map(p => ({
            pageNumber: p.pageNumber,
            pageTitle: p.title,
            thumbnail: p.thumbnail,
            inputType: 'excel' as InputType,  // デフォルトはExcel入力
            comment: '',
            status: 'pending',
        }));
        setPageWorkItems(workItems);
        setCurrentPageIndex(0);
        setCurrentStep('excel-upload');
    }, [pdfPages]);

    // ============================================================
    // 範囲選択
    // ============================================================
    const handleCellMouseDown = useCallback((row: number, col: number) => {
        setIsSelecting(true);
        setSelectionStart({ row, col });
        setCurrentSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
    }, []);

    const handleCellMouseMove = useCallback((row: number, col: number) => {
        if (!isSelecting || !selectionStart) return;
        setCurrentSelection({
            startRow: Math.min(selectionStart.row, row),
            startCol: Math.min(selectionStart.col, col),
            endRow: Math.max(selectionStart.row, row),
            endCol: Math.max(selectionStart.col, col),
        });
    }, [isSelecting, selectionStart]);

    const handleCellMouseUp = useCallback(() => {
        if (currentSelection) {
            setPageWorkItems(prev => prev.map((item, idx) =>
                idx === currentPageIndex ? {
                    ...item,
                    excelFileId: activeExcelId,
                    sheetName: activeSheetName,
                    range: currentSelection,
                } : item
            ));
        }
        setIsSelecting(false);
        setSelectionStart(null);
    }, [currentSelection, currentPageIndex, activeExcelId, activeSheetName]);

    // ============================================================
    // コメント生成
    // ============================================================
    const handleGenerateComment = useCallback(async () => {
        const item = pageWorkItems[currentPageIndex];
        if (!item) return;

        setPageWorkItems(prev => prev.map((it, idx) =>
            idx === currentPageIndex ? { ...it, status: 'generating' } : it
        ));

        await new Promise(resolve => setTimeout(resolve, 1500));

        const comment = generateSampleComment(item.pageTitle);
        setPageWorkItems(prev => prev.map((it, idx) =>
            idx === currentPageIndex ? { ...it, comment, status: 'completed' } : it
        ));
    }, [currentPageIndex, pageWorkItems]);

    // ============================================================
    // ヘルパー
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

    const currentSheet = useMemo(() => {
        const file = excelFiles.find(f => f.id === activeExcelId);
        return file?.sheets.find(s => s.name === activeSheetName) || null;
    }, [excelFiles, activeExcelId, activeSheetName]);

    const currentWorkItem = pageWorkItems[currentPageIndex];

    const getCellDisplayStyle = useCallback((row: number, col: number): React.CSSProperties => {
        if (!currentSheet) return {};

        const cellStyle = currentSheet.styles[row]?.[col] || {};
        const style: React.CSSProperties = {};

        // 基本スタイル
        if (cellStyle.bold) style.fontWeight = 'bold';
        if (cellStyle.italic) style.fontStyle = 'italic';
        if (cellStyle.underline) style.textDecoration = 'underline';
        if (cellStyle.fontSize) style.fontSize = `${cellStyle.fontSize}px`;
        if (cellStyle.fontColor) style.color = cellStyle.fontColor;
        if (cellStyle.bgColor) style.backgroundColor = cellStyle.bgColor;
        if (cellStyle.align) style.textAlign = cellStyle.align;
        if (cellStyle.valign) style.verticalAlign = cellStyle.valign;

        // 罫線
        const borderToCSS = (b?: BorderStyle): string => {
            if (!b) return '1px solid #e5e7eb';
            const widthMap = { thin: '1px', medium: '2px', thick: '3px', double: '3px', dotted: '1px', dashed: '1px' };
            const styleMap = { thin: 'solid', medium: 'solid', thick: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed' };
            return `${widthMap[b.style]} ${styleMap[b.style]} ${b.color}`;
        };
        style.borderTop = borderToCSS(cellStyle.borderTop);
        style.borderBottom = borderToCSS(cellStyle.borderBottom);
        style.borderLeft = borderToCSS(cellStyle.borderLeft);
        style.borderRight = borderToCSS(cellStyle.borderRight);

        // 選択範囲ハイライト
        const range = currentWorkItem?.range;
        if (range && row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol) {
            style.backgroundColor = '#3B82F640';
            style.outline = '2px solid #3B82F6';
        }

        // ドラッグ中の選択
        if (currentSelection && row >= currentSelection.startRow && row <= currentSelection.endRow &&
            col >= currentSelection.startCol && col <= currentSelection.endCol) {
            style.backgroundColor = '#10B98140';
            style.outline = '2px solid #10B981';
        }

        return style;
    }, [currentSheet, currentWorkItem, currentSelection]);

    // ============================================================
    // レンダリング
    // ============================================================
    const steps = [
        { step: 'pdf-upload', label: 'PDF', icon: '📄' },
        { step: 'page-select', label: 'ページ選択', icon: '✓' },
        { step: 'excel-upload', label: 'Excel', icon: '📊' },
        { step: 'page-work', label: '作業', icon: '✨' },
    ];

    const stepOrder: WorkflowStep[] = ['pdf-upload', 'page-select', 'excel-upload', 'page-work'];
    const currentStepIndex = stepOrder.indexOf(currentStep);

    return (
        <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-indigo-50">
            {/* ステップインジケーター */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2">
                <div className="flex items-center justify-center gap-1">
                    {steps.map((item, index) => (
                        <React.Fragment key={item.step}>
                            <button
                                onClick={() => index <= currentStepIndex && setCurrentStep(item.step as WorkflowStep)}
                                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all ${currentStep === item.step
                                    ? 'bg-indigo-600 text-white'
                                    : index < currentStepIndex
                                        ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                        : 'bg-gray-100 text-gray-400'
                                    }`}
                            >
                                <span>{item.icon}</span>
                                <span className="font-medium">{item.label}</span>
                            </button>
                            {index < steps.length - 1 && <div className={`w-4 h-0.5 ${index < currentStepIndex ? 'bg-indigo-400' : 'bg-gray-200'}`} />}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {/* メインコンテンツ */}
            <div className="flex-1 min-h-0 p-4 overflow-auto">

                {/* PDFアップロード */}
                {currentStep === 'pdf-upload' && (
                    <div className="h-full flex items-center justify-center">
                        <div
                            onClick={() => pdfInputRef.current?.click()}
                            className="w-full max-w-xl p-10 rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:border-indigo-400 cursor-pointer transition-all"
                        >
                            <input ref={pdfInputRef} type="file" accept=".pdf" onChange={handlePdfUpload} className="hidden" />
                            <div className="text-center">
                                {isLoadingPdf ? (
                                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                ) : (
                                    <>
                                        <div className="text-5xl mb-4">📄</div>
                                        <h3 className="text-lg font-bold text-gray-800 mb-2">PDFレポートをアップロード</h3>
                                        <p className="text-gray-500 text-sm">ページを自動抽出します</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ページ選択 */}
                {currentStep === 'page-select' && (
                    <div className="h-full flex flex-col gap-3">
                        <div className="bg-white rounded-lg p-3 shadow-sm flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800">コメント対象ページを選択</h3>
                                <p className="text-xs text-gray-500">{pdfPages.filter(p => p.isSelected).length}/{pdfPages.length}ページ選択中</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setPdfPages(p => p.map(x => ({ ...x, isSelected: true })))} className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">全選択</button>
                                <button onClick={() => setPdfPages(p => p.map(x => ({ ...x, isSelected: false })))} className="px-3 py-1 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">全解除</button>
                                <button onClick={handleConfirmPageSelection} disabled={!pdfPages.some(p => p.isSelected)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">次へ →</button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <div className="grid grid-cols-5 md:grid-cols-7 lg:grid-cols-9 gap-3">
                                {pdfPages.map(page => (
                                    <div
                                        key={page.pageNumber}
                                        onClick={() => setPdfPages(p => p.map(x => x.pageNumber === page.pageNumber ? { ...x, isSelected: !x.isSelected } : x))}
                                        className={`relative rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${page.isSelected ? 'border-indigo-500 shadow-lg' : 'border-gray-200 opacity-50'}`}
                                    >
                                        {page.thumbnail && <img src={page.thumbnail} alt="" className="w-full aspect-[3/4] object-cover bg-white" />}
                                        <div className="absolute top-1 right-1">
                                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${page.isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-300'}`}>
                                                {page.isSelected && '✓'}
                                            </div>
                                        </div>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                                            <p className="text-white text-xs truncate">{page.title}</p>
                                            <p className="text-white/60 text-xs">P.{page.pageNumber}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Excelアップロード */}
                {currentStep === 'excel-upload' && (
                    <div className="h-full flex flex-col gap-3">
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-gray-800">Excelファイルを追加</h3>
                                <button onClick={() => setCurrentStep('page-work')} disabled={excelFiles.length === 0} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">作業開始 →</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {excelFiles.map(f => (
                                    <div key={f.id} className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm">
                                        <span>📊 {f.name}</span>
                                        <button onClick={() => setExcelFiles(prev => prev.filter(x => x.id !== f.id))} className="text-green-600 hover:text-red-600">✕</button>
                                    </div>
                                ))}
                                <button onClick={() => excelInputRef.current?.click()} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200">+ 追加</button>
                                <input ref={excelInputRef} type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} className="hidden" />
                            </div>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <a href="/sample_financial_report.xlsx" download className="flex items-center gap-2 text-green-700 hover:underline">
                                <span>📄</span><span>サンプルExcelをダウンロード</span>
                            </a>
                        </div>
                    </div>
                )}

                {/* 統合ワークビュー */}
                {currentStep === 'page-work' && currentWorkItem && (
                    <div className="h-full flex gap-3">
                        {/* 左: ページ一覧 */}
                        <div className="w-48 flex-shrink-0 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden">
                            <div className="p-2 border-b border-gray-200 font-bold text-sm text-gray-700">ページ一覧</div>
                            <div className="flex-1 overflow-y-auto p-1 space-y-1">
                                {pageWorkItems.map((item, idx) => (
                                    <div
                                        key={item.pageNumber}
                                        onClick={() => setCurrentPageIndex(idx)}
                                        className={`p-2 rounded-lg cursor-pointer transition-all flex items-center gap-2 ${idx === currentPageIndex ? 'bg-indigo-100 border-2 border-indigo-400' : 'hover:bg-gray-50 border-2 border-transparent'}`}
                                    >
                                        <div className="w-8 h-10 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                                            {item.thumbnail && <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{item.pageTitle}</p>
                                            <p className="text-xs text-gray-400">P.{item.pageNumber}</p>
                                        </div>
                                        {item.status === 'completed' && <span className="text-green-600 text-xs">✓</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 中央: Excelビューア */}
                        <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden">
                            <div className="p-2 border-b border-gray-200 flex items-center gap-3">
                                <select value={activeExcelId} onChange={e => { setActiveExcelId(e.target.value); const f = excelFiles.find(x => x.id === e.target.value); if (f) setActiveSheetName(f.sheets[0]?.name || ''); }} className="px-2 py-1 border rounded text-sm">
                                    {excelFiles.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                                <div className="flex gap-1">
                                    {excelFiles.find(f => f.id === activeExcelId)?.sheets.map(s => (
                                        <button key={s.name} onClick={() => setActiveSheetName(s.name)} className={`px-2 py-1 text-xs rounded ${activeSheetName === s.name ? 'bg-indigo-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>{s.name}</button>
                                    ))}
                                </div>
                                <div className="flex-1" />
                                {currentWorkItem.range && (
                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                        {getColumnLabel(currentWorkItem.range.startCol)}{currentWorkItem.range.startRow + 1}:
                                        {getColumnLabel(currentWorkItem.range.endCol)}{currentWorkItem.range.endRow + 1}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-auto select-none" onMouseLeave={() => isSelecting && handleCellMouseUp()}>
                                {currentSheet && (
                                    <table className="border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                                        <thead className="sticky top-0 z-10">
                                            <tr>
                                                <th className="w-10 h-6 bg-gray-200 border border-gray-300 text-xs text-gray-500 sticky left-0 z-20"></th>
                                                {Array.from({ length: Math.min(currentSheet.colCount, 30) }).map((_, c) => (
                                                    <th key={c} className="h-6 min-w-[70px] bg-gray-100 border border-gray-300 text-xs text-gray-600" style={{ position: c < (currentSheet.frozenCols || 0) ? 'sticky' : undefined, left: c < (currentSheet.frozenCols || 0) ? `${40 + c * 70}px` : undefined, zIndex: c < (currentSheet.frozenCols || 0) ? 15 : undefined }}>{getColumnLabel(c)}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {currentSheet.cells.slice(0, 100).map((row, r) => (
                                                <tr key={r} style={{ position: r < (currentSheet.frozenRows || 0) ? 'sticky' : undefined, top: r < (currentSheet.frozenRows || 0) ? `${24 + r * 24}px` : undefined, zIndex: r < (currentSheet.frozenRows || 0) ? 5 : undefined }}>
                                                    <td className="w-10 h-6 bg-gray-100 border border-gray-300 text-xs text-gray-500 text-center sticky left-0 z-10">{r + 1}</td>
                                                    {Array.from({ length: Math.min(currentSheet.colCount, 30) }).map((_, c) => (
                                                        <td
                                                            key={c}
                                                            className="h-6 min-w-[70px] px-1 truncate cursor-crosshair"
                                                            style={getCellDisplayStyle(r, c)}
                                                            onMouseDown={() => handleCellMouseDown(r, c)}
                                                            onMouseMove={() => handleCellMouseMove(r, c)}
                                                            onMouseUp={handleCellMouseUp}
                                                        >
                                                            {/* フォーマット済み値を優先表示（¥1,234、12.34%など） */}
                                                            {row[c]?.formattedValue ?? row[c]?.value ?? ''}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* リサイズハンドル */}
                        <div
                            className="w-1 bg-gray-200 hover:bg-indigo-400 cursor-col-resize flex-shrink-0 transition-colors"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                setIsResizing(true);
                                const startX = e.clientX;
                                const startWidth = commentPanelWidth;

                                const handleMouseMove = (moveEvent: MouseEvent) => {
                                    const delta = startX - moveEvent.clientX;
                                    setCommentPanelWidth(Math.max(280, Math.min(600, startWidth + delta)));
                                };

                                const handleMouseUp = () => {
                                    setIsResizing(false);
                                    window.removeEventListener('mousemove', handleMouseMove);
                                    window.removeEventListener('mouseup', handleMouseUp);
                                };

                                window.addEventListener('mousemove', handleMouseMove);
                                window.addEventListener('mouseup', handleMouseUp);
                            }}
                        />

                        {/* 右: コメント（リサイズ対応） */}
                        <div
                            className="flex-shrink-0 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden"
                            style={{ width: commentPanelWidth }}
                        >
                            {/* ページ情報 */}
                            <div className="p-3 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">📑</span>
                                    <div className="flex-1">
                                        <p className="font-bold text-gray-800">{currentWorkItem.pageTitle}</p>
                                        <p className="text-xs text-gray-500">P.{currentWorkItem.pageNumber}</p>
                                    </div>
                                </div>
                            </div>

                            {/* 入力タイプ切替 */}
                            <div className="p-3 border-b border-gray-200">
                                <div className="flex gap-1 mb-3">
                                    <button
                                        onClick={() => setPageWorkItems(prev => prev.map((it, idx) =>
                                            idx === currentPageIndex ? { ...it, inputType: 'excel' as InputType } : it
                                        ))}
                                        className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentWorkItem.inputType === 'excel'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        📊 Excel範囲
                                    </button>
                                    <button
                                        onClick={() => setPageWorkItems(prev => prev.map((it, idx) =>
                                            idx === currentPageIndex ? { ...it, inputType: 'image' as InputType } : it
                                        ))}
                                        className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${currentWorkItem.inputType === 'image'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                    >
                                        🖼️ 画像
                                    </button>
                                </div>

                                {/* Excel入力時: 当月列指定 */}
                                {currentWorkItem.inputType === 'excel' && currentSheet && (
                                    <div className="flex items-center gap-2 text-sm">
                                        <span className="text-gray-600">当月列:</span>
                                        <select
                                            value={currentWorkItem.targetMonthCol ?? ''}
                                            onChange={(e) => setPageWorkItems(prev => prev.map((it, idx) =>
                                                idx === currentPageIndex
                                                    ? { ...it, targetMonthCol: e.target.value ? parseInt(e.target.value) : undefined }
                                                    : it
                                            ))}
                                            className="px-2 py-1 border border-gray-300 rounded text-sm flex-1"
                                        >
                                            <option value="">自動検出</option>
                                            {Array.from({ length: Math.min(currentSheet.colCount, 30) }).map((_, c) => (
                                                <option key={c} value={c}>
                                                    {getColumnLabel(c)}列
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* 画像入力時: ファイルアップロード */}
                                {currentWorkItem.inputType === 'image' && (
                                    <div>
                                        <input
                                            ref={imageInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    setPageWorkItems(prev => prev.map((it, idx) =>
                                                        idx === currentPageIndex
                                                            ? { ...it, tableImage: event.target?.result as string }
                                                            : it
                                                    ));
                                                };
                                                reader.readAsDataURL(file);
                                            }}
                                        />
                                        {currentWorkItem.tableImage ? (
                                            <div className="relative">
                                                <img
                                                    src={currentWorkItem.tableImage}
                                                    alt="Table"
                                                    className="w-full rounded border border-gray-200"
                                                />
                                                <button
                                                    onClick={() => setPageWorkItems(prev => prev.map((it, idx) =>
                                                        idx === currentPageIndex ? { ...it, tableImage: undefined } : it
                                                    ))}
                                                    className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => imageInputRef.current?.click()}
                                                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                                            >
                                                🖼️ 表の画像をアップロード
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* 生成ボタン */}
                            <div className="p-3 border-b border-gray-200">
                                <button
                                    onClick={handleGenerateComment}
                                    disabled={currentWorkItem.status === 'generating'}
                                    className="w-full px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-medium rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {currentWorkItem.status === 'generating' ? (
                                        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>生成中...</span></>
                                    ) : (
                                        <><span>✨</span><span>コメント生成</span></>
                                    )}
                                </button>
                            </div>

                            {/* コメント表示/編集 */}
                            <div className="flex-1 p-3 overflow-auto">
                                {currentWorkItem.status === 'completed' ? (
                                    <div className="space-y-2 h-full flex flex-col">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-green-600 font-medium">✓ 生成完了</span>
                                            <button onClick={() => navigator.clipboard.writeText(currentWorkItem.comment)} className="text-xs text-gray-500 hover:text-indigo-600">📋 コピー</button>
                                        </div>
                                        <textarea
                                            value={currentWorkItem.comment}
                                            onChange={e => setPageWorkItems(prev => prev.map((it, idx) => idx === currentPageIndex ? { ...it, comment: e.target.value } : it))}
                                            className="flex-1 w-full p-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                            style={{ minHeight: '200px' }}
                                        />
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                                        <div className="text-center">
                                            {currentWorkItem.inputType === 'excel' ? (
                                                <>
                                                    <p>Excelで範囲を選択して</p>
                                                    <p>コメントを生成してください</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p>表の画像をアップロードして</p>
                                                    <p>コメントを生成してください</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ページナビゲーション */}
                            <div className="p-3 border-t border-gray-200 flex justify-between">
                                <button
                                    onClick={() => setCurrentPageIndex(i => Math.max(0, i - 1))}
                                    disabled={currentPageIndex === 0}
                                    className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-200"
                                >
                                    ← 前
                                </button>
                                <span className="text-sm text-gray-500">{currentPageIndex + 1} / {pageWorkItems.length}</span>
                                <button
                                    onClick={() => setCurrentPageIndex(i => Math.min(pageWorkItems.length - 1, i + 1))}
                                    disabled={currentPageIndex === pageWorkItems.length - 1}
                                    className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm disabled:opacity-50 hover:bg-gray-200"
                                >
                                    次 →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentGeneratorTabV3;

// コメント生成機能の型定義

// Excelセルデータ
export interface CellData {
    value: string | number | null;
    format?: string;
    style?: {
        bold?: boolean;
        italic?: boolean;
        bgColor?: string;
        textColor?: string;
    };
}

// シートデータ
export interface SheetData {
    name: string;
    cells: CellData[][];
    rowCount: number;
    colCount: number;
}

// 選択範囲
export interface CellRange {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
}

// ページテンプレート
export interface PageTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    ranges: {
        id: string;
        label: string;
        range?: CellRange;
        color: string;
    }[];
}

// 生成されたコメント
export interface GeneratedComment {
    pageId: string;
    pageName: string;
    comment: string;
    rawData: Record<string, unknown>;
    status: 'pending' | 'generating' | 'completed' | 'error';
    timestamp?: string;
    error?: string;
}

// 顧客情報
export interface CustomerInfo {
    id: string;
    name: string;
    parentCompany?: string;
    industry?: string;
    templates: string[]; // テンプレートID一覧
}

// ワークフローの状態
export type WorkflowStep =
    | 'upload'     // ファイルアップロード
    | 'preview'    // プレビュー・シート選択
    | 'mapping'    // 範囲選択・ページ紐づけ
    | 'generate'   // コメント生成
    | 'result';    // 結果表示

export interface AnalysisResult {
  page: number;
  pdfPhysicalPageNumber?: number;
  pageTitle?: string;
  type: '数値計算の誤り' | '表示・記載の誤り' | '事実関係の誤り' | '重要事項の遺漏' | '品質管理上の問題';
  summary: string;
  details: string;
  highlightText?: string;
  // 該当箇所の詳細情報
  location?: {
    tableTitle?: string;      // 表のタイトル
    columnName?: string;      // 列名
    rowName?: string;         // 行名
    sectionName?: string;     // セクション名
  };
  // 数値計算の誤り専用フィールド
  reportedValue?: string;     // レポート上の（間違った）数値
  correctValue?: string;      // 正しい数値  
  calculationFormula?: string; // 計算式
}

export interface HighlightArea {
  pageIndex: number; 
  bounds: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
  text: string;
}

// 前月比較機能用の型定義
export interface MonthlyComparisonResult {
  id: string;
  page: number;
  pageTitle?: string;
  comparisonType: '同軸比較' | '異軸比較' | '新規項目' | '削除項目' | '累計推移';
  itemPath: string;
  currentValue?: string;
  previousValue?: string;
  changeAmount?: string;
  changePercentage?: string;
  comment: string;
  significance: '高' | '中' | '低';
  category: '売上' | '利益' | '費用' | '資産' | '負債' | 'その他';
  timestamp: string;
  // コメント生成用の追加情報
  originalComment?: string; // 前月のコメント
  generatedComment: string; // AI生成された当月コメント
  reasoning: string; // AIの判断理由
}

export interface MonthlyData {
  id: string;
  fileName: string;
  uploadDate: string;
  extractedData: {
    page: number;
    pageTitle?: string;
    content: string;
    tables: Array<{
      title?: string;
      data: Record<string, any>;
    }>;
  }[];
  analysisResults: AnalysisResult[];
}

export interface ComparisonRequest {
  currentFile: File;
  previousFile: File;
  comparisonOptions: {
    includeDeletedItems: boolean;
    includeNewItems: boolean;
    significanceThreshold: '高' | '中' | '低';
    focusAreas: string[]; // 重点分析エリア
  };
}

export interface FileUploadState {
  previousFile: File | null;
  currentFile: File | null;
  isAnalyzing: boolean;
  error: string | null;
} 
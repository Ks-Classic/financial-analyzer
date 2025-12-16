# 財務コメント自動生成機能 - 技術設計書

## 1. システムアーキテクチャ

### 1.1 全体構成

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ユーザー（ブラウザ）                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Vercel (Frontend)                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Vite + React + TypeScript                    │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ App.tsx      │  │ Comment      │  │ Spreadsheet  │               │   │
│  │  │ (メイン)     │  │ Generator    │  │ Viewer       │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ xlsx.js      │  │ API Client   │  │ Clipboard    │               │   │
│  │  │ (Excel解析)  │  │              │  │ Utils        │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ API Call (HTTPS)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GCP (Backend)                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Cloud Run (API Service)                      │   │
│  │                         Node.js + Express                            │   │
│  │                                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ /api/        │  │ Comment      │  │ Prompt       │               │   │
│  │  │ generate-    │  │ Service      │  │ Builder      │               │   │
│  │  │ comment      │  │              │  │              │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           Firestore                                  │   │
│  │                                                                      │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │   │
│  │  │ customers  │  │ templates  │  │ comments   │                     │   │
│  │  │            │  │            │  │ (履歴)     │                     │   │
│  │  └────────────┘  └────────────┘  └────────────┘                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Google AI (Gemini API)                            │
│                           gemini-2.0-flash                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Phase 1 アーキテクチャ（シンプル版）

Phase 1ではFirestoreを使用せず、フロントエンド主体で実装：

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ブラウザ (Frontend)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Excelアップロード                                                │   │
│  │         ↓                                                            │   │
│  │  2. xlsx.js でクライアントサイド解析                                 │   │
│  │         ↓                                                            │   │
│  │  3. 範囲選択 → データ抽出                                           │   │
│  │         ↓                                                            │   │
│  │  4. API呼び出し (tableData送信)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Backend (Cloud Run)                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  5. リクエスト受信                                                   │   │
│  │         ↓                                                            │   │
│  │  6. プロンプト構築                                                   │   │
│  │         ↓                                                            │   │
│  │  7. Gemini API 呼び出し                                              │   │
│  │         ↓                                                            │   │
│  │  8. レスポンス整形 → 返却                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. フロントエンド設計

### 2.1 ディレクトリ構成

```
src/
├── App.tsx                          # メインアプリ（タブ切り替え）
├── main.tsx                         # エントリポイント
├── index.css                        # グローバルスタイル
├── types.ts                         # 共通型定義
│
├── components/
│   ├── ResultsDisplay.tsx           # 既存: レポートチェック結果
│   ├── MonthlyComparisonTab.tsx     # 既存: 月次比較
│   │
│   ├── comment-generator/           # 新規: コメント生成機能
│   │   ├── CommentGeneratorTab.tsx  # タブのメインコンポーネント
│   │   ├── FileUploader.tsx         # Excelアップロード
│   │   ├── SheetSelector.tsx        # シート選択UI
│   │   ├── SpreadsheetViewer.tsx    # スプレッドシート表示
│   │   ├── RangeSelector.tsx        # 範囲選択UI
│   │   ├── MonthDetector.tsx        # 月列検出・確認UI
│   │   ├── CommentSettings.tsx      # コメント設定UI
│   │   ├── CommentEditor.tsx        # コメント表示・編集
│   │   └── CopyButton.tsx           # コピーボタン
│   │
│   └── shared/                      # 共有コンポーネント
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── Toast.tsx
│       └── LoadingSpinner.tsx
│
├── hooks/
│   ├── useExcelParser.ts            # Excelパースロジック
│   ├── useRangeSelection.ts         # 範囲選択ロジック
│   ├── useMonthDetection.ts         # 月列検出ロジック
│   ├── useCommentGeneration.ts      # コメント生成API呼び出し
│   └── useClipboard.ts              # クリップボード操作
│
├── services/
│   └── api.ts                       # API呼び出し関数
│
└── utils/
    ├── environment.ts               # 既存: 環境設定
    ├── excelUtils.ts                # Excel関連ユーティリティ
    └── monthPatterns.ts             # 月パターン認識
```

### 2.2 コンポーネント階層

```
App.tsx
├── Header
├── TabNavigation
│   ├── [レポートチェック]
│   ├── [コメント生成]          ← 新規追加
│   └── [顧客管理] (Phase 2)
│
└── TabContent
    └── CommentGeneratorTab     ← 新規
        ├── FileUploader
        │   └── DragDropZone
        │
        ├── SheetSelector
        │   └── SheetListItem[]
        │
        ├── SpreadsheetViewer
        │   ├── ColumnHeaders
        │   ├── RowNumbers
        │   └── CellGrid
        │       └── Cell[]
        │
        ├── RangeSelector (SpreadsheetViewer上のオーバーレイ)
        │   └── SelectionOverlay
        │
        ├── MonthDetector
        │   ├── DetectionResult
        │   └── ManualSettings
        │
        ├── CommentSettings
        │   ├── ModeSelector (お任せ/項目指定)
        │   └── ItemCheckboxes
        │
        ├── GenerateButton
        │
        └── CommentEditor
            ├── CommentDisplay
            ├── EditTextArea
            └── ActionButtons (コピー, 再生成)
```

### 2.3 状態管理

```typescript
// CommentGeneratorTab の状態

interface CommentGeneratorState {
  // ファイル関連
  file: File | null;
  workbook: XLSX.WorkBook | null;
  isLoading: boolean;
  error: string | null;

  // シート関連
  sheetNames: string[];
  selectedSheet: string | null;
  sheetData: CellData[][] | null;

  // 範囲選択関連
  isSelectingRange: boolean;
  selectedRange: Range | null;
  selectedData: CellData[][] | null;

  // 月検出関連
  detectedMonths: MonthInfo[];
  latestMonth: string | null;
  previousMonth: string | null;

  // コメント設定
  commentMode: 'auto' | 'specified';
  targetItems: string[];
  availableItems: string[];  // 選択範囲から抽出した項目

  // 生成関連
  isGenerating: boolean;
  generatedComment: string | null;
  isEditing: boolean;
}

interface Range {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface MonthInfo {
  value: string;       // '2506'
  column: number;      // 列インデックス
  format: string;      // 'YYMM'
}

interface CellData {
  value: string | number | null;
  type: 'text' | 'number' | 'empty';
  row: number;
  col: number;
}
```

### 2.4 主要フック実装概要

#### useExcelParser

```typescript
// hooks/useExcelParser.ts

import * as XLSX from 'xlsx';

export function useExcelParser() {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      setWorkbook(wb);
    } catch (e) {
      setError('ファイルの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getSheetData = useCallback((sheetName: string): CellData[][] => {
    if (!workbook) return [];
    
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
    const data: CellData[][] = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      const rowData: CellData[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[cellAddress];
        rowData.push({
          value: cell?.v ?? null,
          type: cell?.t === 'n' ? 'number' : cell?.v ? 'text' : 'empty',
          row,
          col,
        });
      }
      data.push(rowData);
    }
    return data;
  }, [workbook]);

  return { workbook, isLoading, error, parseFile, getSheetData };
}
```

#### useMonthDetection

```typescript
// hooks/useMonthDetection.ts

const MONTH_PATTERNS = [
  { name: 'YYMM', regex: /^(\d{4})$/, parse: (m: string) => m },
  { name: 'YYYY/MM', regex: /^(\d{4})\/(\d{2})$/, parse: (m: string) => m.replace('/', '').slice(2) },
  { name: 'YYYY-MM', regex: /^(\d{4})-(\d{2})$/, parse: (m: string) => m.replace('-', '').slice(2) },
  { name: 'N月', regex: /^(\d{1,2})月$/, parse: (m: string) => m.replace('月', '').padStart(2, '0') },
];

export function useMonthDetection() {
  const detectMonths = useCallback((headerRow: CellData[]): MonthDetectionResult => {
    const months: MonthInfo[] = [];
    
    headerRow.forEach((cell, colIndex) => {
      const value = String(cell.value);
      for (const pattern of MONTH_PATTERNS) {
        if (pattern.regex.test(value)) {
          months.push({
            value: pattern.parse(value),
            column: colIndex,
            format: pattern.name,
          });
          break;
        }
      }
    });

    // 日付順にソート
    months.sort((a, b) => a.value.localeCompare(b.value));

    return {
      detectedMonths: months,
      latestMonth: months[months.length - 1]?.value || null,
      previousMonth: months[months.length - 2]?.value || null,
      pattern: months[0]?.format || null,
    };
  }, []);

  return { detectMonths };
}
```

---

## 3. バックエンド設計

### 3.1 ディレクトリ構成

```
backend/
├── src/
│   ├── index.ts                     # エントリポイント
│   ├── app.ts                       # Express アプリ設定
│   │
│   ├── routes/
│   │   ├── analyze.ts               # 既存: PDF分析
│   │   └── comment.ts               # 新規: コメント生成
│   │
│   ├── services/
│   │   ├── pdfService.ts            # 既存: PDF解析
│   │   ├── aiService.ts             # 既存: AI分析（拡張）
│   │   └── commentService.ts        # 新規: コメント生成ロジック
│   │
│   ├── prompts/
│   │   ├── reportAnalysis.ts        # 既存: レポート分析プロンプト
│   │   └── commentGeneration.ts     # 新規: コメント生成プロンプト
│   │
│   └── utils/
│       ├── validators.ts            # 入力バリデーション
│       └── formatters.ts            # 出力整形
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

### 3.2 API エンドポイント

#### POST /api/generate-comment

```typescript
// routes/comment.ts

import express from 'express';
import { generateComment } from '../services/commentService';

const router = express.Router();

router.post('/generate-comment', async (req, res) => {
  try {
    const {
      tableData,
      targetMonth,
      compareMonth,
      pageType,
      targetItems,
      commentStyle,
    } = req.body;

    // バリデーション
    if (!tableData || !targetMonth || !compareMonth) {
      return res.status(400).json({
        error: '必須パラメータが不足しています',
      });
    }

    // コメント生成
    const result = await generateComment({
      tableData,
      targetMonth,
      compareMonth,
      pageType,
      targetItems,
      commentStyle,
    });

    res.json(result);
  } catch (error) {
    console.error('Comment generation error:', error);
    res.status(500).json({
      error: 'コメント生成に失敗しました',
    });
  }
});

export default router;
```

### 3.3 コメント生成サービス

```typescript
// services/commentService.ts

import { GoogleGenerativeAI } from '@google/generative-ai';
import { buildCommentPrompt } from '../prompts/commentGeneration';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

interface CommentRequest {
  tableData: TableData;
  targetMonth: string;
  compareMonth: string;
  pageType?: string;
  targetItems?: string[];
  commentStyle?: CommentStyle;
}

interface TableData {
  headers: string[];
  rows: {
    item: string;
    values: (number | string | null)[];
  }[];
}

interface CommentStyle {
  maxLength?: number;
  format?: 'bullet' | 'paragraph';
}

interface CommentResult {
  comment: string;
  highlights: Highlight[];
  suggestedItems: string[];
}

interface Highlight {
  item: string;
  currentValue: number;
  previousValue: number;
  changeAmount: number;
  changeRate: number;
  description: string;
}

export async function generateComment(request: CommentRequest): Promise<CommentResult> {
  // 1. 変動分析
  const analysis = analyzeChanges(request.tableData, request.targetMonth, request.compareMonth);

  // 2. プロンプト構築
  const prompt = buildCommentPrompt({
    tableData: request.tableData,
    analysis,
    targetItems: request.targetItems,
    commentStyle: request.commentStyle,
  });

  // 3. Gemini API 呼び出し
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // 4. レスポンス解析
  const parsed = parseAIResponse(response);

  return {
    comment: parsed.comment,
    highlights: analysis.highlights,
    suggestedItems: analysis.topChangedItems,
  };
}

function analyzeChanges(tableData: TableData, targetMonth: string, compareMonth: string) {
  const targetIdx = tableData.headers.findIndex(h => h.includes(targetMonth));
  const compareIdx = tableData.headers.findIndex(h => h.includes(compareMonth));

  const highlights: Highlight[] = [];

  tableData.rows.forEach(row => {
    const currentValue = Number(row.values[targetIdx]) || 0;
    const previousValue = Number(row.values[compareIdx]) || 0;
    const changeAmount = currentValue - previousValue;
    const changeRate = previousValue !== 0 
      ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100 
      : currentValue !== 0 ? Infinity : 0;

    highlights.push({
      item: row.item,
      currentValue,
      previousValue,
      changeAmount,
      changeRate,
      description: '', // AI が生成
    });
  });

  // 変動率の絶対値でソートし、上位項目を抽出
  const topChangedItems = [...highlights]
    .sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate))
    .slice(0, 5)
    .map(h => h.item);

  return { highlights, topChangedItems };
}
```

---

## 4. データフロー詳細

### 4.1 コメント生成フロー

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. ユーザーが「コメント生成」クリック                                      │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 2. フロントエンドで選択範囲データを抽出                                    │
│                                                                            │
│    selectedData: CellData[][] → TableData 形式に変換                       │
│                                                                            │
│    {                                                                       │
│      headers: ['項目', '2501', '2502', ..., '2506'],                       │
│      rows: [                                                               │
│        { item: '売上高', values: [19990, 17983, ..., 21080] },             │
│        { item: 'ラボ', values: [11526, 17256, ..., 20634] },               │
│        ...                                                                 │
│      ]                                                                     │
│    }                                                                       │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 3. API リクエスト送信                                                      │
│                                                                            │
│    POST /api/generate-comment                                              │
│    {                                                                       │
│      tableData: { ... },                                                   │
│      targetMonth: '2506',                                                  │
│      compareMonth: '2505',                                                 │
│      targetItems: ['売上高', '売上原価'],  // 項目指定モードの場合         │
│      commentStyle: {                                                       │
│        maxLength: 500,                                                     │
│        format: 'bullet'                                                    │
│      }                                                                     │
│    }                                                                       │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 4. バックエンドで変動分析                                                  │
│                                                                            │
│    - 各項目の前月比を計算                                                  │
│    - 変動率でランキング                                                    │
│    - 推奨分析項目を抽出                                                    │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 5. プロンプト構築 & Gemini API 呼び出し                                    │
│                                                                            │
│    - 表データをプロンプトに埋め込み                                        │
│    - 分析観点を指示                                                        │
│    - 出力フォーマットを指定                                                │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 6. レスポンス返却                                                          │
│                                                                            │
│    {                                                                       │
│      comment: "・売上高\n  2506月の売上高は21,080千円...",                 │
│      highlights: [                                                         │
│        { item: '入会金収入', changeRate: Infinity, ... },                  │
│        { item: 'ラボ', changeRate: 15.9, ... }                             │
│      ],                                                                    │
│      suggestedItems: ['入会金収入', 'ラボ', '年会費収入']                  │
│    }                                                                       │
└────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 7. フロントエンドでコメント表示                                            │
│                                                                            │
│    - コメントをエディタに表示                                              │
│    - 推奨項目をサジェストとして表示                                        │
│    - コピーボタンを有効化                                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. エラーハンドリング

### 5.1 フロントエンド

```typescript
// hooks/useCommentGeneration.ts

export function useCommentGeneration() {
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    comment: null,
    error: null,
  });

  const generate = async (request: CommentRequest) => {
    setState({ isGenerating: true, comment: null, error: null });

    try {
      const response = await fetch('/api/generate-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'コメント生成に失敗しました');
      }

      const result = await response.json();
      setState({ isGenerating: false, comment: result.comment, error: null });
      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : '不明なエラーが発生しました';
      setState({ isGenerating: false, comment: null, error: message });
      throw error;
    }
  };

  return { ...state, generate };
}
```

### 5.2 バックエンド

```typescript
// middleware/errorHandler.ts

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  console.error('Error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: err.message,
      code: 'VALIDATION_ERROR',
    });
  }

  if (err.message.includes('API key')) {
    return res.status(500).json({
      error: 'AI サービスの設定エラーです',
      code: 'AI_CONFIG_ERROR',
    });
  }

  if (err.message.includes('RESOURCE_EXHAUSTED')) {
    return res.status(429).json({
      error: 'リクエスト制限に達しました。しばらく待ってから再試行してください',
      code: 'RATE_LIMIT',
    });
  }

  res.status(500).json({
    error: 'サーバーエラーが発生しました',
    code: 'INTERNAL_ERROR',
  });
}
```

---

## 6. テスト戦略

### 6.1 ユニットテスト

| 対象 | テスト内容 |
|------|-----------|
| useExcelParser | Excelファイルのパース、シートデータ抽出 |
| useMonthDetection | 各月パターンの認識、最新月/前月特定 |
| analyzeChanges | 変動計算、ランキング |
| buildCommentPrompt | プロンプト構築 |

### 6.2 統合テスト

| 対象 | テスト内容 |
|------|-----------|
| /api/generate-comment | 正常系リクエスト、エラーレスポンス |
| コメント生成フロー | アップロード→選択→生成→コピー |

### 6.3 E2Eテスト

| シナリオ | 内容 |
|----------|------|
| 基本フロー | Excelアップロード→シート選択→範囲選択→コメント生成→コピー |
| エラーケース | 無効なファイル、API エラー時のリトライ |

---

## 7. デプロイ構成

### 7.1 環境変数

```bash
# フロントエンド (Vercel)
VITE_API_URL=https://api.example.com

# バックエンド (Cloud Run)
GEMINI_API_KEY=xxx
NODE_ENV=production
```

### 7.2 デプロイフロー

```
main ブランチへの push
         │
         ▼
    GitHub Actions
         │
    ┌────┴────┐
    ▼         ▼
 Vercel    Cloud Build
(Frontend)  (Backend)
    │         │
    ▼         ▼
 Deploy    Cloud Run
           Deploy
```

---

*作成日: 2025-12-16*
*バージョン: 1.0*

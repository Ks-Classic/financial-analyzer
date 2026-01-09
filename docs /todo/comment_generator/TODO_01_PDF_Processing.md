# TODO_01: PDFコメント抽出（既存拡張）

## 🎯 目的
V3の既存PDF処理機能を拡張し、前月レポートからコメントテキストを抽出する

---

## ✅ 既存実装（活用可能）

### CommentGeneratorTabV3.tsx より

```typescript
// 既に実装済み
import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// PDFPage型定義
interface PDFPage {
  pageNumber: number;
  title: string;
  thumbnail?: string;
  isSelected: boolean;
}

// サムネイル生成ロジック（onload内）
const page = await pdf.getPage(i);
const viewport = page.getViewport({ scale: 1.5 });
const canvas = document.createElement('canvas');
// ... レンダリング処理
```

**活用ポイント**:
- `pdfjs-dist` の設定済み
- `PDFPage` 型定義
- サムネイル生成ロジック

---

## 📋 新規実装タスク

### ✅ 1. PDFPage型の拡張

- [ ] **1.1. 型定義の拡張**
  ```typescript
  interface PDFPage {
    pageNumber: number;
    title: string;
    thumbnail?: string;
    isSelected: boolean;
    // 👇 新規追加
    extractedComment?: string;    // 抽出されたコメント
    commentConfidence?: number;   // 抽出の信頼度
  }
  ```

### ✅ 2. テキスト抽出機能

- [ ] **2.1. ページ全体のテキスト抽出**
  - [ ] `page.getTextContent()` を使用
  - [ ] テキストアイテムの位置情報を取得
  - [ ] 日本語テキストの正しいエンコーディング確認

- [ ] **2.2. 抽出関数の実装**
  ```typescript
  async function extractPageText(page: PDFPageProxy): Promise<TextItem[]> {
    const textContent = await page.getTextContent();
    return textContent.items.map(item => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    }));
  }
  ```

### ✅ 3. コメント領域の特定

- [ ] **3.1. コメント領域推定ロジック**
  - [ ] ページ下部のテキストをコメント候補として抽出
  - [ ] 表形式（数値が多い領域）を除外
  - [ ] 文章形式のテキストブロックを検出

- [ ] **3.2. 推定ロジック実装**
  ```typescript
  function identifyCommentRegion(textItems: TextItem[], pageHeight: number): string {
    // ページ下部1/3をコメント領域と推定
    const commentThreshold = pageHeight * 0.67;
    
    const commentItems = textItems
      .filter(item => item.y < commentThreshold) // 下部は y が小さい
      .filter(item => !isNumericValue(item.text)) // 数値のみの行を除外
      .sort((a, b) => b.y - a.y); // 上から順に
    
    return commentItems.map(item => item.text).join('');
  }
  ```

- [ ] **3.3. ヒューリスティック改善**
  - [ ] 「・」「-」で始まる行はコメントの可能性高
  - [ ] 連続するテキストブロックをグルーピング
  - [ ] 表のセル（短いテキスト＋数値）を除外

### ✅ 4. V3への統合

- [ ] **4.1. 既存のonload関数を拡張**
  - [ ] サムネイル生成後にテキスト抽出を追加
  - [ ] 抽出結果をPDFPage配列に格納

- [ ] **4.2. 共通関数の抽出**
  - [ ] `src/lib/pdf-utils.ts` を作成
  - [ ] テキスト抽出・コメント推定を独立関数化

### ✅ 5. UI表示

- [ ] **5.1. 抽出コメントの確認UI**
  - [ ] ページ選択画面でコメントプレビュー表示
  - [ ] 「コメント抽出失敗」の場合は警告表示

---

## 🔧 技術仕様

### 新規ファイル

```
src/
├── lib/
│   └── pdf-utils.ts          # PDF処理共通関数
└── hooks/
    └── usePDFTextExtractor.ts # テキスト抽出Hook
```

### pdf-utils.ts

```typescript
// src/lib/pdf-utils.ts

import * as pdfjsLib from 'pdfjs-dist';

export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

export interface ExtractedPageData {
  pageNumber: number;
  title: string;
  comment: string;
  thumbnail: string;
}

/**
 * PDFページからテキストを抽出
 */
export async function extractTextFromPage(
  page: pdfjsLib.PDFPageProxy
): Promise<TextItem[]> {
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1.0 });
  
  return textContent.items
    .filter((item): item is pdfjsLib.TextItem => 'str' in item)
    .map(item => ({
      text: item.str,
      x: item.transform[4],
      y: viewport.height - item.transform[5], // Y座標を反転
      width: item.width,
      height: item.height,
    }));
}

/**
 * タイトルを推定（ページ上部の大きいテキスト）
 */
export function extractTitle(textItems: TextItem[]): string {
  const topItems = textItems
    .filter(item => item.y < 100) // 上部100px以内
    .sort((a, b) => a.y - b.y);
  
  if (topItems.length > 0) {
    return topItems[0].text.trim();
  }
  return '';
}

/**
 * コメントを推定（ページ下部のテキストブロック）
 */
export function extractComment(
  textItems: TextItem[],
  pageHeight: number
): string {
  const commentThreshold = pageHeight * 0.6; // 下部40%をコメント領域と推定
  
  const commentItems = textItems
    .filter(item => item.y > commentThreshold)
    .filter(item => item.text.length > 5) // 短すぎるテキストを除外
    .filter(item => !/^[\d,\.%]+$/.test(item.text)) // 数値のみを除外
    .sort((a, b) => a.y - b.y);
  
  // テキストを結合（改行を考慮）
  let comment = '';
  let lastY = 0;
  for (const item of commentItems) {
    if (lastY > 0 && item.y - lastY > 20) {
      comment += '\n';
    }
    comment += item.text;
    lastY = item.y;
  }
  
  return comment.trim();
}
```

---

## ⚠️ 注意事項

1. **PDF構造の多様性**: レポートによってレイアウトが異なる。汎用的なロジックが必要
2. **日本語フォント**: 一部のPDFでは日本語が正しく抽出できない場合あり
3. **性能**: 20ページ分のテキスト抽出は時間がかかる可能性あり（非同期処理）

---

## 📊 進捗

| タスク | ステータス | 既存活用 | 新規実装 |
|--------|------------|----------|----------|
| 1.1 型定義の拡張 | 未着手 | PDFPage型 | 新フィールド追加 |
| 2.1 テキスト抽出 | 未着手 | pdfjs-dist | getTextContent() |
| 2.2 抽出関数 | 未着手 | - | 新規 |
| 3.1 コメント領域推定 | 未着手 | - | 新規 |
| 3.2 ロジック実装 | 未着手 | - | 新規 |
| 3.3 ヒューリスティック | 未着手 | - | 新規 |
| 4.1 V3統合 | 未着手 | onload関数 | 拡張 |
| 4.2 共通関数抽出 | 未着手 | - | 新規 |
| 5.1 確認UI | 未着手 | ページ選択UI | 拡張 |

---

*作成日: 2026-01-03*

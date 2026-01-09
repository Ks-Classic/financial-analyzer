# TODO_03: プロンプトエンジン（新規実装）

## 🎯 目的
ページタイトル・前月コメントを分析し、最適なプロンプトを自動生成するエンジンを実装

---

## ✅ 既存実装（参考）

### V3のコメント生成ロジック

```typescript
// CommentGeneratorTabV3.tsx より
// サンプルコメント生成（ローカル、AI未連携）

const generateSampleComment = (pageTitle: string, rangeData?: string[][]): string => {
  // ... ハードコードされたサンプルコメント生成
  const comments: string[] = [];
  
  if (/売上|PL|損益/.test(pageTitle)) {
    comments.push('売上高は前月比で5%増加しました。');
  }
  // ...
  
  return comments.join('\n');
};
```

**課題**:
- AIに連携していない（ローカル生成）
- 前月コメントを参照していない
- プロンプトのカスタマイズ不可

---

## 📋 新規実装タスク

### ✅ 1. システムプロンプト管理

- [ ] **1.1. デフォルトプロンプト定義**
  ```typescript
  // src/lib/prompts.ts
  
  export const DEFAULT_SYSTEM_PROMPT = `
  あなたは財務分析の専門家です。
  
  【基本ルール】
  - 前月レポートのコメントのトーン・表現スタイルを踏襲
  - 当月の特徴的な変動やトピックがあれば言及
  - 他のページのデータも参照して要因分析
  - コメントは前月レポートと同程度の文字数
  - 数ヶ月の推移を見て傾向が変化した場合も考察
  
  【出力形式】
  - 文章形式で出力
  - 必要に応じて箇条書きも使用可
  `;
  ```

- [ ] **1.2. プロンプト設定の永続化**
  - [ ] localStorage への保存
  - [ ] ロード時の読み込み

### ✅ 2. 前月コメント分析

- [ ] **2.1. 文体分析**
  ```typescript
  interface CommentStyle {
    format: 'bullet' | 'paragraph' | 'mixed';
    averageCharCount: number;
    hasNumbers: boolean;
    mentionedItems: string[];
  }
  
  function analyzeCommentStyle(comment: string): CommentStyle {
    const isBullet = /^[・\-●]/.test(comment);
    const isParagraph = comment.split('\n').length <= 3;
    
    return {
      format: isBullet ? 'bullet' : isParagraph ? 'paragraph' : 'mixed',
      averageCharCount: comment.length,
      hasNumbers: /\d+/.test(comment),
      mentionedItems: extractMentionedItems(comment),
    };
  }
  ```

- [ ] **2.2. 言及項目の抽出**
  ```typescript
  function extractMentionedItems(comment: string): string[] {
    const items: string[] = [];
    
    if (/売上/.test(comment)) items.push('売上');
    if (/利益/.test(comment)) items.push('利益');
    if (/原価/.test(comment)) items.push('原価');
    if (/経費|費用/.test(comment)) items.push('経費');
    // ...
    
    return items;
  }
  ```

### ✅ 3. 個別プロンプト自動生成

- [ ] **3.1. 生成ロジック**
  ```typescript
  // src/lib/prompt-generator.ts
  
  interface GeneratePromptInput {
    pageTitle: string;
    previousComment: string;
    commentStyle: CommentStyle;
  }
  
  function generatePagePrompt(input: GeneratePromptInput): string {
    const { pageTitle, previousComment, commentStyle } = input;
    
    const formatDesc = commentStyle.format === 'bullet' 
      ? '箇条書き形式' 
      : '文章形式';
    
    const analysisInstruction = getAnalysisInstruction(pageTitle);
    
    return `
  【${pageTitle}】
  - ${analysisInstruction}
  - 前月コメントのスタイル: ${formatDesc}、約${commentStyle.averageCharCount}文字
  - 前月コメント:
    「${previousComment}」
  `;
  }
  ```

- [ ] **3.2. ページ種別別指示**
  ```typescript
  function getAnalysisInstruction(title: string): string {
    if (/損益|PL|P\/L/.test(title)) {
      return '売上高の変動については、売上個数・単価・カテゴリ別のページデータを参照して具体的な要因を記載';
    }
    if (/貸借|BS|B\/S/.test(title)) {
      return '現預金、売掛金、在庫の変動理由を中心に記載';
    }
    if (/推移/.test(title)) {
      return 'トレンド変化、季節要因、異常値を中心に記載';
    }
    if (/カテゴリ|商品|製品/.test(title)) {
      return 'カテゴリ間の比較、構成比変化を中心に記載';
    }
    return '主要な変動項目とその要因を分析して記載';
  }
  ```

### ✅ 4. プロンプト編集UI

- [ ] **4.1. システムプロンプトエリア**
  - [ ] 折りたたみ可能なテキストエリア
  - [ ] 「デフォルトに戻す」ボタン
  - [ ] 文字数カウント表示

- [ ] **4.2. 個別プロンプト一覧**
  - [ ] ページごとにコンパクト表示
  - [ ] 「編集」ボタンで展開
  - [ ] 自動生成プロンプトのハイライト

- [ ] **4.3. コンポーネント実装**
  ```typescript
  // src/components/comment-generator/MultiPageAnalysis/PromptEditor.tsx
  
  interface PromptEditorProps {
    systemPrompt: string;
    onSystemPromptChange: (prompt: string) => void;
    pagePrompts: Map<number, string>;
    onPagePromptChange: (pageNumber: number, prompt: string) => void;
    pages: PDFPage[];
  }
  ```

### ✅ 5. テンプレート保存/読込

- [ ] **5.1. 保存機能**
  - [ ] テンプレート名の入力
  - [ ] システムプロンプト + 個別プロンプトをセット保存
  - [ ] localStorage に保存

- [ ] **5.2. 読み込み機能**
  - [ ] 保存済みテンプレート一覧表示
  - [ ] テンプレート選択 → 適用
  - [ ] 削除機能

---

## 🔧 技術仕様

### ファイル構成

```
src/
├── lib/
│   ├── prompts.ts          # デフォルトプロンプト定義
│   ├── prompt-generator.ts # プロンプト生成ロジック
│   └── comment-analyzer.ts # コメント分析
├── hooks/
│   └── usePromptTemplates.ts # テンプレート管理
└── components/comment-generator/MultiPageAnalysis/
    └── PromptEditor.tsx    # プロンプト編集UI
```

---

## 🎨 UI仕様

### プロンプト設定画面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ステップ 4/5: プロンプト設定                 [テンプレ保存] [テンプレ読込]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ▼ システムプロンプト（全ページ共通）               [デフォルトに戻す]      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ あなたは財務分析の専門家です。                                      │   │
│  │ ...                                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  文字数: 245                                                               │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  個別プロンプト（自動生成済み - 編集可能）                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ P1: 損益計算書                              [▼ 編集] [デフォルト]   │   │
│  │ 売上高の変動については...（自動生成）                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ P2: 貸借対照表                              [▼ 編集] [デフォルト]   │   │
│  │ 現預金、売掛金、在庫の変動理由...（自動生成）                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                          [← 戻る] [コメント生成へ →]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 進捗

| タスク | ステータス | 備考 |
|--------|------------|------|
| 1.1 デフォルトプロンプト | 未着手 | |
| 1.2 永続化 | 未着手 | |
| 2.1 文体分析 | 未着手 | |
| 2.2 言及項目抽出 | 未着手 | |
| 3.1 生成ロジック | 未着手 | |
| 3.2 ページ種別別指示 | 未着手 | |
| 4.1 システムプロンプトUI | 未着手 | |
| 4.2 個別プロンプト一覧 | 未着手 | |
| 4.3 コンポーネント実装 | 未着手 | |
| 5.1 保存機能 | 未着手 | |
| 5.2 読み込み機能 | 未着手 | |

---

*作成日: 2026-01-03*

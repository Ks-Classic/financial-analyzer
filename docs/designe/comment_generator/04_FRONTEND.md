# 04. フロントエンド実装

## コンポーネント階層

```
src/components/comment-generator/
├── CommentGeneratorTabV4.tsx    # エントリーポイント（タブ切替）
└── MultiPageAnalysis/
    ├── index.tsx                # メインウィザード（6ステップ）
    └── components/
        ├── CommentCard.tsx          # レビュー用カード
        ├── CommentRefiner.tsx       # 修正UI
        ├── SequentialPageCapture.tsx # 逐次入力モード
        ├── ClientSettings.tsx       # 顧客設定
        ├── RegionSelector.tsx       # コメント範囲選択
        ├── PromptEditor.tsx         # プロンプト編集
        ├── ImagePasteArea.tsx       # 画像ペースト領域
        ├── ProgressIndicator.tsx    # 進捗表示
        └── WizardNavigation.tsx     # ナビゲーション
```

---

## ウィザードステップ

### Step 1: PDFアップロード (`pdf-upload`)

**処理**:
1. PDFファイル受け取り
2. pdf.jsで解析
3. ページサムネイル・テキスト抽出
4. 前月コメント抽出（指定領域）

```typescript
const handlePdfUpload = async (file: File) => {
    const pdfDocument = await loadPdfDocument(file);
    const extractedPages = await extractPages(pdfDocument);
    setPages(extractedPages);
    setSelectedPages(extractedPages.map(p => p.pageNumber));
};
```

### Step 2: ページ選択 (`page-select`)

**UI**:
- サムネイル一覧
- チェックボックスで選択
- 全選択/全解除ボタン

### Step 3: 画像入力 (`image-input`)

**2モード対応**:

| モード | 説明 |
|--------|------|
| 一括 | 全ページ貼り付け後に一括生成 |
| 逐次 | ページごとに貼り付け→生成→次へ |

```typescript
// 画像ペースト処理
const handleImagePaste = (pageNumber: number, imageData: string) => {
    setPageImages(prev => {
        const next = new Map(prev);
        next.set(pageNumber, { 
            imageData, 
            isPasted: true, 
            isSkipped: false 
        });
        return next;
    });
};
```

### Step 4: プロンプト設定 (`prompt-setup`)

**設定項目**:
- システムプロンプト（共通）
- ページ固有プロンプト（オプション）

### Step 5: 一括生成 (`generate`)

```typescript
const handleGenerateAll = async () => {
    const pageData = selectedPages.map(pageNum => ({
        pageNumber: pageNum,
        pageTitle: pages[pageNum].title,
        currentImage: pageImages.get(pageNum)?.imageData,
        previousComment: pages[pageNum].extractedComment,
    }));

    const { cacheId } = await generateAll(pageData, pageData, {
        systemPrompt,
        pagePrompts,
    });

    setBulkCacheId(cacheId);  // チャット修正用に保存
    setCurrentStep('review');
};
```

### Step 6: 確認・編集 (`review`)

**レイアウト**:
```
┌────────────────────────────────────────────────────────────────────┐
│ 📝 コメント確認・編集           [前月表示□] [📋全コピー] [🔄新規] │
├────────────────────────────────────────────────────────────────────┤
│ [1 貸借] [2 損益✎] [3 CF] [4 売上] ...    ← ページナビ          │
├────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐    │
│ │ CommentCard (各ページ)                                      │    │
│ └─────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────┘
```

---

## CommentCard コンポーネント

### Props

```typescript
interface CommentCardProps {
    pageNumber: number;
    pageTitle: string;
    previousComment?: string;
    generatedComment: GeneratedCommentResult;
    editedComment?: string;
    currentImage?: string;
    cacheId?: string;               // ⚡高速マーク表示
    onEdit: (pageNumber: number, comment: string) => void;
    onRegenerate: (pageNumber: number) => void;
    onCopy: (comment: string) => void;
    onImageClick?: (image: string) => void;
    onChatRefine?: (pageNumber: number, instruction: string) => Promise<string>;
    showPreviousComment?: boolean;
}
```

### レイアウト

```
┌─────────────────────────────────────────────────────────────────┐
│ [N] ページタイトル              [⚡高速] [前月▶] [📋] [🔄]     │
├───────────────┬─────────────────────────────────────────────────┤
│               │ 生成コメント（クリックで編集）                  │
│   画像        │ ─────────────────────────────────────────────   │
│  (w-96固定)   │ 💬 修正指示入力欄               [⚡修正]        │
└───────────────┴─────────────────────────────────────────────────┘
```

### チャット修正

```typescript
const handleChatRefine = async () => {
    setIsRefining(true);
    try {
        const refined = await onChatRefine(pageNumber, chatInput);
        onEdit(pageNumber, refined);
        setChatInput('');
    } finally {
        setIsRefining(false);
    }
};
```

---

## Hooks

### useCommentGeneration

```typescript
const {
    generateAll,      // 一括生成
    generate,         // 個別生成
    results,          // Map<number, GeneratedCommentResult>
    progress,         // BatchProgress
    isGenerating,     // boolean
    cancelGeneration, // () => void
} = useCommentGeneration();
```

**generateAll 内部処理**:
1. `/api/bulk-cache` → cacheId取得
2. 3ページ並列で `/api/generate-fast` 呼び出し
3. 結果をMapに格納

### useClientSettings

```typescript
const {
    clients,           // ClientSettings[]
    selectedClient,    // ClientSettings | null
    selectClient,      // (id: string | null) => void
    addClient,         // (name: string) => ClientSettings
    updateClient,      // (settings: ClientSettings) => void
    deleteClient,      // (id: string) => void
    updatePageRegion,  // (clientId, pageNum, region) => void
    getPageRegions,    // () => PageCommentRegion[]
} = useClientSettings();
```

**保存先**: localStorage
**キー**: `financial-analyzer-client-settings`

---

## 型定義

### 主要な型 (multi-page-analysis.ts)

```typescript
interface PageImageState {
    pageNumber: number;
    imageData: string | null;
    isPasted: boolean;
    isSkipped: boolean;
}

interface GeneratedCommentResult {
    pageNumber: number;
    comment: string;
    processingTime: number;
    status: 'pending' | 'generating' | 'completed' | 'error';
    error?: string;
}

interface BatchProgress {
    total: number;
    completed: number;
    currentPage: number;
    status: 'idle' | 'generating' | 'completed' | 'error';
}

interface ClientSettings {
    clientId: string;
    clientName: string;
    pageRegions: PageCommentRegion[];
    systemPrompt?: string;
    pagePromptTemplates?: Map<number, string>;
}

interface PageCommentRegion {
    pageNumber: number;
    region: { x, y, width, height };  // 0-1正規化
    isEnabled: boolean;
}
```

---

## スタイリング (Tailwind CSS)

### よく使うパターン

```css
/* グラデーションボタン */
bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg

/* カードヘッダー */
bg-gradient-to-r from-slate-50 to-white border-b border-gray-100

/* ページ番号バッジ */
w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white

/* ホバーエフェクト */
hover:shadow-md transition-shadow
```

---

## パフォーマンス最適化

1. **Context Caching**: 画像再送信不要
2. **並列処理**: 3ページ同時生成
3. **遅延レンダリング**: 大量カードはスクロール時にレンダリング検討
4. **メモ化**: `useMemo`, `useCallback` 活用

# 02. システムアーキテクチャ

## 全体構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                         フロントエンド (React + Vite)               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  MultiPageAnalysis (6ステップウィザード)                      │  │
│  │  ├── PDFアップロード                                          │  │
│  │  ├── ページ選択                                               │  │
│  │  ├── 画像入力                                                 │  │
│  │  ├── プロンプト設定                                           │  │
│  │  ├── 一括コメント生成                                         │  │
│  │  └── 確認・編集                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Hooks                                                        │  │
│  │  ├── useCommentGeneration (一括生成)                          │  │
│  │  ├── useClientSettings (顧客設定)                             │  │
│  │  └── useStreamingGeneration (ストリーミング)                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    バックエンド API (Vercel Serverless)             │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │ /api/comment/bulk-cache     全ページ一括キャッシュ              ││
│  │ /api/comment/generate-fast  キャッシュ使用高速生成              ││
│  │ /api/comment/generate-stream ストリーミング生成                 ││
│  │ /api/comment/refine         コメント修正                        ││
│  │ /api/comment/cache          個別キャッシュ管理                  ││
│  │ /api/comment/extract        PDFテキスト抽出                     ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Gemini AI (gemini-3-flash-preview)             │
│  ・Context Caching対応 (1時間有効)                                  │
│  ・マルチモーダル（画像+テキスト）                                   │
│  ・ストリーミングレスポンス                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 一括生成フロー

```
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: 一括キャッシュ作成                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    全ページ画像+メタデータ    ┌──────────────────┐   │
│  │ Frontend │ ─────────────────────────────→│ /api/bulk-cache  │   │
│  └──────────┘                               └──────────────────┘   │
│                                                      │               │
│                                                      ▼               │
│                                         ┌─────────────────────────┐ │
│                                         │ Gemini Context Caching  │ │
│                                         │ (12ページ分を一括保存)   │ │
│                                         └─────────────────────────┘ │
│                                                      │               │
│                                                      ▼               │
│                                                  cacheId             │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: 並列生成 (3ページ同時)                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Batch 1: [P1, P2, P3] ──→ /api/generate-fast(cacheId) ──→ 結果    │
│  Batch 2: [P4, P5, P6] ──→ /api/generate-fast(cacheId) ──→ 結果    │
│  Batch 3: [P7, P8, P9] ──→ /api/generate-fast(cacheId) ──→ 結果    │
│  Batch 4: [P10,P11,P12]──→ /api/generate-fast(cacheId) ──→ 結果    │
│                                                                      │
│  ※各バッチ間に500ms待機（レート制限対策）                           │
│  ※画像再送信不要（キャッシュ参照）                                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## データフロー

### 一括生成時

```typescript
// 1. フロントエンド: 全ページのデータを収集
const pageData = selectedPages.map(pageNum => ({
    pageNumber: pageNum,
    pageTitle: pages[pageNum].title,
    currentImage: pageImages.get(pageNum),      // 今月データ画像
    previousComment: pages[pageNum].extractedComment,  // 前月コメント
}));

// 2. useCommentGeneration.generateAll()
const { results, cacheId } = await generateAll(pageData, ...);
// 内部で:
//   - /api/bulk-cache を呼び出し → cacheId取得
//   - /api/generate-fast を並列呼び出し → 各ページのコメント取得

// 3. cacheIdを保存（後のチャット修正で再利用）
setBulkCacheId(cacheId);
```

### チャット修正時

```typescript
// キャッシュがあれば高速修正
if (bulkCacheId) {
    // 画像再送信不要、キャッシュ参照
    const response = await fetch('/api/comment/generate-fast', {
        body: JSON.stringify({
            cacheId: bulkCacheId,
            pageNumber,
            pagePrompt: `【修正指示】${instruction}`,
        })
    });
} else {
    // キャッシュなし → 画像再送信（遅い）
    const response = await fetch('/api/comment/refine', ...);
}
```

---

## 状態管理

### MultiPageAnalysis (index.tsx) の主要State

```typescript
// Step 1: PDFアップロード
const [pdfFile, setPdfFile] = useState<File | null>(null);
const [pages, setPages] = useState<ExtractedPage[]>([]);

// Step 2: ページ選択
const [selectedPages, setSelectedPages] = useState<number[]>([]);

// Step 3: 画像入力
const [pageImages, setPageImages] = useState<Map<number, PageImageState>>(new Map());

// Step 4: プロンプト
const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
const [pagePrompts, setPagePrompts] = useState<Map<number, string>>(new Map());

// Step 5-6: 生成結果
const [editedComments, setEditedComments] = useState<Map<number, string>>(new Map());
const [bulkCacheId, setBulkCacheId] = useState<string | null>(null);

// useCommentGeneration Hook
const { generateAll, results, progress, isGenerating } = useCommentGeneration();
```

---

## パフォーマンス最適化

### Context Caching

```
【従来】
P1: 画像送信(3MB) + 生成(5s) = 8s
P2: 画像送信(3MB) + 生成(5s) = 8s
...
P12: 画像送信(3MB) + 生成(5s) = 8s
合計: 96s + 順次処理待ち = 10分以上

【新方式】
キャッシュ作成: 全画像一括送信(36MB) = 5s
P1-3並列生成: キャッシュ参照 = 3s
P4-6並列生成: キャッシュ参照 = 3s
P7-9並列生成: キャッシュ参照 = 3s
P10-12並列生成: キャッシュ参照 = 3s
合計: 5s + 12s + 待機 = 約20s
```

### 並列度の選定

- **PARALLEL_COUNT = 3**: Gemini APIのレート制限を考慮
- バッチ間に500ms待機
- 過度な並列化は429エラーの原因

---

## セキュリティ

| 項目 | 現状 | 備考 |
|------|------|------|
| API認証 | なし | 将来Supabase Auth導入予定 |
| CORS | Vercel設定 | 同一オリジンのみ許可 |
| データ保存 | localStorage | ブラウザ固有、共有不可 |
| 画像データ | セッション内のみ | 永続化なし |
| Geminiキャッシュ | 1時間で期限切れ | サーバー側で自動削除 |

---

## 環境変数

```env
# 必須
GEMINI_API_KEY=your-gemini-api-key

# 将来用（未使用）
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

# 03. API仕様

## エンドポイント一覧

| エンドポイント | メソッド | 用途 | 速度 |
|---------------|---------|------|------|
| `/api/comment/bulk-cache` | POST | 全ページ一括キャッシュ | - |
| `/api/comment/generate-fast` | POST | キャッシュ使用生成 | ⚡高速 |
| `/api/comment/generate-stream` | POST | ストリーミング生成 | 普通 |
| `/api/comment/refine` | POST | コメント修正 | 普通 |
| `/api/comment/cache` | POST | 個別キャッシュ管理 | - |
| `/api/comment/extract` | POST | PDFテキスト抽出 | - |

---

## POST /api/comment/bulk-cache

### 概要
全ページの画像と前月コメントをGemini Context Caching APIでキャッシュ。

### リクエスト
```typescript
{
  pages: Array<{
    pageNumber: number;
    pageTitle: string;
    imageData: string;      // Base64 or Data URI
    previousComment?: string;
  }>;
  systemPrompt: string;
  ttlSeconds?: number;      // デフォルト 3600（1時間）
}
```

### レスポンス
```typescript
// 成功 (200)
{
  success: true,
  cacheId: "cachedContents/abc123...",
  pageCount: 12,
  expireTime: "2026-01-09T10:00:00.000Z"
}

// エラー (400/500)
{
  error: "エラーメッセージ",
  details?: "詳細"
}
```

---

## POST /api/comment/generate-fast

### 概要
キャッシュを使用した高速コメント生成。画像再送信不要。

### リクエスト
```typescript
{
  cacheId: string;          // bulk-cacheで取得したID
  pageNumber: number;
  pageTitle: string;
  pagePrompt?: string;      // ページ固有プロンプト
}
```

### レスポンス
```typescript
// 成功 (200)
{
  success: true,
  pageNumber: 1,
  pageTitle: "貸借対照表",
  generatedComment: "総資産は前月末比で...",
  processingTime: 1523,     // ミリ秒
  usedCache: true
}
```

---

## POST /api/comment/generate-stream

### 概要
Server-Sent Events (SSE) でストリーミング生成。個別ページ用。

### リクエスト
```typescript
{
  targetPage: {
    pageNumber: number;
    pageTitle: string;
    currentImage: string;      // 必須
    previousImage?: string;
    previousComment?: string;
    existingCacheId?: string;
  };
  contextPages?: Array<{
    pageNumber: number;
    pageTitle: string;
    currentImage: string;
  }>;
  systemPrompt: string;
  pagePrompt?: string;
  modelName?: string;          // デフォルト: gemini-3-flash-preview
}
```

### レスポンス (SSE)
```
data: {"event":"start","data":{}}
data: {"event":"chunk","data":"生成された"}
data: {"event":"chunk","data":"テキスト..."}
data: {"event":"done","data":{"imageCacheId":"cachedContents/xyz"}}
```

**イベント種類**:
| イベント | 説明 |
|---------|------|
| `start` | 生成開始 |
| `chunk` | テキストチャンク |
| `done` | 完了 (imageCacheId含む) |
| `error` | エラー発生 |

---

## POST /api/comment/refine

### 概要
既存コメントを修正。プリセットまたはカスタム指示。

### リクエスト
```typescript
{
  originalComment: string;
  refinementType: 'shorten' | 'detailed' | 'formal' | 'casual' | 'custom';
  customInstruction?: string;   // type='custom'時に必須
  pageTitle?: string;
  previousComment?: string;
  currentImage?: string;
  imageCacheId?: string;
}
```

### レスポンス
```typescript
// 成功 (200)
{
  success: true,
  refinedComment: "修正されたコメント...",
  processingTime: 2341
}
```

---

## POST /api/comment/cache

### 概要
個別画像のキャッシュ管理。

### リクエスト
```typescript
{
  action: 'create' | 'get' | 'delete';
  
  // create時
  images?: Array<{
    pageNumber: number;
    imageData: string;
  }>;
  systemPrompt?: string;
  ttlSeconds?: number;
  
  // get/delete時
  cacheId?: string;
}
```

---

## エラーコード

| HTTPステータス | 意味 |
|--------------|------|
| 200 | 成功 |
| 400 | パラメータ不正 |
| 405 | HTTPメソッド不正 |
| 429 | レート制限 |
| 500 | サーバーエラー |

---

## レート制限対策

フロントエンド側で実施:
- 並列リクエスト数: 3
- バッチ間待機: 500ms
- リトライ: 429時に指数バックオフ

---

## モデル設定

- **モデル名**: `gemini-3-flash-preview`
- **Context Caching**: 対応（1時間有効）
- **マルチモーダル**: 画像+テキスト
- **ストリーミング**: 対応

# 03. API仕様

## エンドポイント一覧

| エンドポイント | メソッド | 用途 | 速度 | 構造化出力 |
|---------------|---------|------|------|----------|
| `/api/comment/generate` | POST | **構造化出力対応コメント生成** | 普通 | ✅対応 |
| `/api/comment/bulk-cache` | POST | 全ページ一括キャッシュ | - | - |
| `/api/comment/generate-fast` | POST | キャッシュ使用生成 | ⚡高速 | - |
| `/api/comment/generate-stream` | POST | ストリーミング生成 | 普通 | ❌非対応 |
| `/api/comment/refine` | POST | コメント修正 | 普通 | - |
| `/api/comment/cache` | POST | 個別キャッシュ管理 | - | - |
| `/api/comment/extract` | POST | PDFテキスト抽出 | - | - |

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

## POST /api/comment/generate（構造化出力対応）

### 概要
構造化出力（responseSchema）による高品質コメント生成。JSON形式で応答を強制し、自動バリデーションを実行。

> **注意**: ストリーミングには非対応。リアルタイム表示が必要な場合は `generate-stream` を使用。

### リクエスト
```typescript
{
  targetPage: {
    pageNumber: number;
    pageTitle: string;
    currentImage: string;      // 必須: 今月データ画像 (Base64 or Data URI)
    previousImage?: string;    // 前月レポート画像
    previousComment?: string;  // 抽出済み前月コメント
  };
  contextPages?: Array<{
    pageNumber: number;
    pageTitle: string;
    currentImage: string;
  }>;                          // 最大3ページまで
  systemPrompt: string;
  pagePrompt?: string;
  modelName?: string;          // デフォルト: gemini-3.1-pro-preview
}
```

### レスポンス
```typescript
// 成功 (200)
{
  success: true,
  generatedComment: "売上高は前月比...",  // UI後方互換: プレーンテキスト
  processingTime: 3241,                    // ミリ秒
  modelUsed: "gemini-3.1-pro-preview",
  pageNumber: 1,
  metadata: {
    confidence: 0.92,                      // 確信度 0.0〜1.0
    dataSource: "image_and_previous",      // enum: image_only | image_and_context | image_and_previous
    speculativeFlag: false,                // 推測的内容の有無
    extractedNumbers: [                    // 言及した数値の一覧
      {
        label: "売上高 前月比",
        value: 1490,
        unit: "千円",
        change_pct: 7.6
      }
    ],
    variationFactors: [                    // 変動要因の一覧
      {
        factor: "商品Aの販売個数増加",
        contribution_pct: 65,
        source: "image_data"               // enum: image_data | previous_comment | context_page | unknown
      }
    ]
  },
  validation: {
    passed: true,                          // 全エラーチェック通過
    errors: [],                            // severity=error の問題
    warnings: [],                          // severity=warning の問題
    totalChecks: 7,
    passedChecks: 7
  }
}
```

### バリデーションチェック項目（7項目）

| # | チェック | severity | 内容 |
|---|---------|----------|------|
| 1 | 禁止表現 | error | 「著しく」「大幅に」「横ばい」等の抽象表現を検出 |
| 2 | 推量表現 | error | 「〜と考えられます」「〜の影響と思われます」等を検出 |
| 3 | 推測フラグ | error | AI自身が `speculative_flag: true` を返した場合 |
| 4 | ソース違反 | error | `variation_factors.source` が許可値以外の場合 |
| 5 | 80%カバー超過 | warning | 上位要因で80%達成後に2要因以上が余分に列挙 |
| 6 | 確信度低下 | warning | `confidence_score < 0.7` の場合 |
| 7 | マークダウン | error | `#` `**` `- ` `> ` 等のマークダウン記法を検出 |

### フォールバック動作
JSON解析に失敗した場合、生テキストを `generatedComment` に格納し、`validation.passed = false` で返却。

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
  modelName?: string;          // デフォルト: gemini-3.1-pro-preview
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

### コメント生成・修正系（高品質推論）
- **モデル名**: `gemini-3.1-pro-preview`
- **temperature**: `0.3`（財務分析は低温で再現性重視）
- **Context Caching**: 対応（1時間有効）
- **マルチモーダル**: 画像+テキスト
- **ストリーミング**: 対応（generate-stream のみ）
- **構造化出力**: 対応（generate のみ、`responseMimeType: 'application/json'` + `responseSchema`）

### 抽出・OCR系（高速処理）
- **モデル名**: `gemini-3.1-flash-lite-preview`
- **用途**: PDFテキスト抽出、画像からのデータ読み取り
- **特徴**: 速度優先、コスト効率重視

### 構造化出力 vs ストリーミング

| 方式 | エンドポイント | 利点 | 制約 |
|------|--------------|------|------|
| 構造化出力 | `/api/comment/generate` | 自動バリデーション、メタデータ取得 | ストリーミング不可 |
| ストリーミング | `/api/comment/generate-stream` | リアルタイム表示、UX向上 | バリデーション不可 |

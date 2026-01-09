# TODO_04: Gemini API連携（新規実装）

## 🎯 目的
全画像＋前月PDFを参照した上で、ページごとのコメントを生成するAPI連携を実装

---

## ✅ 既存実装（参考）

### プロジェクト内のGemini連携

プロジェクト内の他機能（レポート分析）でGemini APIを使用している可能性あり。

```typescript
// 確認が必要: 既存のGemini API呼び出しパターン
// apps/backend/src/api/analysis/analysis.service.ts など
```

### V3の現状

```typescript
// V3はAI連携なし（ローカルでサンプルコメント生成）
const generateSampleComment = (pageTitle: string, rangeData?: string[][]) => {
  // ハードコードされたサンプル生成
};
```

**課題**:
- AI API未連携
- マルチモーダル入力（画像）未対応
- 複数ページのコンテキスト参照なし

---

## 📋 新規実装タスク

### ✅ 1. API設計

- [ ] **1.1. エンドポイント設計**
  ```
  POST /api/comment/generate-multi
  
  リクエスト:
  - targetPage: 生成対象ページの情報
  - contextPages: 参照用の他ページ情報
  - systemPrompt: システムプロンプト
  - pagePrompt: 個別プロンプト
  
  レスポンス:
  - generatedComment: 生成されたコメント
  - processingTime: 処理時間
  ```

- [ ] **1.2. 型定義**
  ```typescript
  // src/types/comment-generator.ts
  
  interface MultiPageGenerateRequest {
    targetPage: {
      pageNumber: number;
      pageTitle: string;
      currentImage: string; // base64
      previousImage: string; // base64
      previousComment: string;
    };
    contextPages: {
      pageNumber: number;
      pageTitle: string;
      currentImage: string;
    }[];
    systemPrompt: string;
    pagePrompt: string;
  }
  
  interface MultiPageGenerateResponse {
    pageNumber: number;
    generatedComment: string;
    processingTime: number;
    error?: string;
  }
  ```

### ✅ 2. API Routes実装

- [ ] **2.1. エンドポイント作成**
  ```typescript
  // src/app/api/comment/generate-multi/route.ts
  // または src/api/comment/generate-multi.ts (バックエンド構成による)
  
  import { GoogleGenerativeAI } from '@google/generative-ai';
  
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  
  export async function POST(request: Request) {
    const body: MultiPageGenerateRequest = await request.json();
    
    // Gemini モデル選択
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash' // または gemini-1.5-pro
    });
    
    // プロンプト構築
    const prompt = buildPrompt(body);
    
    // 画像データの準備
    const imageParts = prepareImages(body);
    
    // API呼び出し
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const comment = response.text();
    
    return Response.json({
      pageNumber: body.targetPage.pageNumber,
      generatedComment: comment,
      processingTime: Date.now() - startTime
    });
  }
  ```

- [ ] **2.2. プロンプト構築**
  ```typescript
  function buildPrompt(body: MultiPageGenerateRequest): string {
    return `
  ${body.systemPrompt}

  ${body.pagePrompt}

  【生成対象ページ】
  - ページ番号: ${body.targetPage.pageNumber}
  - タイトル: ${body.targetPage.pageTitle}

  【前月コメント（参照用 - トーン・スタイルを踏襲）】
  ${body.targetPage.previousComment}

  【コンテキストページ（要因分析の参考）】
  ${body.contextPages.map(p => `- P${p.pageNumber}: ${p.pageTitle}`).join('\n')}

  【タスク】
  上記の情報と添付画像を参照し、今月のレポートコメントを生成してください。

  【添付画像の説明】
  1枚目: 今月の${body.targetPage.pageTitle}のデータ
  2枚目: 前月の${body.targetPage.pageTitle}（参照用）
  3枚目以降: 他のページの今月データ（要因分析の参考用）
  `;
  }
  ```

- [ ] **2.3. 画像データ準備**
  ```typescript
  function prepareImages(body: MultiPageGenerateRequest) {
    const images = [];
    
    // 今月の対象ページ
    images.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: body.targetPage.currentImage.split(',')[1] // base64部分のみ
      }
    });
    
    // 前月の対象ページ
    images.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: body.targetPage.previousImage.split(',')[1]
      }
    });
    
    // コンテキストページ（上限あり）
    const maxContextPages = 5; // API制限を考慮
    for (const page of body.contextPages.slice(0, maxContextPages)) {
      images.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: page.currentImage.split(',')[1]
        }
      });
    }
    
    return images;
  }
  ```

### ✅ 3. フロントエンド連携

- [ ] **3.1. API呼び出しHook**
  ```typescript
  // src/hooks/useCommentGeneration.ts
  
  interface UseCommentGenerationResult {
    generate: (request: MultiPageGenerateRequest) => Promise<string>;
    generateAll: (pages: PageData[], prompts: PromptData) => Promise<Map<number, string>>;
    progress: BatchProgress;
    isGenerating: boolean;
    error: string | null;
  }
  
  export function useCommentGeneration(): UseCommentGenerationResult {
    const [progress, setProgress] = useState<BatchProgress>({
      total: 0,
      completed: 0,
      currentPage: 0,
      status: 'idle'
    });
    
    const generate = async (request: MultiPageGenerateRequest) => {
      const response = await fetch('/api/comment/generate-multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      
      const result = await response.json();
      return result.generatedComment;
    };
    
    // ...
  }
  ```

- [ ] **3.2. 一括生成**
  - [ ] 選択された全ページに対して順次生成
  - [ ] 進捗表示への連携
  - [ ] エラー発生時の継続/中断選択

- [ ] **3.3. ページ別再生成**
  - [ ] 単一ページのみ再生成
  - [ ] プロンプト変更後の再生成

### ✅ 4. エラーハンドリング

- [ ] **4.1. API エラー**
  - [ ] タイムアウト処理
  - [ ] レート制限対応
  - [ ] リトライロジック

- [ ] **4.2. バリデーション**
  - [ ] 画像サイズチェック
  - [ ] プロンプト長さチェック

### ✅ 5. 進捗表示

- [ ] **5.1. 生成進捗UI**
  - [ ] 「3/15 ページ生成中...」表示
  - [ ] プログレスバー
  - [ ] キャンセルボタン

---

## 🔧 技術仕様

### ファイル構成

```
src/
├── app/api/comment/generate-multi/
│   └── route.ts              # APIエンドポイント
├── lib/
│   ├── gemini-client.ts      # Gemini APIクライアント
│   └── prompt-builder.ts     # プロンプト構築
└── hooks/
    └── useCommentGeneration.ts # 生成Hook
```

### 環境変数

```env
GEMINI_API_KEY=your-api-key
```

### API制限の考慮

| 項目 | 制限 | 対策 |
|------|------|------|
| レート制限 | 60 req/min | 逐次処理、間隔調整 |
| 画像サイズ | 20MB/リクエスト | 画像圧縮 |
| コンテキスト長 | 1M トークン | コンテキストページ数制限 |

---

## ⚠️ 注意事項

1. **Vercel制限**: Vercel無料プランは10秒タイムアウト。必要なら Edge Function または 外部バックエンド
2. **コスト**: 画像送信はトークン消費が多い。料金を考慮したモデル選択
3. **キャッシュ**: 同じ入力に対する再生成は避ける（コスト削減）

---

## 📊 進捗

| タスク | ステータス | 備考 |
|--------|------------|------|
| 1.1 エンドポイント設計 | 未着手 | |
| 1.2 型定義 | 未着手 | |
| 2.1 エンドポイント作成 | 未着手 | |
| 2.2 プロンプト構築 | 未着手 | |
| 2.3 画像データ準備 | 未着手 | |
| 3.1 API呼び出しHook | 未着手 | |
| 3.2 一括生成 | 未着手 | |
| 3.3 ページ別再生成 | 未着手 | |
| 4.1 APIエラー処理 | 未着手 | |
| 4.2 バリデーション | 未着手 | |
| 5.1 進捗表示UI | 未着手 | |

---

*作成日: 2026-01-03*

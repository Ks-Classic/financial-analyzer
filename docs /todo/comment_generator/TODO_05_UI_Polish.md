# TODO_05: UI統合（V3拡張 or V4新規）

## 🎯 目的
全機能を統合し、ステップ形式のウィザードUIを完成させる

---

## 🔄 実装方針の選択

### オプションA: V3を拡張

| メリット | デメリット |
|----------|------------|
| 既存コードを活用 | 954行がさらに複雑に |
| 本番への影響が小さい | リファクタリングが大変 |

### オプションB: V4として新規作成（推奨）

| メリット | デメリット |
|----------|------------|
| クリーンな設計 | V3との共通部分の重複 |
| テストしやすい | 開発工数が増える |
| 段階的リリース可能 | - |

### 判断基準

- V3が本番で使われている → **V4新規作成を推奨**
- 新機能はタブ切替で選択可能にする
- V3の共通部分（PDF処理、型定義）は`src/lib/`に抽出

---

## 📋 タスク一覧

### ✅ 1. コンポーネント構成

- [ ] **1.1. ディレクトリ作成**
  ```
  src/components/comment-generator/
  ├── CommentGeneratorTabV3.tsx  # 既存（そのまま維持）
  ├── CommentGeneratorTabV4.tsx  # 新規（切替用）
  └── MultiPageAnalysis/         # 新規
      ├── index.tsx              # メインコンポーネント
      ├── steps/
      │   ├── Step1_PDFUpload.tsx
      │   ├── Step2_PageSelect.tsx
      │   ├── Step3_ImagePaste.tsx
      │   ├── Step4_PromptEdit.tsx
      │   └── Step5_Review.tsx
      ├── components/
      │   ├── ImagePasteArea.tsx
      │   ├── PromptEditor.tsx
      │   ├── CommentCard.tsx
      │   └── ProgressIndicator.tsx
      └── hooks/
          └── useMultiPageState.ts
  ```

### ✅ 2. メインコンポーネント

- [ ] **2.1. ステップ管理**
  ```typescript
  const [currentStep, setCurrentStep] = useState(1);
  const STEPS = [
    { id: 1, name: 'PDFアップロード', component: Step1_PDFUpload },
    { id: 2, name: 'ページ選択', component: Step2_PageSelect },
    { id: 3, name: '画像入力', component: Step3_ImagePaste },
    { id: 4, name: 'プロンプト設定', component: Step4_PromptEdit },
    { id: 5, name: 'コメント確認', component: Step5_Review },
  ];
  ```

- [ ] **2.2. 状態管理**
  ```typescript
  interface MultiPageState {
    // Step 1
    pdfFile: File | null;
    pages: PDFPage[];
    
    // Step 2
    selectedPages: number[];
    
    // Step 3
    pageImages: Map<number, string>;
    
    // Step 4
    systemPrompt: string;
    pagePrompts: Map<number, string>;
    
    // Step 5
    generatedComments: Map<number, string>;
    editedComments: Map<number, string>;
  }
  ```

### ✅ 3. ステップコンポーネント

- [ ] **3.1. Step1_PDFUpload**
  - [ ] V3のPDFアップロード部分を抽出
  - [ ] コメント抽出機能を統合（TODO_01）

- [ ] **3.2. Step2_PageSelect**
  - [ ] V3のページ選択UIを抽出
  - [ ] 抽出されたコメントのプレビュー追加

- [ ] **3.3. Step3_ImagePaste**
  - [ ] 画像ペーストウィザード（TODO_02）

- [ ] **3.4. Step4_PromptEdit**
  - [ ] プロンプトエディタ（TODO_03）

- [ ] **3.5. Step5_Review**
  - [ ] コメント表示・編集・コピー（TODO_04の結果表示）

### ✅ 4. V3との切替

- [ ] **4.1. タブ内サブタブ**
  ```typescript
  // CommentGeneratorTabV4.tsx
  const [mode, setMode] = useState<'simple' | 'multi'>('simple');
  
  return (
    <div>
      <div className="tabs">
        <button onClick={() => setMode('simple')}>シンプル（V3）</button>
        <button onClick={() => setMode('multi')}>総合分析（V4）</button>
      </div>
      
      {mode === 'simple' ? (
        <CommentGeneratorTabV3 />
      ) : (
        <MultiPageAnalysis />
      )}
    </div>
  );
  ```

### ✅ 5. 共通部品の抽出

- [ ] **5.1. PDF処理を抽出**
  - [ ] `src/lib/pdf-utils.ts` に移動
  - [ ] V3, V4 両方から参照

- [ ] **5.2. 型定義を抽出**
  - [ ] `src/types/comment-generator.ts` に移動
  - [ ] 共通の型はここで管理

### ✅ 6. コメント表示・編集

- [ ] **6.1. コメントカード**
  - [ ] 前月コメントと今月生成コメントの比較表示
  - [ ] 編集ボタン → インライン編集
  - [ ] 再生成ボタン

- [ ] **6.2. コピー機能**
  - [ ] 個別コピーボタン
  - [ ] 一括コピー（全ページ）
  - [ ] トースト通知

- [ ] **6.3. 折りたたみ/展開**
  - [ ] コンパクト表示（タイトルのみ）
  - [ ] 展開表示（フルコメント）

### ✅ 7. エラーハンドリング・UX

- [ ] **7.1. ローディング表示**
  - [ ] 各ステップのローディング
  - [ ] コメント生成中のプログレス

- [ ] **7.2. エラー表示**
  - [ ] API エラー時のトースト
  - [ ] リトライボタン

- [ ] **7.3. ページ離脱警告**
  - [ ] 未保存データがある場合の警告
  - [ ] `beforeunload`イベント

---

## 🎨 UI仕様

### ステップインジケーター

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ① PDFアップロード  →  ② ページ選択  →  ③ 画像入力  →  ④ プロンプト  →  ⑤ 確認  │
│       ✓                  ●               ○               ○              ○   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### モード切替

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✨ コメント生成                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  [シンプル（従来版）] [総合分析（新機能）]                                  │
│        ───────────         ═══════════════                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 進捗

| タスク | ステータス | 備考 |
|--------|------------|------|
| 1.1 ディレクトリ作成 | 未着手 | |
| 2.1 ステップ管理 | 未着手 | |
| 2.2 状態管理 | 未着手 | |
| 3.1 Step1_PDFUpload | 未着手 | V3から抽出 |
| 3.2 Step2_PageSelect | 未着手 | V3から抽出 |
| 3.3 Step3_ImagePaste | 未着手 | TODO_02 |
| 3.4 Step4_PromptEdit | 未着手 | TODO_03 |
| 3.5 Step5_Review | 未着手 | TODO_04 |
| 4.1 V3との切替 | 未着手 | |
| 5.1 PDF処理抽出 | 未着手 | |
| 5.2 型定義抽出 | 未着手 | |
| 6.1 コメントカード | 未着手 | |
| 6.2 コピー機能 | 未着手 | |
| 6.3 折りたたみ/展開 | 未着手 | |
| 7.1 ローディング表示 | 未着手 | |
| 7.2 エラー表示 | 未着手 | |
| 7.3 ページ離脱警告 | 未着手 | |

---

*作成日: 2026-01-03*

# TODO_02: 画像ペースト機能（新規実装）

## 🎯 目的
Ctrl+Vで今月データの画像をペーストするウィザード形式のUIを新規実装

---

## ✅ 既存実装（参考）

### V3の関連機能

V3には画像ペースト機能はないが、以下が参考になる：

```typescript
// ファイルアップロードのinput処理（参考）
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  // ... 処理
};

// ドラッグ＆ドロップ処理（参考）
<div
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={handleDrop}
>
```

**活用ポイント**:
- ドラッグ＆ドロップのUI/UXパターン
- ファイル処理のエラーハンドリング

---

## 📋 新規実装タスク

### ✅ 1. Clipboard API実装

- [ ] **1.1. ペーストイベント処理**
  - [ ] `paste`イベントのリスナー登録
  - [ ] `ClipboardEvent`から画像データを取得
  - [ ] 対応形式: PNG, JPEG, WebP, BMP

- [ ] **1.2. 画像データ変換**
  - [ ] `Blob` → `FileReader` → Base64変換
  - [ ] メモリ効率を考慮したリサイズ（任意）

- [ ] **1.3. Hookとして実装**
  ```typescript
  // src/hooks/useClipboardPaste.ts
  
  export function useClipboardPaste(
    onPaste: (imageData: string) => void
  ) {
    useEffect(() => {
      const handlePaste = (event: ClipboardEvent) => {
        event.preventDefault();
        const items = event.clipboardData?.items;
        if (!items) return;
        
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const imageData = e.target?.result as string;
                onPaste(imageData);
              };
              reader.readAsDataURL(file);
            }
            break;
          }
        }
      };
      
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }, [onPaste]);
  }
  ```

### ✅ 2. ペーストエリアUI

- [ ] **2.1. 空状態のデザイン**
  - [ ] 「Ctrl+V で画像をペースト」のプレースホルダー
  - [ ] 📋 アイコン表示
  - [ ] 破線ボーダー + 薄い背景色

- [ ] **2.2. フォーカス状態**
  - [ ] クリックでフォーカス取得
  - [ ] フォーカス時のハイライト表示
  - [ ] キーボードフォーカスのアクセシビリティ

- [ ] **2.3. ペースト後の状態**
  - [ ] 画像プレビュー表示
  - [ ] 「クリア」ボタン
  - [ ] 「回転」ボタン（90度回転、任意）

- [ ] **2.4. コンポーネント実装**
  ```typescript
  // src/components/comment-generator/MultiPageAnalysis/ImagePasteArea.tsx
  
  interface ImagePasteAreaProps {
    imageData: string | null;
    onPaste: (imageData: string) => void;
    onClear: () => void;
    placeholder?: string;
  }
  
  export function ImagePasteArea({
    imageData,
    onPaste,
    onClear,
    placeholder = 'Ctrl+V で画像をペースト'
  }: ImagePasteAreaProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    
    useClipboardPaste(onPaste);
    
    return (
      <div
        ref={containerRef}
        tabIndex={0}
        className={`
          border-2 border-dashed rounded-lg p-4
          focus:outline-none focus:ring-2 focus:ring-blue-500
          ${imageData ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}
        `}
      >
        {imageData ? (
          <div className="relative">
            <img src={imageData} alt="Pasted" className="max-w-full h-auto" />
            <button onClick={onClear} className="absolute top-2 right-2 ...">
              🗑️ クリア
            </button>
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            <div className="text-4xl mb-2">📋</div>
            <p>{placeholder}</p>
            <p className="text-sm mt-1">クリックしてから Ctrl+V</p>
          </div>
        )}
      </div>
    );
  }
  ```

### ✅ 3. ウィザードナビゲーション

- [ ] **3.1. ステップ管理**
  - [ ] 現在のページインデックス管理
  - [ ] 選択されたページリストを順番に処理

- [ ] **3.2. ナビゲーションボタン**
  - [ ] 「← 前のページ」ボタン
  - [ ] 「次のページ →」ボタン
  - [ ] 「スキップ」ボタン

- [ ] **3.3. 進捗インジケーター**
  - [ ] ●●●○○○ 形式のドット表示
  - [ ] 「3/15 ページ完了」のテキスト表示

- [ ] **3.4. コンポーネント実装**
  ```typescript
  // src/components/comment-generator/MultiPageAnalysis/WizardNavigation.tsx
  
  interface WizardNavigationProps {
    currentIndex: number;
    totalPages: number;
    onPrev: () => void;
    onNext: () => void;
    onSkip: () => void;
    canPrev: boolean;
    canNext: boolean;
  }
  ```

### ✅ 4. 前月PDF参照表示

- [ ] **4.1. 左右レイアウト**
  - [ ] 左: 前月PDFサムネイル
  - [ ] 右: 画像ペーストエリア

- [ ] **4.2. サムネイル拡大**
  - [ ] クリックでモーダル表示
  - [ ] 「拡大表示」ボタン

- [ ] **4.3. 前月コメント表示**
  - [ ] サムネイル下に抽出済みコメントを表示
  - [ ] スクロール可能なテキストエリア

### ✅ 5. 状態管理

- [ ] **5.1. ページごとの画像状態**
  ```typescript
  interface PageImageState {
    pageNumber: number;
    imageData: string | null;
    isPasted: boolean;
    isSkipped: boolean;
  }
  
  const [pageImages, setPageImages] = useState<Map<number, PageImageState>>();
  ```

- [ ] **5.2. 完了判定**
  - [ ] 全ページ入力完了の検出
  - [ ] 「次のステップへ」ボタンの有効化

---

## 🎨 UI仕様

### 画像入力画面

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ P3: 売上推移表 (3/15)                                    [スキップ] [戻る] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────┐     ┌────────────────────────────┐         │
│  │ 【前月レポート参照】        │     │ 【今月データ】              │         │
│  │                            │     │                            │         │
│  │  ┌──────────────────────┐ │     │  ┌──────────────────────┐ │         │
│  │  │                      │ │     │  │                      │ │         │
│  │  │  (前月P3の           │ │     │  │   ここにCtrl+Vで     │ │         │
│  │  │   サムネイル)        │ │     │  │   画像をペースト     │ │         │
│  │  │                      │ │     │  │                      │ │         │
│  │  └──────────────────────┘ │     │  │   📋                 │ │         │
│  │                            │     │  │                      │ │         │
│  │  [拡大表示]                │     │  └──────────────────────┘ │         │
│  │                            │     │                            │         │
│  │  前月コメント:             │     │  [クリア] [回転]           │         │
│  │  ┌──────────────────────┐ │     │                            │         │
│  │  │ 5月は季節的な需要... │ │     │                            │         │
│  │  └──────────────────────┘ │     │                            │         │
│  └────────────────────────────┘     └────────────────────────────┘         │
│                                                                             │
│  ● ● ● ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○ ○  (進捗: 3/15)                              │
│                                                                             │
│                                          [← 前のページ] [次のページ →]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚠️ 注意事項

1. **ブラウザ互換性**: Clipboard APIはHTTPSまたはlocalhostでのみ動作
2. **フォーカス必須**: ペーストを受け付けるにはエリアにフォーカスが必要
3. **画像サイズ**: 大きな画像はメモリ使用量に注意

---

## 📊 進捗

| タスク | ステータス | 備考 |
|--------|------------|------|
| 1.1 ペーストイベント処理 | 未着手 | |
| 1.2 画像データ変換 | 未着手 | |
| 1.3 Hook実装 | 未着手 | |
| 2.1 空状態デザイン | 未着手 | |
| 2.2 フォーカス状態 | 未着手 | |
| 2.3 ペースト後の状態 | 未着手 | |
| 2.4 コンポーネント実装 | 未着手 | |
| 3.1 ステップ管理 | 未着手 | |
| 3.2 ナビゲーションボタン | 未着手 | |
| 3.3 進捗インジケーター | 未着手 | |
| 3.4 コンポーネント実装 | 未着手 | |
| 4.1 左右レイアウト | 未着手 | |
| 4.2 サムネイル拡大 | 未着手 | |
| 4.3 前月コメント表示 | 未着手 | |
| 5.1 状態管理 | 未着手 | |
| 5.2 完了判定 | 未着手 | |

---

*作成日: 2026-01-03*

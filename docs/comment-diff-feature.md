# コメント修正差分表示機能 - 実装ガイド

## 📋 実装概要

Financial Analyzerのチャット修正機能に、**変更箇所を視覚的に表示する差分機能**を追加しました。

### 🎯 実装した機能（Phase 1）

1. ✅ **3秒間の自動ハイライト表示**
   - 修正直後に変更箇所を自動的にハイライト
   - 追加部分: 🟢 緑背景
   - 削除部分: 🔴 赤背景・取り消し線
   - 3秒後に自動でフェードアウト

2. ✅ **修正回数カウント表示**
   - バッジに修正回数を表示（例: `編集済 (3回)`）
   - 修正履歴を内部的に保持

3. ✅ **差分統計バッジ**
   - 文字数の増減を視覚的に表示
   - 📈 増加: 青バッジ（+XX文字）
   - 📉 削減: 紫バッジ（-XX文字）

4. ✅ **手動差分表示トグル**
   - 2回以上修正した場合に「📊 差分表示」ボタンを表示
   - クリックで差分表示と通常表示を切り替え

---

## 🗂️ 追加ファイル

### 1. `/src/lib/diff-utils.ts`
**役割**: テキスト差分計算のユーティリティ関数

- `computeTextDiff()`: 2つのテキストを比較して差分を計算
- `computeDiffStats()`: 差分統計（文字数変化、増減率）を計算
- シンプルな単語ベースのアルゴリズムで高速動作

### 2. `/src/components/comment-generator/MultiPageAnalysis/components/DiffViewer.tsx`
**役割**: 差分を視覚的に表示するコンポーネント

**主要コンポーネント**:
- `DiffViewer`: 差分ハイライト表示
  - `autoHide`: 3秒後の自動非表示機能
  - `autoHideDuration`: 自動非表示までの秒数
- `DiffStatsBadge`: 差分統計バッジ（文字数増減）

### 3. `/tailwind.config.js` （更新）
**追加内容**: カスタムアニメーション `pulse-subtle`
- 差分ハイライトの控えめなアニメーション効果

---

## 🔄 更新ファイル

### `/src/components/comment-generator/MultiPageAnalysis/components/CommentCard.tsx`

**追加された状態管理**:
```typescript
// 修正履歴の保持
const [editHistory, setEditHistory] = useState<Array<{
    text: string;
    timestamp: Date;
    instruction?: string;
}>>([...]);

// 現在の差分データ（3秒間のみ表示）
const [currentDiff, setCurrentDiff] = useState<DiffFragment[] | null>(null);

// 手動差分表示モードのON/OFF
const [showDiffMode, setShowDiffMode] = useState(false);
```

**修正フローの変更**:
```typescript
const handleChatRefine = async () => {
    const beforeText = displayComment; // 修正前を保存
    
    const refined = await onChatRefine(pageNumber, chatInput.trim());
    
    // 差分を計算
    const diff = computeTextDiff(beforeText, refined);
    setCurrentDiff(diff); // → 3秒間ハイライト表示
    
    // 履歴に追加
    setEditHistory(prev => [...prev, { text: refined, ... }]);
};
```

**UI表示ロジック**:
```typescript
{currentDiff ? (
    // 3秒間の自動ハイライト
    <DiffViewer fragments={currentDiff} autoHide={true} autoHideDuration={3} />
) : showDiffMode && editHistory.length > 1 ? (
    // 手動差分表示モード
    <DiffViewer fragments={...} autoHide={false} />
) : (
    // 通常表示
    <div>{displayComment}</div>
)}
```

---

## 🎨 UI/UXの動作

### **修正直後（自動ハイライト）**
```
┌────────────────────────────────────────────────┐
│ P3: 損益計算書     編集済 (2回)  📈 +12文字     │
├────────────────────────────────────────────────┤
│ 売上高は前年比で12%増加しています。            │
│ ~~収益性が改善しました。~~                     │ ← 赤・取り消し線
│ 営業利益率も向上し、効率性が高まっています。  │ ← 緑ハイライト
│                                                │
│ 💬 [修正指示を入力...        ] [⚡修正]        │
└────────────────────────────────────────────────┘
          ↓ 3秒後に自動で通常表示に戻る
```

### **複数回修正後（トグルボタン表示）**
```
┌────────────────────────────────────────────────┐
│ P3: 損益計算書                                  │
│ 編集済 (3回)  [📊 差分表示]  📉 -8文字         │
│              ↑ クリックで差分ON/OFF             │
├────────────────────────────────────────────────┤
```

---

## ⚙️ 技術仕様

### 差分計算アルゴリズム
- **方式**: 単語ベース（スペース・改行で分割）
- **精度**: シンプルだが金融コメント（短文）には十分
- **パフォーマンス**: O(n+m) の線形時間

### 状態管理
- **履歴保持**: コンポーネント内の`useState`で管理
- **永続化**: なし（ページリロードで消える）
- **理由**: セッション内での修正作業が中心のため

### アニメーション
- **Tailwind CSS**: `animate-pulse-subtle`
- **duration**: 2秒のイージング
- **boxShadow**: ハイライト時のみ微妙な影を追加

---

## 🚀 使い方

### 1. 開発サーバーを起動
```bash
cd /home/ykoha/financital-analyzer
vercel dev --listen 3001
```

### 2. ブラウザでアクセス
```
http://localhost:3001
```

### 3. テスト手順
1. Multi-Page Analysisモードでレポートを生成
2. Step 7（レビュー）で任意のページを選択
3. チャット入力欄に修正指示を入力（例: 「もっと簡潔に」）
4. ⚡修正ボタンをクリック
5. **→ 3秒間、変更箇所が緑/赤でハイライト表示される**
6. 修正回数が増えると「編集済 (X回)」バッジが表示
7. 2回以上修正すると「📊 差分表示」ボタンが表示される

---

## 📊 実装の技術的ハイライト

### ✅ **パフォーマンス最適化**
- 差分計算は修正時のみ実行（レンダリング毎ではない）
- `useMemo`は不要（計算コストが低い）

### ✅ **UXの配慮**
- 修正が1回のみの場合、トグルボタンを表示しない
- 3秒後の自動非表示で、読みやすさを維持
- アニメーションは控えめ（`pulse-subtle`）

### ✅ **拡張性**
- `DiffFragment`型により、将来的に行ベース差分も可能
- `editHistory`から任意の版に戻す機能も実装可能（Phase 3予定）

---

## 🔮 今後の拡張可能性（Phase 2/3）

### Phase 2（UX向上）
- [ ] 履歴パネルの折りたたみ表示
- [ ] 修正指示のタイムスタンプ表示
- [ ] キーボードショートカット（Ctrl+Z で前の版に戻す）

### Phase 3（プレミアム機能）
- [ ] 任意の版を選択して復元
- [ ] サイドバイサイド比較モード
- [ ] 修正履歴のエクスポート（JSON/Markdown）

---

## 🐛 既知の制限事項

1. **ページリロードで履歴消失**
   - 現在は`useState`のみで管理
   - 必要に応じて`localStorage`に保存可能

2. **差分精度**
   - 単語ベースのため、文中の微妙な表現変更は検出が粗い
   - より高精度な差分が必要な場合は`diff-match-patch`導入を検討

3. **長文での表示**
   - 200文字以上のコメントでは、差分が見づらくなる可能性
   - 将来的に展開/折りたたみ機能を追加予定

---

## 📝 まとめ

この実装により、アナリストは：
1. **修正内容を即座に視覚的に確認**できる
2. **修正回数を一目で把握**できる
3. **複数回の修正を比較**できる

→ **AI修正の透明性が向上し、レビュー効率が大幅に改善**します。

---

*実装日: 2026-01-16*  
*Phase: 1（基礎機能）*

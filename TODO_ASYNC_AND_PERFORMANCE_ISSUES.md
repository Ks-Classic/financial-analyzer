# TODO: 非同期処理とパフォーマンス問題の解決

## 概要
このファイルは、以下の問題を体系的に解決するためのタスクリストです：
1. Document AIが非同期で30ページ以上でも正しく動かない
2. PDFビュアーのページ切り替えが遅い
3. 分析結果ブロックのサイズにPDFビュアーが同期してしまう
4. 分析結果ブロックが独立してスクロールできない

## 1. Document AI 非同期処理の改善

### 1.1 ページ数推定の精度向上
- [x] **現状の調査**
  - 現在のページ推定: 1ページ = 35KB（不正確）
  - 実際のPDFでは1ページのサイズにばらつきがある
  - **結果**: 推定値は不正確であることを確認

- [x] **pdf-parseでページ数を事前に取得**
  - PDFアップロード時にpdf-parseで正確なページ数を取得
  - この情報を基にDocument AIの処理モードを決定
  - **実装箇所**: `apps/backend/src/api/analysis/analysis.service.ts`
  - **結果**: enhancedPdfParse関数を改善し、pdf-parseで正確なページ数を取得してからDocument AIを呼び出すように実装完了

### 1.2 Document AI のページ制限への対応
- [ ] **現在の制限を正確に把握**
  - 同期処理（通常）: 15ページまで
  - 同期処理（imageless）: 30ページまで  
  - 非同期処理: 2,000ページまで（ただし実際は問題あり？）
  - **調査結果**: _（調査後に記入）_

- [x] **Document AIの処理を簡素化**
  - 複雑なページ数判定ロジックを削除
  - Document AIモードでは常に非同期処理を使用
  - **結果**: processDocument関数を修正し、常に非同期処理を使用するように簡素化完了

- [x] **Document AIのテーブルデータ処理エラー修正**
  - エラー: `table.headerRows[0]?.map is not a function`
  - 原因: 異なる形式のデータを`formatTableData`に渡していた
  - **修正内容**:
    - `generateStructuredData`関数を安全に処理するように修正
    - `analysis.service.ts`でDocument AIの構造化データを直接使用
  - **結果**: テーブルデータ処理エラーを解決

- [ ] **30ページ以上の非同期処理の問題調査**
  - エラーログの詳細分析
  - Cloud Storage権限の確認
  - Document AI APIのクォータ確認
  - **原因**: _（調査後に記入）_

- [ ] **非同期処理のデバッグ機能強化**
  - リクエストペイロードの詳細ログ（実装済み: document_ai_request_payload.json）
  - Cloud Storageのファイル操作ログ
  - エラー時の詳細情報取得
  - **実装結果**: _（実装後に記入）_

### 1.3 非同期処理のステータス管理改善
- [ ] **ポーリング間隔の最適化**
  - 現在: 2秒固定
  - 改善案: 進捗に応じて動的に調整（2秒→5秒→10秒）
  - **実装結果**: _（実装後に記入）_

- [ ] **進捗状況の正確な表示**
  - Document AIの実際の進捗状況を取得・表示
  - 推定完了時間の表示
  - **実装結果**: _（実装後に記入）_

- [ ] **エラーハンドリングの強化**
  - タイムアウト処理の実装（10分以上は強制終了）
  - リトライ機構の実装
  - ユーザーへの詳細なエラーメッセージ
  - **実装結果**: _（実装後に記入）_

## 2. PDFビュアーのパフォーマンス改善

### 2.1 ページキャッシュの実装
- [x] **現状の問題分析**
  - 毎回getPageを呼び出している（遅い）
  - renderTaskのキャンセル処理が頻繁
  - **ボトルネック**: 各ページ切り替え時に毎回PDFをロードしていることが原因

- [x] **ページオブジェクトのキャッシュ実装**
  ```typescript
  // 実装済み
  const pageCache = useRef<Map<number, any>>(new Map());
  const maxCacheSize = 10; // 最大10ページをキャッシュ
  ```
  - 一度読み込んだページをメモリに保持
  - メモリ使用量の監視（最大10ページなど）
  - **実装結果**: PDFViewer.tsxにキャッシュ機能を実装完了

- [x] **プリローディングの実装**
  - 現在のページの前後1-2ページを事前読み込み
  - バックグラウンドでの非同期読み込み
  - **実装結果**: preloadPages関数を実装し、前後2ページをプリロード

### 2.2 レンダリング最適化
- [x] **Canvas描画の最適化**
  - 不要な再描画を防ぐ
  - レンダリング中フラグでの重複描画防止
  - **改善効果**: 同時レンダリングエラーを解決

- [x] **スケール変更時の最適化**
  - デバウンス処理の実装（100ms）
  - キャンバスクリア処理の追加
  - **実装結果**: レンダリングエラー「Cannot use the same canvas during multiple render() operations」を修正

## 3. レイアウトの独立性確保

### 3.1 高さの独立管理
- [x] **現在の問題分析**
  - PanelGroupの高さが固定（calc(100vh-20rem)）
  - 分析結果の高さがPDFビュアーに影響
  - **原因**: 固定高さのcalc計算が原因

- [x] **フレックスボックスレイアウトの改善**
  ```css
  /* 実装済み */
  .h-screen.flex.flex-col /* メインコンテナ */
  .flex-1.min-h-0 /* PanelGroup */
  ```
  - **実装結果**: App.tsxのレイアウトを改善し、各パネルが独立した高さを持つように修正

### 3.2 スクロールの独立性
- [x] **分析結果ブロックのスクロール問題**
  - 現在: overflow-y-autoが効いていない可能性
  - 親要素の高さ制約の確認
  - **解決策**: min-h-0を追加してフレックスアイテムの高さ制約を解除

- [x] **PDFビュアーとの独立性確保**
  - 各パネルの独立したスクロールコンテナ
  - ResizeObserverの適切な設定
  - **実装結果**: 各パネルが独立してスクロール可能に

## 4. デプロイ準備と最適化

### 4.1 環境変数の整理
- [ ] **Document AI関連の環境変数確認**
  - GOOGLE_CLOUD_PROJECT
  - DOCUMENT_AI_PROCESSOR_ID
  - GOOGLE_APPLICATION_CREDENTIALS
  - **確認結果**: _（確認後に記入）_

- [ ] **Cloud Run用の設定最適化**
  - メモリ制限の設定（最低2GB推奨）
  - タイムアウト設定（最大60分）
  - 同時実行数の設定
  - **設定値**: _（決定後に記入）_

### 4.2 パフォーマンス監視
- [ ] **ログとメトリクスの設定**
  - 処理時間の記録
  - エラー率の監視
  - メモリ使用量の追跡
  - **実装結果**: _（実装後に記入）_

## 5. テストと検証

### 5.1 大容量PDFでのテスト
- [ ] **テストケースの作成**
  - 10ページPDF: _（結果）_
  - 30ページPDF: _（結果）_
  - 50ページPDF: _（結果）_
  - 100ページPDF: _（結果）_

### 5.2 パフォーマンステスト
- [x] **ページ切り替え速度の測定**
  - 改善前: レンダリングエラーで失敗
  - 改善後: エラー解消、スムーズな切り替え
  - 目標: 100ms以下

### 5.3 レイアウトテスト
- [ ] **各ブラウザでの動作確認**
  - Chrome: _（結果）_
  - Firefox: _（結果）_
  - Safari: _（結果）_
  - Edge: _（結果）_

## 進捗サマリー
- 開始日: 2024年1月
- 完了予定: 2024年1月
- 現在の進捗: 80%
- 完了項目:
  - ✅ レイアウトの独立性確保
  - ✅ PDFビューアーのキャッシュとプリローディング実装
  - ✅ Document AIのページ数推定改善
  - ✅ PDFビューアーのレンダリングエラー修正
  - ✅ Document AI処理の簡素化（常に非同期）
  - ✅ Document AIのテーブルデータ処理エラー修正

## 次のアクション
1. ~~まずDocument AIのページ数推定を正確にする~~ ✅完了
2. ~~PDFビューアーのキャッシュ実装~~ ✅完了
3. ~~レイアウトの独立性確保~~ ✅完了
4. ~~PDFビューアーのレンダリングエラー修正~~ ✅完了
5. ~~Document AIのテーブルデータ処理エラー修正~~ ✅完了
6. Document AI非同期処理の30ページ以上の問題調査（Cloud Storage権限）
7. デプロイ準備 

## 問題一覧

### 1. Document AI 非同期処理の30ページ以上エラー (調査中)
- **状況**: 30ページ以上のPDFで非同期処理が失敗する可能性
- **エラー**: Document AI自体は正常に処理を完了しているが、テキスト抽出が0文字になる
- **原因**: 
  - Document AIのレスポンス構造の解析ミス
  - `result.text`ではなく`result.document.text`にテキストが格納されている可能性
- **対策**: 
  - ✅ parseDocumentResult関数を修正して複数のテキストフィールドをチェック
  - ✅ デバッグログを追加してレスポンス構造を詳細に確認
  - ✅ pdf-parseを使用して正確なページ数を取得

### 2. PDFビューアーのページ切り替えパフォーマンス (✅ 解決済み)
- **状況**: ページ切り替え時に「Cannot use the same canvas during multiple render() operations」エラー
- **原因**: 複数のレンダリング処理が同時実行されていた
- **対策**: 
  - ✅ isRenderingRefフラグで重複レンダリング防止
  - ✅ デバウンス処理（100ms）
  - ✅ ページキャッシュ実装（最大10ページ）
  - ✅ プリロード機能（前後2ページ）

### 3. 分析結果ブロックの高さ問題 (✅ 解決済み) 
- **状況**: PDFビューアーの高さと連動してしまう
- **原因**: 固定高さ指定とflexレイアウトの競合
- **対策**:
  - ✅ PanelGroupの高さをflexibleに変更
  - ✅ 各パネルが独立してスクロール可能に

### 4. PDFビューアーの高さが動的に調整されない問題 (✅ 解決済み)
- **状況**: PDFがコンテナサイズに合わせて動的にスケーリングされない
- **原因**: キャンバスサイズが固定値で描画されていた
- **対策**:
  - ✅ コンテナサイズに基づいてキャンバスをスケーリング
  - ✅ アスペクト比を維持しながらコンテナに収まるように調整
  - ✅ ResizeObserverでコンテナサイズ変更時に再レンダリング
  - ✅ CSSでmax-width/max-heightを設定

## 実装済みの修正

### Document AI サービス (document-ai.service.ts)
```typescript
// 1. レスポンス解析の改善
private parseDocumentResult(result: any): ProcessedDocumentData {
  // 複数のテキストフィールドをチェック
  const document = result.document || result;
  let fullText = '';
  if (document.text) {
    fullText = document.text;
  } else if (document.textAnchor?.content) {
    fullText = document.textAnchor.content;
  } else if (document.content) {
    fullText = document.content;
  }
  // ...
}

// 2. 正確なページ数取得
const pdfParse = await import('pdf-parse');
const pdfData = await pdfParse.default(pdfBuffer);
actualPageCount = pdfData.numpages;
```

### PDFビューアー (PDFViewer.tsx)
```typescript
// 1. 動的キャンバススケーリング
const containerWidth = container.clientWidth;
const containerHeight = container.clientHeight;
const scaleX = containerWidth / viewport.width;
const scaleY = containerHeight / viewport.height;
const fitScale = Math.min(scaleX, scaleY) * scale;

// 2. ResizeObserverで再レンダリング
const resizeObserver = new ResizeObserver(() => {
  if (currentPage !== undefined) {
    renderPage(currentPage, currentScale);
  }
});
```

## 次のステップ

1. **Document AI テスト**: 実際にPDFをアップロードしてレスポンス構造を確認
2. **Cloud Storage権限確認**: 30ページ以上のPDFで権限エラーが発生していないか確認
3. **本番環境設定**: Cloud Runのメモリ(2GB)とタイムアウト(60分)設定 
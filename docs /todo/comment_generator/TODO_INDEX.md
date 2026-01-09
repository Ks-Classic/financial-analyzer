# 複数図表総合分析機能 - 実装TODO

## 📋 概要

**仕様書**: [10_MULTI_PAGE_ANALYSIS_SPEC.md](../../designe/comment_generator/10_MULTI_PAGE_ANALYSIS_SPEC.md)

**目的**: 複数ページの財務データを参照した上で、前月コメントのトーン・スタイルを踏襲しながらコメントを生成する機能

---

## � 既存実装の状況

### 現在のコンポーネント

| ファイル | 状況 | 活用方針 |
|----------|------|----------|
| `CommentGeneratorTabV3.tsx` (954行) | **現在使用中** | 共通部品を抽出して活用 |

### V3で実装済みの機能

| 機能 | ステータス | 備考 |
|------|------------|------|
| ✅ PDFアップロード | 完了 | `pdfjs-dist` 使用 |
| ✅ ページサムネイル生成 | 完了 | Canvas API使用 |
| ✅ ページタイトル推定 | 完了 | パターンマッチング |
| ✅ Excelアップロード | 完了 | `xlsx` 使用 |
| ✅ シート表示・範囲選択 | 完了 | ドラッグ選択UI |
| ✅ サンプルコメント生成 | 完了 | ローカル生成（AI未連携）|
| ✅ 型定義 | 完了 | PDFPage, ExcelFile等 |

### 新規実装が必要な機能

| 機能 | 優先度 | 備考 |
|------|--------|------|
| ❌ 前月コメント抽出 | 高 | PDFからコメントテキストを抽出 |
| ❌ 画像ペースト（Ctrl+V） | 高 | Clipboard API |
| ❌ プロンプト自動生成 | 高 | トーン・文体分析 |
| ❌ Gemini API連携 | 高 | マルチモーダル入力 |
| ❌ ガイド付きウィザードUI | 中 | ステップ形式 |
| ❌ テンプレート保存 | 低 | localStorage |

---

## �📁 ファイル構成

| ファイル | 説明 | 優先度 |
|----------|------|--------|
| **TODO_01_PDF_Processing.md** | コメント抽出機能の追加（既存PDF処理を拡張） | Phase 1 |
| **TODO_02_Image_Paste.md** | 画像ペースト機能（新規） | Phase 1 |
| **TODO_03_Prompt_Engine.md** | プロンプト自動生成・管理（新規） | Phase 1 |
| **TODO_04_Comment_Generation.md** | Gemini API連携（新規） | Phase 1 |
| **TODO_05_UI_Integration.md** | UI統合・ウィザード形式（V3拡張 or V4新規） | Phase 1 |

---

## 🚀 実装順序（推奨）

```
Week 1: 既存拡張 + 新規基盤
┌─────────────────────────────────────────────────────────────────────────┐
│ TODO_01: PDFコメント抽出（V3のPDF処理を拡張）                           │
│  → 既存: pdfjs-dist設定、サムネイル生成                                │
│  → 追加: テキスト抽出、コメント領域特定                                │
├─────────────────────────────────────────────────────────────────────────┤
│ TODO_02: 画像ペースト（新規実装）                                       │
│  → Clipboard API、ペーストエリアUI                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
Week 2: AI連携
┌─────────────────────────────────────────────────────────────────────────┐
│ TODO_03: プロンプト自動生成（新規実装）                                 │
│  → 前月コメント分析、ページ種別別プロンプト                            │
├─────────────────────────────────────────────────────────────────────────┤
│ TODO_04: Gemini API連携（新規実装）                                     │
│  → マルチモーダル入力、一括/ページ別生成                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
Week 3: 統合
┌─────────────────────────────────────────────────────────────────────────┐
│ TODO_05: UI統合                                                          │
│  → 選択肢A: V3をリファクタリングして拡張                               │
│  → 選択肢B: V4として新規作成（V3から共通部品を抽出）                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 実装方針

### アプローチ: ハイブリッド（推奨）

```
既存V3から活用:
├── PDF処理（pdfjs-dist設定、サムネイル生成）
├── 型定義（PDFPage, ExcelFile, SheetData 等）
├── Excelパース・表示ロジック
└── ユーティリティ関数

新規実装:
├── src/components/comment-generator/
│   ├── MultiPageAnalysis/          # 新規ディレクトリ
│   │   ├── index.tsx               # メインコンポーネント
│   │   ├── PDFCommentExtractor.tsx # コメント抽出
│   │   ├── ImagePasteArea.tsx      # 画像ペースト
│   │   ├── PromptEditor.tsx        # プロンプト編集
│   │   ├── CommentViewer.tsx       # コメント表示
│   │   └── WizardNavigation.tsx    # ウィザードナビ
│   └── CommentGeneratorTabV4.tsx   # 新バージョン（オプション）
├── src/hooks/
│   ├── usePDFTextExtractor.ts      # PDFテキスト抽出
│   ├── useClipboardPaste.ts        # 画像ペースト
│   └── usePromptGenerator.ts       # プロンプト生成
├── src/lib/
│   └── comment-analyzer.ts         # コメント分析
└── src/api/
    └── comment/generate-multi/     # API Routes
```

---

## 📊 進捗管理

| TODO | ステータス | 既存活用 | 新規実装 | 開始日 | 完了日 |
|------|------------|----------|----------|--------|--------|
| TODO_01_PDF_Processing | ✅ 完了 | PDF処理基盤 | コメント抽出 | 2026-01-04 | 2026-01-04 |
| TODO_02_Image_Paste | ✅ 完了 | - | 全て新規 | 2026-01-04 | 2026-01-04 |
| TODO_03_Prompt_Engine | ✅ 完了 | - | 全て新規 | 2026-01-04 | 2026-01-04 |
| TODO_04_Comment_Generation | ✅ 完了 | - | 全て新規 | 2026-01-04 | 2026-01-04 |
| TODO_05_UI_Integration | ✅ 完了 | UI基盤 | ウィザード形式 | 2026-01-04 | 2026-01-04 |

---

## ⚠️ 注意事項

1. **V3との互換性**: V3は現在本番で使用中。新機能は別コンポーネントとして実装し、タブ切替で選択可能にする
2. **段階的リリース**: 各TODOは独立してテスト可能。完成したら順次マージ
3. **既存コードの抽出**: 共通部品（PDF処理、型定義）は`src/lib/`に抽出することを検討

---

## 📁 実装されたファイル

### ライブラリ（src/lib/）
- `pdf-utils.ts` - PDF処理、テキスト抽出、コメント抽出
- `prompts.ts` - デフォルトプロンプト、テンプレート管理
- `prompt-generator.ts` - プロンプト自動生成ロジック

### Hooks（src/hooks/）
- `useClipboardPaste.ts` - 画像ペースト機能
- `useCommentGeneration.ts` - コメント生成API連携
- `useClientSettings.ts` - **🆕 顧客別設定管理** (LocalStorage永続化)

### コンポーネント（src/components/comment-generator/）
- `CommentGeneratorTabV4.tsx` - V3/V4モード切替
- `MultiPageAnalysis/index.tsx` - メインコンポーネント (顧客設定・モード選択統合)
- `MultiPageAnalysis/components/` - UI部品
  - `ImagePasteArea.tsx`
  - `WizardNavigation.tsx`
  - `ProgressIndicator.tsx`
  - `PromptEditor.tsx`
  - `CommentCard.tsx`
  - `ClientSettings.tsx` - **🆕 顧客選択・コメント範囲設定UI**
  - `SequentialPageCapture.tsx` - **🆕 シーケンシャルモードUI**

### 型定義（src/types/）
- `multi-page-analysis.ts` - 複数図表分析用の型定義
  - **🆕 追加**: `PageCommentRegion`, `ClientSettings`, `ImageCaptureMode`, `SinglePageGenerationState`

---

## 🆕 Phase 1.5 新機能 (2026-01-05 実装完了)

### 顧客別コメント範囲設定機能

| 機能 | 説明 | ファイル |
|------|------|----------|
| 顧客選択・管理 | 顧客の追加・編集・削除 | `useClientSettings.ts`, `ClientSettings.tsx` |
| ページ範囲設定 | 顧客ごとにコメント抽出範囲を設定 | `ClientSettings.tsx` |
| 設定永続化 | LocalStorageに自動保存 | `useClientSettings.ts` |
| 範囲可視化 | サムネイル上にオーバーレイ表示 | `MultiPageAnalysis/index.tsx` |

### 画像キャプチャモード選択

| モード | 説明 | 用途 |
|--------|------|------|
| 一括モード | 全ページの画像を先にキャプチャ→まとめて生成 | 効率重視 |
| シーケンシャルモード | 1ページずつキャプチャ→即生成 | 確認しながら作業 |

---

## 🐛 バグ修正 (2026-01-05)

| 問題 | 原因 | 修正 |
|------|------|------|
| HTTP 404エラーでコメント生成失敗 | APIエンドポイント未実装 | デモモードフォールバックを改善 |

---

## 🚀 Phase 1.6 - Vercel Functions API実装 (進行中)

### 目標
- Gemini Vision APIを使用したコメント抽出/生成
- セキュアなバックエンドAPI（APIキー非露出）
- Vercel Functionsでサーバーレス実装

### タスクリスト

#### 1. 前準備（クリーンアップ）
- [x] 前月比較タブの削除（未使用機能）
  - `MonthlyComparisonTab.tsx` 削除
  - `App.tsx` から参照削除
- [ ] Cloud Run関連の未使用ファイル整理
  - `cloudbuild.yaml` 削除または更新
  - `/backend/` フォルダ整理

#### 2. Vercel Functions セットアップ
- [x] `/api/` ディレクトリ作成
- [x] `vercel.json` 更新（API Routes設定）
- [ ] Vercel環境変数に `GEMINI_API_KEY` 追加（デプロイ時に設定）

#### 3. コメント抽出API
- [x] `/api/comment/extract.ts` 作成
  - Gemini 2.0 Flash / 2.5 Pro 対応
  - 画像からテキスト抽出
  - 箇条書き・段落構造を保持

#### 4. コメント生成API
- [x] `/api/comment/generate.ts` 作成
  - マルチモーダル入力（前月画像 + 今月画像 + 抽出コメント）
  - システムプロンプト + ページプロンプト対応

#### 5. フロントエンド統合
- [x] 画像範囲切り出し関数（Canvas API） - `api-client.ts`
- [x] `/api/comment/extract` 呼び出し統合（UIから実際に呼び出す部分）
- [ ] `/api/comment/generate` 呼び出し統合（UIから実際に呼び出す部分）
- [x] エラーハンドリング・ローディング表示

### ファイル構成（予定）

```
/api/
├── comment/
│   ├── extract.ts      ← コメント抽出（Gemini Vision）
│   └── generate.ts     ← コメント生成（Gemini）
/src/
└── lib/
    └── api-client.ts   ← API呼び出しユーティリティ
```

### 技術スタック

| 項目 | 選択 |
|------|------|
| APIホスティング | Vercel Functions |
| AIモデル | Gemini 2.0 Flash / 2.5 Pro |
| 画像処理 | Canvas API (フロントエンド) |
| 認証 | Vercel環境変数 (GEMINI_API_KEY) |

---

*作成日: 2026-01-03*
*最終更新: 2026-01-05*

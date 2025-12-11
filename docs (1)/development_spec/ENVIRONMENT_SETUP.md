# 🚀 AI財務レポートアナライザー 開発運用ガイドライン

## 📋 目次
1. [環境別設定概要](#環境別設定概要)
2. [開発環境セットアップ](#開発環境セットアップ)
3. [ステージング環境セットアップ](#ステージング環境セットアップ)
4. [本番環境セットアップ](#本番環境セットアップ)
5. [動作確認手順](#動作確認手順)
6. [トラブルシューティング](#トラブルシューティング)
7. [運用フロー](#運用フロー)

## 🎯 環境別設定概要

### 📊 環境比較表
| 環境 | URL | エンジン制御UI | 処理モード選択UI | デフォルト処理 | Document AI | 用途 |
|------|-----|----------------|-----------------|---------------|-------------|------|
| **開発** | `http://localhost:5173` | ✅ 表示 | ✅ 表示 | Document AI | ✅ 有効 | 機能開発・テスト |
| **ステージング** | `https://[project]-git-[branch].vercel.app` | ❌ 非表示 | ❌ 非表示 | pdf-parse | ❌ 無効 | 動作確認・テスト |
| **本番** | `https://[project].vercel.app` | ❌ 非表示 | ❌ 非表示 | pdf-parse | ❌ 無効 | 顧客提供 |

### 🔧 処理モード戦略
- **開発環境**: Document AI機能テスト・デバッグ用
- **ステージング/本番**: 安定性重視、コスト削減

## 🛠️ 開発環境セットアップ

### 1. 必要な環境変数

#### フロントエンド (.env.local)
```bash
# 開発環境設定
VITE_API_URL=http://localhost:8080
VITE_SHOW_ENGINE_CONTROL=true
VITE_SHOW_PROCESSING_MODE_SELECTION=true
```

#### バックエンド (.env.local)
```bash
# 基本設定
NODE_ENV=development
PORT=8080
GEMINI_API_KEY=your_gemini_api_key_here

# PDF処理エンジン設定
PDF_ENGINE=document-ai
DOCUMENT_AI_ENABLED=true
PDF_FALLBACK_ENABLED=true
PDF_MAX_FILE_SIZE=50
PDF_QUALITY_THRESHOLD=0.8

# Document AI設定（開発用）
GOOGLE_CLOUD_PROJECT=liberate-report-check
DOCUMENT_AI_LOCATION=us
DOCUMENT_AI_PROCESSOR_ID=your_processor_id_here
GOOGLE_APPLICATION_CREDENTIALS=./key/liberate-report-check-04eb1430b53c.json
```

### 2. 開発サーバー起動

```powershell
# プロジェクトルートで
pnpm dev

# 個別起動の場合
# バックエンド
cd apps/backend
pnpm dev

# フロントエンド（別ターミナル）
cd apps/frontend  
pnpm dev
```

### 3. 開発環境確認

```powershell
# フロントエンド確認
Start-Process "http://localhost:5173"

# バックエンドAPI確認
curl http://localhost:8080/api/pdf-engine/config
```

## 🎯 ステージング環境セットアップ

### 1. Vercelプレビュー環境の利用

#### A. プルリクエスト用プレビュー
```powershell
# 新しいブランチで作業
git checkout -b feature/staging-test
git add .
git commit -m "staging test"
git push origin feature/staging-test

# プルリクエスト作成 → 自動的にプレビューURL生成
# 例: https://ai-financial-analyzer-git-feature-staging-test.vercel.app
```

#### B. 専用ステージング環境
```powershell
# Vercel CLI でステージング用プロジェクト作成
vercel

# プロジェクト名: ai-financial-analyzer-staging
# 環境変数設定
vercel env add VITE_API_URL
# 値: https://ai-financial-analyzer-backend.run.app

vercel env add VITE_SHOW_ENGINE_CONTROL
# 値: false

vercel env add NODE_ENV
# 値: staging
```

### 2. ステージング環境の動作確認

#### 環境変数確認
```javascript
// ブラウザコンソールで実行
console.log('Environment:', import.meta.env.VITE_API_URL);
console.log('Show Engine Control:', import.meta.env.VITE_SHOW_ENGINE_CONTROL);
```

#### 期待される動作
- ✅ エンジン制御UI非表示
- ✅ 通常モード（pdf-parse）で動作
- ✅ 安定した処理速度

## 🚀 本番環境セットアップ

### 1. 本番環境変数 (vercel.json)
```json
{
  "env": {
    "VITE_API_URL": "https://ai-financial-analyzer-backend.run.app",
    "VITE_SHOW_ENGINE_CONTROL": "false"
  }
}
```

### 2. 本番デプロイ
```powershell
# 本番デプロイ
vercel --prod

# デプロイ後確認
Start-Process "https://ai-financial-analyzer.vercel.app"
```

## ✅ 動作確認手順

### 🔧 開発環境確認チェックリスト

#### A. 起動確認
- [ ] `pnpm dev` でエラーなく起動
- [ ] フロントエンド: http://localhost:5173 アクセス可能
- [ ] バックエンド: http://localhost:8080 アクセス可能

#### B. エンジン制御UI確認
- [ ] PDFエンジン設定パネルが表示される
- [ ] 「高性能モード優先」表示
- [ ] 展開時に詳細設定が表示される

#### C. Document AI機能確認
```powershell
# エンジン可用性確認
curl http://localhost:8080/api/pdf-engine/availability

# 期待結果
{
  "pdf-parse": true,
  "document-ai": true  # 開発環境では有効
}
```

#### D. PDF処理テスト
- [ ] 財務レポートPDFをアップロード
- [ ] Document AIでの処理確認
- [ ] フォールバック動作確認（Document AI無効時）

### 🎯 ステージング環境確認チェックリスト

#### A. 環境判定確認
```javascript
// コンソールで実行
import { getCurrentEnvironment } from './utils/environment';
console.log(getCurrentEnvironment());

// 期待結果
{
  name: 'staging',
  showEngineControl: false,
  defaultEngine: 'pdf-parse',
  allowEngineSelection: false
}
```

#### B. UI確認
- [ ] エンジン制御UI非表示
- [ ] 通常モードで動作
- [ ] 顧客向けシンプルなUI

#### C. 処理確認
- [ ] pdf-parseエンジンで処理
- [ ] Document AI未使用（コスト削減）
- [ ] 安定した処理速度

### 🚀 本番環境確認チェックリスト

#### A. セキュリティ確認
- [ ] HTTPS通信
- [ ] セキュリティヘッダー設定
- [ ] 機密情報の非露出

#### B. パフォーマンス確認
- [ ] 初回読み込み速度
- [ ] PDF処理速度
- [ ] メモリ使用量

#### C. 可用性確認
- [ ] 24時間安定動作
- [ ] エラーハンドリング
- [ ] ログ出力

## 🔧 トラブルシューティング

### 開発環境でDocument AIが動作しない

#### 症状
- Document AI処理でエラー
- pdf-parseにフォールバック

#### 対処法
```powershell
# 1. 認証情報確認
$env:GOOGLE_APPLICATION_CREDENTIALS
ls key/liberate-report-check-04eb1430b53c.json

# 2. プロジェクト設定確認
gcloud config list project

# 3. Document AI API有効化確認
gcloud services list --enabled | findstr documentai

# 4. プロセッサID確認
$env:DOCUMENT_AI_PROCESSOR_ID
```

### ステージング環境でエンジン制御UIが表示される

#### 症状
- 本番同様の表示のはずが、開発環境同様の表示

#### 対処法
```powershell
# 1. Vercel環境変数確認
vercel env ls

# 2. 環境変数追加
vercel env add VITE_SHOW_ENGINE_CONTROL
# 値: false

# 3. 再デプロイ
vercel --prod
```

### ポート設定の不整合

#### 症状
- API通信エラー
- 404エラー頻発

#### 対処法
```powershell
# バックエンドポート確認
cd apps/backend
Get-Content package.json | findstr port

# フロントエンドAPI設定確認
cd apps/frontend
Get-Content src/App.tsx | findstr localhost
```

## 📋 運用フロー

### 🔄 日常開発フロー

1. **機能開発**
   ```powershell
   # 開発環境起動
   pnpm dev
   
   # Document AI機能テスト
   # UI確認
   # 単体テスト
   ```

2. **ステージング確認**
   ```powershell
   # ブランチ作成・プッシュ
   git checkout -b feature/new-feature
   git push origin feature/new-feature
   
   # プレビューURL確認
   # 本番同様の動作確認
   ```

3. **本番デプロイ**
   ```powershell
   # メインブランチマージ
   git checkout main
   git merge feature/new-feature
   git push origin main
   
   # 本番自動デプロイ
   # 動作確認
   ```

### 🚨 緊急時対応フロー

#### Document AI障害時
```powershell
# 1. 障害確認
curl https://ai-financial-analyzer-backend.run.app/api/pdf-engine/availability

# 2. pdf-parseモード強制切り替え
curl -X PUT https://ai-financial-analyzer-backend.run.app/api/pdf-engine/config \
  -H "Content-Type: application/json" \
  -d '{"engine": "pdf-parse", "documentAIEnabled": false}'

# 3. 動作確認
# 4. 障害復旧後、設定戻し
```

#### パフォーマンス問題時
```powershell
# 1. 処理モード確認
# 2. ファイルサイズ制限調整
# 3. タイムアウト設定調整
```

### 📊 定期運用タスク

#### 週次確認
- [ ] 開発環境動作確認
- [ ] Document AI使用量確認
- [ ] パフォーマンス指標確認

#### 月次確認
- [ ] コスト分析
- [ ] セキュリティ更新
- [ ] 依存関係更新

### 🎯 運用のベストプラクティス

1. **環境の分離**
   - 開発：自由なテスト環境
   - ステージング：本番同様の確認環境
   - 本番：安定した顧客提供環境

2. **コスト最適化**
   - 開発：Document AI使用
   - 本番：pdf-parse優先
   - 必要時のみ高性能モード

3. **安定性確保**
   - フォールバック機能
   - エラーハンドリング
   - ログ監視

4. **セキュリティ**
   - 認証情報管理
   - HTTPS通信
   - 定期的な更新

この運用ガイドラインに従うことで、**開発効率と本番安定性を両立**できます。 
# 財務レポートアナライザー - デプロイガイド

## 🚀 **クイックデプロイ（推奨）**

### **前提条件**
- Google Cloud Platform アカウント
- Vercel アカウント
- Git リポジトリ（GitHub/GitLab）

### **1. バックエンドデプロイ（GCP Cloud Run）**

#### **Step 1: GCPプロジェクト設定**
```bash
# GCP CLIインストール後
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 必要なAPIを有効化
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable documentai.googleapis.com
```

#### **Step 2: 環境変数設定**
```bash
# Secret Managerに環境変数を保存
gcloud secrets create gemini-api-key --data-file=- <<< "YOUR_GEMINI_API_KEY"
gcloud secrets create document-ai-processor-id --data-file=- <<< "YOUR_PROCESSOR_ID"
gcloud secrets create google-application-credentials --data-file=path/to/service-account.json
```

#### **Step 3: デプロイ実行**
```bash
# リポジトリをクローン
git clone YOUR_REPOSITORY_URL
cd ai-financial-analyzer

# Cloud Buildでデプロイ
gcloud builds submit --config cloudbuild.yaml
```

#### **Step 4: 環境変数をCloud Runに設定**
```bash
gcloud run services update ai-financial-analyzer-backend \
  --set-env-vars="GEMINI_API_KEY=YOUR_GEMINI_API_KEY" \
  --set-env-vars="DOCUMENT_AI_PROCESSOR_ID=YOUR_PROCESSOR_ID" \
  --set-env-vars="GOOGLE_APPLICATION_CREDENTIALS=/app/service-account.json" \
  --region=asia-northeast1
```

### **2. フロントエンドデプロイ（Vercel）**

#### **Step 1: Vercelプロジェクト作成**
1. [Vercel](https://vercel.com) にログイン
2. 「New Project」をクリック
3. GitHubリポジトリを選択
4. Root Directory を `apps/frontend` に設定

#### **Step 2: 環境変数設定**
Vercelダッシュボードで以下を設定：
```
VITE_API_URL = https://YOUR_CLOUD_RUN_URL
```

#### **Step 3: デプロイ設定**
- Build Command: `pnpm build`
- Output Directory: `dist`
- Install Command: `pnpm install`

## 🔧 **設定詳細**

### **必要な環境変数**

#### **バックエンド（Cloud Run）**
```env
# 必須
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=production
PORT=8080

# Document AI使用時（オプション）
DOCUMENT_AI_PROCESSOR_ID=your_processor_id_here
GOOGLE_APPLICATION_CREDENTIALS=/app/service-account.json
GOOGLE_CLOUD_PROJECT=your_project_id
DOCUMENT_AI_LOCATION=us
```

#### **フロントエンド（Vercel）**
```env
VITE_API_URL=https://your-backend-url.run.app
```

### **Document AI設定（高精度モード用）**

#### **Step 1: Document AIプロセッサ作成**
```bash
# Document AIプロセッサを作成
gcloud documentai processors create \
  --location=us \
  --display-name="Financial Report Processor" \
  --type=FORM_PARSER_PROCESSOR
```

#### **Step 2: サービスアカウント設定**
```bash
# サービスアカウント作成
gcloud iam service-accounts create document-ai-service

# 権限付与
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:document-ai-service@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/documentai.apiUser"

# キーファイル作成
gcloud iam service-accounts keys create service-account.json \
  --iam-account=document-ai-service@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## 💰 **コスト見積もり**

### **基本構成（通常モードのみ）**
- **Cloud Run**: 月額 500-2,000円
- **Vercel**: 無料（Hobbyプラン）
- **合計**: 月額 500-2,000円

### **高精度構成（Document AI含む）**
- **基本構成**: 月額 500-2,000円
- **Document AI**: 1,000ページあたり 3,000円
- **合計**: 利用量による（小規模なら月額 3,000-5,000円）

## 🔄 **運用・監視**

### **ログ確認**
```bash
# Cloud Runログ
gcloud logs read --service=ai-financial-analyzer-backend

# リアルタイム監視
gcloud logs tail --service=ai-financial-analyzer-backend
```

### **スケーリング設定**
```bash
# 最大インスタンス数設定
gcloud run services update ai-financial-analyzer-backend \
  --max-instances=10 \
  --region=asia-northeast1

# メモリ・CPU設定
gcloud run services update ai-financial-analyzer-backend \
  --memory=2Gi \
  --cpu=2 \
  --region=asia-northeast1
```

### **エンジン切り替え**
アプリケーション内の「PDFエンジン設定」から：
- **通常モード**: 高速・低コスト
- **高性能モード**: 高精度・高コスト

## 🛠 **トラブルシューティング**

### **よくある問題**

#### **1. Document AI エラー**
```
Error: Document pages exceed the limit: 30 got 34
```
**解決策**: 30ページ以下のPDFを使用するか、通常モードに切り替え

#### **2. メモリ不足エラー**
```
Error: JavaScript heap out of memory
```
**解決策**: Cloud Runのメモリを4Giに増加

#### **3. CORS エラー**
```
Access to fetch at 'https://...' from origin 'https://...' has been blocked
```
**解決策**: バックエンドのCORS設定を確認

### **サポート連絡先**
- 技術サポート: support@example.com
- 緊急時対応: emergency@example.com

## 📊 **パフォーマンス最適化**

### **推奨設定**
```yaml
# Cloud Run 設定
resources:
  limits:
    memory: "2Gi"
    cpu: "2"
  requests:
    memory: "1Gi"
    cpu: "1"

# オートスケーリング
scaling:
  minInstances: 0
  maxInstances: 10
```

### **監視メトリクス**
- レスポンス時間: < 30秒
- エラー率: < 1%
- 可用性: > 99.9% 
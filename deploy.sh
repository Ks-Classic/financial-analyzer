#!/bin/bash

# 財務レポートアナライザー - デプロイスクリプト

set -e

echo "🚀 財務レポートアナライザーのデプロイを開始します..."

# 環境変数チェック
if [ -z "$PROJECT_ID" ]; then
    echo "❌ エラー: PROJECT_ID環境変数が設定されていません"
    echo "   export PROJECT_ID=your-gcp-project-id を実行してください"
    exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ エラー: GEMINI_API_KEY環境変数が設定されていません"
    echo "   export GEMINI_API_KEY=your-api-key を実行してください"
    exit 1
fi

echo "✅ 環境変数チェック完了"

# GCPプロジェクト設定
echo "🔧 GCPプロジェクトを設定中..."
gcloud config set project $PROJECT_ID

# 必要なAPIを有効化
echo "🔧 必要なAPIを有効化中..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable documentai.googleapis.com

# Docker イメージをビルド・デプロイ
echo "🏗️  バックエンドをビルド・デプロイ中..."
gcloud builds submit --config cloudbuild.yaml

# 環境変数を設定
echo "🔧 環境変数を設定中..."
gcloud run services update ai-financial-analyzer-backend \
  --set-env-vars="GEMINI_API_KEY=$GEMINI_API_KEY" \
  --set-env-vars="NODE_ENV=production" \
  --region=asia-northeast1

# Document AI設定（オプション）
if [ ! -z "$DOCUMENT_AI_PROCESSOR_ID" ]; then
    echo "🔧 Document AI設定を追加中..."
    gcloud run services update ai-financial-analyzer-backend \
      --set-env-vars="DOCUMENT_AI_PROCESSOR_ID=$DOCUMENT_AI_PROCESSOR_ID" \
      --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
      --set-env-vars="DOCUMENT_AI_LOCATION=us" \
      --region=asia-northeast1
fi

# デプロイ完了
echo "✅ バックエンドのデプロイが完了しました！"

# Cloud Run URLを取得
BACKEND_URL=$(gcloud run services describe ai-financial-analyzer-backend --region=asia-northeast1 --format="value(status.url)")
echo "🌐 バックエンドURL: $BACKEND_URL"

echo ""
echo "📋 次のステップ:"
echo "1. Vercelでフロントエンドをデプロイ"
echo "2. Vercelの環境変数に以下を設定:"
echo "   VITE_API_URL=$BACKEND_URL"
echo ""
echo "🎉 デプロイ完了！" 
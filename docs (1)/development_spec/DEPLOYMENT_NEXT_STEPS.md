# AI財務レポートアナライザー - デプロイ次のステップ

## 現在の状況

### ✅ 完了済み
1. **バックエンドのCloud Runデプロイ**
   - URL: https://ai-financial-analyzer-backend-sjeqewp5lq-an.a.run.app
   - Secret Manager経由で環境変数設定済み
   - Document AI、Gemini APIの設定済み

2. **Vercelプロジェクトの作成**
   - プロジェクト名: financial-analyzer
   - URL: https://financial-analyzer-8y10sa2wr-ks-classic.vercel.app
   - **エラー**: ワークスペース依存関係 `@repo/types` が解決できない

### 🔄 残りのタスク

## 0. Vercelビルド設定修正（最優先）

### 問題の原因
Vercelがmonorepo構造を認識できず、`@repo/types` パッケージが見つからない

### 解決手順

1. [Vercelダッシュボード](https://vercel.com/ks-classic/financial-analyzer) → **Settings** → **General**
2. **Build & Development Settings** で以下のように設定：

| 設定項目 | 現在の設定 | 修正後 | 説明 |
|---------|-----------|-------|------|
| **Root Directory** | `apps/frontend` | `.` (空白またはドット) | プロジェクトルートに設定 |
| **Framework Preset** | Vite | Other | カスタムビルドコマンドを使用 |
| **Build Command** | `pnpm build` | `pnpm --filter @repo/frontend build` | フロントエンドのみビルド |
| **Output Directory** | `dist` | `apps/frontend/dist` | 正しい出力パス |
| **Install Command** | `pnpm install` | `pnpm install` | 変更なし |
| **Development Command** | 空白 | `pnpm --filter @repo/frontend dev` | 開発サーバー起動 |

## 1. Vercel環境変数の設定

**Settings** → **Environment Variables** で追加：
- **変数名**: `VITE_API_URL`
- **値**: `https://ai-financial-analyzer-backend-sjeqewp5lq-an.a.run.app`
- **環境**: Production, Preview, Development すべてにチェック

## 2. Firestore設定

1. [Firebase Console](https://console.firebase.google.com)でプロジェクトを開く
2. Firestore Databaseを作成（まだの場合）
3. セキュリティルールを設定：
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // バックエンドからのみアクセス可能
    match /analysisResults/{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 3. 動作確認

1. フロントエンドURL: https://financial-analyzer-8y10sa2wr-ks-classic.vercel.app
2. PDFファイルをアップロード
3. 分析が正常に動作することを確認
4. エラーがある場合は、ブラウザのコンソールを確認

## 4. トラブルシューティング

### ワークスペース依存関係エラー
- **原因**: Vercelが `@repo/types` を見つけられない
- **解決**: Root Directoryをプロジェクトルート (`.`) に設定
- **確認**: Build Commandが `pnpm --filter @repo/frontend build` になっているか

### CORSエラーが発生する場合
- Cloud Runのサービス設定でCORSを許可
- バックエンドのCORS設定を確認

### 環境変数が反映されない場合
- Vercelで再デプロイを実行
- ブラウザのキャッシュをクリア

## 5. 本番環境のチェックリスト

- [ ] Vercelビルド設定が正しく構成されている
- [ ] フロントエンドからバックエンドAPIに接続できる
- [ ] PDFアップロードが正常に動作する
- [ ] 分析結果が正しく表示される
- [ ] エクスポート機能が動作する
- [ ] エラーハンドリングが適切に機能する
- [ ] 大容量PDF（30ページ以上）で動作確認

## 連絡先・リソース

- Cloud Runコンソール: https://console.cloud.google.com/run
- Vercelダッシュボード: https://vercel.com/ks-classic/financial-analyzer
- Firebase Console: https://console.firebase.google.com
- プロジェクトID: liberate-report-check 
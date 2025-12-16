### **開発仕様設計書：AI財務レポートアナライザー**
### **（改訂版：PDFエクスポート機能のアーキテクチャ刷新とCI/CDプロセスの完全自動化）**

**改訂履歴**
| 版 | 日付 | 作成者 | 変更内容 |
| :--- | :--- | :--- | :--- |
| 2.0 | 2025/07/21 | Gemini | PDFエクスポート機能のアーキテクチャをマイクロサービス化し、CI/CDプロセスをBuildpacksによる自動化に移行する根本的改修 |
| 1.0 | (初期版) | - | (初期開発) |

---

### **1. プロジェクト概要**

#### **1.1. 目的と背景**
本プロジェクト「AI財務レポートアナライザー」は、アップロードされた財務レポート（PDF形式）をAIが分析し、数値の妥当性、傾向、事実誤認などを自動的に検出・指摘することを目的とする。これにより、財務分析業務の効率化と精度向上を実現する。

当初、分析結果をPDF形式でエクスポートする機能は、メインのバックエンドアプリケーション内にブラウザエンジン（Puppeteer）を同梱する形で実装された。しかし、このアーキテクチャはコンテナ環境との深刻な非互換性を引き起こし、5日以上にわたるデプロイ失敗の連鎖を招いた。

本改訂の目的は、この不安定なPDFエクスポート機能を、**安定的かつ保守性の高いマイクロサービスアーキテクチャへと刷新**し、同時に、失敗の根本原因であった**手動のCI/CDプロセスを、Google Cloud推奨の「Buildpacks」による完全自動化に移行**することで、プロジェクト全体の信頼性と開発者体験を抜本的に改善することである。

#### **1.2. 全体アーキテクチャ図 (To-Be)**

本改修によって実現される最終的なシステムアーキテクチャは以下の通りである。

```
+----------------------------------+
|                                  |
|   ユーザー (Webブラウザ)         |
|                                  |
+----------------+-----------------+
                 | (HTTPS)
                 v
+----------------------------------+
| Frontend (Vercel)                |
| (React / Vite)                   |
| - UI/UXの提供                    |
| - バックエンドへのAPIリクエスト  |
+----------------+-----------------+
                 | (HTTPS API Call)
                 v
+----------------------------------+     (Secure HTTP Call)     +-----------------------------+
| Backend (Cloud Run)              | -------------------------> | PDF Generator (Cloud Function)|
| (Node.js / Express)              |                            | (Node.js / Playwright)      |
| - PDFアップロード受付            |     (HTMLコンテンツ)       | - HTMLを受け取りPDFを生成     |
| - Document AI連携によるテキスト抽出|                            |                             |
| - Gemini API連携による財務分析   |     (生成されたPDF)        |                             |
| - 分析結果のJSON提供             | <------------------------- |                             |
| - PDF生成サービス呼び出し        |                            +-----------------------------+
+----------------------------------+

[CI/CDプロセス]
(開発者のGit Push)
       |
       v
[GitHub Repository]
       | (Webhook)
       v
+----------------------------------+
| Google Cloud Build               |
| - (cloudbuild.yamlは不要)        |
| - ソースコードを直接取得         |
| - Buildpacksがコンテナを自動構築 |
| - Cloud Runへ自動デプロイ        |
+----------------------------------+
```

---

### **2. 機能仕様**

#### **2.1. コア機能（変更なし）**
*   **PDFアップロード機能:** ユーザーはフロントエンドから財務レポートのPDFファイルをアップロードできる。
*   **AI分析機能:** バックエンドは、アップロードされたPDFをGoogle Document AIでテキスト化し、その内容をGoogle Gemini APIに送信して分析を実行する。
*   **分析結果表示機能:** フロントエンドは、バックエンドから分析結果（JSON形式）を受け取り、画面上に分かりやすく表示する。

#### **2.2. PDFエクスポート機能（本改修の対象）**
*   **ユーザー操作:** ユーザーはフロントエンドの「PDFエクスポート」ボタンをクリックする。
*   **フロントエンドの動作:**
    1.  現在の分析結果（JSON）をバックエンドの`/api/export`エンドポイントにPOSTリクエストで送信する。
*   **バックエンドの動作:**
    1.  リクエストを受け取ると、`pdf-export.service.ts`が呼び出される。
    2.  サービスは、受け取った分析結果（JSON）を基に、レポート用の**HTML文字列を動的に生成**する。
    3.  生成したHTML文字列をリクエストボディに含め、**PDF生成Cloud Function**のエンドポイントURLに対して、セキュアなHTTP POSTリクエストを送信する。
    4.  Cloud Functionから返却されたPDFのバイナリデータを受け取る。
    5.  受け取ったPDFデータを、そのままHTTPレスポンスとしてフロントエンドに返す。
*   **PDF生成Cloud Functionの動作:**
    1.  HTTP POSTリクエストでHTML文字列を受け取る。
    2.  Playwrightとサーバーレス用Chromiumを起動する。
    3.  受け取ったHTMLをレンダリングし、A4サイズのPDFを生成する。
    4.  生成したPDFのバイナリデータをHTTPレスポンスとして返す。

---

### **3. 設計**

#### **3.1. サービス境界の再定義**
*   **Backend (`apps/backend`):**
    *   **責務:** ビジネスロジック（分析、外部AI連携）、APIの提供、HTMLの生成。
    *   **非責務:** PDFのレンダリング、ブラウザエンジンの管理。
*   **PDF Generator (`apps/pdf-generator`):**
    *   **責務:** HTMLを受け取り、PDFを生成すること。ただそれだけ。
    *   **非責務:** ビジネスロジック、分析内容の解釈。

#### **3.2. CI/CD設計：Buildpacksによる「Dockerfileレス」運用**
*   **ビルドプロセス:**
    *   `Dockerfile`は使用しない。
    *   `gcloud run deploy`コマンドがソースコードをGCPにアップロードすると、Buildpacksが`package.json`を検知し、自動的に以下の処理を実行する。
        1.  適切なNode.jsバージョンを選択。
        2.  `npm install`を実行し、`dependencies`をインストール。
        3.  `package.json`の`scripts.build`があれば実行（`tsc`によるコンパイル）。
        4.  `package.json`の`scripts.start`（`node dist/server.js`）を本番起動コマンドとして設定した、最適化済みのコンテナイメージを生成。
*   **デプロイプロセス:**
    *   `cloudbuild.yaml`は使用しない。
    *   デプロイは、ローカル環境またはCIスクリプトから、以下の単一の`gcloud`コマンドによって実行される。

---

### **4. 実行計画 (Plan of Action)**

**フェーズ1：プロジェクトの完全な単純化**
1.  **`Dockerfile`の完全撤去:**
    *   `rm apps/backend/Dockerfile` を実行する。
2.  **`cloudbuild.yaml`の完全撤去:**
    *   `rm cloudbuild.yaml` を実行する。

**フェーズ2：バックエンドサービスの最終準備**
1.  **`package.json`の確認:**
    *   `apps/backend/package.json`を開き、`scripts.start`が`"node dist/server.js"`になっていることを確認する。
2.  **`pdf-export.service.ts`の確認:**
    *   `apps/backend/src/services/pdf-export.service.ts`を開き、`PDF_GENERATOR_URL`（`https://pdf-generator-sjeqewp5lq-an.a.run.app`）を正しく呼び出していることを確認する。

**フェーズ3：Buildpacksによる最終デプロイ**
1.  **デプロイコマンドの実行:**
    *   以下のコマンドを、**プロジェクトのルートディレクトリから**実行する。
    ```shell
    gcloud run deploy ai-financial-analyzer-backend \
      --source=apps/backend \
      --platform=managed \
      --region=asia-northeast1 \
      --allow-unauthenticated \
      --port=8080 \
      --memory=2Gi \
      --cpu=2 \
      --max-instances=10 \
      --timeout=3600 \
      --set-env-vars=NODE_ENV=production,GOOGLE_CLOUD_PROJECT=liberate-report-check,DOCUMENT_AI_LOCATION=us,PDF_GENERATOR_URL=https://pdf-generator-sjeqewp5lq-an.a.run.app \
      --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest,DOCUMENT_AI_PROCESSOR_ID=DOCUMENT_AI_PROCESSOR_ID:latest,GOOGLE_APPLICATION_CREDENTIALS=google-application-credentials:latest
    ```

**フェーズ4：動作確認**
1.  デプロイが成功したCloud RunのURLにアクセスし、フロントエンドからPDFエクスポート機能を実行する。
2.  エラーが発生せず、PDFファイルが正常にダウンロードされることを確認する。

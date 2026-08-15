# ドキュメント

このディレクトリには、プロジェクトに追加した設定ファイルやディレクトリの説明をまとめています。

## 目次

- [認証・認可](./authentication.md) — Cognito、`<Authenticator>`、`allow.owner()` による認可
- [Amplify デプロイ設定](./amplify-deployment.md) — `amplify.yml`、Amplify バックエンド定義
- [Amplify Data モデル](./amplify-data-model.md) — `amplify/data/resource.ts` のスキーマ・認可ルール
- [Amplify Functions（Lambda）](./amplify-functions.md) — `amplify/function/` の Lambda 定義、AppSync カスタムクエリとの紐付け
- [Bedrock チャット機能](./bedrock-chat.md) — Bedrock Converse API の呼び出し、IAM 権限の付与（CDK エスケープハッチ）
- [フロントエンドと Bedrock の接続](./frontend-bedrock-integration.md) — `generateClient`、チャット画面の状態設計、ローディング・エラー処理
- [Amplify Sandbox（ローカル開発）](./amplify-sandbox.md) — `npx ampx sandbox`、データ永続性、チーム開発
- [開発ツール設定](./development-tooling.md) — Prettier、ESLint、Husky、lint-staged、Vitest、git-secrets
- [フロントエンドライブラリ](./frontend-libraries.md) — Tailwind CSS、tailwind-merge、React Router
- [pnpm 設定](./pnpm-setup.md) — パッケージマネージャー関連の設定、esbuild のトラブルシューティング

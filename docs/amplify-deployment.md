# Amplify デプロイ設定

AWS Amplify Hosting へのデプロイに関するファイルの説明です。

## `amplify.yml`

Amplify の CI/CD パイプラインを定義するビルド仕様ファイルです。リポジトリ直下に置くと、Amplify コンソールの設定より優先されます。

### backend フェーズ

| フェーズ | コマンド                                                             | 説明                                     |
| -------- | -------------------------------------------------------------------- | ---------------------------------------- |
| preBuild | `corepack enable`                                                    | Node.js 同梱の corepack で pnpm を有効化 |
| preBuild | `pnpm install`                                                       | 依存関係をインストール                   |
| build    | `npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID` | Amplify Gen 2 バックエンドをデプロイ     |

`$AWS_BRANCH` と `$AWS_APP_ID` は Amplify のビルド環境から自動注入される環境変数です。

### frontend フェーズ

| フェーズ | コマンド          | 説明                                              |
| -------- | ----------------- | ------------------------------------------------- |
| preBuild | `corepack enable` | pnpm を有効化                                     |
| preBuild | `pnpm install`    | 依存関係をインストール                            |
| build    | `pnpm run build`  | Vite でフロントエンドをビルド（成果物は `dist/`） |

### artifacts

ビルド成果物の配信元を指定します。

- `baseDirectory: dist` — Vite のデフォルト出力先
- `files: '**/*'` — `dist/` 配下のすべてのファイルを配信

### cache

- `$(pnpm store path)` — pnpm のグローバルストアをキャッシュし、2回目以降の `pnpm install` を高速化

---

## `amplify/` ディレクトリ

Amplify Gen 2 のバックエンド定義をコードで管理するディレクトリです。

### `amplify/backend.ts`

バックエンドのエントリーポイントです。利用するリソース（認証、API、データベースなど）をまとめて定義します。

```typescript
import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'

export const backend = defineBackend({
  auth,
  data,
})
```

`data` を追加すると、`amplify/data/resource.ts` で定義したデータモデルが AppSync（GraphQL API）+ DynamoDB として同時にデプロイされます。

### `amplify/auth/resource.ts`

Cognito ベースの認証リソース定義です。

```typescript
import { defineAuth } from '@aws-amplify/backend'

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
})
```

現在はメールアドレスによるログインのみ有効です。ソーシャルログインや MFA などはここに追加します。

ローカルで Cognito 環境を構築する手順は [Amplify Sandbox（ローカル開発）](./amplify-sandbox.md) を参照してください。

### `amplify/data/resource.ts`

Amplify Data（AppSync + DynamoDB）のスキーマ定義です。TypeScript の `a.schema()` で GraphQL スキーマ相当のモデルを宣言します。

詳細は [Amplify Data モデル](./amplify-data-model.md) を参照してください。

---

## `.npmrc`

Amplify のビルドイメージ上で pnpm を正しく動作させるための設定です。

```
node-linker=hoisted
```

pnpm のデフォルトはシンボリックリンクベースのインストールですが、Amplify のビルド環境では問題を起こすことがあります。`hoisted` にすることで npm と同様に `node_modules` へ直接パッケージを配置します。

---

## `.gitignore`（Amplify 関連の追加分）

```
# Amplify
.amplify
amplify_outputs.json
/amplify_output.json
```

| ファイル/ディレクトリ  | 説明                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `.amplify/`            | ローカル sandbox 環境の一時ファイル                                      |
| `amplify_outputs.json` | sandbox / デプロイ後に生成されるバックエンド設定（フロントエンド接続用） |
| `amplify_output.json`  | 旧形式の出力ファイル（存在する場合）                                     |

これらは環境ごとに変わるため、リポジトリには含めません。

# Amplify Functions（Lambda）と AppSync の紐付け

`amplify/function/` 配下で定義した Lambda 関数を、`amplify/data/resource.ts` のカスタムクエリのハンドラとして AppSync に紐付ける手順の説明です。

Amplify Gen 2 では、Lambda 関数を **TypeScript のコードとして定義** すると、デプロイ時に esbuild でバンドルされ、CDK 経由で Lambda 関数・IAM ロール・AppSync のデータソース／リゾルバーが自動生成されます。コンソールでの手作業は一切不要です。

## 全体の流れ

```
amplify/function/helloWorld/resource.ts   ← ① 関数の定義（ランタイム・エントリポイント）
amplify/function/helloWorld/handler.ts    ← ② 実処理（型は data/resource.ts から逆輸入）
amplify/data/resource.ts                  ← ③ AppSync のカスタムクエリと紐付け
amplify/backend.ts                        ← ④ バックエンドへ登録
```

型の流れが循環しているように見えますが、`handler.ts` が参照するのは `Schema` の **型のみ**（`import type`）なので、実行時の循環依存は発生しません。

## ① 関数の定義 — `amplify/function/helloWorld/resource.ts`

```typescript
import { defineFunction } from '@aws-amplify/backend'

export const helloWorldFunction = defineFunction({
  runtime: 22,
  name: 'hello-world',
  entry: './handler.ts',
})
```

| プロパティ | 説明                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `runtime`  | Node.js のメジャーバージョン。`22` は `nodejs22.x` を意味します。省略時は Amplify の既定値                   |
| `name`     | 生成される Lambda 関数名のベース。省略するとディレクトリ名が使われる。実際の関数名には環境識別子が付与される |
| `entry`    | ハンドラのパス。**`resource.ts` からの相対パス** で指定する                                                  |

その他、必要に応じて指定できる主なオプション：

- `timeoutSeconds` — 既定 3 秒。外部 API 呼び出しなどがある場合は延長する
- `memoryMB` — 既定 512MB
- `environment` — 環境変数（値はデプロイ時に注入される）
- `schedule` — cron / rate 式による定期実行

## ② ハンドラの実装 — `amplify/function/helloWorld/handler.ts`

```typescript
import type { Schema } from '../../data/resource'

export const handler: Schema['HelloWorld']['functionHandler'] = async () => {
  return 'Hello, world!'
}
```

`Schema['HelloWorld']['functionHandler']` を型注釈に使うことで、**スキーマ定義（引数・戻り値）とハンドラの実装が型レベルで同期** します。

- スキーマ側で `.returns(a.string())` としているので、戻り値は `string` に限定される
- 引数を追加した場合（`.arguments({ name: a.string() })`）、`event.arguments.name` が型付きで参照できる

`@types/aws-lambda` を devDependency ではなく dependency として追加していますが、これは Amplify のビルド時に型解決が必要になるためです。

## ③ AppSync との紐付け — `amplify/data/resource.ts`

```typescript
import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { helloWorldFunction } from '../function/helloWorld/resource'

const schema = a.schema({
  // ... Message, Conversation ...

  HelloWorld: a
    .query()
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()]) // 認証されたユーザーからのアクセスを許可
    .handler(a.handler.function(helloWorldFunction)), // helloWorldFunctionをハンドラとして指定
})
```

| メソッド                            | 役割                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `a.query()`                         | 読み取り系のカスタム操作。副作用のある処理は `a.mutation()` を使う                  |
| `.returns(a.string())`              | GraphQL の戻り値型。`a.ref('Message')` のようにモデル参照や `.array()` も指定できる |
| `.authorization()`                  | この操作を呼べる主体。ここでは Cognito で認証済みのユーザーのみ                     |
| `.handler(a.handler.function(...))` | 解決処理を Lambda に委譲する。ここで AppSync のデータソースとリゾルバーが生成される |

### 認可について

`allow.authenticated()` は「サインイン済みなら誰でも呼べる」という意味です。モデルで使っている `allow.owner()` はレコード所有者に限定する仕組みなので、レコードを持たないカスタムクエリでは使えません。より絞り込みたい場合は `allow.groups(['admin'])` などを使います。詳細は [認証・認可](./authentication.md) を参照してください。

Lambda 側から Data API を呼び返したい場合は、スキーマに `.authorization((allow) => [allow.resource(helloWorldFunction)])` を追加し、ハンドラで Amplify のデータクライアントを生成する必要があります（今回は未実施）。

## ④ バックエンドへの登録 — `amplify/backend.ts`

```typescript
import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { helloWorldFunction } from './function/helloWorld/resource'

export const backend = defineBackend({
  auth,
  data,
  helloWorldFunction,
})
```

`defineBackend` に渡して初めて CloudFormation スタックに含まれます。`data` から参照しているだけでは **デプロイされません**。

## pnpm の設定変更

```yaml
allowBuilds:
  '@parcel/watcher': true
  aws-sdk: false
  core-js: false
  esbuild: true
```

Lambda 関連の依存を入れた際に `aws-sdk`（v2）が推移的依存として現れ、pnpm v10 の install スクリプト承認待ちになったため、明示的に `false`（スクリプト実行不要）を指定しています。`allowBuilds` の仕組みそのものは [pnpm 設定](./pnpm-setup.md) を参照してください。

## 動作確認

### ローカル（Sandbox）

```bash
npx ampx sandbox
```

`amplify/` 配下の変更を検知して自動デプロイされます。Lambda のコードを書き換えた場合も、差分デプロイで数十秒で反映されます。詳細は [Amplify Sandbox](./amplify-sandbox.md) を参照してください。

### フロントエンドからの呼び出し

生成された `amplify_outputs.json` を使ってクライアントを作ると、カスタムクエリは `client.queries.<操作名>` に生えます。

```typescript
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const client = generateClient<Schema>()

const { data, errors } = await client.queries.HelloWorld()
// data: string | null
```

`errors` は必ずチェックしてください。AppSync は認可エラーやハンドラ内の例外を HTTP 200 で返し、`errors` 配列に格納します（例外がスローされるわけではありません）。

### AWS コンソールでの確認

- **Lambda** — `hello-world` を含む名前の関数が作成される。テストイベントは空 JSON `{}` でよい
- **AppSync** — 対象 API の「クエリ」に `HelloWorld` が追加され、データソースが Lambda になっている
- **CloudWatch Logs** — `/aws/lambda/<関数名>` にハンドラの `console.log` が出力される

## つまずきやすいポイント

| 症状                                               | 原因と対処                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Schema['HelloWorld']` が型エラーになる            | `data/resource.ts` にカスタムクエリを追加する前にハンドラを書いている。③ を先に済ませる |
| デプロイしても Lambda が作られない                 | `backend.ts` の `defineBackend` に渡していない（④）                                     |
| 呼び出し時に `Not Authorized to access HelloWorld` | `.authorization()` の指定漏れ、またはサインインしていない状態で呼んでいる               |
| `entry` のパス解決に失敗する                       | `entry` は `resource.ts` からの相対パス。プロジェクトルートからの相対パスではない       |
| 実行時に循環参照エラーが出る                       | `handler.ts` の `import type` が値 import になっている。必ず `import type` にする       |

## 関連ドキュメント

- [Bedrock チャット機能](./bedrock-chat.md) — 本手順の応用例（引数付きクエリ、外部 SDK、IAM 権限追加）
- [Amplify Data モデル](./amplify-data-model.md) — スキーマとモデルの定義
- [認証・認可](./authentication.md) — Cognito と認可ルール
- [Amplify Sandbox](./amplify-sandbox.md) — ローカル開発環境
- [Amplify デプロイ設定](./amplify-deployment.md) — CI/CD でのビルド

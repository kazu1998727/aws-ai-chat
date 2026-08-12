# Bedrock チャット機能（`BedrockChat` カスタムクエリ）

Amazon Bedrock の LLM を呼び出す Lambda 関数 `bedrockChatFunction` と、それを AppSync のカスタムクエリ `BedrockChat` として公開する構成の説明です。

Lambda と AppSync の紐付けの基本形は [Amplify Functions（Lambda）](./amplify-functions.md) と同じです。本ドキュメントでは **Bedrock 固有の部分**（SDK の使い方、IAM 権限の付与、モデル ID の扱い）に絞って説明します。

## 追加・変更したファイル

```
amplify/function/bedrockChat/resource.ts   ← ① 関数定義（タイムアウト 300 秒）
amplify/function/bedrockChat/handler.ts    ← ② Bedrock Converse API の呼び出し
amplify/data/resource.ts                   ← ③ 引数付きカスタムクエリの定義
amplify/backend.ts                         ← ④ 登録 + IAM ポリシーの追加（CDK エスケープハッチ）
package.json                               ← ⑤ Bedrock SDK・CDK 依存の追加
```

## ① 関数定義 — `amplify/function/bedrockChat/resource.ts`

```typescript
import { defineFunction } from '@aws-amplify/backend'

export const bedrockChatFunction = defineFunction({
  entry: './handler.ts',
  name: 'bedrock-chat',
  runtime: 22,
  timeoutSeconds: 300,
})
```

`helloWorld` との違いは `timeoutSeconds: 300` です。LLM の推論は既定の 3 秒では確実にタイムアウトするため延長しています。

> **注意**: AppSync 側のリゾルバーには **30 秒** の上限があります。Lambda を 300 秒に設定しても、同期クエリとして呼ぶ限り 30 秒を超えた時点でクライアントにはタイムアウトが返ります。長文生成を扱う場合は、ストリーミング（`ConverseStream`）＋ サブスクリプション、または非同期ジョブ化を検討する必要があります。現状は 30 秒以内に収まる想定です。

## ② ハンドラ — `amplify/function/bedrockChat/handler.ts`

```typescript
import type { Schema } from '../../data/resource'
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandInput,
} from '@aws-sdk/client-bedrock-runtime'

const client = new BedrockRuntimeClient()

const SYSTEMPROMPT = 'You are the best teacher in the world.'

export const handler: Schema['BedrockChat']['functionHandler'] = async (
  event,
) => {
  const prompt = event.arguments.prompt
  const modelId = event.arguments.modelId

  const input: ConverseCommandInput = {
    modelId: modelId,
    system: [{ text: SYSTEMPROMPT }],
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 1000,
      temperature: 0.5,
    },
  }

  const command = new ConverseCommand(input)
  const response = await client.send(command)
  return response.output?.message?.content?.[0]?.text || ''
}
```

### ポイント

**クライアントをハンドラの外で生成している**
`BedrockRuntimeClient` はモジュールスコープで一度だけ生成しています。Lambda の実行環境は再利用されるため、ウォームスタート時に接続やクレデンシャルの解決を使い回せます。ハンドラ内で毎回 `new` するとコールドスタート相当のオーバーヘッドが毎回発生します。

**認証情報とリージョンは明示していない**
SDK は Lambda 実行ロールの一時クレデンシャルと、環境変数 `AWS_REGION` を自動的に拾います。**アクセスキーをコードや環境変数に置く必要はありません**（置いてはいけません）。ただしリージョンが暗黙になる副作用として、関数がデプロイされたリージョンでそのモデルが有効化されていないと `AccessDeniedException` になります。

**Converse API を使っている**
`InvokeModel` はモデルごとにリクエスト JSON の形が違いますが、`Converse` は **モデル横断で統一されたインターフェース** を提供します。`modelId` を差し替えるだけで別モデルに切り替えられるのはこのためです。

**`inferenceConfig`**

| パラメータ    | 設定値 | 意味                                                               |
| ------------- | ------ | ------------------------------------------------------------------ |
| `maxTokens`   | 1000   | 生成する最大トークン数。上限に達すると途中で打ち切られる           |
| `temperature` | 0.5    | 出力のランダム性。0 に近いほど決定的、1 に近いほど多様（0.0〜1.0） |

**レスポンスの取り出し**
`response.output?.message?.content?.[0]?.text` はすべてオプショナルです。ツール使用やコンテンツフィルタにより `content[0]` がテキストブロックでない場合があるため、`|| ''` でフォールバックしています。

> 現状はテキストが取れなかった場合に空文字を返すため、クライアント側からは「正常に空応答が返った」ように見えます。原因切り分けのため、`response.stopReason` をログ出力しておくと運用時に役立ちます。

## ③ カスタムクエリの定義 — `amplify/data/resource.ts`

```typescript
BedrockChat: a
  .query()
  .arguments({
    prompt: a.string().required(),
    modelId: a.string().required(),
  })
  .returns(a.string())
  .authorization((allow) => [allow.authenticated()])
  .handler(a.handler.function(bedrockChatFunction)),
```

`helloWorld` と違い `.arguments()` を持ちます。ここで定義した引数が、

- GraphQL スキーマの引数（`bedrockChat(prompt: String!, modelId: String!)`）
- ハンドラの `event.arguments` の型
- フロントエンドの `client.queries.BedrockChat({ prompt, modelId })` の引数型

の 3 箇所に自動で反映されます。`.required()` を付けているので、未指定は AppSync のバリデーション段階で弾かれ、Lambda までは到達しません。

### `modelId` をクライアントから受け取ることについて

現状の設計では、**サインイン済みユーザーが任意のモデル ID を指定できます**。IAM ポリシー側も全 foundation model を許可しているため、利用者は意図しない（＝高価な）モデルを呼べます。

プロトタイプ段階では許容範囲ですが、本番運用に向けては次のいずれかが必要です。

- `modelId` を引数から外し、Lambda 側で定数または環境変数から決める
- 許可リストをハンドラ内で検証し、想定外の値はエラーにする
- IAM ポリシーの `resources` を、実際に使うモデルの ARN に限定する

## ④ IAM 権限の付与 — `amplify/backend.ts`

```typescript
import { bedrockChatFunction } from './function/bedrockChat/resource'
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam'

export const backend = defineBackend({
  auth,
  data,
  helloWorldFunction,
  bedrockChatFunction,
})

backend.bedrockChatFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      'arn:aws:bedrock:*::foundation-model/*',
      'arn:aws:bedrock:*:*:inference-profile/*',
      'arn:aws:bedrock:*:*:application-inference-profile/*',
    ],
  }),
)
```

### CDK エスケープハッチ

`defineFunction` は Bedrock 権限を宣言する手段を持たないため、`defineBackend` の戻り値から **生の CDK コンストラクトへ降りて** ポリシーを追加しています。これは Amplify Gen 2 が公式に提供している「エスケープハッチ」です。

`backend.<リソース名>.resources.<CDK オブジェクト>` の形でアクセスでき、ここでは `resources.lambda`（`IFunction`）の実行ロールに対して `addToRolePolicy()` を呼んでいます。**`defineBackend` の呼び出しより後** に書く必要があります。

### 3 つの ARN パターン

| ARN パターン                                          | 何を指すか                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `arn:aws:bedrock:*::foundation-model/*`               | 基盤モデル本体。アカウント ID 部分が空なのは AWS 所有のリソースだから（`:` が 2 連続） |
| `arn:aws:bedrock:*:*:inference-profile/*`             | クロスリージョン推論プロファイル（`apac.` / `us.` などのプレフィックス付きモデル ID）  |
| `arn:aws:bedrock:*:*:application-inference-profile/*` | コスト配分タグ用に自分で作成する推論プロファイル                                       |

推論プロファイル経由でモデルを呼ぶ場合、**プロファイルとその先の foundation model の両方** に権限が必要です。片方だけだと `AccessDeniedException` になるため、3 つとも指定しています。

現状はリージョンもモデルもワイルドカードです。使うモデルが固まったら ARN を絞り込むのが最小権限の原則に沿います。

## ⑤ 依存関係の追加 — `package.json`

```json
"dependencies": {
  "@aws-sdk/client-bedrock-runtime": "^3.1107.0"
},
"devDependencies": {
  "aws-cdk-lib": "2.263.0",
  "constructs": "10.8.1"
}
```

| パッケージ                        | 区分            | 理由                                                                                                 |
| --------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `@aws-sdk/client-bedrock-runtime` | dependencies    | ハンドラが実行時に使う。Amplify のビルド時に esbuild がバンドルするため、Lambda レイヤーの用意は不要 |
| `aws-cdk-lib`                     | devDependencies | `backend.ts` の `PolicyStatement` で使用。デプロイ時にのみ評価されるためランタイムには含まれない     |
| `constructs`                      | devDependencies | `aws-cdk-lib` のピア依存。バージョン不一致だと型エラーになるため明示的に入れている                   |

`aws-cdk-lib` と `constructs` は **キャレット（`^`）を付けずに固定** しています。CDK はマイナーバージョン間で型の非互換が起きることがあり、Amplify が内部で使う CDK と食い違うと `Construct` 型が別物と判定されてビルドが落ちるためです。

## 動作確認

### 前提: Bedrock のモデルアクセス有効化

コードをデプロイしても、**AWS アカウント側でモデルアクセスを有効にしていないと呼び出せません**。

1. AWS コンソール → Amazon Bedrock → 「モデルアクセス」
2. 使用したいモデルをリクエスト（Anthropic 製モデルは利用用途の入力が必要）
3. ステータスが「アクセスが付与されました」になるまで待つ

これは **リージョンごと** の設定です。Sandbox と本番でリージョンが違う場合は両方で有効化が必要です。

### 前提: `modelId` には推論プロファイル ID を使う

**実際に踏んだ問題**: AppSync のコンソールから素のモデル ID（例: `anthropic.claude-sonnet-4-5-20250929-v1:0`）を渡してもエラーになりました。**推論プロファイル ID を指定したところ成功** しました。

新しめのモデルはオンデマンド実行がサポートされず、**クロスリージョン推論プロファイル経由でしか呼び出せません**。そして、どのプロファイルが使えるかは **リージョンによって異なります**。推測で書かず、必ず実際のリージョンに問い合わせて確認してください。

```bash
aws bedrock list-inference-profiles --region ap-northeast-1
```

ID と名前だけを一覧したい場合:

```bash
aws bedrock list-inference-profiles --region ap-northeast-1 \
  --query 'inferenceProfileSummaries[].{id:inferenceProfileId,name:inferenceProfileName,status:status}' \
  --output table
```

`ap-northeast-1`（東京）での出力例（抜粋）:

```
apac.anthropic.claude-3-5-sonnet-20241022-v2:0     APAC Anthropic Claude 3.5 Sonnet v2   ACTIVE
jp.anthropic.claude-sonnet-4-5-20250929-v1:0       JP Anthropic Claude Sonnet 4.5        ACTIVE
jp.anthropic.claude-haiku-4-5-20251001-v1:0        JP Anthropic Claude Haiku 4.5         ACTIVE
global.anthropic.claude-sonnet-4-5-20250929-v1:0   Global Claude Sonnet 4.5              ACTIVE
apac.amazon.nova-pro-v1:0                          APAC Nova Pro                         ACTIVE
```

ここで得られた **`inferenceProfileId` の値をそのまま `modelId` に渡します**。

#### プレフィックスの意味

| プレフィックス | ルーティング範囲                 | 備考                                                             |
| -------------- | -------------------------------- | ---------------------------------------------------------------- |
| `jp.`          | 日本国内のリージョン             | データを日本国内に留めたい場合はこれ                             |
| `apac.`        | アジアパシフィックのリージョン間 | 東京・大阪・シンガポール・シドニー等に分散                       |
| `global.`      | 全世界のリージョン間             | 可用性・スループットは最も高いが、処理先リージョンは限定されない |
| `us.` / `eu.`  | 米国 / 欧州                      | 東京リージョンからは使えない                                     |

**注意**: `ap-northeast-1` で新しい Anthropic モデルを使う場合、`apac.` プレフィックスが存在するとは限りません。上記の一覧でも Claude Sonnet 4.5 は `jp.` と `global.` にはありますが `apac.` にはありません。**一覧に出た ID をそのままコピーする** のが確実です。

データの処理先リージョンに制約がある場合は `jp.` を選んでください。`global.` は処理が国外リージョンに振られる可能性があります。

### フロントエンドからの呼び出し

```typescript
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const client = generateClient<Schema>()

const { data, errors } = await client.queries.BedrockChat({
  prompt: '再帰関数を初心者向けに説明して',
  // list-inference-profiles で確認した inferenceProfileId をそのまま渡す
  modelId: 'jp.anthropic.claude-sonnet-4-5-20250929-v1:0',
})

if (errors) {
  console.error(errors)
}
console.log(data)
```

`modelId` に渡すのは **素のモデル ID ではなく推論プロファイル ID** です（前節参照）。使えるプロファイルはリージョン依存なので、値をハードコードする前に `aws bedrock list-inference-profiles` で必ず実在を確認してください。

### AppSync コンソールでの確認

AWS コンソール → AppSync → 対象 API → 「クエリ」から、デプロイ後すぐに動作確認できます。

```graphql
query {
  bedrockChat(
    prompt: "再帰関数を初心者向けに説明して"
    modelId: "jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
  )
}
```

`.authorization((allow) => [allow.authenticated()])` としているため、コンソール上部の認証モードを **Cognito ユーザープール** に切り替え、サインインした状態で実行する必要があります。API キーや IAM のままだと認可エラーになります。

## エラーと対処

| エラー                                                      | 原因                                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `AccessDeniedException`                                     | モデルアクセス未有効化、リージョン相違、または IAM ポリシー不足                                                                       |
| `ValidationException: Invalid model identifier`             | `modelId` の綴り誤り、またはそのリージョンに存在しないモデル。`list-inference-profiles` の出力と突き合わせる                          |
| `ValidationException: on-demand throughput isn't supported` | **素のモデル ID を渡している**。`list-inference-profiles` で得た `inferenceProfileId`（`jp.` / `apac.` / `global.` 付き）に置き換える |
| `ThrottlingException`                                       | Bedrock のレート制限。指数バックオフでのリトライ、またはクォータ引き上げを申請                                                        |
| クライアント側でタイムアウト                                | AppSync の 30 秒上限。`maxTokens` を下げるか、ストリーミング構成に変更する                                                            |
| `Task timed out after 300.00 seconds`                       | Lambda 側のタイムアウト。プロンプトか `maxTokens` を見直す                                                                            |

ログは CloudWatch Logs の `/aws/lambda/<bedrock-chat を含む関数名>` に出力されます。

## 今後の検討事項

- **会話履歴の保持** — 現状は 1 リクエスト 1 往復で、`messages` に過去のやり取りを積んでいません。`Conversation` / `Message` モデル（[Amplify Data モデル](./amplify-data-model.md)）と接続することで継続的な会話にできます
- **ストリーミング** — `ConverseStreamCommand` + AppSync サブスクリプションで逐次表示
- **`modelId` の制限** — 上記「`modelId` をクライアントから受け取ることについて」を参照
- **入力長のバリデーション** — 現状 `prompt` の長さは無制限。極端に長い入力はコストとタイムアウトの両面でリスク

## 関連ドキュメント

- [Amplify Functions（Lambda）](./amplify-functions.md) — Lambda と AppSync 紐付けの基本
- [Amplify Data モデル](./amplify-data-model.md) — スキーマとモデルの定義
- [認証・認可](./authentication.md) — Cognito と認可ルール
- [Amplify Sandbox](./amplify-sandbox.md) — ローカル開発環境

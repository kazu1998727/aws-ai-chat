# Amplify Data モデル

`amplify/data/resource.ts` で定義している、チャット機能向けのデータモデルの説明です。Amplify Data は、この定義から **AppSync（GraphQL API）と DynamoDB テーブル** を自動生成します。

## スキーマ定義

```typescript
import { type ClientSchema, a, defineData } from '@aws-amplify/backend'

const schema = a.schema({
  Message: a
    .model({
      conversationId: a.id().required(),
      createdAt: a.datetime().required(),
      conversation: a.belongsTo('Conversation', 'conversationId'),
      sender: a.string(),
      content: a.string(),
    })
    .identifier(['conversationId', 'createdAt'])
    .authorization((allow) => [allow.owner()]),

  Conversation: a
    .model({
      conversationId: a.id().required(),
      title: a.string().required(),
      createdAt: a.datetime(),
      updatedAt: a.datetime(),
      messages: a.hasMany('Message', 'conversationId'),
    })
    .identifier(['conversationId'])
    .authorization((allow) => [allow.owner()]),
})

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
})
```

## モデル一覧

### `Conversation`（会話）

| フィールド       | 型            | 必須 | 説明                                       |
| ---------------- | ------------- | ---- | ------------------------------------------ |
| `conversationId` | `ID`          | ✓    | 主キー（パーティションキー）               |
| `title`          | `String`      | ✓    | 会話のタイトル                             |
| `createdAt`      | `AWSDateTime` | —    | 作成日時                                   |
| `updatedAt`      | `AWSDateTime` | —    | 更新日時                                   |
| `messages`       | `[Message]`   | —    | 紐づくメッセージ一覧（`hasMany` の逆参照） |

- **主キー**: `conversationId` のみ（ソートキーなし）

### `Message`（メッセージ）

| フィールド       | 型             | 必須 | 説明                                                       |
| ---------------- | -------------- | ---- | ---------------------------------------------------------- |
| `conversationId` | `ID`           | ✓    | 主キー（パーティションキー） / `Conversation` への外部キー |
| `createdAt`      | `AWSDateTime`  | ✓    | 主キー（ソートキー） / 作成日時                            |
| `conversation`   | `Conversation` | —    | 紐づく会話（`belongsTo`）                                  |
| `sender`         | `String`       | —    | 送信者                                                     |
| `content`        | `String`       | —    | メッセージ本文                                             |

- **主キー**: `conversationId`（パーティションキー） + `createdAt`（ソートキー）の複合キー
- この複合キーにより、DynamoDB 上で「特定の会話に属するメッセージを作成日時順に取得する」クエリが効率的に行える

## リレーション

`Conversation` 1 に対して `Message` が多数、という 1:N の関係です。

```
Conversation (1) ──hasMany──> Message (N)
     ▲                            │
     └────────belongsTo───────────┘
```

- `Conversation.messages` — `hasMany('Message', 'conversationId')`
- `Message.conversation` — `belongsTo('Conversation', 'conversationId')`

いずれも `conversationId` を外部キーとして関連付けています。

## 認可ルール（Authorization）

両モデルとも `allow.owner()` を設定しています。

```typescript
.authorization((allow) => [allow.owner()])
```

- レコードを作成したユーザー（Cognito の `owner` フィールド、`cognito:username` を識別子として使用）のみが、そのレコードに対して `create` / `read` / `update` / `delete` を実行できる
- 他のユーザーが作成した `Conversation` や `Message` にはアクセスできない
- デフォルトの認可プロバイダーは Cognito User Pool（`default_authorization_type: AMAZON_COGNITO_USER_POOLS`）

### 生成時の警告について

sandbox のデプロイログに以下の警告が出ます。

```
WARNING: owners may reassign ownership for the following model(s) and role(s):
Message: [owner], Conversation: [owner].
```

これは、`owner` フィールドの値をクライアント側から変更できてしまう（=所有者を後から差し替えられる）ことへの注意喚起です。意図しない場合は、フィールドレベルの認可ルールで `owner` フィールドを読み取り専用にすることを検討します。

参考: [Amplify 公式ドキュメント（認可ルール）](https://docs.amplify.aws/cli/graphql/authorization-rules/#per-user--owner-based-data-access)

## デプロイされる AWS リソース

`data` をバックエンドに追加すると、以下が自動作成されます。

| リソース                 | 説明                                                           |
| ------------------------ | -------------------------------------------------------------- |
| AWS AppSync API          | GraphQL エンドポイント（`amplify_outputs.json` の `data.url`） |
| Amazon DynamoDB テーブル | `Conversation`、`Message` それぞれのテーブル                   |
| リゾルバー / VTL         | CRUD 操作用の AppSync リゾルバー（Amplify が自動生成）         |

## フロントエンドからの利用イメージ

Amplify のクライアントライブラリ（`aws-amplify/data` の `generateClient`）を使うと、`Schema` 型を利用して型安全にデータ操作ができます。

```typescript
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const client = generateClient<Schema>()

// 会話を作成
await client.models.Conversation.create({
  conversationId: crypto.randomUUID(),
  title: '新しい会話',
})

// 会話に紐づくメッセージを作成
await client.models.Message.create({
  conversationId,
  createdAt: new Date().toISOString(),
  sender: 'user',
  content: 'こんにちは',
})
```

※ 上記は本プロジェクトのスキーマに基づく利用例です。実際の呼び出しコードはフロントエンド実装時に追加してください。

## 関連ドキュメント

- [Amplify デプロイ設定](./amplify-deployment.md) — `amplify/backend.ts` 全体の構成
- [Amplify Sandbox（ローカル開発）](./amplify-sandbox.md) — ローカルでのデプロイ・データ永続性の注意点

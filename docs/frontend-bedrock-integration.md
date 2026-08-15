# フロントエンドと Bedrock の接続

チャット画面から実際に Amazon Bedrock を呼び出せるようにした変更の説明です。

これまでフロントエンドは `sampleConversations`（[`src/sampleData.ts`](../src/sampleData.ts)）のダミーデータだけで動作しており、AI の返答は固定文字列「AIのダミーメッセージです」でした。本変更で、AppSync のカスタムクエリ `BedrockChat` を呼び出して実際の応答を表示します。

バックエンド側（Lambda・IAM・モデル ID）の説明は [Bedrock チャット機能](./bedrock-chat.md) を参照してください。本ドキュメントは **フロントエンド側の配線と状態管理** に絞ります。

## 追加・変更したファイル

```
src/api/client.ts                  ← ① Amplify Data クライアントの生成（アプリ全体で 1 つ）
src/api/bedrock.ts                 ← ② BedrockChat クエリの呼び出しラッパー
src/pages/ChatConversation.tsx     ← ③ 実 API 呼び出し・ローディング表示への差し替え
src/pages/NewChat.tsx              ← ④ ダミー応答の削除
src/components/ui/ChatInput.tsx    ← ⑤ disabled プロップの追加
```

## ① Amplify Data クライアント — `src/api/client.ts`

```typescript
import { generateClient } from 'aws-amplify/api'
import type { Schema } from '../../amplify/data/resource'

export const client = generateClient<Schema>()
```

`generateClient<Schema>()` は、[`amplify/data/resource.ts`](../amplify/data/resource.ts) のスキーマ定義から型付きのクライアントを作ります。`Schema` を型引数に渡しているため、`client.queries.BedrockChat({ prompt, modelId })` の引数名・型・戻り値の型がすべてスキーマから導出されます。**引数名を打ち間違えるとビルド時に落ちます**。

**なぜ別ファイルに切り出しているか**

`generateClient()` は内部で AppSync のエンドポイント設定・認証プロバイダーを解決します。呼び出しごとに生成するとその解決が毎回走るため、モジュールスコープで一度だけ生成して使い回します。[`src/main.tsx`](../src/main.tsx) の `Amplify.configure(outputs)` より後に評価される必要がありますが、`client.ts` は API を呼ぶコンポーネントから間接的に import されるため、実際の呼び出し時点では必ず設定済みです。

> `aws-amplify/api` と `aws-amplify/data` のどちらからでも `generateClient` を import できます。本プロジェクトは `aws-amplify/api` を使っています。

## ② 呼び出しラッパー — `src/api/bedrock.ts`

```typescript
import { client } from './client'

export const callBedrockChat = async (prompt: string, modelId: string) => {
  try {
    const response = await client.queries.BedrockChat({ prompt, modelId })
    return response.data
  } catch (error) {
    console.error('チャットの送信リクエストでエラーが発生しました:', error)
    throw new Error('チャットの送信リクエストでエラーが発生しました', {
      cause: error,
    })
  }
}
```

UI コンポーネントから GraphQL クライアントを直接触らせないための薄いラッパーです。将来 `Conversation` / `Message` モデルへの永続化を足すときも、変更範囲がこの層に閉じます。

**`{ cause: error }`**
元のエラーを捨てずに `Error` の `cause` に載せています。AppSync の認可エラーなのか Bedrock 側のエラーなのかは元のエラーにしか入っていないため、握りつぶすと原因切り分けができなくなります。

**現状の制約**
`client.queries.*` は例外を投げず `{ data, errors }` を返すのが基本です。上記は `errors` を見ていないため、**GraphQL レベルのエラー（認可エラーなど）が `catch` されずに `data: null` として返ります**。呼び出し側では「応答なし」として扱われます。`errors` の判定を足すのが本来の形です。

## ③ チャット画面 — `src/pages/ChatConversation.tsx`

### 処理フロー

画面に入る経路が 2 つあります。

**A. 新規チャット（`/chat/new` から遷移）**

1. `NewChat` が会話 ID を採番し、ユーザーの発言 1 件だけを持つ会話を `sampleConversations` に push
2. `navigate('/chat/:id', { state: { message, model } })` で遷移
3. `ChatConversation` が `location.state` を検出し、**初回に一度だけ** `requestAIResponse()` を実行
4. 応答が返ったら assistant メッセージを追加

**B. 既存チャット（サイドバーから遷移）**

1. `location.state` が無いので初回リクエストは走らない
2. `sampleConversations` から会話を引いて表示するだけ
3. 以降は入力欄からの送信（`sendMessage`）で A の 3〜4 と同じ流れ

### 状態設計

この画面には「会話データ」の state がありません。

```typescript
// TODO 実際のアプリではAPIからデータを取得する
const conversation =
  sampleConversations.find((c) => c.id === conversationId) ?? null
```

**なぜ `useState` + `useEffect` で持たないか**

`conversationId` から会話を引くのは外部システムとの同期ではなく **単なる派生値** です。effect で `setState` すると「null で 1 回描画 → effect → 再描画」という無駄なカスケードが発生し、`react-hooks/set-state-in-effect` で lint エラーになります。

```
error  Calling setState synchronously within an effect can trigger cascading renders
       react-hooks/set-state-in-effect
```

書き込み先は `sampleConversations`（モジュール変数）で、これが唯一の情報源です。React はモジュール変数の変更を検知できないため、再描画のトリガーだけを明示的に持ちます。

```typescript
const [, refresh] = useReducer((n: number) => n + 1, 0)
```

**メッセージの追加はコンポーネント外の関数で行う**

```typescript
const appendMessage = (
  conversationId: string | undefined,
  message: Message,
) => {
  const index = sampleConversations.findIndex((c) => c.id === conversationId)
  if (index === -1) return
  const current = sampleConversations[index]
  sampleConversations[index] = {
    ...current,
    messages: [...current.messages, message],
    updatedAt: new Date(),
  }
}
```

配列要素を **新しいオブジェクトで置き換えて** います。`conversation.messages.push(...)` のような破壊的変更にすると、レンダー中に読んだローカル変数をレンダー後に書き換えることになり、React Compiler の lint に弾かれます。

```
error  Cannot modify local variables after render completes
```

またこの関数をコンポーネントの外に置くことで参照が安定し、`useCallback` の依存配列に含める必要がなくなります。

**ローディング状態は導出する**

```typescript
// 末尾がユーザー発言 === AI の応答待ち
const isLoadingAIResponse = conversation?.messages.at(-1)?.role === 'user'
```

`isLoading` を別の `useState` で持つと、メッセージ配列という実体と二重管理になり、ずれた瞬間に「送信できないのにスピナーも出ない」といった状態が生まれます。「最後の発言がユーザーなら応答待ち」は常に成立するため、state を持たずに導出しています。エラー時も assistant のエラーメッセージを追加するので、ローディングは必ず解除されます。

> `ponytail:` 会話の最後がユーザー発言のまま確定するケース（リクエストを投げずに終わる経路）を作ると、スピナーが出たままになります。永続化を入れる際は「送信中」フラグをサーバー側の状態として持つ形に変える必要があります。

**初回リクエストの二重実行防止**

```typescript
const initialRequestSent = useRef(false)

useEffect(() => {
  if (!initChatDetail || initialRequestSent.current) return
  initialRequestSent.current = true
  requestAIResponse(initChatDetail.message, initChatDetail.model)
}, [initChatDetail, requestAIResponse])
```

`main.tsx` の `<StrictMode>` により、開発時は effect が意図的に 2 回実行されます。ガードが無いと **Bedrock へのリクエストが 2 回飛び、課金も 2 倍** になります。ref はレンダーをまたいで保持され、書き換えても再描画を起こさないため、この用途に適しています。

なお、この effect の中には同期的な `setState` がありません。状態が変わるのは `await` の後に呼ばれる `refresh()` だけなので、`set-state-in-effect` には該当しません。

### エラーハンドリング

```typescript
try {
  const aiResponse = await callBedrockChat(message, model)
  appendMessage(
    conversationId,
    createMessage('assistant', aiResponse || 'AIからの応答がありません'),
  )
} catch (error) {
  console.error('AI応答の取得に失敗しました:', error)
  appendMessage(
    conversationId,
    createMessage(
      'assistant',
      'AIからの応答の取得に失敗しました。後ほど再試行してください。',
    ),
  )
}
```

失敗しても **必ず assistant メッセージを 1 件追加** します。これは表示上の親切さだけでなく、前述の「ローディングは導出値」という設計を成立させるためでもあります。応答を追加しないパスがあると、その会話は永久に応答待ち表示のままになります。

想定される失敗は AppSync の 30 秒タイムアウト、Bedrock のスロットリング、モデルアクセス未有効化などです。詳細は [Bedrock チャット機能のエラー表](./bedrock-chat.md#エラーと対処) を参照してください。

### スクロール追従

```typescript
useEffect(() => {
  messagesEndRef.current?.scrollIntoView()
}, [conversation?.messages.length])
```

依存配列がオブジェクト参照ではなく **件数** です。メッセージが増えたときだけ実行され、無関係な再描画では走りません。

## ④ ダミー応答の削除 — `src/pages/NewChat.tsx`

`NewChat` は会話を作る際に、ユーザー発言に加えて「AIのダミーメッセージです」という assistant メッセージも push していました。実際の応答は遷移先の `ChatConversation` が取得するため、これを削除しています。

残しておくと、ダミー応答と実際の応答が両方表示され、さらに「最後の発言が assistant」になるためローディング表示も出ません。

## ⑤ 入力欄の無効化 — `src/components/ui/ChatInput.tsx`

```typescript
interface ChatInputProps {
  sendMessage: (message: string, model: string) => void
  initialModel?: string
  disabled?: boolean
}
```

`disabled` は `<textarea>`、送信ボタン、`handleSubmit` の 3 箇所に効かせています。ボタンだけを無効化しても **`Enter` キーからの `form.requestSubmit()` は通ってしまう** ため、送信ハンドラ側でもガードが必要です。

省略可能（既定値 `false`）にしているので、`NewChat` 側の呼び出しは変更不要です。

## 既知の制約

| 制約                                                   | 内容                                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 会話がリロードで消える                                 | 保存先が `sampleConversations`（モジュール変数）のため。`Conversation` / `Message` モデル未接続 |
| 会話履歴が AI に渡らない                               | `callBedrockChat` に渡すのは今回の発言のみ。Lambda 側も 1 往復しか組み立てていない              |
| GraphQL の `errors` を見ていない                       | ② のとおり。認可エラーが「応答なし」として表示される                                            |
| 応答が一括表示                                         | ストリーミング未対応。長文ほど待ち時間が体感される                                              |
| 送信中に別の会話へ移動すると、応答は元の会話にだけ入る | `conversationId` を閉じ込めているため。動作としては正しいが、通知は出ない                       |

## 今後の対応

1. **`errors` の判定を `callBedrockChat` に追加** — 一番小さく、一番効く
2. **Amplify Data モデルへの永続化** — `sampleConversations` を置き換える。リロード消失と履歴なしの両方が解消する
3. **会話履歴を Bedrock に渡す** — 2 の後。Lambda 側の `messages` 組み立ても合わせて変更が必要
4. **ストリーミング表示** — `ConverseStream` + AppSync サブスクリプション

## 関連ドキュメント

- [Bedrock チャット機能](./bedrock-chat.md) — Lambda、IAM 権限、モデル ID の選び方
- [Amplify Data モデル](./amplify-data-model.md) — スキーマと認可ルール
- [Amplify Functions（Lambda）](./amplify-functions.md) — Lambda と AppSync の紐付け
- [フロントエンドライブラリ](./frontend-libraries.md) — React Router、Tailwind CSS

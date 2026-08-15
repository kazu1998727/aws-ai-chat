import { useParams, useLocation } from 'react-router'
import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Message } from '../types/chat'
import MessageList from '../components/ui/MessageList'
import ChatInput from '../components/ui/ChatInput'
import { sampleConversations } from '../sampleData'
import { callBedrockChat } from '../api/bedrock'

const createMessage = (role: Message['role'], content: string): Message => ({
  id: `message-${self.crypto.randomUUID()}`,
  role,
  content,
  timestamp: new Date(),
})

// TODO 実際のアプリではAPIに保存する
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

export default function ChatConversation() {
  const { conversationId } = useParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { state: initChatDetail } = location
  // sampleConversations を直接書き換えているため、再描画には明示的なトリガーが必要
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  // StrictMode の二重実行で初回リクエストが重複しないようにする
  const initialRequestSent = useRef(false)

  // TODO 実際のアプリではAPIからデータを取得する
  const conversation =
    sampleConversations.find((c) => c.id === conversationId) ?? null

  // 末尾がユーザー発言 === AI の応答待ち。別途 state を持つと実データとずれるため導出する
  const isLoadingAIResponse = conversation?.messages.at(-1)?.role === 'user'

  const requestAIResponse = useCallback(
    async (message: string, model: string) => {
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
      refresh()
    },
    [conversationId],
  )

  // 新規チャットから遷移してきた場合のみ、初回の問い合わせをここで実行する
  useEffect(() => {
    if (!initChatDetail || initialRequestSent.current) return
    initialRequestSent.current = true
    requestAIResponse(initChatDetail.message, initChatDetail.model)
  }, [initChatDetail, requestAIResponse])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView()
  }, [conversation?.messages.length])

  if (!conversation) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-2xl font-bold">
          指定したIDの会話が見つかりません
        </div>
      </div>
    )
  }

  const sendMessage = async (message: string, model: string) => {
    appendMessage(conversationId, createMessage('user', message))
    refresh()
    await requestAIResponse(message, model)
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-4">
        <h1 className="text-xl font-bold">{conversation.title}</h1>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto bg-white">
        <div className="w-3xl">
          <MessageList messages={conversation.messages} />
          {isLoadingAIResponse && (
            <div className="px-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="mx-auto w-3xl bg-white px-4 py-3">
        <ChatInput
          sendMessage={sendMessage}
          initialModel={initChatDetail?.model}
          disabled={isLoadingAIResponse}
        />
      </div>
    </div>
  )
}

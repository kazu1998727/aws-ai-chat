import { useParams, useLocation } from 'react-router'
import { useEffect, useReducer, useRef } from 'react'
import MessageList from '../components/ui/MessageList'
import ChatInput from '../components/ui/ChatInput'
import { sampleConversations } from '../sampleData'

export default function ChatConversation() {
  const { conversationId } = useParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { state: initChatDetail } = location
  // sampleConversations を直接書き換えているため、再描画には明示的なトリガーが必要
  const [, refresh] = useReducer((n: number) => n + 1, 0)

  // TODO 実際のアプリではAPIからデータを取得する
  const conversation =
    sampleConversations.find((c) => c.id === conversationId) ?? null

  useEffect(() => {
    if (conversation?.messages.length) {
      messagesEndRef.current?.scrollIntoView()
    }
  }, [conversation])

  if (!conversation) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center text-2xl font-bold">
          指定したIDの会話が見つかりません
        </div>
      </div>
    )
  }
  const sendMessage = (message: string) => {
    const conversationIndex = sampleConversations.findIndex(
      (conversation) => conversation.id === conversationId,
    )
    if (conversationIndex === -1) {
      return
    }
    const updatedConversation = {
      ...sampleConversations[conversationIndex],
      messages: [
        ...sampleConversations[conversationIndex].messages,
        {
          id: `message-${self.crypto.randomUUID()}`,
          role: 'user' as const,
          content: message,
          timestamp: new Date(),
        },
        {
          id: `message-${self.crypto.randomUUID()}`,
          role: 'assistant' as const,
          content: 'AIのダミーメッセージです',
          timestamp: new Date(),
        },
      ],
      updatedAt: new Date(),
    }
    sampleConversations[conversationIndex] = updatedConversation
    refresh()
  }
  return (
    <div className="flex h-screen flex-col">
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-4">
        <h1 className="text-xl font-bold">{conversation.title}</h1>
      </div>

      <div className="flex flex-1 justify-center overflow-y-auto bg-white">
        <div className="w-3xl">
          <MessageList messages={conversation.messages} />
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="mx-auto w-3xl bg-white px-4 py-3">
        <ChatInput
          sendMessage={sendMessage}
          initialModel={initChatDetail?.model}
        />
      </div>
    </div>
  )
}

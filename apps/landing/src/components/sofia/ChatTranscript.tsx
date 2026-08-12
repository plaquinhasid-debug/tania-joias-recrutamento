import { useEffect, useRef } from "react"

import { ChatBubble } from "@/components/sofia/ChatBubble"
import { TypingIndicator } from "@/components/sofia/TypingIndicator"
import type { SofiaMessage } from "@/types/sofia"

interface ChatTranscriptProps {
  messages: SofiaMessage[]
  botTyping: boolean
}

export function ChatTranscript({ messages, botTyping }: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, botTyping])

  return (
    <div className="wa-wallpaper flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
      {messages.map((message) => (
        <ChatBubble key={message.id} message={message} />
      ))}
      {botTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}

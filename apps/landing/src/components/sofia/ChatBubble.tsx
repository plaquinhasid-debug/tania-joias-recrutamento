import { cn } from "@/lib/utils"
import type { SofiaMessage } from "@/types/sofia"

interface ChatBubbleProps {
  message: SofiaMessage
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isBot = message.role === "bot"

  return (
    <div
      className={cn("flex w-full animate-fade-in", isBot ? "justify-start" : "justify-end")}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
          isBot
            ? "rounded-tl-sm bg-secondary text-secondary-foreground"
            : "rounded-tr-sm bg-primary text-primary-foreground",
        )}
      >
        {message.text}
      </div>
    </div>
  )
}

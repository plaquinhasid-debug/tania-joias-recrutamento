export function TypingIndicator() {
  return (
    <div className="flex w-full animate-fade-in justify-start">
      <div className="flex items-center gap-1 rounded-lg rounded-tl-none bg-[var(--wa-bubble-in)] px-4 py-3 shadow-sm">
        <span className="size-1.5 animate-bounce-soft rounded-full bg-[var(--wa-timestamp)] [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce-soft rounded-full bg-[var(--wa-timestamp)] [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce-soft rounded-full bg-[var(--wa-timestamp)] [animation-delay:300ms]" />
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex w-full animate-fade-in justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm bg-secondary px-4 py-3">
        <span className="size-1.5 animate-bounce-soft rounded-full bg-muted-foreground [animation-delay:0ms]" />
        <span className="size-1.5 animate-bounce-soft rounded-full bg-muted-foreground [animation-delay:150ms]" />
        <span className="size-1.5 animate-bounce-soft rounded-full bg-muted-foreground [animation-delay:300ms]" />
      </div>
    </div>
  )
}

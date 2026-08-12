import { useEffect, useState } from "react"

interface IprCounterProps {
  target: number
  durationMs?: number
  onDone?: () => void
}

/** Anima a contagem de 0 até `target` usando requestAnimationFrame. */
export function IprCounter({ target, durationMs = 2200, onDone }: IprCounterProps) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    let frame: number
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(1, elapsed / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))

      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        onDone?.()
      }
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return (
    <span className="font-display text-6xl font-semibold tabular-nums text-primary">
      {value}
    </span>
  )
}

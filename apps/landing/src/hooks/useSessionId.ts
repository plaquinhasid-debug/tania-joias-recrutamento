import { useState } from "react"

import { getOrCreateSessionId } from "@/lib/tracking"

/** Session id estável durante a visita, persistido em sessionStorage. */
export function useSessionId(): string {
  const [sessionId] = useState(getOrCreateSessionId)
  return sessionId
}

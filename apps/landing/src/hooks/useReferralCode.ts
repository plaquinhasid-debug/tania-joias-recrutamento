import { useState } from "react"

import { getOrCaptureReferralCode } from "@/lib/tracking"

/** Código de indicação (`?ref=`) capturado da URL (ou recuperado de sessionStorage) uma única vez. */
export function useReferralCode(): string | undefined {
  const [ref] = useState(getOrCaptureReferralCode)
  return ref
}

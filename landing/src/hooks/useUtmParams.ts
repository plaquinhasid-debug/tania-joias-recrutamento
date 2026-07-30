import { useState } from "react"

import { getOrCaptureUtmParams, type UtmParams } from "@/lib/tracking"

/** UTM params capturados da URL (ou recuperados de sessionStorage) uma única vez. */
export function useUtmParams(): UtmParams {
  const [utm] = useState(getOrCaptureUtmParams)
  return utm
}

import { useRef } from "react"
import { mutationOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import {
  createResendSubmissionGuard, isRecord, parseResendResult, resendInviteHttpErrorMessage,
  ResendInviteRequestError, RESEND_UNEXPECTED_ERROR,
  type ResendAmbassadorInviteInput, type ResendAmbassadorInviteResult,
} from "../lib/ambassadorInvite"

type FunctionsInvoke = typeof supabase.functions.invoke

async function sanitizedResendError(error: unknown): Promise<ResendInviteRequestError> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    let code: string | undefined
    try {
      const body: unknown = await error.context.clone().json()
      if (isRecord(body) && typeof body.error === "string") code = body.error
    } catch { /* Respostas sem JSON ainda recebem mensagem pelo status HTTP. */ }
    return new ResendInviteRequestError(resendInviteHttpErrorMessage(error.context.status, code))
  }
  return new ResendInviteRequestError(RESEND_UNEXPECTED_ERROR)
}

export async function resendAmbassadorInvite(
  input: ResendAmbassadorInviteInput,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<ResendAmbassadorInviteResult> {
  // Seleção explícita: só o identificador e a prova de estado, nunca
  // nome/telefone/email (esta function nunca cria nada novo).
  const body = { embaixadora_id: input.embaixadoraId, expected_updated_at: input.expectedUpdatedAt }
  let response: Awaited<ReturnType<FunctionsInvoke>>
  try {
    response = await invoke<unknown>("resend-ambassador-invite", { method: "POST", body })
  } catch (error) {
    throw await sanitizedResendError(error)
  }
  if (response.error) throw await sanitizedResendError(response.error)
  return parseResendResult(response.data)
}

export function createResendInviteMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  onResent: (result: ResendAmbassadorInviteResult) => void,
  invoke?: FunctionsInvoke,
) {
  return mutationOptions({
    // Mesmo padrão de useCreateAmbassadorInvite.ts: o resultado secreto vai
    // direto ao estado local do diálogo, nunca em mutation.data/MutationCache.
    mutationFn: async (input: ResendAmbassadorInviteInput): Promise<void> => {
      const result = await resendAmbassadorInvite(input, invoke)
      onResent(result)
    },
    onSuccess: () => {
      // updated_at mudou no banco — invalida a listagem pra que um próximo
      // reenvio desta mesma linha envie o expected_updated_at certo.
      void queryClient.invalidateQueries({ queryKey: ["embaixadoras"] }).catch(() => {})
    },
    retry: false,
    gcTime: 0,
    networkMode: "always",
    throwOnError: false,
  })
}

export function useResendAmbassadorInvite(onResent: (result: ResendAmbassadorInviteResult) => void) {
  const queryClient = useQueryClient()
  const mutation = useMutation(createResendInviteMutationOptions(queryClient, onResent))
  const guard = useRef(createResendSubmissionGuard()).current
  return {
    isPending: mutation.isPending,
    isSubmitting: guard.isPending,
    submit: (input: ResendAmbassadorInviteInput) => guard.run(() => mutation.mutateAsync(input)),
    reset: mutation.reset,
  }
}

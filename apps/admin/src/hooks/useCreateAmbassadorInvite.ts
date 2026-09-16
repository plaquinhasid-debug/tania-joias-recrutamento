import { useRef } from "react"
import { mutationOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { FunctionsHttpError } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"
import {
  createInviteSubmissionGuard, inviteHttpErrorMessage, InviteRequestError,
  INVITE_UNEXPECTED_ERROR, isRecord, parseInviteResult,
  type AmbassadorInviteInput, type AmbassadorInviteResult,
} from "../lib/ambassadorInvite"

type FunctionsInvoke = typeof supabase.functions.invoke

async function sanitizedInviteError(error: unknown): Promise<InviteRequestError> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    let code: string | undefined
    try {
      const body: unknown = await error.context.clone().json()
      if (isRecord(body) && typeof body.error === "string") code = body.error
    } catch { /* Respostas sem JSON ainda recebem mensagem pelo status HTTP. */ }
    return new InviteRequestError(inviteHttpErrorMessage(error.context.status, code))
  }
  return new InviteRequestError(INVITE_UNEXPECTED_ERROR)
}

export async function createAmbassadorInvite(
  input: AmbassadorInviteInput,
  invoke: FunctionsInvoke = supabase.functions.invoke.bind(supabase.functions),
): Promise<AmbassadorInviteResult> {
  // Seleção explícita: o telefone segue exatamente como foi digitado.
  const body = {
    nome: input.nome, telefone: input.telefone, email: input.email,
    ...(input.instagram === undefined ? {} : { instagram: input.instagram }),
  }
  let response: Awaited<ReturnType<FunctionsInvoke>>
  try {
    response = await invoke<unknown>("create-ambassador-invite", { method: "POST", body })
  } catch (error) {
    throw await sanitizedInviteError(error)
  }
  if (response.error) throw await sanitizedInviteError(response.error)
  return parseInviteResult(response.data)
}

export function createInviteMutationOptions(
  queryClient: Pick<QueryClient, "invalidateQueries">,
  onCreated: (result: AmbassadorInviteResult) => void,
  invoke?: FunctionsInvoke,
) {
  return mutationOptions({
    // O resultado secreto vai diretamente ao estado local do Dialog.
    // Retornar void impede que ele entre em mutation.data / MutationCache.
    mutationFn: async (input: AmbassadorInviteInput): Promise<void> => {
      const result = await createAmbassadorInvite(input, invoke)
      onCreated(result)
    },
    onSuccess: () => {
      // Falha de refetch não pode descartar um convite já criado.
      void queryClient.invalidateQueries({ queryKey: ["embaixadoras"] }).catch(() => {})
    },
    retry: false,
    gcTime: 0,
    networkMode: "always",
    throwOnError: false,
  })
}

export function useCreateAmbassadorInvite(onCreated: (result: AmbassadorInviteResult) => void) {
  const queryClient = useQueryClient()
  const mutation = useMutation(createInviteMutationOptions(queryClient, onCreated))
  const guard = useRef(createInviteSubmissionGuard()).current
  return {
    isPending: mutation.isPending,
    isSubmitting: guard.isPending,
    submit: (input: AmbassadorInviteInput) => guard.run(() => mutation.mutateAsync(input)),
    reset: mutation.reset,
  }
}

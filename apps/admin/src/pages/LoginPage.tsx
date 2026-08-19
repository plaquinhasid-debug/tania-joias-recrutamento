import * as React from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { Loader2, Lock, Mail } from "lucide-react"

import { useAuth } from "@/context/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resolveLoginRedirectTarget } from "@/lib/loginRedirect"

export default function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  // IMPLEMENTATION-CRM-004B (item 4) — `resolveLoginRedirectTarget` preserva
  // `pathname` + `search` (não só `pathname`), pra um deep link
  // `/crm?lead=...` acessado deslogada sobreviver ao login. Ver
  // `lib/loginRedirect.ts`.
  if (!loading && session) {
    const from = (location.state as { from?: Location })?.from
    return <Navigate to={resolveLoginRedirectTarget(from)} replace />
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    setSubmitting(false)
    if (signInError) {
      setError(
        signInError === "Invalid login credentials"
          ? "E-mail ou senha inválidos."
          : signInError,
      )
      return
    }
    const from = (location.state as { from?: Location })?.from
    navigate(resolveLoginRedirectTarget(from), { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-3xl font-medium tracking-tight text-foreground">
            Tania Joias
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Painel administrativo — acesso da equipe
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@taniajoias.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pl-10"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" variant="gold" size="lg" disabled={submitting} className="mt-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Contas são criadas manualmente pela equipe. Sem cadastro público.
        </p>
      </div>
    </div>
  )
}

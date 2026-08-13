import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { fichaAprovacaoSchema, type FichaAprovacaoPayload } from "@tania-joias/shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface FichaFormProps {
  onSubmitValues: (values: FichaAprovacaoPayload) => Promise<void>
}

interface FieldProps {
  label: string
  error?: string
}

function Field({ label, error, children }: React.PropsWithChildren<FieldProps>) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function FichaForm({ onSubmitValues }: FichaFormProps) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FichaAprovacaoPayload>({
    resolver: zodResolver(fichaAprovacaoSchema),
    defaultValues: { tem_conjuge: false },
  })

  const temConjuge = watch("tem_conjuge")

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    setSubmitting(true)
    try {
      await onSubmitValues(values)
    } catch {
      setSubmitError("Não deu pra enviar agora. Confira sua internet e tente de novo.")
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Endereço</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Rua" error={errors.endereco_rua?.message}>
              <Input {...register("endereco_rua")} placeholder="Nome da rua" />
            </Field>
          </div>
          <Field label="Número" error={errors.endereco_numero?.message}>
            <Input {...register("endereco_numero")} placeholder="Nº" />
          </Field>
          <Field label="CEP" error={errors.endereco_cep?.message}>
            <Input {...register("endereco_cep")} placeholder="00000-000" />
          </Field>
          <Field label="Bairro" error={errors.endereco_bairro?.message}>
            <Input {...register("endereco_bairro")} placeholder="Bairro" />
          </Field>
          <Field label="Cidade" error={errors.endereco_cidade?.message}>
            <Input {...register("endereco_cidade")} placeholder="Cidade" />
          </Field>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Família</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome do pai" error={errors.nome_pai?.message}>
            <Input {...register("nome_pai")} placeholder="Nome completo" />
          </Field>
          <Field label="Nome da mãe" error={errors.nome_mae?.message}>
            <Input {...register("nome_mae")} placeholder="Nome completo" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" className="size-4 rounded border-input" {...register("tem_conjuge")} />
          Sou casada ou tenho companheiro
        </label>

        {temConjuge && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nome dele" error={errors.conjuge_nome?.message}>
              <Input {...register("conjuge_nome")} placeholder="Nome completo" />
            </Field>
            <Field label="Telefone dele" error={errors.conjuge_telefone?.message}>
              <Input {...register("conjuge_telefone")} placeholder="(11) 91234-5678" />
            </Field>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          3 referências familiares
        </h2>
        <p className="text-sm text-muted-foreground">
          Pode ser mãe, irmãos, primos ou vizinhos — nome e telefone de 3 pessoas.
        </p>
        {([1, 2, 3] as const).map((n) => (
          <div key={n} className="grid grid-cols-2 gap-4">
            <Field
              label={`Nome ${n}`}
              error={errors[`ref${n}_nome` as const]?.message}
            >
              <Input {...register(`ref${n}_nome` as const)} placeholder="Nome completo" />
            </Field>
            <Field
              label={`Telefone ${n}`}
              error={errors[`ref${n}_telefone` as const]?.message}
            >
              <Input {...register(`ref${n}_telefone` as const)} placeholder="(11) 91234-5678" />
            </Field>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Referência comercial</h2>
        <Field label="O que você vende hoje" error={errors.ref_comercial_o_que_vende?.message}>
          <Input {...register("ref_comercial_o_que_vende")} placeholder="Ex.: cosméticos, roupas..." />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome" error={errors.ref_comercial_nome?.message}>
            <Input {...register("ref_comercial_nome")} placeholder="Nome de quem confirma" />
          </Field>
          <Field label="Telefone" error={errors.ref_comercial_telefone?.message}>
            <Input {...register("ref_comercial_telefone")} placeholder="(11) 91234-5678" />
          </Field>
        </div>
      </div>

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button type="submit" variant="gold" className="w-full" disabled={submitting}>
        {submitting ? "Enviando..." : "Enviar ficha"}
      </Button>
    </form>
  )
}

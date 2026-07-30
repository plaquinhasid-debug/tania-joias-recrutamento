import { ChipsAnswerInput } from "@/components/sofia/inputs/ChipsAnswerInput"
import { TextAnswerForm } from "@/components/sofia/inputs/TextAnswerForm"
import { YesNoAnswerButtons } from "@/components/sofia/inputs/YesNoAnswerButtons"
import type { SofiaStep } from "@/data/sofia-script"

interface SofiaAnswerInputProps {
  step: SofiaStep
  disabled?: boolean
  onAnswer: (value: string | number | boolean, displayText: string) => void
}

/** Renderiza o input correto (texto, sim/não ou chips) para a etapa atual. */
export function SofiaAnswerInput({ step, disabled, onAnswer }: SofiaAnswerInputProps) {
  if (step.kind === "yesno") {
    return <YesNoAnswerButtons step={step} disabled={disabled} onAnswer={onAnswer} />
  }

  if (step.kind === "chips") {
    return <ChipsAnswerInput step={step} disabled={disabled} onSubmitValue={onAnswer} />
  }

  return (
    <TextAnswerForm
      stepKey={step.key}
      schema={step.schema}
      placeholder={step.placeholder}
      multiline={step.kind === "textarea"}
      disabled={disabled}
      onSubmitValue={onAnswer}
    />
  )
}

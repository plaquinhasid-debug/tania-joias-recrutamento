import { TextAnswerForm } from "@/components/sofia/inputs/TextAnswerForm"
import { cn } from "@/lib/utils"
import type { SofiaChipsStep } from "@/data/sofia-script"

interface ChipsAnswerInputProps {
  step: SofiaChipsStep
  disabled?: boolean
  onSubmitValue: (value: string | number, displayText: string) => void
}

export function ChipsAnswerInput({ step, disabled, onSubmitValue }: ChipsAnswerInputProps) {
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {step.chips.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={disabled}
            onClick={() => onSubmitValue(chip, chip)}
            className={cn(
              "rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors",
              "hover:border-gold hover:text-gold",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {chip}
          </button>
        ))}
      </div>
      <TextAnswerForm
        stepKey={step.key}
        schema={step.schema}
        placeholder={step.placeholder}
        disabled={disabled}
        onSubmitValue={onSubmitValue}
      />
    </div>
  )
}

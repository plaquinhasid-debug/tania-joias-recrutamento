import { Button } from "@/components/ui/button"
import type { SofiaYesNoStep } from "@/data/sofia-script"

interface YesNoAnswerButtonsProps {
  step: SofiaYesNoStep
  disabled?: boolean
  onAnswer: (value: boolean, displayText: string) => void
}

export function YesNoAnswerButtons({ step, disabled, onAnswer }: YesNoAnswerButtonsProps) {
  return (
    <div className="flex w-full gap-3">
      <Button
        type="button"
        className="flex-1 rounded-full bg-[var(--wa-accent)] text-[var(--wa-accent-foreground)] hover:bg-[var(--wa-accent)]/90"
        disabled={disabled}
        onClick={() => onAnswer(true, step.yesLabel)}
      >
        {step.yesLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex-1 rounded-full border-[var(--wa-header)] bg-white text-[var(--wa-header)] hover:bg-[var(--wa-header)]/10"
        disabled={disabled}
        onClick={() => onAnswer(false, step.noLabel)}
      >
        {step.noLabel}
      </Button>
    </div>
  )
}

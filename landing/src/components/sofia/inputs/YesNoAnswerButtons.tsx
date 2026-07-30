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
        variant="gold"
        className="flex-1"
        disabled={disabled}
        onClick={() => onAnswer(true, step.yesLabel)}
      >
        {step.yesLabel}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        disabled={disabled}
        onClick={() => onAnswer(false, step.noLabel)}
      >
        {step.noLabel}
      </Button>
    </div>
  )
}

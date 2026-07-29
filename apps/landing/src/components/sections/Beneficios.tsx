import {
  Banknote,
  CalendarClock,
  GraduationCap,
  HeartHandshake,
  Truck,
  Users,
} from "lucide-react"

import { Reveal } from "@/components/Reveal"

const BENEFITS = [
  {
    icon: Banknote,
    title: "Sem investimento inicial",
    text: "Comece a revender sem precisar comprar estoque antecipado.",
  },
  {
    icon: GraduationCap,
    title: "Treinamento completo",
    text: "Material de vendas, scripts e dicas prontas para você aplicar desde o primeiro dia.",
  },
  {
    icon: HeartHandshake,
    title: "Suporte próximo",
    text: "Time dedicado para tirar dúvidas e ajudar você a vender mais.",
  },
  {
    icon: CalendarClock,
    title: "Flexibilidade total",
    text: "Dedique o tempo que fizer sentido para você, sem jornada fixa.",
  },
  {
    icon: Truck,
    title: "Logística facilitada",
    text: "Você recebe as peças e cuidamos da reposição do seu catálogo.",
  },
  {
    icon: Users,
    title: "Comunidade de revendedoras",
    text: "Troque experiências com outras mulheres que já estão no caminho do sucesso.",
  },
]

export function Beneficios() {
  return (
    <section id="beneficios" className="py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Por que revender com a gente
          </h2>
          <p className="mt-4 text-muted-foreground">
            Tudo pensado para você começar rápido e crescer com segurança.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit, index) => (
            <Reveal key={benefit.title} delay={(index % 3) * 0.08}>
              <div className="group flex h-full flex-col gap-3 rounded-xl border border-border p-6 transition-colors hover:border-gold/50">
                <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-foreground transition-colors group-hover:bg-gold/15 group-hover:text-gold">
                  <benefit.icon className="size-5" />
                </div>
                <h3 className="font-medium text-foreground">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

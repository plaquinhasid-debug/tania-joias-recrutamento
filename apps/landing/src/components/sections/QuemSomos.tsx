import { Gem, ShieldCheck, Sparkles } from "lucide-react"

import { Reveal } from "@/components/Reveal"

const PILLARS = [
  {
    icon: Gem,
    title: "Curadoria premium",
    text: "Peças em semijoias com acabamento nobre, banho de qualidade e design atual — para revender com orgulho.",
  },
  {
    icon: ShieldCheck,
    title: "Marca consolidada",
    text: "Anos de mercado e milhares de clientes satisfeitas em todo o Brasil.",
  },
  {
    icon: Sparkles,
    title: "Você no controle",
    text: "Defina seus horários, seu ritmo e sua forma de vender — presencial ou pelas redes sociais.",
  },
]

export function QuemSomos() {
  return (
    <section id="quem-somos" className="bg-secondary/50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Quem é a Tania Joias
          </h2>
          <p className="mt-4 text-muted-foreground">
            Somos uma marca de semijoias premium que acredita que toda mulher merece uma
            fonte de renda flexível — e uma coleção à altura para representar. Construímos
            uma rede de revendedoras em todo o país, com suporte de verdade em cada etapa.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {PILLARS.map((pillar, index) => (
            <Reveal key={pillar.title} delay={index * 0.1}>
              <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-background p-7">
                <div className="flex size-11 items-center justify-center rounded-full bg-gold/15 text-gold">
                  <pillar.icon className="size-5" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground">
                  {pillar.title}
                </h3>
                <p className="text-sm text-muted-foreground">{pillar.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

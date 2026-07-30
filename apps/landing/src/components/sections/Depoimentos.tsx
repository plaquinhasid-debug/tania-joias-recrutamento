import { Star } from "lucide-react"

import { Reveal } from "@/components/Reveal"
import { Card, CardContent } from "@/components/ui/card"

const TESTIMONIALS = [
  {
    name: "Michely",
    cidade: "Mauá",
    text: "Comecei revendendo pra amigas só pra complementar a renda. Hoje já tenho uma carteira de clientes fiéis e o dinheiro extra virou parte importante do orçamento de casa.",
  },
  {
    name: "Sonia Aguiar",
    cidade: "Mauá",
    text: "Eu não tinha experiência nenhuma com vendas. O treinamento me deu segurança pra começar, e em poucos meses já sentia a diferença no bolso, sem largar minhas outras atividades.",
  },
  {
    name: "Gislaine",
    cidade: "Mauá",
    text: "O que mais me conquistou foi a flexibilidade. Encaixo as vendas no meu tempo livre, entre um compromisso e outro, e ainda assim vejo resultado todo mês.",
  },
]

export function Depoimentos() {
  return (
    <section id="depoimentos" className="bg-secondary/50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Quem já revende, recomenda
          </h2>
          <p className="mt-4 text-muted-foreground">
            Histórias de mulheres que transformaram tempo livre em renda extra.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {TESTIMONIALS.map((testimonial, index) => (
            <Reveal key={testimonial.name} delay={index * 0.1}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-4 pt-6">
                  <div className="flex gap-0.5 text-gold">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-4 fill-current" />
                    ))}
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{testimonial.text}</p>
                  <div>
                    <p className="text-sm font-medium text-foreground">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">Cidade/{testimonial.cidade}</p>
                  </div>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

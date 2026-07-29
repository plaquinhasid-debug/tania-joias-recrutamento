import { Reveal } from "@/components/Reveal"
import { Button } from "@/components/ui/button"

interface ComoFuncionaProps {
  onOpenSofia: () => void
}

const STEPS = [
  {
    number: "01",
    title: "Cadastro rápido",
    text: "Converse com a Sofia, nossa assistente virtual, e conte um pouco sobre você. Leva menos de 2 minutos.",
  },
  {
    number: "02",
    title: "Aprovação do perfil",
    text: "Nossa equipe analisa seu cadastro e libera o acesso ao catálogo e aos materiais de revenda.",
  },
  {
    number: "03",
    title: "Treinamento e catálogo",
    text: "Você recebe treinamento completo, tabela de preços e conteúdo pronto para divulgar.",
  },
  {
    number: "04",
    title: "Primeiras vendas",
    text: "Comece a vender para amigas, família e redes sociais — no seu ritmo, com nosso suporte.",
  },
]

export function ComoFunciona({ onOpenSofia }: ComoFuncionaProps) {
  return (
    <section id="como-funciona" className="bg-secondary/50 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-muted-foreground">
            Do primeiro contato até a sua primeira venda, um caminho simples e guiado.
          </p>
        </Reveal>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 0.1} className="relative">
              <div className="flex flex-col gap-3">
                <span className="font-display text-4xl font-semibold text-gold/70">
                  {step.number}
                </span>
                <h3 className="font-medium text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14 flex justify-center">
          <Button size="lg" variant="gold" onClick={onOpenSofia}>
            Quero começar agora
          </Button>
        </Reveal>
      </div>
    </section>
  )
}

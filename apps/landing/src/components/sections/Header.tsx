import { Button } from "@/components/ui/button"

interface HeaderProps {
  onOpenSofia: () => void
}

const NAV_LINKS = [
  { href: "#quem-somos", label: "Quem somos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#faq", label: "Dúvidas" },
]

export function Header({ onOpenSofia }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a
          href="#top"
          className="shrink-0 font-display text-lg font-semibold tracking-wide text-foreground sm:text-xl"
        >
          Tania Joias
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <Button variant="gold" size="sm" onClick={onOpenSofia} className="shrink-0 whitespace-nowrap">
          <span className="hidden sm:inline">Quero ser revendedora</span>
          <span className="sm:hidden">Cadastre-se</span>
        </Button>
      </div>
    </header>
  )
}

import { Instagram, MapPin, Phone } from "lucide-react"

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="font-display text-lg font-semibold text-foreground">Tania Joias</p>
        <p className="text-xs text-muted-foreground">
          © {year} Tania Joias. Todos os direitos reservados. Semijoias premium para
          revendedoras em todo o Brasil.
        </p>
        <a
          href="https://www.instagram.com/taniajoias_/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram da Tania Joias"
          className="flex items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-gold"
        >
          <Instagram className="size-5" />
        </a>
      </div>

      <div className="mx-auto mt-6 flex max-w-6xl flex-col items-center gap-2 border-t border-border px-6 pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-center sm:gap-6">
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 shrink-0" />
          R. Vereador Fernando Zanella, 13 — 1º andar, sala 04, Centro, Mauá/SP
        </span>
        <a href="tel:+551146370390" className="flex items-center gap-1.5 hover:text-foreground">
          <Phone className="size-3.5 shrink-0" />
          (11) 94637-0390
        </a>
      </div>
    </footer>
  )
}

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="font-display text-lg font-semibold text-foreground">Tania Joias</p>
        <p className="text-xs text-muted-foreground">
          © {year} Tania Joias. Todos os direitos reservados. Semijoias premium para
          revendedoras em todo o Brasil.
        </p>
      </div>
    </footer>
  )
}

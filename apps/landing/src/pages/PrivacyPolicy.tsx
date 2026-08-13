const sections = [
  {
    title: "1. Dados que podemos coletar",
    body: "Podemos coletar nome, telefone, cidade, respostas fornecidas em formulÃ¡rios ou conversas, dados de candidatura e informaÃ§Ãµes tÃ©cnicas de acesso, como data, horÃ¡rio, dispositivo e origem da visita.",
  },
  {
    title: "2. Como usamos os dados",
    body: "Usamos os dados para atender interessadas, conduzir processos de cadastro e seleÃ§Ã£o de revendedoras, responder mensagens, enviar informaÃ§Ãµes solicitadas, melhorar nossos serviÃ§os, prevenir fraudes e cumprir obrigaÃ§Ãµes legais.",
  },
  {
    title: "3. WhatsApp e comunicaÃ§Ãµes",
    body: "Quando vocÃª entra em contato pelo WhatsApp, tratamos seu nÃºmero, nome de perfil e o conteÃºdo das mensagens para prestar atendimento. Mensagens iniciadas pela Tania Joias respeitarÃ£o as permissÃµes concedidas, as regras da Plataforma WhatsApp Business e a legislaÃ§Ã£o aplicÃ¡vel.",
  },
  {
    title: "4. Compartilhamento",
    body: "Os dados podem ser processados por fornecedores essenciais de tecnologia, hospedagem, banco de dados e comunicaÃ§Ã£o, incluindo Meta/WhatsApp, Vercel e Supabase, somente na medida necessÃ¡ria para operar os serviÃ§os. NÃ£o vendemos dados pessoais.",
  },
  {
    title: "5. Armazenamento e seguranÃ§a",
    body: "Mantemos os dados pelo tempo necessÃ¡rio Ã s finalidades informadas, ao exercÃ­cio regular de direitos e ao cumprimento de obrigaÃ§Ãµes legais. Adotamos medidas tÃ©cnicas e administrativas razoÃ¡veis para protegÃª-los contra acesso, alteraÃ§Ã£o ou divulgaÃ§Ã£o indevidos.",
  },
  {
    title: "6. Seus direitos",
    body: "Nos termos da LGPD, vocÃª pode solicitar confirmaÃ§Ã£o do tratamento, acesso, correÃ§Ã£o, portabilidade, informaÃ§Ãµes sobre compartilhamento, revogaÃ§Ã£o do consentimento e, quando aplicÃ¡vel, anonimizaÃ§Ã£o, bloqueio ou exclusÃ£o dos dados.",
  },
  {
    title: "7. ExclusÃ£o de dados",
    body: "Para solicitar acesso, correÃ§Ã£o ou exclusÃ£o de seus dados, envie um e-mail para taniajoiasmaua@gmail.com, informando seu nome e telefone. Poderemos solicitar informaÃ§Ãµes adicionais apenas para confirmar a identidade do solicitante.",
  },
  {
    title: "8. AtualizaÃ§Ãµes desta polÃ­tica",
    body: "Esta polÃ­tica pode ser atualizada para refletir mudanÃ§as legais ou operacionais. A versÃ£o vigente estarÃ¡ sempre disponÃ­vel nesta pÃ¡gina.",
  },
]

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <a href="/" className="font-display text-xl font-semibold">
            Tania Joias
          </a>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Voltar ao site
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-gold">
          Privacidade e proteÃ§Ã£o de dados
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          PolÃ­tica de Privacidade
        </h1>
        <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
          A Tania Joias respeita sua privacidade e trata dados pessoais com transparÃªncia,
          seguranÃ§a e de acordo com a Lei Geral de ProteÃ§Ã£o de Dados (LGPD). Esta polÃ­tica
          explica como os dados sÃ£o tratados em nosso site, formulÃ¡rios e atendimento pelo
          WhatsApp.
        </p>

        <div className="mt-12 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-2xl font-semibold">{section.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <section className="mt-12 rounded-2xl border border-border bg-secondary p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold">Contato</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Controladora: Tania Joias<br />
            E-mail: <a className="underline hover:text-foreground" href="mailto:taniajoiasmaua@gmail.com">taniajoiasmaua@gmail.com</a>
          </p>
        </section>

        <p className="mt-8 text-sm text-muted-foreground">Ãšltima atualizaÃ§Ã£o: 13 de agosto de 2026.</p>
      </main>
    </div>
  )
}

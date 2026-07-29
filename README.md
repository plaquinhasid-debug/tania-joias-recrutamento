# Tania Joias — Captação de Revendedoras

Monorepo com duas aplicações independentes sobre o mesmo backend Supabase (projeto `tania-joias-crm`).

- `apps/landing` — Landing Page + assistente Sofia (capta candidatas).
- `apps/admin` — Painel administrativo (gerencia candidatas, CRM, relatórios).
- `packages/shared` — tipos gerados do Supabase, constantes e schemas Zod compartilhados.
- `supabase/functions/finalize-candidate` — Edge Function que calcula IPR/perfil/status e grava o lead (único ponto de escrita da tabela `leads`).

## Rodando localmente

```bash
npm install
npm run dev:landing   # http://localhost:5173
npm run dev:admin     # http://localhost:5174
```

Cada app já tem um `.env` com a URL e a anon key do projeto Supabase (`.env.example` documenta as variáveis).

## Contas da equipe (painel admin)

O painel usa Supabase Auth (email/senha). Crie as contas da equipe pelo Supabase Studio → Authentication → Add user. Não há tela pública de cadastro.

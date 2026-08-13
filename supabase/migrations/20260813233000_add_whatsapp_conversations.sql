create table if not exists public.whatsapp_contacts (
  telefone text primary key,
  nome text null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text not null unique,
  telefone text not null references public.whatsapp_contacts(telefone) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null default 'text',
  body text null,
  status text null,
  raw_payload jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_phone_created_idx
  on public.whatsapp_messages (telefone, created_at desc);

alter table public.whatsapp_contacts enable row level security;
alter table public.whatsapp_messages enable row level security;

comment on table public.whatsapp_contacts is 'Contatos que conversaram com o numero oficial da Tania Joias pela Cloud API.';
comment on table public.whatsapp_messages is 'Mensagens recebidas e enviadas pela integracao oficial do WhatsApp.';

-- Interfaces de UI do bender-3d-mcp. Acesso só pelo servidor (chave service_role, que ignora RLS).
create table if not exists public.interfaces (
  id text primary key,
  nome text not null,
  dados jsonb not null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.interfaces enable row level security;
-- Sem políticas: anon e authenticated não leem nem escrevem.

create index if not exists interfaces_atualizada_idx on public.interfaces (atualizada_em desc);

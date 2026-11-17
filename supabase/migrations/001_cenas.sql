-- Cenas do bender-3d-mcp. Acesso só pelo servidor (chave service_role, que ignora RLS).
create table if not exists public.cenas (
  id text primary key,
  nome text not null,
  dados jsonb not null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.cenas enable row level security;
-- Sem políticas: anon e authenticated não leem nem escrevem.

create index if not exists cenas_atualizada_idx on public.cenas (atualizada_em desc);

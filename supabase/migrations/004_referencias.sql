create table if not exists public.referencias (
  id text primary key,
  tipo text not null check (tipo in ('3d', '2d', 'pixelart', 'interface')),
  nome text not null,
  descricao text not null default '',
  dados jsonb not null,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);

alter table public.referencias enable row level security;

create index if not exists referencias_tipo_idx on public.referencias (tipo, atualizada_em desc);

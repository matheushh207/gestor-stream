-- Executar no SQL Editor do Supabase (projeto: qghdhewbssfatxmhnwng)
-- Depois: Authentication > Providers > Email > desabilitar "Confirm email" se quiser cadastro direto de revenda pelo admin.

-- Extensões
create extension if not exists "uuid-ossp";

-- Tabelas
create table if not exists public.revendas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  status text not null default 'ativo' check (status in ('ativo', 'bloqueado')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_revenda (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  revenda_id uuid references public.revendas (id) on delete cascade,
  role text not null check (role in ('admin', 'revenda')),
  unique (user_id)
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  revenda_id uuid not null references public.revendas (id) on delete cascade,
  nome text not null,
  whatsapp text,
  usuario text,
  senha text,
  plano text,
  valor numeric(12,2) default 0,
  vencimento date,
  status text not null default 'ativo' check (status in ('ativo', 'vencido', 'teste', 'suspenso')),
  created_at timestamptz not null default now()
);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  valor numeric(12,2) not null,
  metodo text not null check (metodo in ('pix', 'dinheiro', 'cartao')),
  pago_em timestamptz not null default now()
);

create index if not exists idx_user_revenda_user on public.user_revenda (user_id);
create index if not exists idx_user_revenda_revenda on public.user_revenda (revenda_id);
create index if not exists idx_clientes_revenda on public.clientes (revenda_id);
create index if not exists idx_pagamentos_cliente on public.pagamentos (cliente_id);

-- RLS
alter table public.revendas enable row level security;
alter table public.user_revenda enable row level security;
alter table public.clientes enable row level security;
alter table public.pagamentos enable row level security;

-- Funções auxiliares (security definer para evitar recursão em policies)
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_revenda ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  );
$$;

create or replace function public.my_revenda_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ur.revenda_id from public.user_revenda ur
  where ur.user_id = auth.uid() and ur.role = 'revenda'
  limit 1;
$$;

-- revendas
drop policy if exists "revendas_select" on public.revendas;
create policy "revendas_select" on public.revendas for select using (
  public.is_platform_admin() or id = public.my_revenda_id()
);

drop policy if exists "revendas_insert_admin" on public.revendas;
create policy "revendas_insert_admin" on public.revendas for insert with check (public.is_platform_admin());

drop policy if exists "revendas_update_admin" on public.revendas;
create policy "revendas_update_admin" on public.revendas for update using (public.is_platform_admin());

-- user_revenda
drop policy if exists "user_revenda_select_own" on public.user_revenda;
create policy "user_revenda_select_own" on public.user_revenda for select using (
  public.is_platform_admin() or user_id = auth.uid()
);

drop policy if exists "user_revenda_insert_admin" on public.user_revenda;
create policy "user_revenda_insert_admin" on public.user_revenda for insert with check (public.is_platform_admin());

drop policy if exists "user_revenda_update_admin" on public.user_revenda;
create policy "user_revenda_update_admin" on public.user_revenda for update using (public.is_platform_admin());

-- clientes
drop policy if exists "clientes_all" on public.clientes;
create policy "clientes_all" on public.clientes for all using (
  public.is_platform_admin() or revenda_id = public.my_revenda_id()
) with check (
  public.is_platform_admin() or revenda_id = public.my_revenda_id()
);

-- pagamentos (via cliente pertencente à revenda)
drop policy if exists "pagamentos_select" on public.pagamentos;
create policy "pagamentos_select" on public.pagamentos for select using (
  public.is_platform_admin()
  or exists (
    select 1 from public.clientes c
    where c.id = pagamentos.cliente_id and c.revenda_id = public.my_revenda_id()
  )
);

drop policy if exists "pagamentos_insert" on public.pagamentos;
create policy "pagamentos_insert" on public.pagamentos for insert with check (
  public.is_platform_admin()
  or exists (
    select 1 from public.clientes c
    where c.id = pagamentos.cliente_id and c.revenda_id = public.my_revenda_id()
  )
);

drop policy if exists "pagamentos_update" on public.pagamentos;
create policy "pagamentos_update" on public.pagamentos for update using (
  public.is_platform_admin()
  or exists (
    select 1 from public.clientes c
    where c.id = pagamentos.cliente_id and c.revenda_id = public.my_revenda_id()
  )
);

drop policy if exists "pagamentos_delete" on public.pagamentos;
create policy "pagamentos_delete" on public.pagamentos for delete using (
  public.is_platform_admin()
  or exists (
    select 1 from public.clientes c
    where c.id = pagamentos.cliente_id and c.revenda_id = public.my_revenda_id()
  )
);

-- Vincular usuário já existente em auth.users à revenda (admin). Crie o usuário em Authentication > Users antes.
create or replace function public.admin_link_revenda_user(p_revenda_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso negado';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Usuário não encontrado. Crie o usuário em Authentication (Supabase) primeiro.';
  end if;
  insert into public.user_revenda (user_id, revenda_id, role)
  values (uid, p_revenda_id, 'revenda')
  on conflict (user_id) do update set revenda_id = excluded.revenda_id, role = 'revenda';
end;
$$;

grant execute on function public.admin_link_revenda_user(uuid, text) to authenticated;

-- Login: primeiro acesso com o e-mail oficial cria o perfil admin (sem SQL manual).
-- E-mail: manter igual a src/config/plataforma.js  (returns json para PostgREST)
drop function if exists public.bootstrap_platform_admin();

create or replace function public.bootstrap_platform_admin()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uemail text;
  official constant text := 'matheush.h207@gmail.com';
  admin_count int;
begin
  select email into uemail from auth.users where id = auth.uid();
  if uemail is null then
    raise exception 'Sessão inválida';
  end if;

  if exists (select 1 from public.user_revenda where user_id = auth.uid()) then
    return json_build_object('ok', true, 'skipped', 'already_has_profile');
  end if;

  if lower(trim(uemail)) <> lower(official) then
    return json_build_object('ok', true, 'skipped', 'not_official_email');
  end if;

  select count(*)::int into admin_count from public.user_revenda where role = 'admin';
  if admin_count > 0 then
    raise exception 'Já existe administrador na plataforma.';
  end if;

  insert into public.user_revenda (user_id, revenda_id, role)
  values (auth.uid(), null, 'admin');

  return json_build_object('ok', true, 'created', true);
end;
$$;

grant execute on function public.bootstrap_platform_admin() to authenticated;

notify pgrst, 'reload schema';

-- Apenas UM usuário pode ser admin da plataforma (dono do SaaS)
create unique index if not exists idx_apenas_um_admin_plataforma
  on public.user_revenda ((1))
  where role = 'admin';

-- Vincular o admin oficial ao Auth: ver supabase/admin-plataforma.sql (e-mail fixo no repositório)

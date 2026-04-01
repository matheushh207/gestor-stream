-- Rode TODO este bloco no SQL Editor do Supabase (uma vez).
-- Corrige: "Could not find the function public.bootstrap_platform_admin in the schema cache"
-- E-mail admin: igual a src/config/plataforma.js

-- Se existia versão antiga (returns void), remove para recriar com returns json (melhor no PostgREST).
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

-- Atualiza o cache da API (PostgREST) para enxergar a função
notify pgrst, 'reload schema';

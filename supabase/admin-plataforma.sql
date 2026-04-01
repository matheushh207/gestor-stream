-- =============================================================================
-- ADMIN ÚNICO DA PLATAFORMA (SaaS) — uso MANUAL (opcional)
-- =============================================================================
-- E-mail oficial: matheush.h207@gmail.com (igual src/config/plataforma.js)
--
-- No fluxo normal NÃO precisa deste arquivo: após o login, a função
-- public.bootstrap_platform_admin() cria o perfil admin automaticamente.
--
-- Use este SQL só se quiser forçar o vínculo manualmente ou corrigir dados.
--
-- Regra: só pode existir UM usuário com role = admin (índice no schema.sql).
-- =============================================================================

-- Garante no máximo 1 admin (se ainda não aplicou o schema completo novo)
create unique index if not exists idx_apenas_um_admin_plataforma
  on public.user_revenda ((1))
  where role = 'admin';

-- Vincula o usuário do Auth a admin (único)
insert into public.user_revenda (user_id, revenda_id, role)
select u.id, null, 'admin'
from auth.users u
where lower(u.email) = lower('matheush.h207@gmail.com')
on conflict (user_id) do update
  set revenda_id = excluded.revenda_id,
      role = 'admin';

-- Se não inseriu nenhuma linha, o usuário ainda não existe no Auth:
-- crie em Authentication > Users ou use signup, depois rode de novo este arquivo.

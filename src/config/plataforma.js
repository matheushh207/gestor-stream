/**
 * E-mail do único admin da plataforma (dono do SaaS). Deve ser o mesmo e-mail na função
 * SQL public.bootstrap_platform_admin() e em supabase/bootstrap-admin.sql.
 *
 * Senha fica só no Supabase Auth (nunca no código). No login, a RPC bootstrap_platform_admin
 * cria a linha em user_revenda para este e-mail se ainda não existir admin.
 *
 * Autorização real: user_revenda + RLS. Este export é referência / possível UI.
 */
export const EMAIL_ADMIN_PLATAFORMA = 'matheush.h207@gmail.com'

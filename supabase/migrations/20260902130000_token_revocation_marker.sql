-- Revogacao de sessoes sem rotacionar o JWT secret.
--
-- Os tokens emitidos pela auth-cpf sao JWT autoassinados: nao ha sessao no
-- servidor, e o token de admin vale 10 anos. Trocar a senha NAO invalida um
-- token ja emitido -- quem tem um continua entrando. A unica revogacao
-- possivel era rotacionar o JWT secret do projeto, que tambem assina a anon
-- key e a service_role key e derrubaria os tres apps e as Edge Functions.
--
-- Marco por usuario: todo token emitido ANTES de tokens_valid_from deixa de
-- valer como admin. Deslogar todas as sessoes de alguem vira:
--     UPDATE profiles SET tokens_valid_from = now() WHERE id = '...';
-- Para reverter, basta voltar a coluna para NULL.
--
-- A regra e aplicada nos dois caminhos:
--   1. PostgREST/RLS, via is_admin() (abaixo);
--   2. Edge Function auth-cpf, em verifyAdmin(), que valida o x-admin-token
--      sem passar pelo banco.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tokens_valid_from timestamptz;

COMMENT ON COLUMN public.profiles.tokens_valid_from IS
  'Tokens emitidos antes deste instante nao valem mais. Defina como now() para deslogar o usuario de todas as sessoes.';

REVOKE UPDATE (tokens_valid_from) ON public.profiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND (
        p.tokens_valid_from IS NULL
        -- iat do JWT >= marco. Se o claim faltar, a comparacao vira NULL e o
        -- EXISTS falha: falha fechado, que e o comportamento desejado aqui.
        OR to_timestamp(
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'iat')::numeric
           ) >= p.tokens_valid_from
      )
  );
$function$;

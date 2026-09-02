-- F-02 (crítico): qualquer usuário autenticado conseguia virar admin.
--
-- A policy de UPDATE tinha apenas USING (auth.uid() = id) e nenhum WITH CHECK
-- limitando colunas. No Postgres isso impede trocar o id da linha, mas libera
-- alterar qualquer OUTRA coluna da própria linha -- inclusive `role`. Como
-- `authenticated` tinha GRANT de UPDATE na tabela inteira e a constraint
-- profiles_role_check aceita 'admin', bastava:
--     PATCH /rest/v1/profiles?id=eq.<uuid>  {"role":"admin"}
-- e is_admin() passava a valer para o atacante, derrubando todo o RLS.
--
-- Correção em duas camadas:
--   1) WITH CHECK explícito na policy (a linha resultante segue sendo a do dono);
--   2) privilégio por COLUNA: o usuário só escreve campos de perfil. As colunas
--      sensíveis (role, cpf, password_hash, reseller_id, id) ficam sem GRANT de
--      UPDATE, então o Postgres barra a escrita no executor, antes do RLS.
--
-- service_role e postgres mantêm UPDATE na tabela inteira, de modo que a Edge
-- Function auth-cpf (reset_password, register, delete_user) continua funcionando.
-- Por isso não usamos trigger: dentro de SECURITY DEFINER o current_user vira o
-- dono da função, o que tornaria a checagem de papel não confiável.

BEGIN;

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- anon nunca escreve em profiles; authenticated só nos campos editáveis do perfil.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, pix_key, cidade) ON public.profiles TO authenticated;

-- `phone` fica de fora de propósito: o trigger on_profile_phone_set dispara
-- link_bets_by_phone() (SECURITY DEFINER, ignora RLS), que reivindica todas as
-- apostas órfãs com aquele telefone. Poder editar o próprio telefone permitia
-- assumir apostas de terceiros (F-07). Nenhuma tela do app edita phone hoje.
COMMENT ON COLUMN public.profiles.role IS
  'Somente service_role/admin altera. GRANT de UPDATE negado a authenticated (ver migration 20260902120000).';

COMMIT;

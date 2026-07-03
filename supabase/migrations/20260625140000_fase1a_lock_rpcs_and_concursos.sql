-- Fase 1a: corrige a policy permissiva de concursos e revoga execução anônima
-- das funções SECURITY DEFINER sensíveis (mantendo só as realmente públicas).
-- Depende da Fase 3 (auth real) estar no ar — admin/usuários enviam JWT válido.

-- 1) concursos: troca USING(true) por is_admin() para escrita; SELECT segue público.
DROP POLICY IF EXISTS "Public management concursos" ON public.concursos;
CREATE POLICY "Admins manage concursos" ON public.concursos
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- 2) revoga EXECUTE de anon/PUBLIC nas SECURITY DEFINER, exceto as públicas.
DO $$
DECLARE
  r record;
  public_ok text[] := ARRAY[
    'get_prize_estimates','get_system_setting','get_bet_pricing',
    'check_betting_lock','is_admin','profile_exists'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef = true
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
      AND p.proname <> ALL(public_ok)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

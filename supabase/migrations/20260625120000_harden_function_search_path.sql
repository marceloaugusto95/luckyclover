-- Fase 4 (hardening de segurança): fixa search_path nas funções próprias do schema public.
-- Resolve o lint 0011 (function_search_path_mutable) reportado pelos advisors da Supabase.
-- Exclui funções pertencentes a extensões (ex.: pg_trgm) que não podemos alterar.
-- search_path = public, pg_catalog preserva a resolução de nomes atual (zero impacto funcional).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_catalog', r.sig);
  END LOOP;
END $$;

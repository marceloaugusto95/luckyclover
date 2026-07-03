-- Fase 1b (escopo): guarda por dono/role em funções per-user (plpgsql, SECURITY DEFINER).
-- get_user_bets/get_reseller_bets/register/search: só o próprio dono (ou admin).
-- get_winners (PIX/telefone): só admin ou revendedor.
DO $$
DECLARE
  oid_ oid;
  def text;
  guard text;
  item jsonb;
  pairs jsonb := jsonb_build_array(
    jsonb_build_object('fn','get_user_bets','cond','p_user_id = auth.uid() OR public.is_admin()'),
    jsonb_build_object('fn','get_reseller_bets','cond','EXISTS (SELECT 1 FROM public.resellers r WHERE r.id = p_reseller_id AND r.user_id = auth.uid()) OR public.is_admin()'),
    jsonb_build_object('fn','register_reseller_client','cond','p_reseller_user_id = auth.uid() OR public.is_admin()'),
    jsonb_build_object('fn','search_clients_for_reseller','cond','p_reseller_user_id = auth.uid() OR public.is_admin()'),
    jsonb_build_object('fn','get_winners','cond','public.is_admin() OR (auth.jwt() ->> ''user_role'') = ''reseller''')
  );
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(pairs)
  LOOP
    SELECT p.oid INTO oid_
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = (item->>'fn') AND p.prosecdef
      AND p.prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
    LIMIT 1;
    IF oid_ IS NULL THEN CONTINUE; END IF;
    def := pg_get_functiondef(oid_);
    IF position('__SCOPE_GUARD__' in def) > 0 THEN CONTINUE; END IF;
    guard := E'\nBEGIN\n  -- __SCOPE_GUARD__\n  IF NOT (' || (item->>'cond') || E') THEN RAISE EXCEPTION ''Acesso negado'' USING ERRCODE = ''42501''; END IF;\n';
    def := regexp_replace(def, E'\nBEGIN\n', guard);
    EXECUTE def;
  END LOOP;
END $$;

-- Fase 1b: adiciona guarda is_admin() nas funções administrativas (plpgsql).
-- Impede que um usuário logado não-admin chame RPCs administrativas.
-- Idempotente: pula se a guarda já existir. Injeta logo após o primeiro BEGIN.
DO $$
DECLARE
  r record;
  admin_fns text[] := ARRAY[
    'check_winners','get_admin_metrics','get_all_bets','get_all_clients',
    'get_all_resellers','get_bet_details','get_general_reseller_report',
    'get_recent_transactions','insert_reseller','process_draw',
    'toggle_bet_pricing_status','update_bet_price','update_reseller_commission',
    'update_system_settings'
  ];
  def text;
  newdef text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(admin_fns) AND p.prosecdef AND p.prolang =
          (SELECT oid FROM pg_language WHERE lanname='plpgsql')
  LOOP
    def := pg_get_functiondef(r.oid);
    IF position('__ADMIN_GUARD__' in def) > 0 THEN CONTINUE; END IF;
    newdef := regexp_replace(
      def,
      E'\nBEGIN\n',
      E'\nBEGIN\n  -- __ADMIN_GUARD__\n  IF NOT public.is_admin() THEN RAISE EXCEPTION ''Acesso negado: requer admin'' USING ERRCODE = ''42501''; END IF;\n'
    );
    EXECUTE newdef;
  END LOOP;
END $$;

-- F-03 (crítico, parte 2): a policy de INSERT de bets valida apenas o dono
-- (user_id / reseller_id) e não restringe colunas. Um cliente podia inserir uma
-- aposta já com payment_status='paid' e status='confirmed' e pular o pagamento
-- por completo -- um bypass ainda mais direto que o do carrinho.
--
-- Nenhum fluxo legítimo faz isso: os apps cliente e revendedor sempre gravam
-- 'pending'. Por isso normalizamos no banco em vez de recusar o INSERT, o que
-- mantém os três apps funcionando sem nenhuma alteração de código.

CREATE OR REPLACE FUNCTION public.force_new_bet_unpaid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- auth.role() lê o claim 'role' do JWT: 'service_role' identifica as Edge
  -- Functions (pix-webhook / pix-create-charge), únicas autorizadas a marcar
  -- pagamento. Funciona também dentro de SECURITY DEFINER, ao contrário de
  -- current_user, que ali passa a ser o dono da função.
  IF coalesce(auth.role(), '') <> 'service_role' AND NOT is_admin() THEN
    NEW.payment_status := 'pending';
    NEW.status         := 'pending';
    NEW.payment_id     := NULL;
    NEW.hits           := 0;
    NEW.prize_amount   := 0;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_force_new_bet_unpaid ON public.bets;
CREATE TRIGGER tr_force_new_bet_unpaid
  BEFORE INSERT ON public.bets
  FOR EACH ROW EXECUTE FUNCTION public.force_new_bet_unpaid();

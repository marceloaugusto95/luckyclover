-- check_winners cascata-aware: retorna os ganhadores da faixa REALMENTE premiada.
-- Regra (igual ao process_draw): se há Sena (6), premiados = {6,5} (split normal);
-- senão, 100% do prêmio desce para a maior faixa com ganhador (5,4,3,2,1).
-- Mantém a guarda de admin e a assinatura de retorno existente.
CREATE OR REPLACE FUNCTION public.check_winners(concurso_num integer, winning_numbers integer[])
 RETURNS TABLE(bet_id uuid, user_name text, user_phone text, user_pix text, bet_numbers integer[], hits integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_max_hits integer;
  v_winning_hits integer[];
BEGIN
  -- __ADMIN_GUARD__
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado: requer admin' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(MAX(hc), 0) INTO v_max_hits
  FROM (
    SELECT (SELECT COUNT(*) FROM unnest(b.numbers) bn WHERE bn = ANY(winning_numbers)) AS hc
    FROM bets b
    WHERE b.concurso = concurso_num AND b.payment_status = 'paid'
  ) s;

  v_winning_hits := CASE
    WHEN v_max_hits >= 6 THEN ARRAY[6, 5]
    WHEN v_max_hits >= 1 THEN ARRAY[v_max_hits]
    ELSE ARRAY[]::integer[]
  END;

  RETURN QUERY
  SELECT
    b.id AS bet_id,
    COALESCE(b.client_name, p.full_name) AS user_name,
    COALESCE(b.client_phone, p.phone) AS user_phone,
    COALESCE(p.pix_key, b.client_pix) AS user_pix,
    b.numbers AS bet_numbers,
    (SELECT COUNT(*)::integer FROM unnest(b.numbers) bn WHERE bn = ANY(winning_numbers)) AS hits
  FROM bets b
  LEFT JOIN profiles p ON b.user_id = p.id
  WHERE b.concurso = concurso_num
    AND b.payment_status = 'paid'
    AND (SELECT COUNT(*) FROM unnest(b.numbers) bn WHERE bn = ANY(winning_numbers)) = ANY(v_winning_hits)
  ORDER BY hits DESC;
END;
$function$;

-- get_prize_estimates voltou a ser SECURITY INVOKER na migration de cascata e,
-- com o RLS de bets ligado, passou a somar só as apostas visíveis ao chamador
-- (anon/cliente => pool 0, prêmio R$ 0,00). Volta a SECURITY DEFINER para calcular
-- o pool real. Retorna apenas agregados (sem PII), então pode permanecer público.
CREATE OR REPLACE FUNCTION public.get_prize_estimates(concurso_num integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    settings_json JSONB;
    sena_pct DECIMAL(5,2);
    quina_pct DECIMAL(5,2);
BEGIN
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    prize_pool := total_sales * 0.70;

    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);

    sena_prize := prize_pool * sena_pct;
    quina_prize := prize_pool * quina_pct;

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', 0,
        'bets_count', valid_bets_count,
        'sena_pct', sena_pct,
        'quina_pct', quina_pct,
        'cascading', true
    );
END;
$function$;

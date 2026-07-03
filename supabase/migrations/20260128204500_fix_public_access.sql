-- Migration: Secure Public Access via RPCs
-- Applied on: 2026-01-28
-- Description: Fixes broken public/admin pages caused by RLS by providing secure, aggregated data access via SECURITY DEFINER functions.

-- 1. FIX: get_prize_estimates
-- Change to SECURITY DEFINER so it can calculate totals even if user can't read individual bets
CREATE OR REPLACE FUNCTION public.get_prize_estimates(concurso_num integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER -- RUNS AS SUPERUSER
AS $function$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    quadra_prize DECIMAL(12,2);
    
    settings_json JSONB;
    sena_pct DECIMAL(5,2);
    quina_pct DECIMAL(5,2);
    quadra_pct DECIMAL(5,2);
BEGIN
    -- Calculate total sales for the contest (only paid bets)
    -- This works now because SECURITY DEFINER bypasses RLS
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Logic: 70% of Revenue is Prize Pool
    prize_pool := total_sales * 0.70;

    -- Fetch distribution settings
    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    
    -- Default to 70% Sena, 30% Quina if not set
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);
    quadra_pct := 0;

    -- Calculate prizes
    sena_prize := prize_pool * sena_pct;
    quina_prize := prize_pool * quina_pct;
    quadra_prize := prize_pool * quadra_pct;

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', quadra_prize,
        'bets_count', valid_bets_count,
        'sena_pct', sena_pct,
        'quina_pct', quina_pct
    );
END;
$function$;

-- 2. NEW: get_contest_stats
-- Valid replacement for ConcursosPage.tsx manual aggregation
CREATE OR REPLACE FUNCTION public.get_contest_stats()
 RETURNS TABLE (
    concurso integer,
    total_revenue numeric,
    total_bets bigint
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.concurso,
        COALESCE(SUM(b.amount), 0) as total_revenue,
        COUNT(b.id) as total_bets
    FROM bets b
    GROUP BY b.concurso
    ORDER BY b.concurso DESC;
END;
$function$;

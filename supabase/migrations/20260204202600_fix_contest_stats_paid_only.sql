-- Migration: Fix get_contest_stats to only count paid bets
-- Purpose: Ensure total_revenue only includes confirmed payments

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
    WHERE b.payment_status = 'paid'
    GROUP BY b.concurso
    ORDER BY b.concurso DESC;
END;
$function$;

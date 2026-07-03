-- Migration: Fix get_contest_stats to include total_commission per contest
-- Joins with transactions table to sum commission amounts tied to bets in each contest

CREATE OR REPLACE FUNCTION public.get_contest_stats()
 RETURNS TABLE (
    concurso integer,
    total_revenue numeric,
    total_bets bigint,
    total_commission numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.concurso,
        COALESCE(SUM(b.amount), 0) as total_revenue,
        COUNT(b.id) as total_bets,
        COALESCE(SUM(t.commission_amount), 0) as total_commission
    FROM bets b
    LEFT JOIN (
        SELECT tr.bet_id, tr.amount as commission_amount
        FROM transactions tr
        WHERE tr.type = 'commission'
        AND tr.status = 'completed'
    ) t ON t.bet_id = b.id
    WHERE b.payment_status = 'paid'
    GROUP BY b.concurso
    ORDER BY b.concurso DESC;
END;
$function$;

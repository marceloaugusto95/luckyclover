-- Add coupon_code to the get_contest_report_bets RPC
-- Shows which reseller coupon the bet was placed with, or NULL if placed directly via the app
DROP FUNCTION IF EXISTS get_contest_report_bets(INTEGER);

CREATE OR REPLACE FUNCTION get_contest_report_bets(p_concurso INTEGER)
RETURNS TABLE (
    bet_id UUID,
    client_name TEXT,
    phone TEXT,
    reseller_name TEXT,
    numbers INTEGER[],
    status TEXT,
    payment_status TEXT,
    hits INTEGER,
    amount NUMERIC,
    created_at TIMESTAMPTZ,
    ticket_number TEXT,
    coupon_code TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        COALESCE(p.full_name, b.client_name, 'Anônimo') AS client_name,
        COALESCE(p.phone, b.client_phone) AS phone,
        COALESCE(rp.full_name, 'Direto') AS reseller_name,
        b.numbers,
        b.status,
        b.payment_status,
        b.hits,
        b.amount,
        b.created_at,
        b.ticket_number,
        r.coupon_code
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    LEFT JOIN public.resellers r ON b.reseller_id = r.id
    LEFT JOIN public.profiles rp ON r.user_id = rp.id
    WHERE b.concurso = p_concurso
    AND b.payment_status = 'paid'
    ORDER BY 
        CASE WHEN b.hits IS NULL THEN 0 ELSE b.hits END DESC,
        b.created_at ASC;
END;
$$ LANGUAGE plpgsql;

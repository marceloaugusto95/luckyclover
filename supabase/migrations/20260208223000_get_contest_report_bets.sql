-- Migration: Create get_contest_report_bets RPC
-- Purpose: Retrieve detailed bet information for a specific contest for the Admin Report (PDF).
-- Returns: client name, phone, reseller name (if any), numbers, status, hits, amount.

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
    amount DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        COALESCE(p.full_name, b.client_name, 'Anônimo') AS client_name,
        COALESCE(p.phone, b.client_phone) AS phone,
        COALESCE(rp.full_name, 'Direto') AS reseller_name, -- 'Direto' if no reseller
        b.numbers,
        b.status,
        b.payment_status,
        b.hits,
        b.amount,
        b.created_at
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    LEFT JOIN public.resellers r ON b.reseller_id = r.id
    LEFT JOIN public.profiles rp ON r.user_id = rp.id
    WHERE b.concurso = p_concurso
    -- Include all paid bets, or maybe all bets? User said "apostas feitas".
    -- Let's include paid bets (processed) and confirmed ones.
    AND b.payment_status = 'paid'
    ORDER BY 
        CASE WHEN b.hits IS NULL THEN 0 ELSE b.hits END DESC,
        b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

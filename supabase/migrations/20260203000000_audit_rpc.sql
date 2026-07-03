-- Migration: Create Audit RPC Function
-- Purpose: Allow public access to anonymized bet data for a specific contest for transparency/audit.

CREATE OR REPLACE FUNCTION get_audit_bets(p_concurso INTEGER)
RETURNS TABLE (
    bet_id UUID,
    full_name TEXT,
    created_at TIMESTAMPTZ,
    numbers INTEGER[],
    status TEXT,
    hits INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        -- Take first 3 characters of name, pad with ***. Handle short names gracefully.
        CASE 
            WHEN LENGTH(p.full_name) > 3 THEN SUBSTRING(p.full_name, 1, 3) || '***'
            ELSE SUBSTRING(p.full_name, 1, 1) || '***'
        END AS full_name,
        b.created_at,
        b.numbers,
        b.status::TEXT,
        COALESCE(b.hits, 0) AS hits
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE b.concurso = p_concurso
    -- Include only valid bets (confirmed, won, lost)
    AND b.status IN ('confirmed', 'won', 'lost')
    AND b.payment_status = 'paid'
    ORDER BY b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon (public) and authenticated users
GRANT EXECUTE ON FUNCTION get_audit_bets(INTEGER) TO anon, authenticated, service_role;

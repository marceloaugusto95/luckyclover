-- Migration: Update Audit RPC Function to include Reseller Client Names
-- Purpose: Fix issue where bets created by resellers (without user_id) were showing as unnamed.

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
        -- Use user profile name if available, otherwise use client_name (from reseller bets)
        CASE 
            WHEN COALESCE(p.full_name, b.client_name) IS NULL THEN 'Anônimo'
            WHEN LENGTH(COALESCE(p.full_name, b.client_name)) > 3 THEN SUBSTRING(COALESCE(p.full_name, b.client_name), 1, 3) || '***'
            ELSE SUBSTRING(COALESCE(p.full_name, b.client_name), 1, 1) || '***'
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
    ORDER BY b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to anon (public) and authenticated users
GRANT EXECUTE ON FUNCTION get_audit_bets(INTEGER) TO anon, authenticated, service_role;

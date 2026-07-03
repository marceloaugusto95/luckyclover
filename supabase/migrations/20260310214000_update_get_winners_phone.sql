-- Update get_winners to COALESCE client_name/client_phone from bets table
-- This fixes the issue where reseller-created bets show "Cliente" and "Não informado"
-- instead of the actual client name and phone stored in the bets table.
DROP FUNCTION IF EXISTS get_winners(INTEGER);

CREATE OR REPLACE FUNCTION get_winners(p_concurso_number INTEGER)
RETURNS TABLE (
    bet_id UUID,
    user_id UUID,
    full_name TEXT,
    phone TEXT,
    pix_key TEXT,
    numbers INTEGER[],
    hits INTEGER,
    amount DECIMAL,
    client_name TEXT,
    client_phone TEXT,
    ticket_number TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        b.user_id,
        COALESCE(b.client_name, p.full_name) AS full_name,
        COALESCE(b.client_phone, p.phone) AS phone,
        p.pix_key,
        b.numbers,
        b.hits,
        b.amount,
        b.client_name,
        b.client_phone,
        b.ticket_number
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE b.concurso = p_concurso_number
    AND b.status = 'won'
    ORDER BY b.hits DESC, b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

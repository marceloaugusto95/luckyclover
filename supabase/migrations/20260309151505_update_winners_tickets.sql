-- Update get_winners to include client_name and ticket_number from bets
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
    ticket_number TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        b.user_id,
        p.full_name,
        p.phone,
        p.pix_key,
        b.numbers,
        b.hits,
        b.amount,
        b.client_name,
        b.ticket_number
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE b.concurso = p_concurso_number
    AND b.status = 'won'
    ORDER BY b.hits DESC, b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

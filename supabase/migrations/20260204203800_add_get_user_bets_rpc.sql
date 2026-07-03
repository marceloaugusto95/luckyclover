-- Migration: Add get_user_bets and get_reseller_bets RPC functions
-- Purpose: Allow users with custom CPF auth to fetch their own bets, bypassing RLS

CREATE OR REPLACE FUNCTION public.get_user_bets(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    concurso INTEGER,
    numbers INTEGER[],
    amount DECIMAL,
    status TEXT,
    payment_status TEXT,
    hits INTEGER,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.concurso,
        b.numbers,
        b.amount,
        b.status,
        b.payment_status,
        b.hits,
        b.created_at
    FROM bets b
    WHERE b.user_id = p_user_id
      AND b.payment_status = 'paid'
    ORDER BY b.created_at DESC;
END;
$function$;

-- Also add get_reseller_bets for resellers to see their sales
CREATE OR REPLACE FUNCTION public.get_reseller_bets(p_reseller_id UUID)
RETURNS TABLE (
    id UUID,
    concurso INTEGER,
    numbers INTEGER[],
    amount DECIMAL,
    status TEXT,
    payment_status TEXT,
    hits INTEGER,
    created_at TIMESTAMPTZ,
    client_name TEXT,
    client_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.concurso,
        b.numbers,
        b.amount,
        b.status,
        b.payment_status,
        b.hits,
        b.created_at,
        b.client_name,
        b.client_phone
    FROM bets b
    WHERE b.reseller_id = p_reseller_id
      AND b.payment_status = 'paid'
    ORDER BY b.created_at DESC;
END;
$function$;

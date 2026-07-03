-- Migration: Ensure all bet-related RPCs only show paid tickets
-- Purpose: Tickets with payment n confirmed should n be shown or counted in the apps.

-- 1. get_user_bets (Client App)
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

-- 2. get_reseller_bets (Reseller App)
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
    client_phone TEXT,
    ticket_number TEXT
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
        b.client_phone,
        b.ticket_number
    FROM public.bets b
    WHERE b.reseller_id = p_reseller_id
      AND b.payment_status = 'paid'
    ORDER BY b.created_at DESC;
END;
$function$;

-- 3. check_winners
CREATE OR REPLACE FUNCTION public.check_winners(concurso_num INTEGER, winning_numbers INTEGER[])
RETURNS TABLE (
    bet_id UUID,
    user_name TEXT,
    user_phone TEXT,
    user_pix TEXT,
    bet_numbers INTEGER[],
    hits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.id as bet_id,
        COALESCE(b.client_name, p.full_name) as user_name,
        COALESCE(b.client_phone, p.phone) as user_phone,
        p.pix_key as user_pix,
        b.numbers as bet_numbers,
        (
            SELECT COUNT(*)::INTEGER 
            FROM unnest(b.numbers) as bn
            WHERE bn = ANY(winning_numbers)
        ) as hits
    FROM 
        public.bets b
    LEFT JOIN 
        public.profiles p ON b.user_id = p.id
    WHERE 
        b.concurso = concurso_num
        AND b.payment_status = 'paid'
        AND (
            SELECT COUNT(*)
            FROM unnest(b.numbers) as bn
            WHERE bn = ANY(winning_numbers)
        ) >= 4; -- Show Quadra(4), Quina(5) and Sena(6)
END;
$function$;

-- 4. get_audit_bets
CREATE OR REPLACE FUNCTION public.get_audit_bets(p_concurso INTEGER)
RETURNS TABLE (
    bet_id UUID,
    full_name TEXT,
    created_at TIMESTAMPTZ,
    numbers INTEGER[],
    status TEXT,
    hits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
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
    AND b.payment_status = 'paid'
    ORDER BY b.created_at ASC;
END;
$function$;

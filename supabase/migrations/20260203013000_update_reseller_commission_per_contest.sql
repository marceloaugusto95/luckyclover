-- Migration: Update get_all_resellers to scope to Current Contest
-- Purpose: Total Sales and Commission should only reflect the currently OPEN contest.

DROP FUNCTION IF EXISTS get_all_resellers();

CREATE OR REPLACE FUNCTION get_all_resellers()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    business_name TEXT,
    full_name TEXT,
    user_cpf TEXT,
    user_phone TEXT,
    user_cidade TEXT,
    user_pix TEXT,
    total_sales NUMERIC,
    total_commission NUMERIC,
    commission_rate NUMERIC,
    coupon_code TEXT,
    is_active BOOLEAN,
    current_concurso INTEGER
) AS $$
DECLARE
    v_current_concurso INTEGER;
BEGIN
    -- Get current open contest
    SELECT concurso_number INTO v_current_concurso 
    FROM concursos 
    WHERE status = 'open' 
    ORDER BY concurso_number ASC 
    LIMIT 1;

    RETURN QUERY
    SELECT 
        r.id,
        r.user_id,
        COALESCE(r.business_name, p.full_name) AS business_name,
        p.full_name,
        p.cpf AS user_cpf,
        p.phone AS user_phone,
        p.cidade AS user_cidade,
        p.pix_key AS user_pix,
        COALESCE((
            SELECT SUM(b.amount)::NUMERIC
            FROM bets b 
            WHERE b.reseller_id = r.id 
              AND b.status IN ('confirmed', 'paid')
              -- If there is a current contest, filter by it. If not, results are 0.
              AND (v_current_concurso IS NOT NULL AND b.concurso = v_current_concurso)
        ), 0) AS total_sales,
        COALESCE((
            SELECT SUM(b.amount * (COALESCE(r.commission_rate, 10) / 100.0))::NUMERIC
            FROM bets b 
            WHERE b.reseller_id = r.id 
              AND b.status IN ('confirmed', 'paid')
              AND (v_current_concurso IS NOT NULL AND b.concurso = v_current_concurso)
        ), 0) AS total_commission,
        r.commission_rate,
        r.coupon_code,
        r.is_active,
        v_current_concurso AS current_concurso
    FROM resellers r
    JOIN profiles p ON r.user_id = p.id
    ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute
GRANT EXECUTE ON FUNCTION get_all_resellers() TO anon, authenticated, service_role;

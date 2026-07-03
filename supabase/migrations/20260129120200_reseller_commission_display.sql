-- Migration: Update get_all_resellers to include total commission
-- Applied on: 2026-01-29
-- Description: Updates the get_all_resellers RPC to calculate and return 
-- total commission earned by each reseller from the bets table.

-- Drop and recreate the function with total_commission field
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
    is_active BOOLEAN
) AS $$
BEGIN
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
        ), 0) AS total_sales,
        COALESCE((
            SELECT SUM(b.commission)::NUMERIC
            FROM bets b 
            WHERE b.reseller_id = r.id 
              AND b.status IN ('confirmed', 'paid')
        ), 0) AS total_commission,
        r.commission_rate,
        r.coupon_code,
        r.is_active
    FROM resellers r
    JOIN profiles p ON r.user_id = p.id
    ORDER BY r.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

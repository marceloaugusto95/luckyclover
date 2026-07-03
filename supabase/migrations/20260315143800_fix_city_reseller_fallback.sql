-- Update get_all_bets to include reseller's city as fallback when client has no city
CREATE OR REPLACE FUNCTION public.get_all_bets(limit_count integer DEFAULT 500)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      b.id,
      b.concurso,
      b.numbers,
      b.amount,
      b.status,
      b.payment_status,
      b.created_at,
      b.ticket_number,
      b.client_name,
      b.client_phone,
      json_build_object(
        'full_name', p.full_name,
        'phone', p.phone,
        'cpf', p.cpf,
        'cidade', COALESCE(p.cidade, rp.cidade)
      ) as profiles,
      json_build_object(
        'coupon_code', r.coupon_code
      ) as resellers
    FROM bets b
    LEFT JOIN profiles p ON b.user_id = p.id
    LEFT JOIN resellers r ON b.reseller_id = r.id
    LEFT JOIN profiles rp ON r.user_id = rp.id
    WHERE b.payment_status = 'paid'
    ORDER BY b.concurso DESC, b.created_at DESC
    LIMIT limit_count
  ) t;
  
  RETURN result;
END;
$function$;

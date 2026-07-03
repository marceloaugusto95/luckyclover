-- get_bet_details: resolve cidade (e demais dados do cliente) com fallback —
-- além do perfil por user_id, casa um perfil por CPF/telefone quando user_id é nulo
-- (vendas de revendedor não vinculadas). Mantém a guarda de admin.
CREATE OR REPLACE FUNCTION public.get_bet_details(p_bet_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  result json;
BEGIN
  -- __ADMIN_GUARD__
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado: requer admin' USING ERRCODE = '42501'; END IF;

  SELECT json_build_object(
    'id', b.id,
    'concurso', b.concurso,
    'numbers', b.numbers,
    'amount', b.amount,
    'status', b.status,
    'payment_status', b.payment_status,
    'hits', b.hits,
    'created_at', b.created_at,
    'ticket_number', b.ticket_number,
    'client_name', b.client_name,
    'client_phone', b.client_phone,
    'client_cpf', b.client_cpf,
    'client_pix', b.client_pix,
    'profiles', json_build_object(
      'id', COALESCE(p.id, pm.id),
      'full_name', COALESCE(p.full_name, pm.full_name),
      'cpf', COALESCE(p.cpf, pm.cpf),
      'phone', COALESCE(p.phone, pm.phone),
      'pix_key', COALESCE(p.pix_key, pm.pix_key),
      'cidade', COALESCE(p.cidade, pm.cidade)
    ),
    'resellers', json_build_object(
      'coupon_code', r.coupon_code,
      'business_name', r.business_name
    )
  ) INTO result
  FROM bets b
  LEFT JOIN profiles p ON b.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT pp.id, pp.full_name, pp.cpf, pp.phone, pp.pix_key, pp.cidade
    FROM profiles pp
    WHERE p.id IS NULL
      AND (
        (length(regexp_replace(COALESCE(b.client_cpf,''), '\D', '', 'g')) = 11
          AND pp.cpf = regexp_replace(b.client_cpf, '\D', '', 'g'))
        OR
        (length(regexp_replace(COALESCE(b.client_phone,''), '\D', '', 'g')) >= 10
          AND regexp_replace(COALESCE(pp.phone,''), '\D', '', 'g') = regexp_replace(b.client_phone, '\D', '', 'g'))
      )
    LIMIT 1
  ) pm ON true
  LEFT JOIN resellers r ON b.reseller_id = r.id
  WHERE b.id = p_bet_id;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION get_prize_estimates(concurso_num INTEGER)
RETURNS JSON AS $$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    quadra_prize DECIMAL(12,2);
BEGIN
    -- Calculate total sales for the contest (only paid bets)
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Logic defined by user:
    -- Prize Pool = 70% of Total Revenue
    prize_pool := total_sales * 0.70;

    -- Sena = 70% of Prize Pool
    sena_prize := prize_pool * 0.70;

    -- Quina = 30% of Prize Pool
    quina_prize := prize_pool * 0.30;
    
    -- Quadra = 0% (as requested)
    quadra_prize := 0;

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', quadra_prize,
        'bets_count', valid_bets_count
    );
END;
$$ LANGUAGE plpgsql;

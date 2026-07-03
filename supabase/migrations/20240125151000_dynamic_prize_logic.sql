CREATE OR REPLACE FUNCTION get_prize_estimates(concurso_num INTEGER)
RETURNS JSON AS $$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    quadra_prize DECIMAL(12,2);
    
    -- Settings variables
    settings_json JSONB;
    sena_pct DECIMAL(5,2);
    quina_pct DECIMAL(5,2);
    quadra_pct DECIMAL(5,2);
BEGIN
    -- Calculate total sales for the contest (only paid bets)
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Logic defined by user:
    -- Prize Pool = 70% of Total Revenue
    prize_pool := total_sales * 0.70;

    -- Fetch distribution settings
    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    
    -- Default to 70% Sena, 30% Quina if not set
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);
    -- Current config page doesn't have Quadra, so default to 0 or remaining? 
    -- User said "And so on...", implying dynamic distribution.
    -- But currently only Sena/Quina are in the settings JSON.
    -- We'll assume Quadra is 0 unless added later, or just remainder? 
    -- User previously requested 70/30 split explicitly.
    quadra_pct := 0; 

    -- Calculate prizes
    sena_prize := prize_pool * sena_pct;
    quina_prize := prize_pool * quina_pct;
    quadra_prize := prize_pool * quadra_pct;

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', quadra_prize,
        'bets_count', valid_bets_count,
        'sena_pct', sena_pct,
        'quina_pct', quina_pct
    );
END;
$$ LANGUAGE plpgsql;

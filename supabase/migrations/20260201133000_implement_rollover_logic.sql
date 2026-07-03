-- Migration: Implement Rollover Logic (Sena Only)
-- Purpose: Add accumulation columns and update logic to carry over Sena prize when no winners

-- 1. Add columns to concursos table
ALTER TABLE public.concursos 
ADD COLUMN IF NOT EXISTS accumulated_sena DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS prize_pool_sena DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS prize_pool_quina DECIMAL(12,2);

-- 2. Update process_draw function
CREATE OR REPLACE FUNCTION process_draw(p_concurso_number INTEGER)
RETURNS TABLE (
    bets_processed INTEGER,
    winners_sena INTEGER,
    winners_quina INTEGER,
    winners_quadra INTEGER
) AS $$
DECLARE
    v_drawn_numbers INTEGER[];
    v_bet RECORD;
    v_hits INTEGER;
    v_bets_processed INTEGER := 0;
    v_winners_sena INTEGER := 0;
    v_winners_quina INTEGER := 0;
    v_winners_quadra INTEGER := 0;
    
    -- Prize Calculation Variables
    v_total_sales DECIMAL(12,2) := 0;
    v_prize_pool DECIMAL(12,2) := 0;
    v_sena_prize_base DECIMAL(12,2) := 0;
    v_quina_prize_base DECIMAL(12,2) := 0;
    
    -- Accumulation Variables
    v_prev_accumulated_sena DECIMAL(12,2) := 0;
    v_final_sena_prize DECIMAL(12,2) := 0;
    v_final_quina_prize DECIMAL(12,2) := 0;
    
    -- Settings
    v_settings_json JSONB;
    v_sena_pct DECIMAL(5,2);
    v_quina_pct DECIMAL(5,2);
BEGIN
    -- Get drawn numbers
    SELECT drawn_numbers INTO v_drawn_numbers
    FROM public.concursos
    WHERE concurso_number = p_concurso_number
    AND status = 'closed';
    
    IF v_drawn_numbers IS NULL THEN
        RAISE EXCEPTION 'Concurso % not found or not closed', p_concurso_number;
    END IF;
    
    -- Get settings for distribution
    SELECT value INTO v_settings_json FROM system_settings WHERE key = 'prize_distribution';
    v_sena_pct := COALESCE((v_settings_json->>'sena')::DECIMAL, 0.70);
    v_quina_pct := COALESCE((v_settings_json->>'quina')::DECIMAL, 0.30);

    -- Calculate Sales and Base Prize Pool
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_sales
    FROM bets
    WHERE concurso = p_concurso_number AND payment_status = 'paid';
    
    -- 70% of sales goes to prize pool
    v_prize_pool := v_total_sales * 0.70;
    
    v_sena_prize_base := v_prize_pool * v_sena_pct;
    v_quina_prize_base := v_prize_pool * v_quina_pct;
    
    -- Get Accumulated Sena from Previous Contest
    SELECT COALESCE(accumulated_sena, 0)
    INTO v_prev_accumulated_sena
    FROM public.concursos
    WHERE concurso_number = p_concurso_number - 1;
    
    -- Calculate Total Available Prizes
    v_final_sena_prize := v_sena_prize_base + v_prev_accumulated_sena;
    v_final_quina_prize := v_quina_prize_base; -- Quina does not accumulate from previous
    
    -- Process all confirmed bets
    FOR v_bet IN 
        SELECT id, numbers
        FROM public.bets
        WHERE concurso = p_concurso_number
        AND status = 'confirmed'
    LOOP
        -- Count matching numbers
        SELECT COUNT(*) INTO v_hits
        FROM unnest(v_bet.numbers) AS bet_num
        WHERE bet_num = ANY(v_drawn_numbers);
        
        -- Update bet results
        IF v_hits >= 4 THEN
            UPDATE public.bets
            SET status = 'won', hits = v_hits, updated_at = NOW()
            WHERE id = v_bet.id;
            
            IF v_hits = 6 THEN v_winners_sena := v_winners_sena + 1;
            ELSIF v_hits = 5 THEN v_winners_quina := v_winners_quina + 1;
            ELSIF v_hits = 4 THEN v_winners_quadra := v_winners_quadra + 1;
            END IF;
        ELSE
            UPDATE public.bets
            SET status = 'lost', hits = v_hits, updated_at = NOW()
            WHERE id = v_bet.id;
        END IF;
        
        v_bets_processed := v_bets_processed + 1;
    END LOOP;
    
    -- Determine Accumulation for THIS contest
    UPDATE public.concursos
    SET 
        -- Save calculated pools for record
        prize_pool_sena = v_final_sena_prize,
        prize_pool_quina = v_final_quina_prize,
        
        -- Accumulation Logic:
        -- If NO winners for Sena, accumulate amount for next.
        -- If winners exist, accumulation is 0.
        accumulated_sena = CASE 
            WHEN v_winners_sena = 0 THEN v_final_sena_prize 
            ELSE 0 
        END,
        
        updated_at = NOW()
    WHERE concurso_number = p_concurso_number;
    
    -- Return summary
    RETURN QUERY SELECT v_bets_processed, v_winners_sena, v_winners_quina, v_winners_quadra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update get_prize_estimates function
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
    
    -- Accumulation
    prev_accumulated_sena DECIMAL(12,2) := 0;
BEGIN
    -- Calculate total sales
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Prize Pool = 70% of Total Revenue
    prize_pool := total_sales * 0.70;

    -- Fetch distribution settings
    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);
    
    -- Get Accumulated Sena from Previous Contest
    SELECT COALESCE(accumulated_sena, 0)
    INTO prev_accumulated_sena
    FROM public.concursos
    WHERE concurso_number = concurso_num - 1;

    -- Calculate prizes
    sena_prize := (prize_pool * sena_pct) + prev_accumulated_sena;
    quina_prize := (prize_pool * quina_pct); -- No accumulation for Quina
    quadra_prize := 0; 

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', quadra_prize,
        'bets_count', valid_bets_count,
        'sena_pct', sena_pct,
        'quina_pct', quina_pct,
        'accumulated_sena', prev_accumulated_sena
    );
END;
$$ LANGUAGE plpgsql;

-- Migration: Fix process_draw to include all PAID bets
-- Purpose: Bets are created as 'pending' but 'paid'. Previously process_draw filtered for 'confirmed' status which might not be set.
-- We now filter by payment_status = 'paid' AND status != 'refunded'.

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
    
    -- Process all PAID bets (instead of just confirmed)
    FOR v_bet IN 
        SELECT id, numbers
        FROM public.bets
        WHERE concurso = p_concurso_number
        AND payment_status = 'paid'   -- CHANGED: check payment_status
        AND status != 'refunded'      -- CHANGED: exclude refunded
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

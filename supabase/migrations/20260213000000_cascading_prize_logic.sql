-- Migration: Hybrid Cascading Prize Logic (Refined)
-- Normal Sena/Quina split if Sena winners exist.
-- If NO Sena winners, cascade: Sena pool merges into Quina.
-- If NO Quina winners either, cascade continues downward.
-- No accumulation between contests.

-- ============================================================
-- 1. Replace process_draw function
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_draw(p_concurso_number INTEGER)
RETURNS TABLE (
    bets_processed INTEGER,
    winners_sena INTEGER,
    winners_quina INTEGER,
    winners_quadra INTEGER,
    winning_tier INTEGER,
    winners_count INTEGER
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
    v_pool_sena DECIMAL(12,2) := 0;
    v_pool_quina DECIMAL(12,2) := 0;
    v_pool_cascade DECIMAL(12,2) := 0;
    v_prize_per_winner DECIMAL(12,2) := 0;
    v_max_hits INTEGER := 0;
    v_tier_winners INTEGER := 0;
    
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

    -- Calculate total sales for THIS concurso only (no rollover)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_sales
    FROM bets
    WHERE concurso = p_concurso_number AND payment_status = 'paid';
    
    -- Prize pool = 70% of current sales
    v_prize_pool := v_total_sales * 0.70;
    
    -- Normal split
    v_pool_sena := v_prize_pool * v_sena_pct;
    v_pool_quina := v_prize_pool * v_quina_pct;
    
    -- ============================================================
    -- PHASE 1: Calculate hits for ALL bets
    -- ============================================================
    FOR v_bet IN 
        SELECT id, numbers
        FROM public.bets
        WHERE concurso = p_concurso_number
        AND payment_status = 'paid'
        AND status != 'refunded'
    LOOP
        -- Count matching numbers
        SELECT COUNT(*) INTO v_hits
        FROM unnest(v_bet.numbers) AS bet_num
        WHERE bet_num = ANY(v_drawn_numbers);
        
        -- Update hits on the bet
        UPDATE public.bets
        SET hits = v_hits, updated_at = NOW()
        WHERE id = v_bet.id;
        
        -- Track tier counts
        IF v_hits = 6 THEN v_winners_sena := v_winners_sena + 1;
        ELSIF v_hits = 5 THEN v_winners_quina := v_winners_quina + 1;
        ELSIF v_hits = 4 THEN v_winners_quadra := v_winners_quadra + 1;
        END IF;
        
        IF v_hits > v_max_hits THEN v_max_hits := v_hits; END IF;
        v_bets_processed := v_bets_processed + 1;
    END LOOP;
    
    -- ============================================================
    -- PHASE 2: Hybrid prize distribution
    --   If Sena winners: normal split (70% Sena, 30% Quina)
    --   If NO Sena: cascade Sena pool into Quina
    --   If NO Quina either: cascade everything to next tier down
    -- ============================================================
    IF v_prize_pool > 0 AND v_bets_processed > 0 THEN
    
        IF v_winners_sena > 0 THEN
            -- === NORMAL SPLIT ===
            -- Sena winners get pool_sena
            v_prize_per_winner := v_pool_sena / v_winners_sena;
            UPDATE public.bets
            SET status = 'won', prize_amount = v_prize_per_winner, updated_at = NOW()
            WHERE concurso = p_concurso_number AND payment_status = 'paid'
            AND status != 'refunded' AND hits = 6;
            
            -- Quina winners get pool_quina
            IF v_winners_quina > 0 THEN
                v_prize_per_winner := v_pool_quina / v_winners_quina;
                UPDATE public.bets
                SET status = 'won', prize_amount = v_prize_per_winner, updated_at = NOW()
                WHERE concurso = p_concurso_number AND payment_status = 'paid'
                AND status != 'refunded' AND hits = 5;
            END IF;
            
            -- Everyone else lost
            UPDATE public.bets
            SET status = 'lost', prize_amount = 0, updated_at = NOW()
            WHERE concurso = p_concurso_number AND payment_status = 'paid'
            AND status != 'refunded' AND hits < 5;
            
            -- Set the winning tier for return
            v_tier_winners := v_winners_sena;
            v_max_hits := 6;
            
        ELSE
            -- === CASCADE MODE ===
            -- No Sena winners: entire prize pool cascades down
            v_pool_cascade := v_prize_pool;  -- 100% of prize pool
            
            IF v_winners_quina > 0 THEN
                -- Quina gets everything
                v_prize_per_winner := v_pool_cascade / v_winners_quina;
                UPDATE public.bets
                SET status = 'won', prize_amount = v_prize_per_winner, updated_at = NOW()
                WHERE concurso = p_concurso_number AND payment_status = 'paid'
                AND status != 'refunded' AND hits = 5;
                
                v_tier_winners := v_winners_quina;
                v_max_hits := 5;
                
            ELSIF v_winners_quadra > 0 THEN
                -- Quadra gets everything
                v_prize_per_winner := v_pool_cascade / v_winners_quadra;
                UPDATE public.bets
                SET status = 'won', prize_amount = v_prize_per_winner, updated_at = NOW()
                WHERE concurso = p_concurso_number AND payment_status = 'paid'
                AND status != 'refunded' AND hits = 4;
                
                v_tier_winners := v_winners_quadra;
                v_max_hits := 4;
                
            ELSE
                -- Continue cascading: find the highest tier with any winners
                -- (3 hits, 2 hits, 1 hit)
                FOR v_hits IN REVERSE 3..1 LOOP
                    SELECT COUNT(*) INTO v_tier_winners
                    FROM public.bets
                    WHERE concurso = p_concurso_number AND payment_status = 'paid'
                    AND status != 'refunded' AND hits = v_hits;
                    
                    IF v_tier_winners > 0 THEN
                        v_prize_per_winner := v_pool_cascade / v_tier_winners;
                        UPDATE public.bets
                        SET status = 'won', prize_amount = v_prize_per_winner, updated_at = NOW()
                        WHERE concurso = p_concurso_number AND payment_status = 'paid'
                        AND status != 'refunded' AND hits = v_hits;
                        
                        v_max_hits := v_hits;
                        EXIT;  -- Found winners, stop cascading
                    END IF;
                END LOOP;
            END IF;
            
            -- Mark all non-winners as lost
            UPDATE public.bets
            SET status = 'lost', prize_amount = 0, updated_at = NOW()
            WHERE concurso = p_concurso_number AND payment_status = 'paid'
            AND status != 'refunded' AND status != 'won';
        END IF;
        
    ELSE
        -- No bets or no prize pool
        UPDATE public.bets
        SET status = 'lost', prize_amount = 0, updated_at = NOW()
        WHERE concurso = p_concurso_number AND payment_status = 'paid'
        AND status != 'refunded';
    END IF;
    
    -- ============================================================
    -- PHASE 3: Update concurso record
    -- ============================================================
    UPDATE public.concursos
    SET 
        prize_pool_sena = CASE WHEN v_winners_sena > 0 THEN v_pool_sena ELSE 0 END,
        prize_pool_quina = CASE 
            WHEN v_winners_sena > 0 AND v_winners_quina > 0 THEN v_pool_quina
            WHEN v_winners_sena = 0 AND v_winners_quina > 0 THEN v_prize_pool
            ELSE 0 
        END,
        accumulated_sena = 0,
        accumulated_quina = 0,
        updated_at = NOW()
    WHERE concurso_number = p_concurso_number;
    
    -- Auto-open next concurso
    INSERT INTO public.concursos (concurso_number, draw_date, drawn_numbers, status)
    VALUES (
        p_concurso_number + 1,
        (CURRENT_DATE + INTERVAL '3 days')::DATE,
        ARRAY[0,0,0,0,0,0]::INTEGER[],
        'open'
    )
    ON CONFLICT (concurso_number) DO NOTHING;
    
    -- Return summary
    RETURN QUERY SELECT v_bets_processed, v_winners_sena, v_winners_quina, v_winners_quadra, v_max_hits, v_tier_winners;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. Replace get_prize_estimates function
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_prize_estimates(concurso_num INTEGER)
RETURNS JSON AS $$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    
    settings_json JSONB;
    sena_pct DECIMAL(5,2);
    quina_pct DECIMAL(5,2);
BEGIN
    -- Calculate total sales (paid only) for THIS concurso only
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Prize pool = 70% of current sales (no accumulation)
    prize_pool := total_sales * 0.70;

    -- Fetch distribution settings
    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);
    
    -- Show the normal split as estimation (before draw)
    sena_prize := prize_pool * sena_pct;
    quina_prize := prize_pool * quina_pct;

    RETURN json_build_object(
        'total_sales', total_sales,
        'prize_pool', prize_pool,
        'sena', sena_prize,
        'quina', quina_prize,
        'quadra', 0,
        'bets_count', valid_bets_count,
        'sena_pct', sena_pct,
        'quina_pct', quina_pct,
        'cascading', true
    );
END;
$$ LANGUAGE plpgsql;

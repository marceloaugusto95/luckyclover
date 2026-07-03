-- Migration: No Rollover Prize Logic
-- Purpose: Remove all accumulation/rollover. Sena fallback to quina. Auto-open next concurso.

-- 1. Update process_draw function
CREATE OR REPLACE FUNCTION public.process_draw(p_concurso_number INTEGER)
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
    v_sena_prize DECIMAL(12,2) := 0;
    v_quina_prize DECIMAL(12,2) := 0;
    
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

    -- Calculate Sales for THIS concurso only (no rollover)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_sales
    FROM bets
    WHERE concurso = p_concurso_number AND payment_status = 'paid';
    
    -- Prize pool = 70% of current sales only
    v_prize_pool := v_total_sales * 0.70;
    
    -- Process all PAID bets first to count winners
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
    
    -- Prize distribution logic (NO ROLLOVER):
    -- If sena winners exist: sena gets 70%, quina gets 30% (normal split)
    -- If NO sena winners but quina winners exist: quina gets 100% of prize pool
    -- If NO sena AND NO quina winners: house keeps everything (no rollover)
    IF v_winners_sena > 0 THEN
        v_sena_prize := v_prize_pool * v_sena_pct;
        v_quina_prize := v_prize_pool * v_quina_pct;
    ELSIF v_winners_quina > 0 THEN
        -- Sena fallback: entire prize pool goes to quina
        v_sena_prize := 0;
        v_quina_prize := v_prize_pool;
    ELSE
        -- No winners: house keeps everything
        v_sena_prize := 0;
        v_quina_prize := 0;
    END IF;
    
    -- Update concurso record (no accumulation — always zero)
    UPDATE public.concursos
    SET 
        prize_pool_sena = v_sena_prize,
        prize_pool_quina = v_quina_prize,
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
    RETURN QUERY SELECT v_bets_processed, v_winners_sena, v_winners_quina, v_winners_quadra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update get_prize_estimates function (no rollover)
CREATE OR REPLACE FUNCTION public.get_prize_estimates(concurso_num INTEGER)
RETURNS JSON AS $$
DECLARE
    total_sales DECIMAL(12,2);
    valid_bets_count INTEGER;
    prize_pool DECIMAL(12,2);
    sena_prize DECIMAL(12,2);
    quina_prize DECIMAL(12,2);
    
    -- Settings variables
    settings_json JSONB;
    sena_pct DECIMAL(5,2);
    quina_pct DECIMAL(5,2);
BEGIN
    -- Calculate total sales (paid only) for THIS concurso only
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
    INTO total_sales, valid_bets_count
    FROM bets
    WHERE concurso = concurso_num AND payment_status = 'paid';

    -- Prize pool = 70% of current sales (no accumulation from previous)
    prize_pool := total_sales * 0.70;

    -- Fetch distribution settings
    SELECT value INTO settings_json FROM system_settings WHERE key = 'prize_distribution';
    sena_pct := COALESCE((settings_json->>'sena')::DECIMAL, 0.70);
    quina_pct := COALESCE((settings_json->>'quina')::DECIMAL, 0.30);
    
    -- Simple proportional split (estimation before draw)
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
        'quina_pct', quina_pct
    );
END;
$$ LANGUAGE plpgsql;

-- Migration: Commission Trigger and Process Draw Function
-- Purpose: Automatically calculate commission when bet is paid, and provide function to process draw results

-- ==============================================
-- COMMISSION TRIGGER
-- ==============================================
-- When a bet payment_status changes to 'paid', calculate and credit commission to reseller

CREATE OR REPLACE FUNCTION calculate_reseller_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_reseller_id UUID;
    v_commission_rate DECIMAL(5,2);
    v_commission_amount DECIMAL(12,2);
BEGIN
    -- Only trigger on payment confirmation
    IF NEW.payment_status = 'paid' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'paid') THEN
        
        -- Check if bet has a reseller
        IF NEW.reseller_id IS NOT NULL THEN
            -- Get reseller commission rate
            SELECT commission_rate INTO v_commission_rate
            FROM public.resellers
            WHERE id = NEW.reseller_id;
            
            IF v_commission_rate IS NOT NULL THEN
                -- Calculate commission
                v_commission_amount := NEW.amount * (v_commission_rate / 100);
                
                -- Update reseller totals
                UPDATE public.resellers
                SET 
                    total_sales = total_sales + NEW.amount,
                    total_commission = total_commission + v_commission_amount
                WHERE id = NEW.reseller_id;
                
                -- Log commission transaction
                INSERT INTO public.transactions (
                    bet_id,
                    reseller_id,
                    type,
                    amount,
                    status,
                    description
                ) VALUES (
                    NEW.id,
                    NEW.reseller_id,
                    'commission',
                    v_commission_amount,
                    'completed',
                    'Comissão automática - Aposta ' || NEW.id::TEXT
                );
                
                RAISE NOTICE 'Commission calculated: R$ % for reseller %', v_commission_amount, NEW.reseller_id;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS on_bet_payment_confirmed ON public.bets;
CREATE TRIGGER on_bet_payment_confirmed
    AFTER UPDATE OF payment_status ON public.bets
    FOR EACH ROW
    EXECUTE FUNCTION calculate_reseller_commission();

-- ==============================================
-- PROCESS DRAW FUNCTION
-- ==============================================
-- Call this function after registering draw results to determine winners

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
BEGIN
    -- Get drawn numbers from concursos table
    SELECT drawn_numbers INTO v_drawn_numbers
    FROM public.concursos
    WHERE concurso_number = p_concurso_number
    AND status = 'closed';
    
    IF v_drawn_numbers IS NULL THEN
        RAISE EXCEPTION 'Concurso % not found or not closed', p_concurso_number;
    END IF;
    
    -- Process all confirmed bets for this concurso
    FOR v_bet IN 
        SELECT id, numbers, user_id, amount
        FROM public.bets
        WHERE concurso = p_concurso_number
        AND status = 'confirmed'
    LOOP
        -- Count matching numbers
        SELECT COUNT(*) INTO v_hits
        FROM unnest(v_bet.numbers) AS bet_num
        WHERE bet_num = ANY(v_drawn_numbers);
        
        -- Update bet with results
        IF v_hits >= 4 THEN
            UPDATE public.bets
            SET 
                status = 'won',
                hits = v_hits,
                updated_at = NOW()
            WHERE id = v_bet.id;
            
            -- Count winners by category
            IF v_hits = 6 THEN
                v_winners_sena := v_winners_sena + 1;
            ELSIF v_hits = 5 THEN
                v_winners_quina := v_winners_quina + 1;
            ELSIF v_hits = 4 THEN
                v_winners_quadra := v_winners_quadra + 1;
            END IF;
        ELSE
            UPDATE public.bets
            SET 
                status = 'lost',
                hits = v_hits,
                updated_at = NOW()
            WHERE id = v_bet.id;
        END IF;
        
        v_bets_processed := v_bets_processed + 1;
    END LOOP;
    
    -- Return summary
    RETURN QUERY SELECT v_bets_processed, v_winners_sena, v_winners_quina, v_winners_quadra;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================
-- GET WINNERS FUNCTION (for Admin reporting)
-- ==============================================

CREATE OR REPLACE FUNCTION get_winners(p_concurso_number INTEGER)
RETURNS TABLE (
    bet_id UUID,
    user_id UUID,
    full_name TEXT,
    phone TEXT,
    pix_key TEXT,
    numbers INTEGER[],
    hits INTEGER,
    amount DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id AS bet_id,
        b.user_id,
        p.full_name,
        p.phone,
        p.pix_key,
        b.numbers,
        b.hits,
        b.amount
    FROM public.bets b
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE b.concurso = p_concurso_number
    AND b.status = 'won'
    ORDER BY b.hits DESC, b.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

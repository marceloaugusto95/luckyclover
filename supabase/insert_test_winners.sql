-- Insert test users and bets for testing winners
DO $$
DECLARE
    user_id_1 UUID;
    user_id_2 UUID;
BEGIN
    -- Create dummy profiles if not exist
    INSERT INTO public.profiles (id, full_name, role, cpf, phone, pix_key, cidade)
    VALUES 
        (uuid_generate_v4(), 'Ganhador Sena', 'client', '11111111111', '11999999999', 'pix1', 'SP'),
        (uuid_generate_v4(), 'Ganhador Quina', 'client', '22222222222', '11888888888', 'pix2', 'RJ')
    ON CONFLICT (cpf) DO UPDATE SET full_name = EXCLUDED.full_name
    RETURNING id INTO user_id_1;

    SELECT id INTO user_id_2 FROM public.profiles WHERE cpf = '22222222222';

    -- Insert winning bet (Sena - 6 hits)
    -- Assuming winning numbers are [04, 12, 15, 32, 45, 58] (from mega-sena.ts mock)
    INSERT INTO public.bets (user_id, concurso, numbers, amount, payment_status, status)
    VALUES 
        (user_id_1, 2670, ARRAY[4, 12, 15, 32, 45, 58, 60], 50.00, 'paid', 'pending');

    -- Insert winning bet (Quina - 5 hits)
    INSERT INTO public.bets (user_id, user_id, concurso, numbers, amount, payment_status, status)
    VALUES 
        (user_id_2, 2670, ARRAY[4, 12, 15, 32, 45, 10], 50.00, 'paid', 'pending'); -- 10 is miss

END $$;

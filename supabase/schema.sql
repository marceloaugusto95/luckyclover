-- LuckyClover Database Schema
-- Run this in Supabase SQL Editor to set up all tables

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    pix_key TEXT NOT NULL,
    cidade TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'reseller', 'admin')),
    reseller_id UUID REFERENCES public.profiles(id), -- For clients linked to resellers
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RESELLERS TABLE
-- ============================================
CREATE TABLE public.resellers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
    business_name TEXT NOT NULL,
    commission_rate DECIMAL(5,2) DEFAULT 10.00, -- 10% default
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_commission DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BET PRICING TABLE
-- ============================================
CREATE TABLE public.bet_pricing (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    number_count INTEGER NOT NULL UNIQUE CHECK (number_count >= 10 AND number_count <= 25),
    price DECIMAL(10,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default pricing (exponential scale from the existing app)
INSERT INTO public.bet_pricing (number_count, price) VALUES
    (10, 50.00),
    (11, 100.00),
    (12, 200.00),
    (13, 400.00),
    (14, 800.00),
    (15, 1600.00),
    (16, 3200.00),
    (17, 6400.00),
    (18, 12800.00),
    (19, 25600.00),
    (20, 51200.00),
    (21, 102400.00),
    (22, 204800.00),
    (23, 409600.00),
    (24, 819200.00),
    (25, 1638400.00);

-- ============================================
-- BETS TABLE
-- ============================================
CREATE TABLE public.bets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reseller_id UUID REFERENCES public.resellers(id),
    concurso INTEGER NOT NULL,
    numbers INTEGER[] NOT NULL CHECK (array_length(numbers, 1) >= 10 AND array_length(numbers, 1) <= 25),
    amount DECIMAL(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'won', 'lost')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
    hits INTEGER DEFAULT 0,
    prize_amount DECIMAL(12,2) DEFAULT 0,
    pix_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS TABLE
-- ============================================
CREATE TABLE public.transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bet_id UUID REFERENCES public.bets(id),
    reseller_id UUID REFERENCES public.resellers(id),
    type TEXT NOT NULL CHECK (type IN ('bet_payment', 'commission', 'prize_payout', 'refund')),
    amount DECIMAL(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read own profile, admins can read all
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Resellers: Resellers see own data, admins see all
CREATE POLICY "Resellers can view own data" ON public.resellers
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can manage resellers" ON public.resellers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Bet Pricing: Everyone can read, only admins can modify
CREATE POLICY "Anyone can view pricing" ON public.bet_pricing
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage pricing" ON public.bet_pricing
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Bets: Users see own bets, resellers see their clients' bets, admins see all
CREATE POLICY "Users can view own bets" ON public.bets
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Resellers can view client bets" ON public.bets
    FOR SELECT USING (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    );

CREATE POLICY "Admins can view all bets" ON public.bets
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

CREATE POLICY "Users can create bets" ON public.bets
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Resellers can create bets for clients" ON public.bets
    FOR INSERT WITH CHECK (
        reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    );

-- Transactions: Similar to bets
CREATE POLICY "Users can view own transactions" ON public.transactions
    FOR SELECT USING (
        bet_id IN (SELECT id FROM public.bets WHERE user_id = auth.uid())
    );

CREATE POLICY "Admins can manage transactions" ON public.transactions
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bets_updated_at
    BEFORE UPDATE ON public.bets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bet_pricing_updated_at
    BEFORE UPDATE ON public.bet_pricing
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'), 'client');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

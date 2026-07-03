-- Migration: Secure RLS Policies
-- Applied on: 2026-01-28
-- Description: Enforces strict access control on bets, profiles, and resellers.

-- 1. BETS
DROP POLICY IF EXISTS "Allow all bets operations" ON bets;
DROP POLICY IF EXISTS "Users can view own bets" ON bets;
DROP POLICY IF EXISTS "Users can create own bets" ON bets;
DROP POLICY IF EXISTS "Admins can manage all bets" ON bets;

CREATE POLICY "Users can view own bets" ON bets FOR SELECT USING (auth.uid() = user_id OR is_admin());
CREATE POLICY "Users can create own bets" ON bets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all bets" ON bets FOR ALL USING (is_admin());

-- 2. PROFILES
DROP POLICY IF EXISTS "Allow read profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. RESELLERS
DROP POLICY IF EXISTS "Allow reseller management" ON resellers;
DROP POLICY IF EXISTS "Public can find active resellers" ON resellers;
DROP POLICY IF EXISTS "Resellers can view own data" ON resellers;
DROP POLICY IF EXISTS "Admins can manage resellers" ON resellers;

CREATE POLICY "Public can find active resellers" ON resellers FOR SELECT USING (is_active = true);
CREATE POLICY "Resellers can view own data" ON resellers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admins can manage resellers" ON resellers FOR ALL USING (is_admin());

-- 4. TRANSACTIONS
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;

CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (
  bet_id IN (SELECT id FROM bets WHERE user_id = auth.uid()) OR is_admin()
);

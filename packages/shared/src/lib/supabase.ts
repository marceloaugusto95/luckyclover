import { createClient } from '@supabase/supabase-js';

// These will be set via environment variables or Tauri config
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// Type Definitions
// ============================================

export type UserRole = 'client' | 'reseller' | 'admin';

export interface Profile {
    id: string;
    full_name: string;
    phone: string;
    cpf: string;
    pix_key: string;
    cidade: string;
    role: UserRole;
    reseller_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface Reseller {
    id: string;
    user_id: string;
    business_name: string;
    commission_rate: number;
    total_sales: number;
    total_commission: number;
    is_active: boolean;
    created_at: string;
}

export interface BetPricing {
    id: string;
    number_count: number;
    price: number;
    is_active: boolean;
    updated_at: string;
}

export interface Bet {
    id: string;
    user_id: string | null;
    reseller_id: string | null;
    concurso: number;
    numbers: number[];
    amount: number;
    status: 'pending' | 'confirmed' | 'won' | 'lost';
    payment_status: 'pending' | 'paid' | 'refunded';
    hits: number;
    prize_amount: number;
    pix_code: string | null;
    created_at: string;
    updated_at: string;
}

export interface Transaction {
    id: string;
    bet_id: string | null;
    reseller_id: string | null;
    type: 'bet_payment' | 'commission' | 'prize_payout' | 'refund';
    amount: number;
    status: 'pending' | 'completed' | 'failed';
    description: string | null;
    created_at: string;
}

// ============================================
// Database Helpers
// ============================================

// Get current user profile
export async function getCurrentProfile(): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error('Error fetching profile:', error);
        return null;
    }
    return data;
}

// Get pricing for number count
export async function getBetPricing(): Promise<BetPricing[]> {
    const { data, error } = await supabase
        .from('bet_pricing')
        .select('*')
        .eq('is_active', true)
        .order('number_count');

    if (error) {
        console.error('Error fetching pricing:', error);
        return [];
    }
    return data;
}

// Get price for specific number count
export async function getPriceForCount(count: number): Promise<number> {
    const { data, error } = await supabase
        .from('bet_pricing')
        .select('price')
        .eq('number_count', count)
        .single();

    if (error || !data) {
        // Fallback to exponential formula
        return 50 * Math.pow(2, count - 10);
    }
    return data.price;
}

// Create a new bet
export async function createBet(
    numbers: number[],
    concurso: number,
    amount: number,
    resellerId?: string
): Promise<Bet | null> {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
        .from('bets')
        .insert({
            user_id: user?.id,
            reseller_id: resellerId,
            concurso,
            numbers,
            amount,
            status: 'pending',
            payment_status: 'pending'
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating bet:', error);
        return null;
    }
    return data;
}

// Get user's bets
export async function getUserBets(limit = 10): Promise<Bet[]> {
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching bets:', error);
        return [];
    }
    return data;
}

// Admin: Get all bets
export async function getAllBets(limit = 50): Promise<Bet[]> {
    const { data, error } = await supabase
        .from('bets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching all bets:', error);
        return [];
    }
    return data;
}

// Admin: Update bet pricing
export async function updateBetPricing(id: string, price: number): Promise<boolean> {
    const { error } = await supabase
        .from('bet_pricing')
        .update({ price })
        .eq('id', id);

    if (error) {
        console.error('Error updating pricing:', error);
        return false;
    }
    return true;
}

// Helper to convert CPF to pseudo-email for Supabase Auth
// Format: cpf_XXXXXXXXXXX@luckyclover.app (valid email format)
function cpfToEmail(cpf: string): string {
    const cleanCpf = cpf.replace(/\D/g, '');
    return `cpf_${cleanCpf}@luckyclover.app`;
}

// Helper to format CPF for display (XXX.XXX.XXX-XX)
export function formatCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, '');
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

// Helper to validate CPF
export function validateCpf(cpf: string): boolean {
    const clean = cpf.replace(/\D/g, '');
    return clean.length === 11;
}

export interface SignUpData {
    cpf: string;
    password: string;
    fullName: string;
    phone: string;
    pixKey: string;
    cidade: string;
}

// Auth helpers
export async function signIn(cpf: string, password: string) {
    const email = cpfToEmail(cpf);
    return supabase.auth.signInWithPassword({ email, password });
}

export async function signUp(data: SignUpData) {
    const email = cpfToEmail(data.cpf);
    return supabase.auth.signUp({
        email,
        password: data.password,
        options: {
            data: {
                full_name: data.fullName,
                phone: data.phone.replace(/\D/g, ''),
                cpf: data.cpf.replace(/\D/g, ''),
                pix_key: data.pixKey,
                cidade: data.cidade,
                role: 'client'
            }
        }
    });
}

export async function signOut() {
    return supabase.auth.signOut();
}

export async function getSession() {
    return supabase.auth.getSession();
}

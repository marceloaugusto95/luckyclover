import { createMockClient as createClient } from './mockBackend';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.luckyclover.local';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key';

// Storage keys (v2: agora guardamos um JWT válido do Supabase; o sufixo força
// re-login limpo, descartando tokens antigos do formato anterior).
const TOKEN_KEY = 'lucky_auth_token_v2';
const USER_KEY = 'lucky_user_v2';

// Client Supabase com auth customizada por CPF. O token do usuário (JWT assinado
// pela auth-cpf com o secret do projeto) é enviado ao PostgREST via accessToken,
// fazendo auth.uid()/RLS funcionarem. Sem token (deslogado) cai no anon automaticamente.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => localStorage.getItem(TOKEN_KEY),
});

// Edge Function URL for custom CPF auth
const authFunctionUrl = `${supabaseUrl}/functions/v1/auth-cpf`;

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

// Types
export interface Profile {
    id: string;
    full_name: string;
    phone: string;
    cpf: string;
    pix_key: string;
    cidade: string;
    role: 'client' | 'reseller' | 'admin';
}

export interface AuthUser {
    id: string;
    cpf: string;
    full_name: string;
    phone?: string;
    pix_key?: string;
    cidade?: string;
    role: string;
}

export interface Bet {
    id: string;
    concurso: number;
    numbers: number[];
    amount: number;
    status: 'pending' | 'confirmed' | 'won' | 'lost';
    payment_status: 'pending' | 'paid' | 'refunded';
    hits: number;
    created_at: string;
    ticket_number?: string;
}

export interface BetPricing {
    number_count: number;
    price: number;
    is_active: boolean;
}

// Auth result type
interface AuthResult {
    success: boolean;
    user?: AuthUser;
    token?: string;
    error?: string;
}

// Custom CPF Auth - Sign In
export async function signIn(cpf: string, password: string): Promise<{ data: AuthUser | null; error: Error | null }> {
    try {
        const response = await fetch(authFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
                action: 'login',
                cpf,
                password,
            }),
        });

        const result: AuthResult = await response.json();

        if (!response.ok || !result.success) {
            return { data: null, error: new Error(result.error || 'Erro ao fazer login') };
        }

        // Store token and user in localStorage
        if (result.token) {
            localStorage.setItem(TOKEN_KEY, result.token);
        }
        if (result.user) {
            localStorage.setItem(USER_KEY, JSON.stringify(result.user));
        }

        return { data: result.user || null, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error('Erro de conexão') };
    }
}

export interface SignUpData {
    cpf: string;
    password: string;
    fullName: string;
    phone: string;
    pixKey: string;
    cidade: string;
}

// Custom CPF Auth - Sign Up
export async function signUp(data: SignUpData): Promise<{ data: AuthUser | null; error: Error | null }> {
    try {
        const response = await fetch(authFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
                action: 'register',
                cpf: data.cpf,
                password: data.password,
                full_name: data.fullName,
                phone: data.phone,
                pix_key: data.pixKey,
                cidade: data.cidade,
                role: 'client',
            }),
        });

        const result: AuthResult = await response.json();

        if (!response.ok || !result.success) {
            return { data: null, error: new Error(result.error || 'Erro ao criar conta') };
        }

        // Store token and user in localStorage
        if (result.token) {
            localStorage.setItem(TOKEN_KEY, result.token);
        }
        if (result.user) {
            localStorage.setItem(USER_KEY, JSON.stringify(result.user));
        }

        return { data: result.user || null, error: null };
    } catch (err) {
        return { data: null, error: err instanceof Error ? err : new Error('Erro de conexão') };
    }
}

// Custom CPF Auth - Sign Out
export async function signOut(): Promise<{ error: Error | null }> {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { error: null };
}

// Get current user from localStorage
export function getCurrentUser(): AuthUser | null {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

// Get auth token
export function getAuthToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
    return !!getAuthToken() && !!getCurrentUser();
}

// Data helpers
export async function getBetPricing(): Promise<BetPricing[]> {
    const { data, error } = await supabase
        .from('bet_pricing')
        .select('number_count, price, is_active')
        .order('number_count');

    if (error) return [];
    return data;
}

export async function getPriceForCount(count: number): Promise<number> {
    const { data } = await supabase
        .from('bet_pricing')
        .select('price, is_active')
        .eq('number_count', count)
        .eq('is_active', true)
        .single();

    return data?.price || 0;
}

export async function getResellerByCoupon(code: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('resellers')
        .select('id')
        .eq('coupon_code', code)
        .eq('is_active', true)
        .single();

    if (error || !data) return null;
    return data.id;
}

export async function createBet(numbers: number[], concurso: number, amount: number, resellerId?: string): Promise<Bet | null> {
    const user = getCurrentUser();
    if (!user) {
        console.error('createBet: No user found in localStorage');
        return null;
    }
    
    console.log('createBet: Attempting to create bet for user:', user.id);

    const { data, error } = await supabase
        .from('bets')
        .insert({
            user_id: user.id,
            reseller_id: resellerId,
            concurso,
            numbers,
            amount,
            status: 'pending',
            payment_status: 'pending',
            client_pix: user.pix_key
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating bet:', error);
        console.error('Full error details:', JSON.stringify(error, null, 2));
        console.error('User ID attempted:', user.id);
        return null;
    }
    return data;
}

export async function createBatchBets(
    bets: { numbers: number[], amount: number, concurso: number }[],
    resellerId?: string,
    clientPhone?: string,
    clientCpf?: string,
    clientPix?: string
) {
    const user = getCurrentUser();
    if (!user) return { cartId: null, bets: [] };

    const cartId = crypto.randomUUID();
    const rows = bets.map(bet => ({
        user_id: user.id,
        reseller_id: resellerId,
        concurso: bet.concurso,
        numbers: bet.numbers,
        amount: bet.amount,
        status: 'pending',
        payment_status: 'pending',
        client_name: user.full_name,
        client_phone: clientPhone || user.phone,
        client_cpf: clientCpf || user.cpf,
        client_pix: clientPix || user.pix_key,
        cart_id: cartId
    }));

    const { data, error } = await supabase
        .from('bets')
        .insert(rows)
        .select();

    if (error) {
        console.error("Batch insert error", error);
        throw error;
    }
    
    return { cartId, bets: data };
}

export async function getUserBets(): Promise<Bet[]> {
    const user = getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
        .rpc('get_user_bets', { p_user_id: user.id });

    if (error) {
        console.error('Error fetching user bets:', error);
        return [];
    }
    
    // Map bet_id to id for compatibility with the Bet interface used in the UI
    return (data || []).map((b: any) => ({
        ...b,
        id: b.bet_id
    }));
}

export interface PrizeEstimate {
    total_sales: number;
    prize_pool: number;
    sena: number;
    quina: number;
}

export async function getPrizeEstimates(concurso: number): Promise<PrizeEstimate | null> {
    const { data, error } = await supabase
        .rpc('get_prize_estimates', { concurso_num: concurso });

    if (error) {
        console.error('Error fetching estimates:', error);
        return null;
    }
    return data;
}

export async function getSystemSettings(key: string): Promise<any> {
    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();

    if (error || !data) return null;
    return data.value;
}

export async function checkBettingLock(): Promise<{ locked: boolean; message?: string }> {
    // Manual Lock Check (managed by admin settings)
    const settings = await getSystemSettings('betting_lock');
    if (settings && settings.manual_lock) {
        return { locked: true, message: 'Apostas estão temporariamente suspensas pelo administrador.' };
    }

    return { locked: false };
}

export async function updateUserPixKey(userId: string, newPixKey: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('profiles')
        .update({ pix_key: newPixKey })
        .eq('id', userId);

    if (error) {
        console.error('Error updating pix key:', error);
        return { success: false, error: 'Erro ao atualizar chave Pix.' };
    }
    return { success: true };
}

export interface ContestStat {
    concurso: number;
    total_revenue: number;
    total_bets: number;
}

export async function getContestStats(): Promise<ContestStat[]> {
    const { data, error } = await supabase
        .rpc('get_contest_stats');

    if (error) {
        console.error('Error fetching contest stats:', error);
        return [];
    }
    return data;
}

export interface AuditBet {
    bet_id: string;
    full_name: string;
    created_at: string;
    numbers: number[];
    status: string;
    hits: number;
}

export async function getAuditBets(concurso: number): Promise<AuditBet[]> {
    const { data, error } = await supabase
        .rpc('get_audit_bets', { p_concurso: concurso });

    if (error) {
        console.error('Error fetching audit bets:', error);
        throw error;
    }
    return data;
}

import { createMockClient as createClient } from './mockBackend';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://demo.luckyclover.local';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'demo-anon-key';

// Storage keys (v2: agora guardamos um JWT válido do Supabase; o sufixo força
// re-login limpo, descartando tokens antigos do formato anterior).
const TOKEN_KEY = 'lucky_reseller_auth_token_v2';
const USER_KEY = 'lucky_reseller_user_v2';

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
export interface AuthUser {
    id: string;
    cpf: string;
    full_name: string;
    phone?: string;
    pix_key?: string;
    cidade?: string;
    role: string;
}

export interface ResellerMetrics {
    totalSales: number;
    commission: number;
    activeClients: number;
    todaysBets: number;
}


export interface Sale {
    id: string;
    client_name: string;
    client_phone?: string;
    game: string;
    amount: number;
    commission: number;
    status: 'pending' | 'confirmed';
    payment_status: 'pending' | 'paid' | 'refunded';
    created_at: string;
    numbers: number[];
    concurso: number;
    ticket_number?: string;
}

export interface BetPricing {
    number_count: number;
    price: number;
    is_active: boolean;
}

export interface PrizeEstimate {
    total_sales: number;
    prize_pool: number;
    sena: number;
    quina: number;
}

export interface ResellerReportItem {
    concurso: number;
    total_sales: number;
    total_commission: number;
    bets: {
        id: string;
        created_at: string;
        amount: number;
        numbers: number[];
        client_name: string;
        commission: number;
        ticket_number?: string;
    }[];
}

// Auth result type
interface AuthResult {
    success: boolean;
    user?: AuthUser;
    token?: string;
    error?: string;
}

// Custom CPF Auth - Sign In (reseller only)
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

        // Check if user is a reseller
        if (result.user?.role !== 'reseller') {
            return { data: null, error: new Error('Acesso não autorizado. Apenas revendedores.') };
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
    // Dispatch storage event to notify current tab (storage event only fires in other tabs by default)
    window.dispatchEvent(new Event('storage'));
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
export async function getResellerMetrics(): Promise<ResellerMetrics & { currentConcurso?: number }> {
    const user = getCurrentUser();
    if (!user) {
        return { totalSales: 0, commission: 0, activeClients: 0, todaysBets: 0 };
    }

    // Get reseller record with maybeSingle() to handle missing records gracefully (e.g. stale sessions)
    const { data: reseller, error } = await supabase
        .from('resellers')
        .select('id, commission_rate')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error("Error fetching reseller metrics:", error);
    }

    if (!reseller) {
        // If not found, check if it's a stale session
        const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
        if (!profile) {
            console.warn("Session user not found. Forcing logout.");
            // We don't force logout automatically to avoid loops, but we log the issue
        }
        return { totalSales: 0, commission: 0, activeClients: 0, todaysBets: 0 };
    }

    // Get current OPEN contest
    const { data: openConcurso } = await supabase
        .from('concursos')
        .select('concurso_number')
        .eq('status', 'open')
        .order('concurso_number', { ascending: true })
        .limit(1)
        .maybeSingle();
    
    // If no open contest, commission is 0 (resets after close)
    if (!openConcurso) {
         return { totalSales: 0, commission: 0, activeClients: 0, todaysBets: 0 };
    }

    // Get bets for this reseller AND this specific contest
    const { data: bets } = await supabase
        .from('bets')
        .select('amount, payment_status, created_at')
        .eq('reseller_id', reseller.id)
        .eq('concurso', openConcurso.concurso_number);

    const totalSales = bets?.filter(b => b.payment_status === 'paid').reduce((sum, b) => sum + (b.amount || 0), 0) || 0;

    // Use stored rate or default to 10%
    const rate = (reseller.commission_rate || 10) / 100;
    const commission = totalSales * rate;

    // Today's bets
    const today = new Date().toISOString().split('T')[0];
    const todaysBets = bets?.filter(b => b.created_at?.startsWith(today) && b.payment_status === 'paid').length || 0;

    return {
        totalSales,
        commission,
        activeClients: 0, 
        todaysBets,
        currentConcurso: openConcurso.concurso_number
    };
}

export async function getRecentSales(): Promise<Sale[]> {
    const user = getCurrentUser();
    if (!user) return [];

    // Get reseller record
    const { data: reseller } = await supabase
        .from('resellers')
        .select('id, commission_rate')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!reseller) return [];

    // Get all bets for this reseller (removed limit to show all)
    const { data: bets, error } = await supabase
        .from('bets')
        .select('id, amount, payment_status, created_at, client_name, client_phone, numbers, concurso, ticket_number, profiles(full_name, phone)')
        .eq('reseller_id', reseller.id)
        .eq('payment_status', 'paid')
        .order('created_at', { ascending: false });

    if (error || !bets) return [];

    const commissionRate = (reseller.commission_rate || 10) / 100;

    return bets.map((bet: any) => {
        const b = bet;
        // Handle profiles being returned as single object or array
        const profileData = b.profiles;
        const profile = Array.isArray(profileData) ? profileData[0] : profileData;
        return {
            id: b.id,
            // Use profile name if linked, otherwise use stored client_name, otherwise fallback
            client_name: profile?.full_name || b.client_name || 'Cliente',
            // Use profile phone if linked, otherwise use stored client_phone
            client_phone: profile?.phone || b.client_phone,
            game: 'Mega Sena',
            amount: b.amount || 0,
            commission: (b.amount || 0) * commissionRate,
            status: b.payment_status === 'paid' ? 'confirmed' : 'pending' as any,
            payment_status: b.payment_status as any,
            created_at: b.created_at,
            numbers: b.numbers || [],
            concurso: b.concurso,
            ticket_number: b.ticket_number
        };
    });
}

// Get reseller sales report
export async function getResellerReport(resellerId: string): Promise<ResellerReportItem[]> {
    const { data, error } = await supabase.rpc('get_reseller_report', {
        p_reseller_id: resellerId
    });

    if (error) {
        console.error('Error fetching reseller report:', error);
        return [];
    }

    return data;
}

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
        .maybeSingle();
    return data?.price || 0;
}

export async function createBetForClient(
    clientName: string,
    numbers: number[],
    concurso: number,
    amount: number,
    clientPhone?: string,
    clientCpf?: string
) {
    const user = getCurrentUser();
    if (!user) return null;

    // Get reseller ID
    const { data: reseller } = await supabase
        .from('resellers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

    let userId = null;

    // Proactively try to find the client's user_id via CPF or Phone
    if (clientCpf || clientPhone) {
        const cleanCpf = clientCpf ? clientCpf.replace(/\D/g, '') : null;
        const cleanPhone = clientPhone ? clientPhone.replace(/\D/g, '') : null;

        let query = supabase.from('profiles').select('id');
        
        if (cleanCpf && cleanPhone) {
            query = query.or(`cpf.eq.${cleanCpf},phone.eq.${cleanPhone}`);
        } else if (cleanCpf) {
            query = query.eq('cpf', cleanCpf);
        } else if (cleanPhone) {
            query = query.eq('phone', cleanPhone);
        }

        const { data: profile } = await query.maybeSingle();
        if (profile) {
            userId = profile.id;
        }
    }

    const { data, error } = await supabase
        .from('bets')
        .insert({
            reseller_id: reseller?.id,
            user_id: userId,
            client_name: clientName,
            client_phone: clientPhone,
            client_cpf: clientCpf,
            concurso,
            numbers,
            amount,
            status: 'pending',
            payment_status: 'pending'
        })
        .select()
        .maybeSingle();

    if (error) {
        console.error('Error creating bet:', error);
        return null;
    }
    return data;
}

export async function createBatchBets(
    bets: { numbers: number[], amount: number, concurso: number }[],
    clientName: string,
    clientPhone?: string,
    clientCpf?: string,
    clientPix?: string
) {
    const user = await getCurrentUser();
    if (!user) return { cartId: null, bets: [] };

    let resellerId = null;

    // Try to find reseller profile
    const { data: reseller } = await supabase
        .from('resellers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
    
    if (reseller) {
        resellerId = reseller.id;
    }

    const cartId = crypto.randomUUID();
    let clientUserId = null;

    // Proactively try to find the client's user_id via CPF or Phone
    if (clientCpf || clientPhone) {
        const cleanCpf = clientCpf ? clientCpf.replace(/\D/g, '') : null;
        const cleanPhone = clientPhone ? clientPhone.replace(/\D/g, '') : null;

        let query = supabase.from('profiles').select('id');
        
        if (cleanCpf && cleanPhone) {
            query = query.or(`cpf.eq.${cleanCpf},phone.eq.${cleanPhone}`);
        } else if (cleanCpf) {
            query = query.eq('cpf', cleanCpf);
        } else if (cleanPhone) {
            query = query.eq('phone', cleanPhone);
        }

        const { data: profile } = await query.maybeSingle();
        if (profile) {
            clientUserId = profile.id;
        }
    }

    const rows = bets.map(bet => ({
        reseller_id: resellerId,
        user_id: clientUserId,
        concurso: bet.concurso,
        numbers: bet.numbers,
        amount: bet.amount,
        status: 'pending',
        payment_status: 'pending',
        client_name: clientName,
        client_phone: clientPhone,
        client_cpf: clientCpf,
        client_pix: clientPix,
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

export async function getSystemSettings(key: string): Promise<any> {
    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

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

export interface Winner {
    bet_id: string;
    user_id: string;
    full_name: string;
    hits: number;
    amount: number;
    ticket_number?: string;
}

export async function getWinners(concursoNumber: number): Promise<Winner[]> {
    const { data, error } = await supabase
        .rpc('get_winners', { p_concurso_number: concursoNumber });

    if (error) {
        console.error('Error fetching winners:', error);
        return [];
    }
    return data || [];
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

// ============================================
// Reseller Client Search & Registration
// ============================================

export interface ResellerClient {
    id?: string;
    name: string;
    phone: string;
    cpf: string;
    pix_key: string;
    source: 'reseller' | 'app';
}

/**
 * Searches for clients across both reseller_clients (recurring) and profiles (app-registered).
 * Uses a server-side RPC function with SECURITY DEFINER to bypass RLS.
 */
export async function searchClients(query: string): Promise<ResellerClient[]> {
    const user = getCurrentUser();
    if (!user || !query || query.length < 2) return [];

    const { data, error } = await supabase
        .rpc('search_clients_for_reseller', {
            p_reseller_user_id: user.id,
            p_query: query
        });

    if (error) {
        console.error('Error searching clients:', error);
        return [];
    }

    return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        phone: row.phone || '',
        cpf: row.cpf || '',
        pix_key: row.pix_key || '',
        source: row.source as 'reseller' | 'app'
    }));
}

/**
 * Registers or updates a client in the reseller_clients table.
 * Uses an RPC with SECURITY DEFINER to bypass RLS.
 */
export async function registerResellerClient(
    clientName: string,
    clientPhone: string,
    clientCpf: string,
    clientPix: string
): Promise<void> {
    const user = getCurrentUser();
    if (!user || !clientCpf) return;

    const { error } = await supabase
        .rpc('register_reseller_client', {
            p_reseller_user_id: user.id,
            p_name: clientName,
            p_phone: clientPhone,
            p_cpf: clientCpf,
            p_pix_key: clientPix
        });

    if (error) {
        console.error('Error registering reseller client:', error);
    }
}

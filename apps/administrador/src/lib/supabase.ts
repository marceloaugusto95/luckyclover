import { createMockClient as createClient } from "./mockBackend";

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ||
    "https://demo.luckyclover.local";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ||
    "demo-anon-key";

// Storage keys (v2: agora guardamos um JWT válido do Supabase; o sufixo força
// re-login limpo, descartando tokens antigos do formato anterior).
const TOKEN_KEY = "lucky_admin_auth_token_v2";
const USER_KEY = "lucky_admin_user_v2";

// Client Supabase com auth customizada por CPF. O token do admin (JWT assinado
// pela auth-cpf com o secret do projeto) é enviado ao PostgREST via accessToken,
// fazendo auth.uid()/is_admin()/RLS funcionarem para o painel administrativo.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => localStorage.getItem(TOKEN_KEY),
});

// Edge Function URL for custom CPF auth
const authFunctionUrl = `${supabaseUrl}/functions/v1/auth-cpf`;

// Helper to format CPF for display (XXX.XXX.XXX-XX)
export function formatCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, "");
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) {
        return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    }
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${
        clean.slice(9, 11)
    }`;
}

// Helper to validate CPF
export function validateCpf(cpf: string): boolean {
    const clean = cpf.replace(/\D/g, "");
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

export interface AdminMetrics {
    totalRevenue: number;
    monthlyRevenue: number;
    registeredClients: number;
    newClientsToday: number;
    totalBets: number;
}

export interface Reseller {
    id: string;
    user_id: string;
    business_name: string;
    user_cpf: string;
    user_phone: string;
    user_cidade: string;
    user_pix: string;
    total_sales: number;
    total_commission: number;
    commission_rate: number;
    coupon_code: string | null;
    is_active: boolean;
}

export interface Transaction {
    id: string;
    description: string;
    date: string;
    amount: number;
    status: "completed" | "pending";
    payment_id?: string;
    mp_status?: string;
    ticket_number?: string;
}

export interface BetPricing {
    id: string;
    number_count: number;
    price: number;
    is_active: boolean;
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

export interface GeneralResellerReportItem {
    reseller_id: string;
    reseller_name: string;
    total_sales: number;
    total_commission: number;
    net_value: number;
    tickets_count: number;
}

export interface CreateResellerData {
    fullName: string;
    cpf: string;
    phone: string;
    pixKey: string;
    cidade: string;
    businessName: string;
    couponCode: string;
    password: string;
}

// Auth result type
interface AuthResult {
    success: boolean;
    user?: AuthUser;
    token?: string;
    error?: string;
}

// Custom CPF Auth - Sign In (admin only)
export async function signIn(
    cpf: string,
    password: string,
): Promise<{ data: AuthUser | null; error: Error | null }> {
    try {
        const response = await fetch(authFunctionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({
                action: "login",
                cpf,
                password,
            }),
        });

        const result: AuthResult = await response.json();

        if (!response.ok || !result.success) {
            return {
                data: null,
                error: new Error(result.error || "Erro ao fazer login"),
            };
        }

        // Check if user is an admin
        if (result.user?.role !== "admin") {
            return {
                data: null,
                error: new Error(
                    "Acesso não autorizado. Apenas administradores.",
                ),
            };
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
        return {
            data: null,
            error: err instanceof Error ? err : new Error("Erro de conexão"),
        };
    }
}

// Custom CPF Auth - Sign Out
export async function signOut(): Promise<{ error: Error | null }> {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Dispatch storage event to notify current tab (storage event only fires in other tabs by default)
    window.dispatchEvent(new Event("storage"));
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

// Intercept auth errors (401/403) from Edge Function calls.
// If the admin token is expired or invalid, sign out and reload.
function handleAuthError(response: Response): void {
    if (response.status === 401 || response.status === 403) {
        console.warn("Sessão expirada ou não autorizada. Fazendo logout...");
        signOut().then(() => window.location.reload());
    }
}

// Create a new reseller account (admin only)
export async function createReseller(
    data: CreateResellerData,
): Promise<{ success: boolean; error?: string }> {
    try {
        const token = getAuthToken();
        const response = await fetch(authFunctionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`,
                "x-admin-token": token || "",
            },
            body: JSON.stringify({
                action: "register",
                cpf: data.cpf,
                password: data.password,
                full_name: data.fullName,
                phone: data.phone.replace(/\D/g, ""),
                pix_key: data.pixKey,
                cidade: data.cidade,
                role: "reseller",
                coupon_code: data.couponCode,
            }),
        });

        // If unauthorized, force re-login
        if (response.status === 401 || response.status === 403) {
            handleAuthError(response);
            return {
                success: false,
                error: "Sessão expirada. Redirecionando para login...",
            };
        }

        const result: AuthResult = await response.json();

        if (!response.ok || !result.success) {
            return {
                success: false,
                error: result.error || "Erro ao criar revendedor",
            };
        }

        // Create reseller record in database using RPC
        if (result.user) {
            const { error: resellerError } = await supabase.rpc(
                "insert_reseller",
                {
                    p_user_id: result.user.id,
                    p_business_name: data.businessName,
                    p_commission_rate: 10.00,
                    p_coupon_code: data.couponCode,
                },
            );

            if (resellerError) {
                return { success: false, error: resellerError.message };
            }
        }

        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Erro desconhecido",
        };
    }
}

// Delete user (admin only)
export async function deleteUser(
    userId: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const token = getAuthToken();
        const response = await fetch(authFunctionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`,
                "x-admin-token": token || "",
            },
            body: JSON.stringify({
                action: "delete_user",
                target_id: userId,
            }),
        });

        // If unauthorized, force re-login
        if (response.status === 401 || response.status === 403) {
            handleAuthError(response);
            return {
                success: false,
                error: "Sessão expirada. Redirecionando para login...",
            };
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
            return {
                success: false,
                error: result.error || "Erro ao excluir usuário",
            };
        }
        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Erro desconhecido",
        };
    }
}

// Reset password (admin only)
export async function resetUserPassword(
    userId: string,
    newPassword: string,
): Promise<{ success: boolean; error?: string }> {
    try {
        const token = getAuthToken();
        const response = await fetch(authFunctionUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseAnonKey}`,
                "x-admin-token": token || "",
            },
            body: JSON.stringify({
                action: "reset_password",
                target_id: userId,
                new_password: newPassword,
            }),
        });

        // If unauthorized, force re-login
        if (response.status === 401 || response.status === 403) {
            handleAuthError(response);
            return {
                success: false,
                error: "Sessão expirada. Redirecionando para login...",
            };
        }

        const result = await response.json();

        if (!response.ok || !result.success) {
            return {
                success: false,
                error: result.error || "Erro ao redefinir senha",
            };
        }
        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : "Erro desconhecido",
        };
    }
}

// Update System Settings (admin only)
export async function updateSystemSettings(
    key: string,
    value: any,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc("update_system_settings", {
        p_key: key,
        p_value: value,
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

// Admin data helpers - Using SECURITY DEFINER RPCs
export async function getAdminMetrics(): Promise<AdminMetrics> {
    const { data, error } = await supabase.rpc("get_admin_metrics");

    if (error || !data) {
        console.error("Error fetching admin metrics:", error);
        return {
            totalRevenue: 0,
            monthlyRevenue: 0,
            registeredClients: 0,
            newClientsToday: 0,
            totalBets: 0,
        };
    }

    return {
        totalRevenue: data.totalRevenue || 0,
        monthlyRevenue: data.monthlyRevenue || 0,
        registeredClients: data.registeredClients || 0,
        newClientsToday: data.newClientsToday || 0,
        totalBets: data.totalBets || 0,
    };
}

export async function getResellers(): Promise<Reseller[]> {
    const { data, error } = await supabase.rpc("get_all_resellers");

    if (error || !data) {
        console.error("Error fetching resellers:", error);
        return [];
    }

    return data.map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        business_name: r.business_name || r.full_name || "N/A",
        user_cpf: formatCpf(r.user_cpf || ""),
        user_phone: r.user_phone || "",
        user_cidade: r.user_cidade || "",
        user_pix: r.user_pix || "",
        total_sales: r.total_sales || 0,
        total_commission: r.total_commission || 0,
        commission_rate: r.commission_rate,
        coupon_code: r.coupon_code || null,
        is_active: r.is_active,
    }));
}

// Get all clients
export async function getClients() {
    const { data, error } = await supabase.rpc("get_all_clients");

    if (error || !data) {
        console.error("Error fetching clients:", error);
        return [];
    }
    return data;
}

// Update reseller commission rate
export async function updateResellerCommission(
    resellerId: string,
    commissionRate: number,
): Promise<boolean> {
    const { error } = await supabase.rpc("update_reseller_commission", {
        p_reseller_id: resellerId,
        p_commission_rate: commissionRate,
    });

    return !error;
}

// Get reseller sales report
export async function getResellerReport(
    resellerId: string,
): Promise<ResellerReportItem[]> {
    const { data, error } = await supabase.rpc("get_reseller_report", {
        p_reseller_id: resellerId,
    });

    if (error) {
        console.error("Error fetching reseller report:", error);
        return [];
    }

    return data;
}

// Get general reseller report (all resellers for a contest)
export async function getGeneralResellerReport(
    concursoNumber: number,
): Promise<GeneralResellerReportItem[]> {
    const { data, error } = await supabase.rpc("get_general_reseller_report", {
        p_concurso_number: concursoNumber,
    });

    if (error) {
        console.error("Error fetching general reseller report:", error);
        return [];
    }
    return data;
}

export async function getRecentTransactions(): Promise<Transaction[]> {
    const { data, error } = await supabase.rpc("get_recent_transactions", {
        limit_count: 20,
    });

    if (error || !data) {
        console.error("Error fetching transactions:", error);
        return [];
    }

    return data.map((bet: any) => ({
        id: bet.id,
        description: `Aposta - Concurso ${bet.concurso}`,
        date: new Date(bet.created_at).toLocaleString("pt-BR"),
        amount: bet.amount || 0,
        status: bet.payment_status === "paid"
            ? "completed" as const
            : "pending" as const,
        payment_id: bet.payment_id || undefined,
        mp_status: bet.payment_status,
        ticket_number: bet.ticket_number,
    }));
}

export async function getBetPricing(): Promise<BetPricing[]> {
    const { data, error } = await supabase.rpc("get_bet_pricing");

    if (error || !data) {
        console.error("Error fetching bet pricing:", error);
        return [];
    }
    return data;
}

export async function updateBetPrice(
    id: string,
    price: number,
): Promise<boolean> {
    const { error } = await supabase.rpc("update_bet_price", {
        p_id: id,
        p_price: price,
    });

    return !error;
}

export async function toggleBetPriceStatus(
    id: string,
    isActive: boolean,
): Promise<boolean> {
    const { error } = await supabase.rpc("toggle_bet_pricing_status", {
        p_id: id,
        p_is_active: isActive,
    });

    return !error;
}

export async function getBetDetails(betId: string) {
    const { data, error } = await supabase.rpc("get_bet_details", {
        p_bet_id: betId,
    });

    if (error || !data) {
        console.error("Error fetching bet details:", error);
        return null;
    }

    // Normalize if it's an array
    const betData = Array.isArray(data) ? data[0] : data;
    return betData as any;
}

export async function getAllBets() {
    const { data, error } = await supabase.rpc("get_all_bets", {
        limit_count: 500,
    });

    if (error || !data) {
        console.error("Error fetching bets:", error);
        return [];
    }
    return data;
}

export interface WinnerDetails {
    bet_id: string;
    user_name: string;
    user_phone: string;
    user_pix: string;
    bet_numbers: number[];
    hits: number;
    ticket_number?: string;
}

export async function checkWinners(
    concurso: number,
    winningNumbers: number[],
): Promise<WinnerDetails[]> {
    const { data, error } = await supabase
        .rpc("check_winners", {
            concurso_num: concurso,
            winning_numbers: winningNumbers,
        });

    if (error) {
        console.error("Error checking winners:", error);
        return [];
    }
    return data;
}

export interface PrizeEstimate {
    total_sales: number;
    prize_pool: number;
    sena: number;
    quina: number;
    accumulated_value?: number;
}

export async function getPrizeEstimates(
    concurso: number,
): Promise<PrizeEstimate | null> {
    const { data, error } = await supabase
        .rpc("get_prize_estimates", { concurso_num: concurso });

    if (error) {
        console.error("Error fetching estimates:", error);
        return null;
    }
    return data;
}

export interface ContestStat {
    concurso: number;
    total_revenue: number;
    total_bets: number;
    total_commission: number;
}

export async function getContestStats(): Promise<ContestStat[]> {
    const { data, error } = await supabase
        .rpc("get_contest_stats");

    if (error) {
        console.error("Error fetching contest stats:", error);
        return [];
    }
    return data;
}

// ==============================================
// CONCURSOS MANAGEMENT
// ==============================================

export interface Concurso {
    id: string;
    concurso_number: number;
    draw_date: string;
    drawn_numbers: number[];
    status: "open" | "closed";
    created_at: string;
}

export async function getConcursos(): Promise<Concurso[]> {
    const { data, error } = await supabase
        .from("concursos")
        .select("*")
        .order("concurso_number", { ascending: false });

    if (error) {
        console.error("Error fetching concursos:", error);
        return [];
    }
    return data;
}

export async function getConcurso(
    concursoNumber: number,
): Promise<Concurso | null> {
    const { data, error } = await supabase
        .from("concursos")
        .select("*")
        .eq("concurso_number", concursoNumber)
        .single();

    if (error) {
        console.error("Error fetching concurso:", error);
        return null;
    }
    return data;
}

export async function createConcurso(
    concursoNumber: number,
    drawDate: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from("concursos")
        .insert({
            concurso_number: concursoNumber,
            draw_date: drawDate,
            drawn_numbers: [],
            status: "open",
        });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function registerDrawResult(
    concursoNumber: number,
    drawnNumbers: number[],
): Promise<{ success: boolean; error?: string }> {
    // Validate 6 numbers
    if (drawnNumbers.length !== 6) {
        return {
            success: false,
            error: "Deve informar exatamente 6 números sorteados",
        };
    }

    const { error } = await supabase
        .from("concursos")
        .update({
            drawn_numbers: drawnNumbers,
            status: "closed",
            updated_at: new Date().toISOString(),
        })
        .eq("concurso_number", concursoNumber);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export interface ProcessDrawResult {
    bets_processed: number;
    winners_sena: number;
    winners_quina: number;
    winners_quadra: number;
}

export async function processDraw(
    concursoNumber: number,
): Promise<{ success: boolean; data?: ProcessDrawResult; error?: string }> {
    const { data, error } = await supabase
        .rpc("process_draw", { p_concurso_number: concursoNumber });

    if (error) {
        return { success: false, error: error.message };
    }

    // RPC returns array with single row
    const result = Array.isArray(data) ? data[0] : data;
    return { success: true, data: result };
}

export interface Winner {
    bet_id: string;
    user_id: string;
    full_name: string;
    phone: string;
    pix_key: string;
    numbers: number[];
    hits: number;
    amount: number;
    ticket_number?: string;
    client_name?: string;
    client_phone?: string;
}

export async function getWinners(concursoNumber: number): Promise<Winner[]> {
    const { data, error } = await supabase
        .rpc("get_winners", { p_concurso_number: concursoNumber });

    if (error) {
        console.error("Error fetching winners:", error);
        return [];
    }
    return data || [];
}

export interface ContestBetReportItem {
    bet_id: string;
    client_name: string;
    phone: string;
    reseller_name: string;
    numbers: number[];
    status: string;
    payment_status: string;
    hits: number;
    amount: number;
    created_at: string;
    ticket_number?: string;
    coupon_code?: string;
}

export async function getContestReportBets(
    concursoNumber: number,
): Promise<ContestBetReportItem[]> {
    const { data, error } = await supabase
        .rpc("get_contest_report_bets", { p_concurso: concursoNumber });

    if (error) {
        console.error("Error fetching contest report bets:", error);
        return [];
    }
    return data || [];
}

export async function updateConcursoDate(
    concursoNumber: number,
    newDate: string,
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from("concursos")
        .update({ draw_date: newDate, updated_at: new Date().toISOString() })
        .eq("concurso_number", concursoNumber);

    if (error) {
        console.error("Error updating concurso date:", error);
        return { success: false, error: error.message };
    }
    return { success: true };
}

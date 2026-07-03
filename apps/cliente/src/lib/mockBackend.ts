/**
 * LuckyClover — In-browser mock backend (portfolio prototype)
 * =============================================================
 * This module replaces `@supabase/supabase-js` for the demo. It provides a small,
 * faithful emulation of the parts of Supabase the app uses:
 *
 *   • A chainable PostgREST-style query builder  ( .from(table).select()/insert()/... )
 *   • The project's RPCs                          ( .rpc('get_all_bets', ...) etc. )
 *   • Realtime subscriptions                      ( .channel().on().subscribe() )
 *   • The custom CPF Edge Function `auth-cpf`     (intercepted `fetch`)
 *   • The `pix-create-charge` Edge Function       (intercepted `fetch`, auto-confirms)
 *
 * All data lives in-memory and is persisted to localStorage, seeded with realistic
 * demo data on first load. There is NO network access and NO secret of any kind.
 * The business logic (cascading prize distribution, reseller commission, etc.) mirrors
 * the real Postgres RPCs so the UI behaves like production.
 *
 * Because each app runs on its own origin, each app seeds its own independent demo DB.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js';

const DB_KEY = 'luckyclover_mock_db_v1';

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

let _seq = 0;
function uid(prefix: string): string {
    _seq += 1;
    return `${prefix}-${_seq.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// Deterministic PRNG (mulberry32) so the seeded dataset is stable.
function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function isoDaysAgo(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}
function dateStr(daysFromNow: number): string {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
}

let _ticket = 480000;
function nextTicket(): string {
    _ticket += 1;
    return String(_ticket);
}

function countHits(numbers: number[], drawn: number[]): number {
    if (!drawn || drawn.length === 0) return 0;
    const set = new Set(drawn.map(Number));
    return (numbers || []).filter((n) => set.has(Number(n))).length;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function seed(): any {
    const rnd = mulberry32(20260703);
    const now = new Date();

    const profiles: any[] = [
        { id: 'u-admin', full_name: 'Administrador Demo', phone: '11900000000', cpf: '00000000000', pix_key: 'admin@luckyclover.demo', cidade: 'São Paulo', role: 'admin', reseller_id: null, created_at: isoDaysAgo(120), updated_at: isoDaysAgo(120) },
        { id: 'u-res-1', full_name: 'João Silva', phone: '19988887777', cpf: '22233344455', pix_key: 'joao@luckyclover.demo', cidade: 'Campinas', role: 'reseller', reseller_id: null, created_at: isoDaysAgo(90), updated_at: isoDaysAgo(90) },
        { id: 'u-res-2', full_name: 'Ana Souza', phone: '13977776666', cpf: '33344455566', pix_key: 'ana@luckyclover.demo', cidade: 'Santos', role: 'reseller', reseller_id: null, created_at: isoDaysAgo(80), updated_at: isoDaysAgo(80) },
    ];

    const clientNames = ['Maria Oliveira', 'Carlos Pereira', 'Fernanda Lima', 'Roberto Alves', 'Patrícia Gomes', 'Lucas Martins', 'Juliana Costa', 'Marcos Rocha'];
    const cities = ['São Paulo', 'Campinas', 'Santos', 'Guarulhos', 'Osasco', 'Sorocaba'];
    clientNames.forEach((name, i) => {
        profiles.push({
            id: `u-c-${i + 1}`,
            full_name: name,
            phone: `1199${(1000000 + i * 111111).toString().slice(0, 7)}`,
            cpf: (11122233344 + i * 1010101).toString().padStart(11, '0'),
            pix_key: `${name.split(' ')[0].toLowerCase()}@luckyclover.demo`,
            cidade: cities[i % cities.length],
            role: 'client',
            reseller_id: i % 3 === 0 ? 'u-res-1' : null,
            created_at: isoDaysAgo(70 - i * 5),
            updated_at: isoDaysAgo(70 - i * 5),
        });
    });

    const resellers: any[] = [
        { id: 'r-1', user_id: 'u-res-1', business_name: 'Banca do João', commission_rate: 10, total_sales: 0, total_commission: 0, is_active: true, coupon_code: 'JOAO10', created_at: isoDaysAgo(90) },
        { id: 'r-2', user_id: 'u-res-2', business_name: 'Sorte Central', commission_rate: 12, total_sales: 0, total_commission: 0, is_active: true, coupon_code: 'CENTRAL', created_at: isoDaysAgo(80) },
    ];

    const bet_pricing: any[] = [];
    for (let count = 10; count <= 20; count++) {
        bet_pricing.push({
            id: `bp-${count}`,
            number_count: count,
            price: 50 * Math.pow(2, count - 10),
            is_active: count <= 16,
            updated_at: isoDaysAgo(30),
        });
    }

    // Draw dates: draws on Tue/Thu/Sat. We approximate with a schedule ending in the future.
    const concursos: any[] = [
        { id: uid('conc'), concurso_number: 2790, draw_date: dateStr(-7), drawn_numbers: [4, 12, 15, 32, 45, 58], status: 'closed', accumulated_sena: 0, accumulated_quina: 0, prize_pool_sena: 0, prize_pool_quina: 0, created_at: isoDaysAgo(14), updated_at: isoDaysAgo(7) },
        { id: uid('conc'), concurso_number: 2791, draw_date: dateStr(-5), drawn_numbers: [7, 18, 22, 33, 41, 55], status: 'closed', accumulated_sena: 0, accumulated_quina: 0, prize_pool_sena: 0, prize_pool_quina: 0, created_at: isoDaysAgo(12), updated_at: isoDaysAgo(5) },
        { id: uid('conc'), concurso_number: 2792, draw_date: dateStr(-2), drawn_numbers: [2, 9, 17, 28, 49, 60], status: 'closed', accumulated_sena: 0, accumulated_quina: 0, prize_pool_sena: 0, prize_pool_quina: 0, created_at: isoDaysAgo(9), updated_at: isoDaysAgo(2) },
        { id: uid('conc'), concurso_number: 2793, draw_date: dateStr(2), drawn_numbers: [], status: 'open', accumulated_sena: 0, accumulated_quina: 0, prize_pool_sena: null, prize_pool_quina: null, created_at: isoDaysAgo(2), updated_at: isoDaysAgo(2) },
    ];

    const clients = profiles.filter((p) => p.role === 'client');
    const bets: any[] = [];
    const transactions: any[] = [];

    function pickNumbers(rng: () => number, count: number): number[] {
        const pool: number[] = [];
        while (pool.length < count) {
            const n = 1 + Math.floor(rng() * 60);
            if (!pool.includes(n)) pool.push(n);
        }
        return pool.sort((a, b) => a - b);
    }

    concursos.forEach((c) => {
        const isOpen = c.status === 'open';
        const nBets = isOpen ? 16 : 14;
        for (let i = 0; i < nBets; i++) {
            const client = clients[Math.floor(rnd() * clients.length)];
            const count = 10 + Math.floor(rnd() * 4); // 10..13
            const numbers = pickNumbers(rnd, count);
            const price = bet_pricing.find((p) => p.number_count === count)?.price ?? 50;
            const useReseller = rnd() < 0.45;
            const reseller = useReseller ? resellers[Math.floor(rnd() * resellers.length)] : null;
            const paid = isOpen ? rnd() < 0.7 : rnd() < 0.9;
            const daysAgo = isOpen ? Math.floor(rnd() * 2) : (10 - concursos.indexOf(c) * 2) + Math.floor(rnd() * 2);
            const bet: any = {
                id: uid('bet'),
                user_id: client.id,
                reseller_id: reseller ? reseller.id : null,
                concurso: c.concurso_number,
                numbers,
                amount: price,
                status: paid ? 'confirmed' : 'pending',
                payment_status: paid ? 'paid' : 'pending',
                hits: 0,
                prize_amount: 0,
                pix_code: null,
                payment_id: paid ? uid('mp') : null,
                client_name: client.full_name,
                client_phone: client.phone,
                client_cpf: client.cpf,
                client_pix: client.pix_key,
                client_email: null,
                cart_id: uid('cart'),
                ticket_number: nextTicket(),
                game: 'Mega Sena',
                created_at: isoDaysAgo(Math.max(0, daysAgo)),
                updated_at: isoDaysAgo(Math.max(0, daysAgo)),
            };
            bets.push(bet);
            if (paid) {
                transactions.push({ id: uid('tx'), bet_id: bet.id, reseller_id: bet.reseller_id, type: 'bet_payment', amount: bet.amount, status: 'completed', description: `Pagamento aposta #${bet.ticket_number}`, created_at: bet.created_at });
                if (reseller) {
                    const commission = +(bet.amount * (reseller.commission_rate / 100)).toFixed(2);
                    transactions.push({ id: uid('tx'), bet_id: bet.id, reseller_id: reseller.id, type: 'commission', amount: commission, status: 'completed', description: `Comissão ${reseller.business_name}`, created_at: bet.created_at });
                }
            }
        }
    });

    const system_settings: any[] = [
        { key: 'betting_lock', value: { manual_lock: false }, updated_at: isoDaysAgo(3) },
        { key: 'prize_distribution', value: { sena: 0.7, quina: 0.3 }, updated_at: isoDaysAgo(3) },
        { key: 'support_phone', value: { number: '5511990000000' }, updated_at: isoDaysAgo(3) },
    ];

    const reseller_clients: any[] = [
        { id: uid('rc'), reseller_user_id: 'u-res-1', name: 'Pedro Nunes', phone: '11955554444', cpf: '99988877766', pix_key: 'pedro@luckyclover.demo', created_at: isoDaysAgo(20) },
        { id: uid('rc'), reseller_user_id: 'u-res-1', name: 'Sandra Dias', phone: '11944443333', cpf: '88877766655', pix_key: 'sandra@luckyclover.demo', created_at: isoDaysAgo(15) },
    ];

    const db = { concursos, bets, profiles, resellers, transactions, bet_pricing, system_settings, reseller_clients, _now: now.toISOString() };

    // Settle the closed contests so winner/report screens have data.
    concursos.filter((c) => c.status === 'closed').forEach((c) => settleConcurso(db, c.concurso_number));

    return db;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function load(): any | null {
    try {
        const raw = localStorage.getItem(DB_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}
function persist() {
    try {
        localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
        /* ignore quota / SSR */
    }
}

const db: any = load() ?? seed();
persist();

// ---------------------------------------------------------------------------
// Prize settlement (mirrors the cascading process_draw RPC)
// ---------------------------------------------------------------------------

function settleConcurso(database: any, concursoNumber: number): any {
    const c = database.concursos.find((x: any) => x.concurso_number === concursoNumber);
    if (!c) return { bets_processed: 0, winners_sena: 0, winners_quina: 0, winners_quadra: 0, winning_tier: 0, winners_count: 0 };
    const drawn = c.drawn_numbers || [];
    const paid = database.bets.filter((b: any) => b.concurso === concursoNumber && b.payment_status === 'paid' && b.status !== 'refunded');
    const pool = +(paid.reduce((s: number, b: any) => s + Number(b.amount), 0) * 0.7).toFixed(2);

    paid.forEach((b: any) => { b.hits = countHits(b.numbers, drawn); });

    const dist = (database.system_settings.find((s: any) => s.key === 'prize_distribution') || {}).value || { sena: 0.7, quina: 0.3 };
    const sena = paid.filter((b: any) => b.hits === 6);
    const quina = paid.filter((b: any) => b.hits === 5);
    const quadra = paid.filter((b: any) => b.hits === 4);

    // reset losers
    paid.forEach((b: any) => { b.status = 'lost'; b.prize_amount = 0; });

    let winning_tier = 0;
    let winners_count = 0;

    if (sena.length > 0) {
        winning_tier = 6;
        winners_count = sena.length;
        const senaShare = +((pool * dist.sena) / sena.length).toFixed(2);
        sena.forEach((b: any) => { b.status = 'won'; b.prize_amount = senaShare; });
        if (quina.length > 0) {
            const quinaShare = +((pool * dist.quina) / quina.length).toFixed(2);
            quina.forEach((b: any) => { b.status = 'won'; b.prize_amount = quinaShare; });
        }
    } else {
        // cascade: entire pool to the single highest tier that has winners
        const tiers: Array<[number, any[]]> = [[5, quina], [4, quadra]];
        for (let t = 3; t >= 1; t--) tiers.push([t, paid.filter((b: any) => b.hits === t)]);
        for (const [tier, winners] of tiers) {
            if (winners.length > 0) {
                winning_tier = tier;
                winners_count = winners.length;
                const share = +(pool / winners.length).toFixed(2);
                winners.forEach((b: any) => { b.status = 'won'; b.prize_amount = share; });
                break;
            }
        }
    }

    c.prize_pool_sena = +(pool * dist.sena).toFixed(2);
    c.prize_pool_quina = +(pool * dist.quina).toFixed(2);

    return {
        bets_processed: paid.length,
        winners_sena: sena.length,
        winners_quina: quina.length,
        winners_quadra: quadra.length,
        winning_tier,
        winners_count,
    };
}

// ---------------------------------------------------------------------------
// Realtime bus
// ---------------------------------------------------------------------------

const channels: any[] = [];

function matchFilter(filter: string | undefined, row: any): boolean {
    if (!filter) return true;
    // format: "col=eq.value"
    const m = /^([a-z_]+)=eq\.(.*)$/.exec(filter);
    if (!m) return true;
    return String(row[m[1]]) === m[2];
}

function emit(table: string, event: string, newRow: any, oldRow: any) {
    channels.forEach((ch) => {
        ch.listeners.forEach((l: any) => {
            const cfg = l.cfg || {};
            if (cfg.table && cfg.table !== table) return;
            if (cfg.event && cfg.event !== '*' && cfg.event !== event) return;
            if (!matchFilter(cfg.filter, newRow)) return;
            try {
                l.cb({ schema: 'public', table, eventType: event, new: newRow, old: oldRow });
            } catch {
                /* listener errors are non-fatal */
            }
        });
    });
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

class Query {
    private table: string;
    private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    private rows: any[] = [];
    private patch: any = null;
    private filters: Array<(r: any) => boolean> = [];
    private orderCol: string | null = null;
    private orderAsc = true;
    private limitN: number | null = null;
    private singleMode: 'one' | 'maybe' | null = null;
    private returning = false;
    private selectStr = '*';
    private conflictKey: string | null = null;

    constructor(table: string) {
        this.table = table;
    }

    select(str?: string) {
        if (this.op === 'select') this.selectStr = str || '*';
        else { this.returning = true; this.selectStr = str || '*'; }
        return this;
    }
    insert(rows: any) { this.op = 'insert'; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch: any) { this.op = 'update'; this.patch = patch; return this; }
    upsert(rows: any, opts?: any) { this.op = 'upsert'; this.rows = Array.isArray(rows) ? rows : [rows]; this.conflictKey = opts?.onConflict || null; return this; }
    eq(col: string, val: any) { this.filters.push((r) => r[col] === val || String(r[col]) === String(val)); return this; }
    neq(col: string, val: any) { this.filters.push((r) => String(r[col]) !== String(val)); return this; }
    in(col: string, vals: any[]) { this.filters.push((r) => vals.map(String).includes(String(r[col]))); return this; }
    or(expr: string) {
        const clauses = expr.split(',').map((c) => {
            const m = /^([a-z_]+)\.eq\.(.*)$/.exec(c.trim());
            return m ? { col: m[1], val: m[2] } : null;
        }).filter(Boolean) as Array<{ col: string; val: string }>;
        this.filters.push((r) => clauses.some((cl) => String(r[cl.col]) === cl.val));
        return this;
    }
    order(col: string, opts?: any) { this.orderCol = col; this.orderAsc = opts ? opts.ascending !== false : true; return this; }
    limit(n: number) { this.limitN = n; return this; }
    maybeSingle() { this.singleMode = 'maybe'; return this; }
    single() { this.singleMode = 'one'; return this; }

    private tableRef(): any[] {
        if (!db[this.table]) db[this.table] = [];
        return db[this.table];
    }

    private applyFilters(list: any[]): any[] {
        return list.filter((r) => this.filters.every((f) => f(r)));
    }

    private withEmbeds(row: any): any {
        const out = { ...row };
        if (this.table === 'bets') {
            if (this.selectStr.includes('profiles(')) {
                const p = db.profiles.find((x: any) => x.id === row.user_id) || null;
                out.profiles = p ? { ...p } : null;
            }
            if (this.selectStr.includes('resellers(')) {
                const rs = db.resellers.find((x: any) => x.id === row.reseller_id) || null;
                out.resellers = rs ? { ...rs } : null;
            }
        }
        return out;
    }

    private finalize(list: any[]) {
        let out = list.map((r) => this.withEmbeds(r));
        if (this.singleMode === 'one') {
            if (out.length === 0) return { data: null, error: { message: 'No rows found', code: 'PGRST116' } };
            return { data: out[0], error: null };
        }
        if (this.singleMode === 'maybe') {
            return { data: out.length ? out[0] : null, error: null };
        }
        return { data: out, error: null };
    }

    private exec() {
        const ref = this.tableRef();

        if (this.op === 'select') {
            let list = this.applyFilters(ref);
            if (this.orderCol) {
                const col = this.orderCol;
                list = [...list].sort((a, b) => {
                    const av = a[col]; const bv = b[col];
                    if (av === bv) return 0;
                    const r = av > bv ? 1 : -1;
                    return this.orderAsc ? r : -r;
                });
            }
            if (this.limitN != null) list = list.slice(0, this.limitN);
            return this.finalize(list);
        }

        if (this.op === 'insert') {
            const inserted = this.rows.map((r) => this.normalizeInsert(r));
            inserted.forEach((r) => { ref.push(r); emit(this.table, 'INSERT', r, null); });
            persist();
            return this.returning ? this.finalize(inserted) : { data: null, error: null };
        }

        if (this.op === 'update') {
            const matched = this.applyFilters(ref);
            matched.forEach((r) => {
                const old = { ...r };
                Object.assign(r, this.patch, { updated_at: new Date().toISOString() });
                emit(this.table, 'UPDATE', r, old);
            });
            persist();
            return this.returning ? this.finalize(matched) : { data: null, error: null };
        }

        if (this.op === 'upsert') {
            const result: any[] = [];
            this.rows.forEach((r) => {
                const key = this.conflictKey;
                const existing = key ? ref.find((x) => String(x[key]) === String(r[key])) : null;
                if (existing) {
                    const old = { ...existing };
                    Object.assign(existing, r, { updated_at: new Date().toISOString() });
                    emit(this.table, 'UPDATE', existing, old);
                    result.push(existing);
                } else {
                    const row = this.normalizeInsert(r);
                    ref.push(row);
                    emit(this.table, 'INSERT', row, null);
                    result.push(row);
                }
            });
            persist();
            return this.returning ? this.finalize(result) : { data: null, error: null };
        }

        return { data: null, error: { message: 'unsupported op' } };
    }

    private normalizeInsert(r: any): any {
        const nowIso = new Date().toISOString();
        const base: any = { ...r };
        if (this.table === 'bets') {
            base.id = base.id || uid('bet');
            base.status = base.status || 'pending';
            base.payment_status = base.payment_status || 'pending';
            base.hits = base.hits ?? 0;
            base.prize_amount = base.prize_amount ?? 0;
            base.ticket_number = base.ticket_number || nextTicket();
            base.cart_id = base.cart_id || uid('cart');
            base.game = base.game || 'Mega Sena';
        } else if (this.table === 'concursos') {
            base.id = base.id || uid('conc');
            base.drawn_numbers = base.drawn_numbers || [];
            base.status = base.status || 'open';
        } else if (this.table === 'profiles') {
            base.id = base.id || uid('u');
            base.role = base.role || 'client';
        } else {
            base.id = base.id || uid(this.table);
        }
        base.created_at = base.created_at || nowIso;
        base.updated_at = nowIso;
        return base;
    }

    // Thenable so `await query` resolves to { data, error }
    then(onFulfilled: any, onRejected?: any) {
        let res;
        try { res = this.exec(); } catch (e) { return Promise.resolve().then(() => onRejected ? onRejected(e) : Promise.reject(e)); }
        return Promise.resolve(res).then(onFulfilled, onRejected);
    }
}

// ---------------------------------------------------------------------------
// RPC implementations
// ---------------------------------------------------------------------------

function paidBetsFor(concurso: number): any[] {
    return db.bets.filter((b: any) => b.concurso === concurso && b.payment_status === 'paid');
}
function openConcurso(): any {
    return db.concursos.filter((c: any) => c.status === 'open').sort((a: any, b: any) => a.concurso_number - b.concurso_number)[0] || null;
}
function resellerById(id: string): any { return db.resellers.find((r: any) => r.id === id) || null; }
function profileById(id: string): any { return db.profiles.find((p: any) => p.id === id) || null; }
function maskName(name: string): string {
    if (!name) return '***';
    const parts = name.split(' ');
    return parts.map((p) => (p.length <= 1 ? p : p[0] + '*'.repeat(Math.max(2, p.length - 1)))).join(' ');
}

const RPCS: Record<string, (args: any) => any> = {
    get_user_bets: ({ p_user_id }) =>
        db.bets
            .filter((b: any) => b.user_id === p_user_id && b.payment_status === 'paid')
            .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
            .map((b: any) => ({ bet_id: b.id, id: b.id, concurso: b.concurso, numbers: b.numbers, amount: b.amount, status: b.status, payment_status: b.payment_status, hits: b.hits, created_at: b.created_at, ticket_number: b.ticket_number })),

    get_prize_estimates: ({ concurso_num }) => {
        const paid = paidBetsFor(concurso_num);
        const total = +paid.reduce((s: number, b: any) => s + Number(b.amount), 0).toFixed(2);
        const pool = +(total * 0.7).toFixed(2);
        const dist = (db.system_settings.find((s: any) => s.key === 'prize_distribution') || {}).value || { sena: 0.7, quina: 0.3 };
        return { total_sales: total, prize_pool: pool, sena: +(pool * dist.sena).toFixed(2), quina: +(pool * dist.quina).toFixed(2), quadra: 0, accumulated_value: 0, bets_count: paid.length, cascading: true };
    },

    get_contest_stats: () => {
        const byConc: Record<number, any> = {};
        paidAll().forEach((b: any) => {
            if (!byConc[b.concurso]) byConc[b.concurso] = { concurso: b.concurso, total_revenue: 0, total_bets: 0, total_commission: 0 };
            byConc[b.concurso].total_revenue += Number(b.amount);
            byConc[b.concurso].total_bets += 1;
        });
        db.transactions.filter((t: any) => t.type === 'commission' && t.status === 'completed').forEach((t: any) => {
            const bet = db.bets.find((b: any) => b.id === t.bet_id);
            if (bet && byConc[bet.concurso]) byConc[bet.concurso].total_commission += Number(t.amount);
        });
        return Object.values(byConc)
            .map((r: any) => ({ ...r, total_revenue: +r.total_revenue.toFixed(2), total_commission: +r.total_commission.toFixed(2) }))
            .sort((a: any, b: any) => b.concurso - a.concurso);
    },

    get_audit_bets: ({ p_concurso }) =>
        paidBetsFor(p_concurso)
            .sort((a: any, b: any) => (a.created_at > b.created_at ? 1 : -1))
            .map((b: any) => ({ bet_id: b.id, full_name: maskName(b.client_name || (profileById(b.user_id) || {}).full_name || ''), created_at: b.created_at, numbers: b.numbers, status: b.status, hits: b.hits })),

    get_admin_metrics: () => {
        const paid = paidAll();
        const now = new Date();
        const monthKey = now.toISOString().slice(0, 7);
        const todayKey = now.toISOString().slice(0, 10);
        const clients = db.profiles.filter((p: any) => p.role === 'client');
        return {
            totalRevenue: +paid.reduce((s: number, b: any) => s + Number(b.amount), 0).toFixed(2),
            monthlyRevenue: +paid.filter((b: any) => (b.created_at || '').slice(0, 7) === monthKey).reduce((s: number, b: any) => s + Number(b.amount), 0).toFixed(2),
            registeredClients: clients.length,
            newClientsToday: clients.filter((c: any) => (c.created_at || '').slice(0, 10) === todayKey).length,
            totalBets: paid.length,
        };
    },

    get_all_resellers: () => {
        const oc = openConcurso();
        const cn = oc ? oc.concurso_number : null;
        return db.resellers.map((r: any) => {
            const user = profileById(r.user_id) || {};
            const sales = cn == null ? 0 : db.bets.filter((b: any) => b.reseller_id === r.id && b.concurso === cn && b.payment_status === 'paid').reduce((s: number, b: any) => s + Number(b.amount), 0);
            return {
                id: r.id, user_id: r.user_id, business_name: r.business_name, full_name: user.full_name,
                user_cpf: user.cpf, user_phone: user.phone, user_cidade: user.cidade, user_pix: user.pix_key,
                total_sales: +sales.toFixed(2), total_commission: +(sales * (r.commission_rate / 100)).toFixed(2),
                commission_rate: r.commission_rate, coupon_code: r.coupon_code, is_active: r.is_active, current_concurso: cn,
            };
        });
    },

    get_all_clients: () =>
        db.profiles.filter((p: any) => p.role === 'client').map((p: any) => ({ id: p.id, full_name: p.full_name, cpf: p.cpf, phone: p.phone, pix_key: p.pix_key, cidade: p.cidade })),

    update_reseller_commission: ({ p_reseller_id, p_commission_rate }) => {
        const r = resellerById(p_reseller_id);
        if (r) r.commission_rate = p_commission_rate;
        persist();
        return null;
    },

    get_reseller_report: ({ p_reseller_id }) => {
        const r = resellerById(p_reseller_id);
        const rate = r ? r.commission_rate : 10;
        const rows = db.bets.filter((b: any) => b.reseller_id === p_reseller_id && b.payment_status === 'paid');
        const byConc: Record<number, any> = {};
        rows.forEach((b: any) => {
            if (!byConc[b.concurso]) byConc[b.concurso] = { concurso: b.concurso, total_sales: 0, total_commission: 0, bets: [] };
            const commission = +(Number(b.amount) * (rate / 100)).toFixed(2);
            byConc[b.concurso].total_sales += Number(b.amount);
            byConc[b.concurso].total_commission += commission;
            byConc[b.concurso].bets.push({ id: b.id, created_at: b.created_at, amount: b.amount, numbers: b.numbers, client_name: b.client_name, commission, ticket_number: b.ticket_number });
        });
        return Object.values(byConc).map((c: any) => ({ ...c, total_sales: +c.total_sales.toFixed(2), total_commission: +c.total_commission.toFixed(2) })).sort((a: any, b: any) => b.concurso - a.concurso);
    },

    get_general_reseller_report: ({ p_concurso_number }) =>
        db.resellers.map((r: any) => {
            const rows = db.bets.filter((b: any) => b.reseller_id === r.id && b.concurso === p_concurso_number && b.payment_status === 'paid');
            const sales = rows.reduce((s: number, b: any) => s + Number(b.amount), 0);
            const commission = +(sales * (r.commission_rate / 100)).toFixed(2);
            return { reseller_id: r.id, reseller_name: r.business_name, total_sales: +sales.toFixed(2), total_commission: commission, net_value: +(sales - commission).toFixed(2), tickets_count: rows.length };
        }).filter((r: any) => r.tickets_count > 0),

    get_recent_transactions: ({ limit_count }) =>
        paidAll()
            .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))
            .slice(0, limit_count || 20)
            .map((b: any) => ({ id: b.id, concurso: b.concurso, created_at: b.created_at, amount: b.amount, payment_status: b.payment_status, payment_id: b.payment_id, ticket_number: b.ticket_number })),

    get_bet_pricing: () => db.bet_pricing.map((p: any) => ({ id: p.id, number_count: p.number_count, price: p.price, is_active: p.is_active })).sort((a: any, b: any) => a.number_count - b.number_count),

    update_bet_price: ({ p_id, p_price }) => { const p = db.bet_pricing.find((x: any) => x.id === p_id); if (p) p.price = p_price; persist(); return null; },
    toggle_bet_pricing_status: ({ p_id, p_is_active }) => { const p = db.bet_pricing.find((x: any) => x.id === p_id); if (p) p.is_active = p_is_active; persist(); return null; },

    get_bet_details: ({ p_bet_id }) => {
        const b = db.bets.find((x: any) => x.id === p_bet_id);
        if (!b) return null;
        const prof = profileById(b.user_id);
        const rs = resellerById(b.reseller_id);
        return {
            id: b.id, concurso: b.concurso, numbers: b.numbers, amount: b.amount, status: b.status, payment_status: b.payment_status, hits: b.hits, created_at: b.created_at, ticket_number: b.ticket_number,
            client_name: b.client_name, client_phone: b.client_phone, client_cpf: b.client_cpf, client_email: b.client_email, client_pix: b.client_pix,
            profiles: prof ? { id: prof.id, full_name: prof.full_name, cpf: prof.cpf, phone: prof.phone, pix_key: prof.pix_key, cidade: prof.cidade } : null,
            resellers: rs ? { coupon_code: rs.coupon_code, business_name: rs.business_name } : null,
        };
    },

    get_all_bets: ({ limit_count }) =>
        paidAll()
            .sort((a: any, b: any) => b.concurso - a.concurso || (a.created_at < b.created_at ? 1 : -1))
            .slice(0, limit_count || 500)
            .map((b: any) => {
                const prof = profileById(b.user_id);
                const rs = resellerById(b.reseller_id);
                return {
                    id: b.id, concurso: b.concurso, numbers: b.numbers, amount: b.amount, status: b.status, payment_status: b.payment_status, created_at: b.created_at, ticket_number: b.ticket_number,
                    client_name: b.client_name, client_phone: b.client_phone,
                    profiles: prof ? { full_name: prof.full_name, phone: prof.phone, cpf: prof.cpf, cidade: prof.cidade || (rs ? (profileById(rs.user_id) || {}).cidade : null) } : null,
                    resellers: rs ? { coupon_code: rs.coupon_code } : null,
                };
            }),

    check_winners: ({ concurso_num, winning_numbers }) => {
        const paid = paidBetsFor(concurso_num);
        const withHits = paid.map((b: any) => ({ b, hits: countHits(b.numbers, winning_numbers || []) }));
        const maxHits = withHits.reduce((m: number, x: any) => Math.max(m, x.hits), 0);
        let selected: any[] = [];
        if (maxHits >= 6) selected = withHits.filter((x: any) => x.hits === 6 || x.hits === 5);
        else if (maxHits >= 1) selected = withHits.filter((x: any) => x.hits === maxHits);
        return selected.map(({ b, hits }: any) => {
            const prof = profileById(b.user_id) || {};
            return { bet_id: b.id, user_name: b.client_name || prof.full_name, user_phone: b.client_phone || prof.phone, user_pix: b.client_pix || prof.pix_key, bet_numbers: b.numbers, hits, ticket_number: b.ticket_number };
        });
    },

    process_draw: ({ p_concurso_number }) => {
        const c = db.concursos.find((x: any) => x.concurso_number === p_concurso_number);
        if (c && c.status !== 'closed') c.status = 'closed';
        const res = settleConcurso(db, p_concurso_number);
        persist();
        return [res];
    },

    get_winners: ({ p_concurso_number }) =>
        db.bets.filter((b: any) => b.concurso === p_concurso_number && b.status === 'won').map((b: any) => {
            const prof = profileById(b.user_id) || {};
            return { bet_id: b.id, user_id: b.user_id, full_name: prof.full_name, phone: prof.phone, pix_key: prof.pix_key, numbers: b.numbers, hits: b.hits, amount: b.prize_amount, client_name: b.client_name, client_phone: b.client_phone, ticket_number: b.ticket_number };
        }),

    get_contest_report_bets: ({ p_concurso }) =>
        paidBetsFor(p_concurso).sort((a: any, b: any) => b.hits - a.hits).map((b: any) => {
            const rs = resellerById(b.reseller_id);
            return { bet_id: b.id, client_name: b.client_name, phone: b.client_phone, reseller_name: rs ? rs.business_name : 'Direto', numbers: b.numbers, status: b.status, payment_status: b.payment_status, hits: b.hits, amount: b.amount, created_at: b.created_at, ticket_number: b.ticket_number, coupon_code: rs ? rs.coupon_code : null };
        }),

    search_clients_for_reseller: ({ p_reseller_user_id, p_query }) => {
        const q = (p_query || '').toLowerCase();
        const fromClients = db.reseller_clients.filter((c: any) => c.reseller_user_id === p_reseller_user_id && (c.name.toLowerCase().includes(q) || (c.cpf || '').includes(q) || (c.phone || '').includes(q)))
            .map((c: any) => ({ id: c.id, name: c.name, phone: c.phone, cpf: c.cpf, pix_key: c.pix_key, source: 'reseller' }));
        const fromApp = db.profiles.filter((p: any) => p.role === 'client' && (p.full_name.toLowerCase().includes(q) || (p.cpf || '').includes(q) || (p.phone || '').includes(q)))
            .map((p: any) => ({ id: p.id, name: p.full_name, phone: p.phone, cpf: p.cpf, pix_key: p.pix_key, source: 'app' }));
        return [...fromClients, ...fromApp].slice(0, 10);
    },

    register_reseller_client: ({ p_reseller_user_id, p_name, p_phone, p_cpf, p_pix_key }) => {
        db.reseller_clients.push({ id: uid('rc'), reseller_user_id: p_reseller_user_id, name: p_name, phone: p_phone, cpf: p_cpf, pix_key: p_pix_key, created_at: new Date().toISOString() });
        persist();
        return null;
    },

    insert_reseller: ({ p_user_id, p_business_name, p_commission_rate, p_coupon_code }) => {
        db.resellers.push({ id: uid('r'), user_id: p_user_id, business_name: p_business_name, commission_rate: p_commission_rate || 10, total_sales: 0, total_commission: 0, is_active: true, coupon_code: p_coupon_code || null, created_at: new Date().toISOString() });
        persist();
        return null;
    },

    update_system_settings: ({ p_key, p_value }) => {
        const s = db.system_settings.find((x: any) => x.key === p_key);
        if (s) s.value = p_value; else db.system_settings.push({ key: p_key, value: p_value, updated_at: new Date().toISOString() });
        persist();
        return null;
    },
};

function paidAll(): any[] {
    return db.bets.filter((b: any) => b.payment_status === 'paid');
}

async function rpc(name: string, args: any) {
    const fn = RPCS[name];
    if (!fn) {
        console.warn(`[mockBackend] Unhandled RPC: ${name}`);
        return { data: null, error: { message: `RPC ${name} not implemented in mock` } };
    }
    try {
        return { data: fn(args || {}), error: null };
    } catch (e: any) {
        return { data: null, error: { message: e?.message || 'mock rpc error' } };
    }
}

// ---------------------------------------------------------------------------
// Mock client
// ---------------------------------------------------------------------------

export function createMockClient(_url?: string, _key?: string, _opts?: any): SupabaseClient {
    const client = {
        from: (table: string) => new Query(table),
        rpc,
        channel: (name: string) => {
            const ch: any = {
                name,
                listeners: [],
                on(_evt: string, cfg: any, cb: any) { this.listeners.push({ cfg, cb }); return this; },
                subscribe(cb?: any) { if (!channels.includes(this)) channels.push(this); if (cb) cb('SUBSCRIBED'); return this; },
            };
            return ch;
        },
        removeChannel: (ch: any) => {
            const i = channels.indexOf(ch);
            if (i >= 0) channels.splice(i, 1);
            return Promise.resolve({ error: null });
        },
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            getSession: async () => ({ data: { session: null }, error: null }),
        },
    };
    // The runtime object implements only the subset of the Supabase client the apps use,
    // but we type it as SupabaseClient so app code type-checks exactly as against the real client.
    return client as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Edge-function emulation via a global fetch interceptor
// ---------------------------------------------------------------------------

function fakeJwt(user: any): string {
    try {
        return `demo.${btoa(JSON.stringify({ sub: user.id, role: 'authenticated', user_role: user.role, cpf: user.cpf }))}.sig`;
    } catch {
        return 'demo.token.sig';
    }
}

function makeFakeQrBase64(text: string): string {
    if (typeof document === 'undefined') return '';
    try {
        const size = 208; const cells = 26; const cell = size / cells;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
        // deterministic module pattern from text hash
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
        const rng = mulberry32(h >>> 0);
        ctx.fillStyle = '#0b3d0b';
        for (let y = 2; y < cells - 2; y++) {
            for (let x = 2; x < cells - 2; x++) {
                if (rng() > 0.5) ctx.fillRect(x * cell, y * cell, cell, cell);
            }
        }
        // finder squares
        const drawFinder = (ox: number, oy: number) => {
            ctx.fillStyle = '#0b3d0b';
            ctx.fillRect(ox * cell, oy * cell, cell * 7, cell * 7);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, cell * 5, cell * 5);
            ctx.fillStyle = '#0b3d0b';
            ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, cell * 3, cell * 3);
        };
        drawFinder(0, 0); drawFinder(cells - 7, 0); drawFinder(0, cells - 7);
        return canvas.toDataURL('image/png').split(',')[1] || '';
    } catch {
        return '';
    }
}

function jsonResponse(body: any, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function handleAuthCpf(body: any): Response {
    const action = body.action;
    if (action === 'login') {
        const cpf = String(body.cpf || '').replace(/\D/g, '');
        const user = db.profiles.find((p: any) => p.cpf === cpf);
        if (!user) return jsonResponse({ success: false, error: 'CPF não encontrado. Use um dos CPFs de demonstração.' }, 401);
        // Demo: any password is accepted.
        return jsonResponse({ success: true, token: fakeJwt(user), user: { id: user.id, cpf: user.cpf, full_name: user.full_name, phone: user.phone, pix_key: user.pix_key, cidade: user.cidade, role: user.role } });
    }
    if (action === 'register') {
        const cpf = String(body.cpf || '').replace(/\D/g, '');
        let user = db.profiles.find((p: any) => p.cpf === cpf);
        if (!user) {
            user = { id: uid('u'), full_name: body.full_name || 'Novo Usuário', phone: String(body.phone || '').replace(/\D/g, ''), cpf, pix_key: body.pix_key || '', cidade: body.cidade || '', role: body.role || 'client', reseller_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            db.profiles.push(user);
            persist();
        }
        return jsonResponse({ success: true, token: fakeJwt(user), user: { id: user.id, cpf: user.cpf, full_name: user.full_name, phone: user.phone, pix_key: user.pix_key, cidade: user.cidade, role: user.role } });
    }
    if (action === 'delete_user') {
        db.profiles = db.profiles.filter((p: any) => p.id !== body.target_id);
        persist();
        return jsonResponse({ success: true });
    }
    if (action === 'reset_password' || action === 'update_settings') {
        if (action === 'update_settings') RPCS.update_system_settings({ p_key: body.key, p_value: body.value });
        return jsonResponse({ success: true });
    }
    return jsonResponse({ success: false, error: 'Ação desconhecida' }, 400);
}

function handlePixCreate(body: any): Response {
    const betId = body.betId;
    const targets = db.bets.filter((b: any) => b.cart_id === betId || b.id === betId);
    const paymentId = uid('mp');
    // Simulate the bank confirming the PIX after a few seconds (via realtime, like production).
    setTimeout(() => {
        targets.forEach((b: any) => {
            const old = { ...b };
            b.payment_status = 'paid';
            b.status = 'confirmed';
            b.payment_id = paymentId;
            b.updated_at = new Date().toISOString();
            db.transactions.push({ id: uid('tx'), bet_id: b.id, reseller_id: b.reseller_id, type: 'bet_payment', amount: b.amount, status: 'completed', description: `Pagamento PIX aposta #${b.ticket_number}`, created_at: b.updated_at });
            if (b.reseller_id) {
                const r = resellerById(b.reseller_id);
                if (r) db.transactions.push({ id: uid('tx'), bet_id: b.id, reseller_id: r.id, type: 'commission', amount: +(b.amount * (r.commission_rate / 100)).toFixed(2), status: 'completed', description: `Comissão ${r.business_name}`, created_at: b.updated_at });
            }
            emit('bets', 'UPDATE', b, old);
        });
        persist();
    }, 4500);

    const total = targets.reduce((s: number, b: any) => s + Number(b.amount), 0) || body.amount || 0;
    const emv = `00020126BR.GOV.BCB.PIX+LuckyCloverDemo52040000530398654${String(total.toFixed(2)).padStart(10, '0')}5802BR5910LuckyClover6009SaoPaulo62070503***6304DEMO`;
    return jsonResponse({
        success: true,
        paymentId,
        status: 'pending',
        qrCode: { qrcode: emv, imagemQrcode: makeFakeQrBase64(emv), ticketUrl: 'https://demo.luckyclover.local/pix/' + paymentId },
    });
}

function handleLoterias(): Response {
    const closed = db.concursos.filter((c: any) => c.status === 'closed').sort((a: any, b: any) => b.concurso_number - a.concurso_number)[0];
    const open = openConcurso();
    return jsonResponse({
        concurso: closed ? closed.concurso_number : 2792,
        data: closed ? closed.draw_date.split('-').reverse().join('/') : '01/01/2026',
        dezenas: closed ? closed.drawn_numbers.map((n: number) => String(n).padStart(2, '0')) : ['02', '09', '17', '28', '49', '60'],
        acumulou: true,
        proximoConcurso: open ? open.concurso_number : 2793,
        dataProximoConcurso: open ? open.draw_date.split('-').reverse().join('/') : '05/01/2026',
        valorEstimadoProximoConcurso: 5200000,
    });
}

function installFetchInterceptor() {
    if (typeof window === 'undefined') return;
    const w = window as any;
    if (w.__luckyMockFetch) return;
    w.__luckyMockFetch = true;
    const original = w.fetch ? w.fetch.bind(w) : null;

    w.fetch = async (input: any, init?: any) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        let body: any = {};
        try { body = init && init.body ? JSON.parse(init.body) : {}; } catch { body = {}; }

        if (url.includes('/functions/v1/auth-cpf')) return handleAuthCpf(body);
        if (url.includes('/functions/v1/pix-create-charge')) return handlePixCreate(body);
        if (url.includes('loteriascaixa') || url.includes('/api/megasena')) return handleLoterias();

        if (original) return original(input, init);
        return jsonResponse({ error: 'network disabled in mock' }, 503);
    };
}

installFetchInterceptor();

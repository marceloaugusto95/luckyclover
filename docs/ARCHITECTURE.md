# LuckyClover — Architecture

This document describes how LuckyClover is designed as a production system, and how the
portfolio prototype faithfully emulates that design in the browser. It is meant to be read
alongside the source under [`apps/`](../apps), [`supabase/`](../supabase) and the mock at
`apps/*/src/lib/mockBackend.ts`.

---

## 1. Monorepo & front-ends

LuckyClover is an **npm-workspaces monorepo** with three independent React + Vite + TypeScript
single-page apps that deploy separately (each produces its own static `dist/`):

| App | Audience | Key screens |
|---|---|---|
| **cliente** | End bettors | Home (next contest, latest result, prize estimate), New Bet (number grid + cart), Checkout (PIX), My Bets, public Audit/transparency |
| **revendedor** | Resellers / points of sale | Dashboard (realtime metrics), New Bet for a client, Sales history + reports, thermal ticket printing |
| **administrador** | Operators | Dashboard & metrics, Contests (create/close/process draw), Clients, Resellers (commissions), Payments, Pricing, Settings, PDF/Excel reports |

State is local (React state + a small Zustand cart store). Styling is hand-written CSS with
a shared design-token sheet in `packages/shared`.

Each app authenticates users independently and stores its session under an app-scoped
`localStorage` key (`lucky_auth_token_v2`, `lucky_reseller_auth_token_v2`,
`lucky_admin_auth_token_v2`).

---

## 2. Backend design (production) vs. prototype (mock)

Every app imports a Supabase client and issues the **same calls** in both worlds:

```
supabase.from('bets').select(...).eq(...)      // PostgREST query builder
supabase.rpc('get_all_bets', { limit_count })  // SECURITY DEFINER RPC
supabase.channel(...).on('postgres_changes',…) // Realtime
fetch(`${url}/functions/v1/auth-cpf`, …)        // Edge Function
```

- **Production:** `createClient` from `@supabase/supabase-js` points at a real project. The
  calls hit PostgREST / RPCs / Realtime / Edge Functions.
- **Prototype:** `createClient` is swapped for `createMockClient` from `mockBackend.ts`,
  which implements the same surface over an in-memory, `localStorage`-persisted database
  seeded with demo data. A `fetch` interceptor emulates the Edge Functions.

Because the call sites are identical, the mock is a drop-in — no page or component code was
changed to run the prototype.

### What the mock reproduces

| Concern | Production | Mock (`mockBackend.ts`) |
|---|---|---|
| Tables & queries | Postgres + PostgREST | Chainable query builder over seeded arrays (`select/insert/update/upsert/eq/or/order/limit/single/maybeSingle`, embedded relations) |
| Business RPCs | ~25 `SECURITY DEFINER` functions | Same names & return shapes, logic re-implemented in TS |
| Realtime | Postgres logical replication | In-process pub/sub; emits `INSERT`/`UPDATE` to channel subscribers with filter matching |
| CPF auth | `auth-cpf` Edge Function (PBKDF2 + signed JWT) | `fetch` interceptor returning a demo token + seeded user |
| PIX | `pix-create-charge` → Mercado Pago → webhook | `fetch` interceptor returns a QR (canvas-rendered), then auto-confirms after ~4.5 s via a realtime `UPDATE` |
| Official results | Caixa lottery API | `fetch` interceptor returns the seeded latest contest |

---

## 3. Data model

Seven core tables (full DDL in [`supabase/schema.sql`](../supabase/schema.sql) and
[`supabase/migrations/`](../supabase/migrations)):

- **profiles** — one row per user; `role ∈ {client, reseller, admin}`, CPF, PIX key, city.
- **resellers** — business name, `commission_rate`, `coupon_code`, activity flag.
- **concursos** — Mega-Sena contests: `concurso_number`, `draw_date`, `drawn_numbers[]`,
  `status ∈ {open, closed}`, prize pools.
- **bets** — `numbers[]` (10–25 picks), `amount`, `status`, `payment_status`, `hits`,
  `prize_amount`, denormalized client fields, `cart_id` (batch grouping), `ticket_number`.
- **transactions** — ledger: `bet_payment`, `commission`, `prize_payout`, `refund`.
- **bet_pricing** — price per `number_count`, toggleable.
- **system_settings** — JSONB config (`betting_lock`, `prize_distribution`, `support_phone`).

A bet is linked to a bettor (`user_id`) and optionally a reseller (`reseller_id`, resolved
from a coupon at checkout).

---

## 4. Authorization model (production)

Row-Level Security is strict. The custom CPF login (`auth-cpf`) signs a **valid Supabase
JWT** (HS256) with claims `sub` = user id, `role = authenticated`, and `user_role ∈
{client, reseller, admin}`. The three front-ends pass that token to PostgREST via the
client's `accessToken` option, so `auth.uid()` and `is_admin()` work and RLS is enforced
for real (not just in the UI).

- `bets`: a user sees/creates their own (`auth.uid() = user_id`); a reseller sees their
  own (`reseller_id`); an admin sees all (`is_admin()`).
- `concursos`: public read; admin-only writes.
- Sensitive RPCs are `SECURITY DEFINER` with internal guards — admin functions raise unless
  `is_admin()`, per-user functions check ownership/role scope.

> The prototype does **not** enforce authorization (there is no server); it seeds each role
> its own view and focuses on demonstrating the product surface. The RLS design is preserved
> verbatim in the migrations for reference.

---

## 5. Prize engine (cascading, no rollover)

Implemented in the `process_draw` RPC and mirrored by `settleConcurso()` in the mock:

1. **Pool** = `sum(paid bet amounts for the contest) × 0.70`.
2. **Hits**: for each paid bet, count matches against `drawn_numbers` (6 drawn).
3. **Distribution**:
   - If there is **≥1 Sena winner** (6 hits): the Sena tier shares `pool × 0.70`; the Quina
     tier (5 hits) shares `pool × 0.30`; everyone below loses. (Split ratio comes from
     `system_settings.prize_distribution`.)
   - If there is **no Sena winner**: the **entire pool** cascades to the single highest tier
     that has any winners (5 → 4 → 3 → 2 → 1), split evenly.
4. Each winning bet gets `status='won'` and its `prize_amount`; others `status='lost'`.

**Reseller commission** is independent of the draw: when a bet becomes `paid`, a trigger
writes a `commission` transaction of `amount × commission_rate/100` and updates reseller
totals. `check_winners` provides an admin preview using the same cascade rule before a
contest is officially closed.

---

## 6. Payments (PIX / Mercado Pago) — production

- `pix-create-charge` (Edge Function, anon-invoked): recomputes the authoritative amount
  from `bet_pricing`, creates a Mercado Pago PIX payment (`external_reference = betId` or
  `cart_id`), and returns the QR code + copy-paste string.
- `pix-webhook` (service role): validates the HMAC signature, re-fetches the real payment
  status, and on `approved` marks the bet(s) `payment_status='paid'`, `status='confirmed'`,
  and inserts a `bet_payment` transaction — which in turn fires the commission trigger.
- The front-end subscribes to a realtime channel filtered by `cart_id` and reacts the moment
  the webhook flips the row to paid.

The mock condenses this into one step: `pix-create-charge` schedules the "approval" itself
after a few seconds and emits the same realtime `UPDATE`, so the checkout UX is identical.

---

## 7. Contest synchronization

`sync-concursos` (Edge Function, scheduled by `pg_cron`) pulls official Mega-Sena results
from the Caixa API, closes the open contest with its drawn numbers, calls `process_draw` to
settle bets, and opens the next contest. Betting locks at 20:00 (America/São_Paulo) on draw
days (Tue/Thu/Sat).

---

## 8. Thermal printing (reseller)

`apps/revendedor/src/lib/printer.ts` formats 58 mm / 32-column monospace tickets and prints
through a priority chain: **SUNMI** (Capacitor plugin) → **Stone deep-link** (Android
`printer-app://`) → **browser `window.print()`** fallback (with an on-screen paper emulator).
Confirmed sales can auto-print via a realtime subscription. See
[`apps/revendedor/IMPRESSAO.md`](../apps/revendedor/IMPRESSAO.md).

---

## 9. Connecting a real backend

To point the prototype at an actual Supabase project:

1. Create the project and apply [`supabase/migrations/`](../supabase/migrations).
2. Deploy the Edge Functions in [`supabase/functions/`](../supabase/functions).
3. In each app, set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see `.env.example`).
4. Change the data-layer import from `./mockBackend` back to `@supabase/supabase-js` in each
   `src/lib/supabase.ts` (and `pix.ts`).

The application code above the data layer needs no changes.

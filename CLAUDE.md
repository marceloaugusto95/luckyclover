# CLAUDE.md

Guidance for Claude Code (and developers) working in the **LuckyClover** repository. It
explains what this project is, why it exists, how it was built, and the conventions to
follow when changing it.

## What this project is

**LuckyClover is a white-label _prototype_ of a full-stack lottery management platform,
built as a portfolio piece.** It showcases a real, non-trivial product architecture —
three role-specific front-ends over a rich BaaS backend — while being safe to publish
publicly and runnable with zero configuration.

- **Frontend:** React 18 + Vite + TypeScript (vanilla CSS), npm-workspaces monorepo
- **Backend (design, reference-only):** Supabase — Postgres + RLS, Edge Functions, Realtime, `pg_cron`
- **Prototype backend (what actually runs):** an in-browser mock in `apps/*/src/lib/mockBackend.ts`
- **Payments (design):** Mercado Pago PIX · **Mobile:** Capacitor/Android thermal printing

It is **not** a live product. There is no server, no database, no secrets. Everything runs
client-side against seeded demo data.

## Origin & relationship to the source product

LuckyClover was derived from a **private production project** ("Trevo da Sorte"). That
production repo auto-deploys to Vercel on every change and must never be touched from here.
LuckyClover is a **sanitized, standalone copy** — a separate git repo with no link back to
production. If you are asked to change "the live app", that is the *other* repo, not this one.

## How it was built (the white-label process)

1. **Copied** the three web apps (`cliente`, `revendedor`, `administrador`), the `shared`
   package, and the `supabase/` folder from the source product.
2. **Rebranded** every string: "Trevo da Sorte" / "ACAO ENTRE AMIGOS - TDS" → **LuckyClover**;
   replaced the logo with `clover.svg`; localStorage keys `trevo_*` → `lucky_*`. The UI
   stays in **Brazilian Portuguese** (the product's market); docs/comments are English.
3. **Scrubbed all secrets**: hardcoded Supabase anon JWT, project ref, Mercado Pago
   credentials, the Android signing fingerprint, and every `.env` were removed and replaced
   with placeholders (`.env.example`).
4. **Replaced the data layer with a mock.** Each app's `src/lib/supabase.ts` (and `pix.ts`)
   originally imported `createClient` from `@supabase/supabase-js`. That import now points to
   `./mockBackend`, which implements the same client surface. **No page or component code
   was changed** — the mock is a drop-in.
5. **Kept the production backend as reference** under `supabase/` (schema, RLS policies,
   `SECURITY DEFINER` RPCs, Edge Functions) so the real design is readable.

## The mock backend (`apps/*/src/lib/mockBackend.ts`)

This is the heart of the prototype. It reproduces the parts of Supabase the apps use:

- **Query builder** — `from(table).select/insert/update/upsert/eq/or/order/limit/single/maybeSingle`, incl. embedded relations (`bets → profiles(...)`).
- **~25 RPCs** — same names and return shapes as the real `SECURITY DEFINER` functions (`get_all_bets`, `process_draw`, `get_prize_estimates`, `get_reseller_report`, …), with the business logic (cascading prize distribution, reseller commissions) re-implemented in TypeScript.
- **Realtime** — an in-process pub/sub emitting `INSERT`/`UPDATE` to `channel().on().subscribe()` subscribers, with `cart_id=eq.…` filter matching.
- **CPF auth** — a global `fetch` interceptor emulating the `auth-cpf` Edge Function (returns a demo token + seeded user).
- **PIX** — the `pix-create-charge` interceptor returns a canvas-rendered QR, then **auto-confirms** the payment after ~4.5 s via a realtime `UPDATE`, so checkout completes like production.
- **Data** — seeded on first load, persisted to `localStorage` (key `luckyclover_mock_db_v1`). It is typed as `SupabaseClient` (via cast) so the app type-checks exactly as against the real client.

> ⚠️ **The mock is duplicated as an identical file in all three apps** (they deploy
> independently and don't share a package). When you change it, edit one copy and copy it to
> the other two:
> ```bash
> cp apps/cliente/src/lib/mockBackend.ts apps/revendedor/src/lib/mockBackend.ts
> cp apps/cliente/src/lib/mockBackend.ts apps/administrador/src/lib/mockBackend.ts
> ```
> Bump `DB_KEY` (e.g. `_v1` → `_v2`) if you change the seed shape, so stale localStorage is discarded.

Because each app runs on its own origin, each seeds its **own** independent demo DB — a bet
created in the reseller app won't appear in admin. That's an accepted prototype limitation.

## Structure

```text
luckyclover/
├── apps/
│   ├── cliente/          # Bettor web app     (dev port 3001)
│   ├── revendedor/       # Reseller POS        (dev port 3002)
│   └── administrador/    # Admin back-office   (dev port 3003)
├── packages/shared/      # Shared types/helpers/styles (reference; not imported by the apps)
├── supabase/             # Production backend design — schema, RLS, RPCs, Edge Functions (reference)
└── docs/ARCHITECTURE.md  # Deep-dive
```

## Commands

```bash
npm install                  # install all workspaces
npm run dev                  # run all three apps at once
npm run dev:cliente          # port 3001
npm run dev:revendedor       # port 3002
npm run dev:administrador    # port 3003
npm run build                # build all three (tsc && vite build each)
```

## Demo credentials

Login is by **CPF**; in the prototype **any password is accepted**. Each app only admits its
own role.

| Role | App | CPF |
|---|---|---|
| Client | cliente | `111.222.333-44` |
| Reseller | revendedor | `222.333.444-55` (coupon `JOAO10`) |
| Admin | administrador | `000.000.000-00` |

## Conventions & guardrails

- **Never commit secrets.** There are none in this repo; keep it that way. `.env*` is
  git-ignored (except `.env.example`).
- TypeScript is **strict** (`noUnusedLocals`/`noUnusedParameters` on) — prefix intentionally
  unused params with `_`.
- Keep the UI in **PT-BR**; write docs/comments in **English**.
- Don't wire the mock into `packages/shared`; the apps each own their data layer.
- To connect a **real** Supabase project instead of the mock, see `docs/ARCHITECTURE.md` §9
  (set the `.env` vars and point the `createClient` import back at `@supabase/supabase-js`).

## Verifying changes

- Build all three apps (`npm run build`) — they must compile clean.
- The mock's runtime behavior can be exercised headlessly by transpiling `mockBackend.ts`
  with esbuild and running it under Node with `localStorage`/`document`/`window` polyfills
  (that's how the initial build was validated end-to-end, including the PIX realtime flow).

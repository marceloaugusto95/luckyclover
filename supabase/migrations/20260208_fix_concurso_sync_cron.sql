-- Database migration to fix Mega-Sena concours sync and cron schedules
-- Created on 2026-02-08

-- 1. Correct the cron job schedules for Mega-Sena draw days (Tue=2, Thu=4, Sat=6)
-- Delete old incorrect schedules if they exist
SELECT cron.unschedule('sync-concursos-after-draw');
SELECT cron.unschedule('sync-concursos-after-draw-2');

-- Create new correct schedules for Tue, Thu, Sat at 23:30 UTC
SELECT cron.schedule(
    'sync-concursos-draw-nights',
    '30 23 * * 2,4,6',
    $$
    SELECT net.http_post(
        url := 'https://your-project-ref.supabase.co/functions/v1/sync-concursos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- Add a follow-up check 2 hours later
SELECT cron.schedule(
    'sync-concursos-draw-nights-followup',
    '30 1 * * 3,5,0',
    $$
    SELECT net.http_post(
        url := 'https://your-project-ref.supabase.co/functions/v1/sync-concursos',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- 2. Ensure initial state for concursos table
-- Concurso 2970 was drawn on 07/02/2026
INSERT INTO concursos (concurso_number, draw_date, status, drawn_numbers, updated_at)
VALUES (2970, '2026-02-07', 'closed', ARRAY[22, 32, 37, 41, 42, 59], NOW())
ON CONFLICT (concurso_number) DO UPDATE SET
    status = 'closed',
    drawn_numbers = ARRAY[22, 32, 37, 41, 42, 59],
    updated_at = NOW();

-- Concurso 2971 is the current open concurso
INSERT INTO concursos (concurso_number, draw_date, status, updated_at)
VALUES (2971, '2026-02-10', 'open', NOW())
ON CONFLICT (concurso_number) DO UPDATE SET
    status = 'open',
    draw_date = '2026-02-10',
    updated_at = NOW();

-- 3. Update any pending bets for concurso 2970
WITH bet_hits AS (
    SELECT 
        b.id,
        (SELECT COUNT(*)::int FROM unnest(b.numbers) n(num) 
         WHERE num IN (22, 32, 37, 41, 42, 59)) AS hit_count
    FROM bets b
    WHERE b.concurso = 2970 AND b.status IN ('confirmed', 'pending')
)
UPDATE bets
SET 
    hits = bh.hit_count,
    status = CASE 
        WHEN bh.hit_count = 6 THEN 'won'
        WHEN bh.hit_count >= 5 THEN 'won'
        ELSE 'lost'
    END,
    updated_at = NOW()
FROM bet_hits bh
WHERE bets.id = bh.id;

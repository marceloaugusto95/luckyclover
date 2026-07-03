-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a cron job to sync concursos every hour
-- This ensures we catch new results quickly after draws
SELECT cron.schedule(
    'sync-concursos-hourly',           -- Job name
    '0 * * * *',                        -- Every hour at minute 0
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

-- Also create a cron job specifically for draw days (Wed and Sat) at 21:00 BRT (00:00 UTC next day)
-- Mega-Sena draws typically happen around 20:00 BRT
SELECT cron.schedule(
    'sync-concursos-after-draw',        -- Job name
    '30 23 * * 3,6',                    -- 23:30 UTC on Wed and Sat (20:30 BRT)
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

-- Schedule an additional check 1 hour after draw for reliability
SELECT cron.schedule(
    'sync-concursos-after-draw-2',      -- Job name
    '30 0 * * 4,0',                     -- 00:30 UTC on Thu and Sun (21:30 BRT previous day)
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

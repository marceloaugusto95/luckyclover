-- Insert default support phone setting if it doesn't exist
INSERT INTO system_settings (key, value, updated_at)
VALUES (
    'support_phone',
    '{"number": "5581900000000"}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO NOTHING;

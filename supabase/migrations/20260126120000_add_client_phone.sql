-- Add client_phone to bets table and create index on profiles phone
ALTER TABLE public.bets
ADD COLUMN client_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);

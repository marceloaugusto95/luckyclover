-- Migration: Create Concursos Table
-- Purpose: Store official lottery draw results internally

-- Create concursos table
CREATE TABLE IF NOT EXISTS public.concursos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    concurso_number INTEGER NOT NULL UNIQUE,
    draw_date DATE NOT NULL,
    drawn_numbers INTEGER[] NOT NULL CHECK (array_length(drawn_numbers, 1) = 6),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.concursos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can read concursos (public lottery results)
CREATE POLICY "Anyone can view concursos" ON public.concursos
    FOR SELECT USING (true);

-- Only admins can manage concursos
CREATE POLICY "Admins can manage concursos" ON public.concursos
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Add updated_at trigger
CREATE TRIGGER concursos_updated_at
    BEFORE UPDATE ON public.concursos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_concursos_number ON public.concursos(concurso_number);
CREATE INDEX IF NOT EXISTS idx_concursos_status ON public.concursos(status);

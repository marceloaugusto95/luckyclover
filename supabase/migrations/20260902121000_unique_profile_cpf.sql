-- F-08: profiles.cpf não tinha restrição de unicidade. O CPF é o identificador
-- de login (auth-cpf faz .eq('cpf', ...).single(), que falha com mais de uma
-- linha), então duplicar o CPF de alguém travava o login da vítima.
-- Verificado antes de aplicar: 0 CPFs duplicados entre os 256 perfis.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_key ON public.profiles (cpf);

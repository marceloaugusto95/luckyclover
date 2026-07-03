-- Fase 2 (segurança): religa Row Level Security na tabela bets sem quebrar os apps.
-- APLICAR SOMENTE depois que a auth nova (JWT válido do Supabase) estiver no ar e
-- verificada (auth.uid() funcionando), caso contrário bloqueia todos os acessos.

-- INSERT: cliente insere a própria aposta (user_id = auth.uid());
--         revendedor insere venda vinculada ao seu cadastro (reseller_id),
--         inclusive para cliente avulso (user_id NULL); admin pode tudo.
DROP POLICY IF EXISTS "Users can create own bets" ON public.bets;
CREATE POLICY "Insert own or reseller bets" ON public.bets
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
    OR is_admin()
  );

-- SELECT: a policy "Users can view own bets" já cobre dono (auth.uid()=user_id) + admin.
-- Adicionamos a leitura das vendas pelo revendedor dono delas.
DROP POLICY IF EXISTS "Resellers can view own sales" ON public.bets;
CREATE POLICY "Resellers can view own sales" ON public.bets
  FOR SELECT
  USING (
    reseller_id IN (SELECT id FROM public.resellers WHERE user_id = auth.uid())
  );

-- Religa o RLS (havia sido desligado, expondo 3k+ apostas ao anon).
ALTER TABLE public.bets ENABLE ROW LEVEL SECURITY;

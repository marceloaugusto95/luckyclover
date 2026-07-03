-- Migration to fix reseller deletion error for transactions
ALTER TABLE "public"."transactions"
  DROP CONSTRAINT IF EXISTS "transactions_reseller_id_fkey",
  ADD CONSTRAINT "transactions_reseller_id_fkey" 
  FOREIGN KEY ("reseller_id") 
  REFERENCES "public"."resellers"("id") 
  ON DELETE SET NULL;

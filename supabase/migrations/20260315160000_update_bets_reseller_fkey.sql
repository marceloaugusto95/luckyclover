-- Migration to fix reseller deletion error
ALTER TABLE "public"."bets"
  DROP CONSTRAINT IF EXISTS "bets_reseller_id_fkey",
  ADD CONSTRAINT "bets_reseller_id_fkey" 
  FOREIGN KEY ("reseller_id") 
  REFERENCES "public"."resellers"("id") 
  ON DELETE SET NULL;

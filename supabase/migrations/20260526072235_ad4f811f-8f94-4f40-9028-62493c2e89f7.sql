
-- farmers: drop open policies
DROP POLICY IF EXISTS "public read farmers" ON public.farmers;
DROP POLICY IF EXISTS "public insert farmers" ON public.farmers;
DROP POLICY IF EXISTS "public update farmers" ON public.farmers;

CREATE POLICY "authenticated read farmers"
  ON public.farmers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert farmers"
  ON public.farmers FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- carbon_tokens: keep public read (marketplace), restrict writes
DROP POLICY IF EXISTS "public insert tokens" ON public.carbon_tokens;
DROP POLICY IF EXISTS "public update tokens" ON public.carbon_tokens;
-- keep "public read tokens" so the marketplace can list available credits

-- purchases: drop all open policies
DROP POLICY IF EXISTS "public read purchases" ON public.purchases;
DROP POLICY IF EXISTS "public insert purchases" ON public.purchases;
DROP POLICY IF EXISTS "public update purchases" ON public.purchases;

CREATE POLICY "authenticated read purchases"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert purchases"
  ON public.purchases FOR INSERT
  TO authenticated
  WITH CHECK (true);

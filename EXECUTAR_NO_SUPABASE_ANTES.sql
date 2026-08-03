-- =========================================================
-- SISTEMA GÁS - Vendas parceladas e taxas por maquininha
-- InfinitePay / recebimento em 1 dia útil
-- Executar no Supabase antes de testar o novo front-end.
-- =========================================================

BEGIN;

-- Snapshot financeiro de cada pagamento. A venda preserva a taxa aplicada no
-- dia do lançamento, mesmo quando a operadora mudar a tabela futuramente.
ALTER TABLE public.sale_payments
  ADD COLUMN IF NOT EXISTS installments SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_brand_group TEXT,
  ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS receipt_plan TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS expected_receipt_date DATE,
  ADD COLUMN IF NOT EXISTS rate_source TEXT,
  ADD COLUMN IF NOT EXISTS receipt_days SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_machine_rate_id UUID;

-- Pagamentos anteriores à migração não tinham taxa individual registrada.
UPDATE public.sale_payments
SET net_amount = ROUND(GREATEST(amount - COALESCE(fee_amount, 0), 0), 2)
WHERE net_amount IS NULL;

ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_installments_check,
  DROP CONSTRAINT IF EXISTS sale_payments_fee_percentage_check,
  DROP CONSTRAINT IF EXISTS sale_payments_fee_amount_check,
  DROP CONSTRAINT IF EXISTS sale_payments_net_amount_check,
  DROP CONSTRAINT IF EXISTS sale_payments_receipt_plan_check,
  DROP CONSTRAINT IF EXISTS sale_payments_receipt_days_check,
  DROP CONSTRAINT IF EXISTS sale_payments_card_brand_group_check;

ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_installments_check
    CHECK (installments BETWEEN 1 AND 12),
  ADD CONSTRAINT sale_payments_fee_percentage_check
    CHECK (fee_percentage >= 0 AND fee_percentage < 100),
  ADD CONSTRAINT sale_payments_fee_amount_check
    CHECK (fee_amount >= 0 AND fee_amount <= amount),
  ADD CONSTRAINT sale_payments_net_amount_check
    CHECK (net_amount IS NULL OR (net_amount >= 0 AND net_amount <= amount)),
  ADD CONSTRAINT sale_payments_receipt_plan_check
    CHECK (receipt_plan IN ('standard', '1_business_day', 'instant', 'no_advance')),
  ADD CONSTRAINT sale_payments_receipt_days_check
    CHECK (receipt_days BETWEEN 0 AND 365),
  ADD CONSTRAINT sale_payments_card_brand_group_check
    CHECK (card_brand_group IS NULL OR card_brand_group IN ('visa_mastercard', 'other'));

-- Tabela configurável usada para sugerir a taxa de novos lançamentos.
CREATE TABLE IF NOT EXISTS public.card_machine_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  card_machine_id UUID NOT NULL REFERENCES public.card_machines(id) ON DELETE CASCADE,
  receipt_plan TEXT NOT NULL DEFAULT '1_business_day',
  card_brand_group TEXT NOT NULL,
  installments SMALLINT NOT NULL,
  fee_percentage NUMERIC(7,4) NOT NULL,
  receipt_days SMALLINT NOT NULL DEFAULT 1,
  source TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT card_machine_rates_plan_check
    CHECK (receipt_plan IN ('1_business_day', 'instant', 'no_advance')),
  CONSTRAINT card_machine_rates_brand_group_check
    CHECK (card_brand_group IN ('visa_mastercard', 'other')),
  CONSTRAINT card_machine_rates_installments_check
    CHECK (installments BETWEEN 1 AND 12),
  CONSTRAINT card_machine_rates_percentage_check
    CHECK (fee_percentage >= 0 AND fee_percentage < 100),
  CONSTRAINT card_machine_rates_receipt_days_check
    CHECK (receipt_days BETWEEN 0 AND 365),
  CONSTRAINT card_machine_rates_unique
    UNIQUE (card_machine_id, receipt_plan, card_brand_group, installments)
);

-- Compatibilidade com uma versão anterior da migração, que já podia ter
-- criado card_machine_rates sem a coluna receipt_days. CREATE TABLE IF NOT
-- EXISTS não adiciona colunas em tabelas existentes, por isso o ALTER é
-- necessário e torna esta migração segura para reexecução.
ALTER TABLE public.card_machine_rates
  ADD COLUMN IF NOT EXISTS receipt_days SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE public.card_machine_rates
  DROP CONSTRAINT IF EXISTS card_machine_rates_receipt_days_check;
ALTER TABLE public.card_machine_rates
  ADD CONSTRAINT card_machine_rates_receipt_days_check
  CHECK (receipt_days BETWEEN 0 AND 365);

CREATE INDEX IF NOT EXISTS idx_card_machine_rates_company
  ON public.card_machine_rates(company_id);
CREATE INDEX IF NOT EXISTS idx_card_machine_rates_lookup
  ON public.card_machine_rates(card_machine_id, receipt_plan, card_brand_group, installments)
  WHERE is_active = TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at' AND n.nspname = 'public'
  ) THEN
    DROP TRIGGER IF EXISTS trg_card_machine_rates_updated_at ON public.card_machine_rates;
    CREATE TRIGGER trg_card_machine_rates_updated_at
      BEFORE UPDATE ON public.card_machine_rates
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

ALTER TABLE public.card_machine_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_machine_rates_company_isolation ON public.card_machine_rates;
CREATE POLICY card_machine_rates_company_isolation ON public.card_machine_rates
  FOR ALL
  USING (company_id = public.auth_company_id())
  WITH CHECK (company_id = public.auth_company_id());

-- A referência é adicionada depois da criação da tabela para manter a migração
-- segura quando for executada novamente.
ALTER TABLE public.sale_payments
  DROP CONSTRAINT IF EXISTS sale_payments_card_machine_rate_id_fkey;
ALTER TABLE public.sale_payments
  ADD CONSTRAINT sale_payments_card_machine_rate_id_fkey
  FOREIGN KEY (card_machine_rate_id)
  REFERENCES public.card_machine_rates(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_installments
  ON public.sale_payments(company_id, installments)
  WHERE installments > 1;
CREATE INDEX IF NOT EXISTS idx_sale_payments_expected_receipt
  ON public.sale_payments(company_id, expected_receipt_date)
  WHERE expected_receipt_date IS NOT NULL;

-- InfinitePay: Maquininha/InfiniteTap, Plano Inicial (até R$ 20 mil/mês),
-- recebimento em 1 dia útil, com antecipação incluída.
-- Snapshot consultado na tabela oficial em 03/08/2026.
WITH rate_data(card_brand_group, installments, fee_percentage) AS (
  VALUES
    ('visa_mastercard', 1,  3.15::numeric),
    ('visa_mastercard', 2,  5.39::numeric),
    ('visa_mastercard', 3,  6.12::numeric),
    ('visa_mastercard', 4,  6.85::numeric),
    ('visa_mastercard', 5,  7.57::numeric),
    ('visa_mastercard', 6,  8.28::numeric),
    ('visa_mastercard', 7,  8.99::numeric),
    ('visa_mastercard', 8,  9.69::numeric),
    ('visa_mastercard', 9, 10.38::numeric),
    ('visa_mastercard',10, 11.06::numeric),
    ('visa_mastercard',11, 11.74::numeric),
    ('visa_mastercard',12, 12.40::numeric),
    ('other', 1,  4.91::numeric),
    ('other', 2,  6.47::numeric),
    ('other', 3,  7.20::numeric),
    ('other', 4,  7.92::numeric),
    ('other', 5,  8.63::numeric),
    ('other', 6,  9.33::numeric),
    ('other', 7, 10.03::numeric),
    ('other', 8, 10.72::numeric),
    ('other', 9, 11.41::numeric),
    ('other',10, 12.08::numeric),
    ('other',11, 12.75::numeric),
    ('other',12, 13.41::numeric)
)
INSERT INTO public.card_machine_rates (
  company_id,
  card_machine_id,
  receipt_plan,
  card_brand_group,
  installments,
  fee_percentage,
  receipt_days,
  source,
  effective_from,
  is_active
)
SELECT
  cm.company_id,
  cm.id,
  '1_business_day',
  rd.card_brand_group,
  rd.installments,
  rd.fee_percentage,
  1,
  'InfinitePay — tabela oficial consultada em 03/08/2026',
  DATE '2026-08-03',
  TRUE
FROM public.card_machines cm
CROSS JOIN rate_data rd
WHERE cm.company_id IS NOT NULL
  AND (
    LOWER(CONCAT_WS(' ', cm.name, cm.brand, cm.provider)) LIKE '%infinite%'
    OR LOWER(CONCAT_WS(' ', cm.name, cm.brand, cm.provider)) LIKE '%cloudwalk%'
  )
ON CONFLICT (card_machine_id, receipt_plan, card_brand_group, installments)
DO UPDATE SET
  company_id = EXCLUDED.company_id,
  fee_percentage = EXCLUDED.fee_percentage,
  receipt_days = EXCLUDED.receipt_days,
  source = EXCLUDED.source,
  effective_from = EXCLUDED.effective_from,
  is_active = TRUE,
  updated_at = NOW();

COMMIT;

NOTIFY pgrst, 'reload schema';

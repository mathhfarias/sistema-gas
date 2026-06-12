-- =========================================================
-- SISTEMA GÁS - Pagamento dividido por venda
-- Exemplo: R$ 100,00 no Pix + R$ 25,00 em dinheiro
-- =========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES public.payment_methods(id),
  card_machine_id UUID REFERENCES public.card_machines(id),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sale_payments_amount_check CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_company_id ON public.sale_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_payment_method_id ON public.sale_payments(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_card_machine_id ON public.sale_payments(card_machine_id);

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sale_payments_company_isolation" ON public.sale_payments;
CREATE POLICY "sale_payments_company_isolation" ON public.sale_payments
  FOR ALL
  USING (company_id = auth_company_id())
  WITH CHECK (company_id = auth_company_id());

-- Backfill: vendas antigas passam a ter 1 registro em sale_payments,
-- mantendo compatibilidade com relatórios antigos.
INSERT INTO public.sale_payments (
  company_id,
  sale_id,
  payment_method_id,
  card_machine_id,
  amount,
  created_at
)
SELECT
  s.company_id,
  s.id,
  s.payment_method_id,
  s.card_machine_id,
  GREATEST(COALESCE(s.total, 0), 0.01),
  COALESCE(s.created_at, NOW())
FROM public.sales s
WHERE s.payment_method_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.sale_payments sp
    WHERE sp.sale_id = s.id
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência opcional
SELECT
  s.sale_number,
  s.total AS total_venda,
  SUM(sp.amount) AS total_pagamentos,
  COUNT(sp.id) AS qtd_formas_pagamento
FROM public.sales s
LEFT JOIN public.sale_payments sp ON sp.sale_id = s.id
GROUP BY s.id, s.sale_number, s.total
ORDER BY s.sale_number DESC
LIMIT 20;

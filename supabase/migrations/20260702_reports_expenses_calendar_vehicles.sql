-- Melhorias de relatórios, despesas, calendário e veículos
-- 1) Data real de pagamento para DRE por competência de pagamento
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2);

-- Preenche paid_at apenas para despesas antigas pagas que ainda não possuem data de pagamento.
-- Para correções finas, ajuste manualmente a data no modal de edição da despesa.
UPDATE public.expenses
SET
  paid_at = COALESCE(updated_at, due_date::timestamptz, NOW()),
  paid_amount = COALESCE(paid_amount, amount)
WHERE status = 'paid'
  AND paid_at IS NULL;

-- 2) Taxa fixa/mensal por maquininha para DRE
ALTER TABLE public.card_machines
ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expenses_company_paid_at
ON public.expenses(company_id, paid_at);

CREATE INDEX IF NOT EXISTS idx_expenses_company_due_date
ON public.expenses(company_id, due_date);

CREATE INDEX IF NOT EXISTS idx_purchases_company_purchased_at
ON public.purchases(company_id, purchased_at);

NOTIFY pgrst, 'reload schema';

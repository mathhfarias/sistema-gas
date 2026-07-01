-- =========================================================
-- PARCELAMENTO DE DESPESAS DE VEÍCULOS
-- =========================================================

BEGIN;

ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS installment_group_id UUID,
ADD COLUMN IF NOT EXISTS installment_number INTEGER,
ADD COLUMN IF NOT EXISTS installment_total INTEGER,
ADD COLUMN IF NOT EXISTS installment_total_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS installment_interest_rate NUMERIC(8,4) DEFAULT 0;

ALTER TABLE public.vehicle_expenses
ADD COLUMN IF NOT EXISTS installment_group_id UUID,
ADD COLUMN IF NOT EXISTS installment_number INTEGER,
ADD COLUMN IF NOT EXISTS installment_total INTEGER,
ADD COLUMN IF NOT EXISTS installment_total_amount NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS installment_interest_rate NUMERIC(8,4) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expenses_installment_group
ON public.expenses(company_id, installment_group_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_installment_group
ON public.vehicle_expenses(company_id, installment_group_id);

ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_installment_number_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_installment_number_check
CHECK (installment_number IS NULL OR installment_number >= 1);

ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_installment_total_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_installment_total_check
CHECK (installment_total IS NULL OR installment_total >= 1);

ALTER TABLE public.vehicle_expenses
DROP CONSTRAINT IF EXISTS vehicle_expenses_installment_number_check;

ALTER TABLE public.vehicle_expenses
ADD CONSTRAINT vehicle_expenses_installment_number_check
CHECK (installment_number IS NULL OR installment_number >= 1);

ALTER TABLE public.vehicle_expenses
DROP CONSTRAINT IF EXISTS vehicle_expenses_installment_total_check;

ALTER TABLE public.vehicle_expenses
ADD CONSTRAINT vehicle_expenses_installment_total_check
CHECK (installment_total IS NULL OR installment_total >= 1);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Permite excluir chegada de gás sem apagar o histórico físico do banco.
-- A tela passa a ocultar compras marcadas como excluídas.

ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS deleted_by UUID;

UPDATE public.purchases
SET is_deleted = FALSE
WHERE is_deleted IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_company_not_deleted
ON public.purchases(company_id, purchased_at DESC)
WHERE is_deleted = FALSE;

NOTIFY pgrst, 'reload schema';

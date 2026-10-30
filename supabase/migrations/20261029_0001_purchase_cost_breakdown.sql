-- ============================================================
-- GasMaster — Feature 2
-- Chegada de Gás: custo total + frete + descontos/créditos
-- V2.3 — 29/10/2026
-- ============================================================

BEGIN;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS discount_credit NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS freight_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_allocated NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_discount_credit_nonnegative'
      AND conrelid = 'public.purchases'::regclass
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_discount_credit_nonnegative
      CHECK (discount_credit >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.purchases.discount_credit IS
  'Descontos/créditos aplicados à chegada.';

COMMENT ON COLUMN public.purchase_items.total_cost IS
  'Valor bruto dos produtos deste item, sem frete e sem descontos/créditos.';

COMMENT ON COLUMN public.purchase_items.unit_cost IS
  'Custo bruto do produto por unidade, antes de frete e descontos/créditos.';

COMMENT ON COLUMN public.purchase_items.freight_allocated IS
  'Parcela do frete rateada proporcionalmente ao valor bruto do item.';

COMMENT ON COLUMN public.purchase_items.discount_allocated IS
  'Parcela dos descontos/créditos rateada proporcionalmente ao valor bruto do item.';

COMMENT ON COLUMN public.purchase_items.final_total_cost IS
  'Custo líquido final do item: produtos + frete rateado - desconto/crédito rateado.';

COMMENT ON COLUMN public.purchase_items.final_unit_cost IS
  'Custo líquido final por unidade após rateio de frete e descontos/créditos.';

WITH item_base AS (
  SELECT
    pi.id,
    pi.purchase_id,
    COALESCE(pi.total_cost, 0)::NUMERIC AS total_cost,
    COALESCE(pi.quantity, 0)::NUMERIC AS quantity,
    COALESCE(p.freight_cost, 0)::NUMERIC AS freight_cost,
    SUM(COALESCE(pi.total_cost, 0)) OVER (PARTITION BY pi.purchase_id)::NUMERIC AS purchase_products_total
  FROM public.purchase_items pi
  JOIN public.purchases p ON p.id = pi.purchase_id
),
allocated AS (
  SELECT
    id,
    total_cost,
    quantity,
    CASE
      WHEN purchase_products_total > 0
      THEN ROUND(freight_cost * total_cost / purchase_products_total, 2)
      ELSE 0
    END AS freight_share
  FROM item_base
)
UPDATE public.purchase_items pi
SET
  freight_allocated = a.freight_share,
  discount_allocated = 0,
  final_total_cost = ROUND(a.total_cost + a.freight_share, 2),
  final_unit_cost = CASE
    WHEN a.quantity > 0
    THEN ROUND((a.total_cost + a.freight_share) / a.quantity, 4)
    ELSE 0
  END
FROM allocated a
WHERE pi.id = a.id
  AND COALESCE(pi.final_total_cost, 0) = 0
  AND COALESCE(pi.final_unit_cost, 0) = 0;

COMMIT;

SELECT
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'purchases' AND column_name = 'discount_credit')
    OR
    (table_name = 'purchase_items' AND column_name IN (
      'freight_allocated',
      'discount_allocated',
      'final_total_cost',
      'final_unit_cost'
    ))
  )
ORDER BY table_name, ordinal_position;

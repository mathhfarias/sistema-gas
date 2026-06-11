-- =========================================================
-- RELATÓRIO POR TIPO DE VENDA DE BOTIJÃO
-- Cria/garante campos para venda de casco vazio e cheio sem retorno
-- e salva o histórico inicial de 69 cheios sem retorno.
-- =========================================================

BEGIN;

-- Garante que a tabela de configurações tenha JSON extra.
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;

-- Garante os campos usados para os preços específicos em Produtos.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS empty_cylinder_sale_price NUMERIC(10,2) NOT NULL DEFAULT 200.00,
ADD COLUMN IF NOT EXISTS full_no_return_sale_price NUMERIC(10,2) NOT NULL DEFAULT 300.00;

UPDATE public.products
SET
  empty_cylinder_sale_price = COALESCE(empty_cylinder_sale_price, 200.00),
  full_no_return_sale_price = COALESCE(full_no_return_sale_price, 300.00);

-- P45 não deve ser vendido no Gás do Povo.
UPDATE public.products
SET gas_povo_sale_price = 0.00
WHERE UPPER(COALESCE(code, '')) = 'P45'
   OR UPPER(COALESCE(name, '')) LIKE '%P45%';

-- Garante o tipo de venda no item.
ALTER TABLE public.sale_items
ADD COLUMN IF NOT EXISTS sale_kind TEXT NOT NULL DEFAULT 'exchange';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_items_sale_kind_check'
  ) THEN
    ALTER TABLE public.sale_items
    ADD CONSTRAINT sale_items_sale_kind_check
    CHECK (sale_kind IN ('exchange','empty_cylinder','full_no_return'));
  END IF;
END $$;

UPDATE public.sale_items
SET sale_kind = 'exchange'
WHERE sale_kind IS NULL;

-- Salva o histórico informado pela operação: 69 botijões cheios vendidos sem retorno
-- antes do controle por tipo de venda ficar visível em Relatórios.
INSERT INTO public.settings (company_id, gas_povo_delivery_fee, low_stock_alert_qty, extra)
SELECT
  c.id,
  20.00,
  5,
  '{"full_no_return_initial_qty": 69}'::jsonb
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s WHERE s.company_id = c.id
);

UPDATE public.settings
SET extra = jsonb_set(
  COALESCE(extra, '{}'::jsonb),
  '{full_no_return_initial_qty}',
  '69'::jsonb,
  true
)
WHERE company_id IN (SELECT id FROM public.companies);

COMMIT;

NOTIFY pgrst, 'reload schema';

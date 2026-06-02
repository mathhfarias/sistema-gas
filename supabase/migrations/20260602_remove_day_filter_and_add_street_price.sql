-- =========================================================
-- SISTEMA GÁS - Filtro mensal em despesas + Preço Entrega/Rua
-- - Remove necessidade de filtro por dia no front-end
-- - Adiciona preço específico para vendas no canal Rua/entrega
-- =========================================================

BEGIN;

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS street_sale_price NUMERIC(10,2) NOT NULL DEFAULT 125.00;

UPDATE public.products
SET street_sale_price = 125.00
WHERE street_sale_price IS NULL
   OR street_sale_price = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_street_sale_price_check'
  ) THEN
    ALTER TABLE public.products
    ADD CONSTRAINT products_street_sale_price_check
    CHECK (street_sale_price >= 0);
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  name AS produto,
  code AS codigo,
  sale_price AS preco_padrao,
  street_sale_price AS preco_entrega_rua,
  gas_povo_sale_price AS preco_gas_do_povo
FROM public.products
ORDER BY name;

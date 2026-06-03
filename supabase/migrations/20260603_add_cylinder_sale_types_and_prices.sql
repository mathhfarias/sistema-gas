-- =========================================================
-- SISTEMA GÁS - Venda de botijão vazio/casco e cheio sem retorno
-- Data: 2026-06-03
-- =========================================================

BEGIN;

-- 1. Novos preços por produto
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS empty_cylinder_sale_price NUMERIC(10,2) NOT NULL DEFAULT 200.00,
ADD COLUMN IF NOT EXISTS full_no_return_sale_price NUMERIC(10,2) NOT NULL DEFAULT 300.00;

-- Valores padrão para produtos já existentes
UPDATE public.products
SET
  empty_cylinder_sale_price = COALESCE(empty_cylinder_sale_price, 200.00),
  full_no_return_sale_price = COALESCE(full_no_return_sale_price, 300.00);

-- P45 não participa do Gás do Povo
UPDATE public.products
SET gas_povo_sale_price = 0.00
WHERE UPPER(COALESCE(code, '')) = 'P45'
   OR UPPER(COALESCE(name, '')) LIKE '%P45%';

-- 2. Tipo do item da venda
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

-- Garante que itens antigos continuem como venda com troca
UPDATE public.sale_items
SET sale_kind = 'exchange'
WHERE sale_kind IS NULL;

-- 3. Recarrega schema do Supabase/PostgREST
COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT
  code,
  name,
  sale_price,
  street_sale_price,
  gas_povo_sale_price,
  empty_cylinder_sale_price,
  full_no_return_sale_price
FROM public.products
WHERE UPPER(COALESCE(code, '')) IN ('P13', 'P45')
   OR UPPER(COALESCE(name, '')) LIKE '%P13%'
   OR UPPER(COALESCE(name, '')) LIKE '%P45%'
ORDER BY code, name;

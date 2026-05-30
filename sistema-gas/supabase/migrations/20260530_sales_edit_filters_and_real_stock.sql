-- =========================================================
-- SISTEMA GÁS - Ajuste de vendas, canal, Gás do Povo e estoque real
-- Data-base operacional: 29/05/2026
-- P13 real: 89 cheios, 151 vazios, 7 em troca
-- P45 real: 0 cheios, 4 vazios, 0 em troca
-- =========================================================

BEGIN;

-- 1. Campo de canal na venda: Rua/Portaria/Entrega/Outro
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'street';

ALTER TABLE public.sales
DROP CONSTRAINT IF EXISTS sales_channel_check;

ALTER TABLE public.sales
ADD CONSTRAINT sales_channel_check
CHECK (channel IN ('street','counter','delivery','other'));

UPDATE public.sales
SET channel = 'street'
WHERE channel IS NULL;

-- 2. Preço específico do Gás do Povo por produto
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS gas_povo_sale_price NUMERIC(10,2) NOT NULL DEFAULT 100.23;

UPDATE public.products
SET gas_povo_sale_price = 100.23
WHERE gas_povo_sale_price IS NULL
   OR UPPER(COALESCE(code, '')) = 'P13'
   OR UPPER(COALESCE(name, '')) LIKE '%P13%';

-- 3. Controle de estoque em troca
ALTER TABLE public.stock_balances
ADD COLUMN IF NOT EXISTS exchange_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS exchange_qty_change INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_movements
DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE public.stock_movements
ADD CONSTRAINT stock_movements_type_check
CHECK (type IN (
  'sale',
  'purchase',
  'return_empty',
  'return_full',
  'adjustment',
  'purchase_return',
  'loss',
  'exchange_out',
  'exchange_in'
));

-- 4. Gatilho de estoque sem esconder saldo negativo.
-- Antes o saldo era travado em zero com GREATEST(0, ...), o que escondia erro operacional.
-- Agora a movimentação é bloqueada se deixar cheios/vazios/troca negativos.
CREATE OR REPLACE FUNCTION public.update_stock_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_full INTEGER;
  v_empty INTEGER;
  v_exchange INTEGER;
BEGIN
  INSERT INTO public.stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty)
  VALUES (NEW.company_id, NEW.product_id, 0, 0, 0)
  ON CONFLICT (company_id, product_id) DO NOTHING;

  SELECT full_qty, empty_qty, exchange_qty
  INTO v_full, v_empty, v_exchange
  FROM public.stock_balances
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id
  FOR UPDATE;

  v_full := COALESCE(v_full, 0) + COALESCE(NEW.full_qty_change, 0);
  v_empty := COALESCE(v_empty, 0) + COALESCE(NEW.empty_qty_change, 0);
  v_exchange := COALESCE(v_exchange, 0) + COALESCE(NEW.exchange_qty_change, 0);

  IF v_full < 0 THEN
    RAISE EXCEPTION 'Estoque de cheios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_empty < 0 THEN
    RAISE EXCEPTION 'Estoque de vazios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_exchange < 0 THEN
    RAISE EXCEPTION 'Estoque em troca insuficiente para o produto %', NEW.product_id;
  END IF;

  UPDATE public.stock_balances
  SET full_qty = v_full,
      empty_qty = v_empty,
      exchange_qty = v_exchange,
      updated_at = NOW()
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Atualizar estoque real informado pela operação.
DO $$
DECLARE
  v_company_id UUID;
  v_p13_id UUID;
  v_p45_id UUID;
BEGIN
  SELECT id
  INTO v_company_id
  FROM public.companies
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada na tabela companies.';
  END IF;

  SELECT id
  INTO v_p13_id
  FROM public.products
  WHERE company_id = v_company_id
    AND (
      UPPER(COALESCE(code, '')) = 'P13'
      OR UPPER(COALESCE(name, '')) LIKE '%P13%'
    )
  LIMIT 1;

  IF v_p13_id IS NULL THEN
    RAISE EXCEPTION 'Produto P13 não encontrado na tabela products.';
  END IF;

  SELECT id
  INTO v_p45_id
  FROM public.products
  WHERE company_id = v_company_id
    AND (
      UPPER(COALESCE(code, '')) = 'P45'
      OR UPPER(COALESCE(name, '')) LIKE '%P45%'
    )
  LIMIT 1;

  IF v_p45_id IS NULL THEN
    RAISE EXCEPTION 'Produto P45 não encontrado na tabela products.';
  END IF;

  INSERT INTO public.stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, updated_at)
  VALUES (v_company_id, v_p13_id, 89, 151, 7, NOW())
  ON CONFLICT (company_id, product_id) DO UPDATE
    SET full_qty = EXCLUDED.full_qty,
        empty_qty = EXCLUDED.empty_qty,
        exchange_qty = EXCLUDED.exchange_qty,
        updated_at = NOW();

  INSERT INTO public.stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, updated_at)
  VALUES (v_company_id, v_p45_id, 0, 4, 0, NOW())
  ON CONFLICT (company_id, product_id) DO UPDATE
    SET full_qty = EXCLUDED.full_qty,
        empty_qty = EXCLUDED.empty_qty,
        exchange_qty = EXCLUDED.exchange_qty,
        updated_at = NOW();
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência final
SELECT
  p.name AS produto,
  p.code AS codigo,
  sb.full_qty AS cheios,
  sb.empty_qty AS vazios,
  sb.exchange_qty AS em_troca,
  sb.updated_at
FROM public.stock_balances sb
JOIN public.products p ON p.id = sb.product_id
WHERE UPPER(COALESCE(p.code, '')) IN ('P13', 'P45')
   OR UPPER(COALESCE(p.name, '')) LIKE '%P13%'
   OR UPPER(COALESCE(p.name, '')) LIKE '%P45%'
ORDER BY p.name;

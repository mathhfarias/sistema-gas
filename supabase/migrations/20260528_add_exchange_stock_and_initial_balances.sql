-- =========================================================
-- SISTEMA GÁS - Controle de troca/em troca + estoque inicial
-- P13: 118 cheios, 122 vazios, 7 em troca
-- P45: 0 cheios, 4 vazios, 0 em troca
-- =========================================================

BEGIN;

-- 1. Adicionar saldo "em troca" no saldo atual
ALTER TABLE stock_balances
ADD COLUMN IF NOT EXISTS exchange_qty INTEGER NOT NULL DEFAULT 0;

-- 2. Adicionar movimentação de troca no histórico
ALTER TABLE stock_movements
ADD COLUMN IF NOT EXISTS exchange_qty_change INTEGER NOT NULL DEFAULT 0;

-- 3. Atualizar tipos permitidos de movimentação
ALTER TABLE stock_movements
DROP CONSTRAINT IF EXISTS stock_movements_type_check;

ALTER TABLE stock_movements
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

-- 4. Garantir que saldos não fiquem negativos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_full_qty_check'
  ) THEN
    ALTER TABLE stock_balances
    ADD CONSTRAINT stock_balances_full_qty_check CHECK (full_qty >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_empty_qty_check'
  ) THEN
    ALTER TABLE stock_balances
    ADD CONSTRAINT stock_balances_empty_qty_check CHECK (empty_qty >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_exchange_qty_check'
  ) THEN
    ALTER TABLE stock_balances
    ADD CONSTRAINT stock_balances_exchange_qty_check CHECK (exchange_qty >= 0);
  END IF;
END $$;

-- 5. Atualizar função do gatilho de estoque para considerar troca
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty)
  VALUES (
    NEW.company_id,
    NEW.product_id,
    GREATEST(0, COALESCE(NEW.full_qty_change, 0)),
    GREATEST(0, COALESCE(NEW.empty_qty_change, 0)),
    GREATEST(0, COALESCE(NEW.exchange_qty_change, 0))
  )
  ON CONFLICT (company_id, product_id) DO UPDATE
    SET full_qty = GREATEST(0, stock_balances.full_qty + COALESCE(NEW.full_qty_change, 0)),
        empty_qty = GREATEST(0, stock_balances.empty_qty + COALESCE(NEW.empty_qty_change, 0)),
        exchange_qty = GREATEST(0, stock_balances.exchange_qty + COALESCE(NEW.exchange_qty_change, 0)),
        updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Inserir/atualizar estoque inicial real
DO $$
DECLARE
  v_company_id UUID;
  v_p13_id UUID;
  v_p45_id UUID;
BEGIN
  SELECT id
  INTO v_company_id
  FROM companies
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada na tabela companies.';
  END IF;

  SELECT id
  INTO v_p13_id
  FROM products
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
  FROM products
  WHERE company_id = v_company_id
    AND (
      UPPER(COALESCE(code, '')) = 'P45'
      OR UPPER(COALESCE(name, '')) LIKE '%P45%'
    )
  LIMIT 1;

  IF v_p45_id IS NULL THEN
    RAISE EXCEPTION 'Produto P45 não encontrado na tabela products.';
  END IF;

  INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, updated_at)
  VALUES (v_company_id, v_p13_id, 118, 122, 7, NOW())
  ON CONFLICT (company_id, product_id) DO UPDATE
    SET full_qty = EXCLUDED.full_qty,
        empty_qty = EXCLUDED.empty_qty,
        exchange_qty = EXCLUDED.exchange_qty,
        updated_at = NOW();

  INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, updated_at)
  VALUES (v_company_id, v_p45_id, 0, 4, 0, NOW())
  ON CONFLICT (company_id, product_id) DO UPDATE
    SET full_qty = EXCLUDED.full_qty,
        empty_qty = EXCLUDED.empty_qty,
        exchange_qty = EXCLUDED.exchange_qty,
        updated_at = NOW();
END $$;

COMMIT;

-- Conferência final
SELECT
  p.name AS produto,
  p.code AS codigo,
  sb.full_qty AS cheios,
  sb.empty_qty AS vazios,
  sb.exchange_qty AS em_troca,
  sb.updated_at
FROM stock_balances sb
JOIN products p ON p.id = sb.product_id
WHERE UPPER(COALESCE(p.code, '')) IN ('P13', 'P45')
   OR UPPER(COALESCE(p.name, '')) LIKE '%P13%'
   OR UPPER(COALESCE(p.name, '')) LIKE '%P45%'
ORDER BY p.name;

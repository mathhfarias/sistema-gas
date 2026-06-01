-- =========================================================
-- VALE HUB / ULTRAGAZ + FILTRO MENSAL DE DESPESAS
-- - Vale Hub não usa maquininha
-- - Vazio retornado em venda Vale Hub fica separado em HUB a retornar
-- - Dashboard passa a ler o saldo HUB a retornar
-- =========================================================

BEGIN;

-- 1) Vale Hub / Ultragaz não deve exigir maquininha
UPDATE public.payment_methods
SET requires_machine = FALSE,
    updated_at = NOW()
WHERE type = 'vale_hub';

-- 2) Adiciona saldo de HUB a retornar no estoque
ALTER TABLE public.stock_balances
ADD COLUMN IF NOT EXISTS hub_pending_qty INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_balances_hub_pending_qty_check'
  ) THEN
    ALTER TABLE public.stock_balances
    ADD CONSTRAINT stock_balances_hub_pending_qty_check
    CHECK (hub_pending_qty >= 0);
  END IF;
END $$;

-- 3) Adiciona movimentação de HUB a retornar no histórico de estoque
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS hub_pending_qty_change INTEGER NOT NULL DEFAULT 0;

-- 4) Atualiza função de saldo para considerar HUB a retornar
CREATE OR REPLACE FUNCTION public.update_stock_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_full INTEGER;
  v_empty INTEGER;
  v_exchange INTEGER;
  v_hub_pending INTEGER;
BEGIN
  INSERT INTO public.stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, hub_pending_qty)
  VALUES (NEW.company_id, NEW.product_id, 0, 0, 0, 0)
  ON CONFLICT (company_id, product_id) DO NOTHING;

  SELECT full_qty, empty_qty, exchange_qty, hub_pending_qty
  INTO v_full, v_empty, v_exchange, v_hub_pending
  FROM public.stock_balances
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id
  FOR UPDATE;

  v_full := COALESCE(v_full, 0) + COALESCE(NEW.full_qty_change, 0);
  v_empty := COALESCE(v_empty, 0) + COALESCE(NEW.empty_qty_change, 0);
  v_exchange := COALESCE(v_exchange, 0) + COALESCE(NEW.exchange_qty_change, 0);
  v_hub_pending := COALESCE(v_hub_pending, 0) + COALESCE(NEW.hub_pending_qty_change, 0);

  IF v_full < 0 THEN
    RAISE EXCEPTION 'Estoque de cheios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_empty < 0 THEN
    RAISE EXCEPTION 'Estoque de vazios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_exchange < 0 THEN
    RAISE EXCEPTION 'Estoque em troca insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_hub_pending < 0 THEN
    RAISE EXCEPTION 'HUB a retornar insuficiente para o produto %', NEW.product_id;
  END IF;

  UPDATE public.stock_balances
  SET full_qty = v_full,
      empty_qty = v_empty,
      exchange_qty = v_exchange,
      hub_pending_qty = v_hub_pending,
      updated_at = NOW()
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência rápida
SELECT
  p.name AS produto,
  p.code AS codigo,
  sb.full_qty AS cheios,
  sb.empty_qty AS vazios,
  sb.exchange_qty AS em_troca,
  sb.hub_pending_qty AS hub_a_retornar
FROM public.stock_balances sb
JOIN public.products p ON p.id = sb.product_id
ORDER BY p.name;

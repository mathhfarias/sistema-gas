-- =========================================================
-- SISTEMA GÁS - Baixa de HUB + correção de vendas Vale Hub
-- - Cria/garante tipo hub_return no histórico de estoque
-- - Vale Hub / Ultragaz não usa maquininha
-- - Corrige saldo operacional: 5 P13 em HUB a retornar
-- - A correção move o saldo de vazios livres para HUB a retornar
-- =========================================================

BEGIN;

-- 1) Garantir colunas de HUB no estoque e nas movimentações
ALTER TABLE public.stock_balances
ADD COLUMN IF NOT EXISTS hub_pending_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS hub_pending_qty_change INTEGER NOT NULL DEFAULT 0;

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

-- 2) Permitir tipo de movimentação hub_return
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
  'exchange_in',
  'hub_return'
));

-- 3) Função de saldo com cheios, vazios, troca e HUB
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

-- 4) Vale Hub / Ultragaz não exige maquininha e vendas antigas ficam sem máquina
UPDATE public.payment_methods
SET requires_machine = FALSE,
    updated_at = NOW()
WHERE type = 'vale_hub';

UPDATE public.sales s
SET card_machine_id = NULL,
    updated_at = NOW()
FROM public.payment_methods pm
WHERE s.payment_method_id = pm.id
  AND pm.type = 'vale_hub'
  AND s.card_machine_id IS NOT NULL;

-- 5) Correção operacional: hoje existem 5 P13 para retornar via portal HUB.
--    Se estavam como vazios livres, esta movimentação transfere para HUB.
DO $$
DECLARE
  v_company_id UUID;
  v_p13_id UUID;
  v_current_hub INTEGER := 0;
  v_target_hub INTEGER := 5;
  v_delta INTEGER := 0;
BEGIN
  SELECT id
  INTO v_company_id
  FROM public.companies
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma empresa encontrada.';
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
    RAISE EXCEPTION 'Produto P13 não encontrado.';
  END IF;

  INSERT INTO public.stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty, hub_pending_qty)
  VALUES (v_company_id, v_p13_id, 0, 0, 0, 0)
  ON CONFLICT (company_id, product_id) DO NOTHING;

  SELECT COALESCE(hub_pending_qty, 0)
  INTO v_current_hub
  FROM public.stock_balances
  WHERE company_id = v_company_id
    AND product_id = v_p13_id;

  v_delta := v_target_hub - v_current_hub;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_movements (
      id,
      company_id,
      product_id,
      type,
      full_qty_change,
      empty_qty_change,
      exchange_qty_change,
      hub_pending_qty_change,
      reference_type,
      reason,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      v_company_id,
      v_p13_id,
      'adjustment',
      0,
      -v_delta,
      0,
      v_delta,
      'hub_balance_correction',
      'Correção operacional: 5 botijões Vale Hub / Ultragaz a retornar no portal',
      NOW()
    );
  END IF;
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
  sb.hub_pending_qty AS hub_a_retornar
FROM public.stock_balances sb
JOIN public.products p ON p.id = sb.product_id
WHERE UPPER(COALESCE(p.code, '')) = 'P13'
   OR UPPER(COALESCE(p.name, '')) LIKE '%P13%'
ORDER BY p.name;

-- =========================================================
-- EDITAR CHEGADA DE GÁS + REGRA DE VAZIOS + ESTOQUE REAL
-- Data: 04/06/2026
-- =========================================================

BEGIN;

-- 1. Garante colunas necessárias
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.stock_balances
ADD COLUMN IF NOT EXISTS exchange_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_balances
ADD COLUMN IF NOT EXISTS hub_pending_qty INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS exchange_qty_change INTEGER DEFAULT 0;

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS hub_pending_qty_change INTEGER DEFAULT 0;

-- 2. Atualiza a proteção do banco para a regra operacional:
--    Toda chegada de gás aumenta cheios e baixa vazios pela mesma quantidade recebida.
CREATE OR REPLACE FUNCTION public.normalize_exchange_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  -- Toda chegada de gás baixa vazios pela mesma quantidade recebida.
  IF NEW.type = 'purchase' AND COALESCE(NEW.full_qty_change, 0) > 0 THEN
    NEW.empty_qty_change := -COALESCE(NEW.full_qty_change, 0);
  END IF;

  -- Toda entrada em troca deve sair dos cheios.
  IF COALESCE(NEW.exchange_qty_change, 0) > 0 THEN
    IF NEW.type = 'exchange_out' THEN
      IF COALESCE(NEW.full_qty_change, 0) = 0 THEN
        NEW.full_qty_change := -COALESCE(NEW.exchange_qty_change, 0);
      END IF;

      IF COALESCE(NEW.empty_qty_change, 0) < 0 THEN
        NEW.empty_qty_change := 0;
      END IF;
    ELSIF NEW.type = 'adjustment' THEN
      IF COALESCE(NEW.full_qty_change, 0) = 0 THEN
        NEW.full_qty_change := -COALESCE(NEW.exchange_qty_change, 0);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_exchange_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_normalize_exchange_stock_movement
BEFORE INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.normalize_exchange_stock_movement();

-- 3. Atualiza estoque real informado:
--    P13 = 53 cheios, 193 vazios, 0 em troca.
--    O HUB é mantido como está, pois é um controle paralelo.
DO $$
DECLARE
  v_company_id UUID;
  v_p13_id UUID;
  v_full_atual INTEGER;
  v_empty_atual INTEGER;
  v_exchange_atual INTEGER;
  v_full_target INTEGER := 53;
  v_empty_target INTEGER := 193;
  v_exchange_target INTEGER := 0;
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

  SELECT full_qty, empty_qty, exchange_qty
  INTO v_full_atual, v_empty_atual, v_exchange_atual
  FROM public.stock_balances
  WHERE company_id = v_company_id
    AND product_id = v_p13_id;

  IF COALESCE(v_full_atual, 0) <> v_full_target
     OR COALESCE(v_empty_atual, 0) <> v_empty_target
     OR COALESCE(v_exchange_atual, 0) <> v_exchange_target THEN
    INSERT INTO public.stock_movements (
      id,
      company_id,
      product_id,
      type,
      reason,
      full_qty_change,
      empty_qty_change,
      exchange_qty_change,
      hub_pending_qty_change,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_company_id,
      v_p13_id,
      'adjustment',
      'Correção de estoque: P13 com 53 cheios, 193 vazios e 0 em troca. Observação operacional: já foram vendidos 69 botijões completos sem retorno de vazio.',
      v_full_target - COALESCE(v_full_atual, 0),
      v_empty_target - COALESCE(v_empty_atual, 0),
      v_exchange_target - COALESCE(v_exchange_atual, 0),
      0,
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
  sb.exchange_qty AS troca,
  COALESCE(sb.hub_pending_qty, 0) AS hub_a_retornar,
  sb.updated_at
FROM public.stock_balances sb
JOIN public.products p ON p.id = sb.product_id
WHERE UPPER(COALESCE(p.code, '')) = 'P13'
   OR UPPER(COALESCE(p.name, '')) LIKE '%P13%';

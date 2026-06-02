-- =========================================================
-- SISTEMA GÁS - HUB sem descontar vazios + seção Calendário
-- Regras:
-- 1) Vale Hub / Ultragaz mantém o vazio no estoque de vazios.
-- 2) O card HUB a Retornar é um controle paralelo.
-- 3) Baixar HUB diminui apenas hub_pending_qty, sem mexer em empty_qty.
-- 4) Cria agenda/calendário operacional.
-- =========================================================

BEGIN;

-- 1) Garantir colunas de HUB
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

-- 2) Garantir tipo hub_return
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

-- 3) Função de saldo com HUB separado
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

-- 4) Vale Hub / Ultragaz não usa maquininha
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

-- 5) Reverter APENAS o desconto de vazios feito pela migration anterior, se ela foi rodada.
--    Mantém o HUB a retornar, mas repõe os vazios livres.
DO $$
DECLARE
  r RECORD;
  v_reversal_empty INTEGER;
BEGIN
  FOR r IN
    SELECT company_id, product_id, COALESCE(SUM(empty_qty_change), 0) AS empty_delta
    FROM public.stock_movements
    WHERE reference_type = 'hub_balance_correction'
    GROUP BY company_id, product_id
  LOOP
    v_reversal_empty := -r.empty_delta;

    IF v_reversal_empty <> 0 AND NOT EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.company_id = r.company_id
        AND sm.product_id = r.product_id
        AND sm.reference_type = 'hub_empty_reversal'
    ) THEN
      INSERT INTO public.stock_movements (
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
        r.company_id,
        r.product_id,
        'adjustment',
        0,
        v_reversal_empty,
        0,
        0,
        'hub_empty_reversal',
        'Correção: HUB é controle paralelo e não deve descontar vazios',
        NOW()
      );
    END IF;
  END LOOP;
END $$;

-- 6) Correção operacional atual: P13 com 5 unidades em HUB a retornar, sem mexer nos vazios.
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
      v_company_id,
      v_p13_id,
      'adjustment',
      0,
      0,
      0,
      v_delta,
      'hub_balance_set_parallel',
      'Correção operacional: HUB a retornar é controle paralelo aos vazios',
      NOW()
    );
  END IF;
END $$;

-- 7) Tabela de calendário/agenda manual
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  title TEXT NOT NULL,
  type TEXT DEFAULT 'general' CHECK (type IN ('general','bill','hub','purchase','vehicle','reminder')),
  event_date DATE NOT NULL,
  amount NUMERIC(10,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount IS NULL OR amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_company_date
ON public.calendar_events(company_id, event_date);

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
BEFORE UPDATE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_company_isolation" ON public.calendar_events;
CREATE POLICY "calendar_events_company_isolation" ON public.calendar_events
FOR ALL USING (company_id = public.auth_company_id())
WITH CHECK (company_id = public.auth_company_id());

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

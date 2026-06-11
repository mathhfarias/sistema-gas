-- =========================================================
-- SISTEMA GÁS - Troca baixa cheios + frete na chegada de gás
-- Data: 04/06/2026
-- =========================================================

BEGIN;

-- 1. Campo de frete na chegada de gás / compras
ALTER TABLE public.purchases
ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(10,2) NOT NULL DEFAULT 0;

UPDATE public.purchases
SET freight_cost = 0
WHERE freight_cost IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_freight_cost_check'
  ) THEN
    ALTER TABLE public.purchases
    ADD CONSTRAINT purchases_freight_cost_check
    CHECK (freight_cost >= 0);
  END IF;
END $$;

-- 2. Regra operacional: quando entrar em troca, sai dos cheios.
-- Protege tanto o botão Enviar Troca quanto ajustes manuais em que o usuário informe apenas +troca.
CREATE OR REPLACE FUNCTION public.normalize_exchange_stock_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.exchange_qty_change, 0) > 0 THEN
    IF NEW.type = 'exchange_out' THEN
      -- Enviar troca agora representa botijão cheio separado para troca.
      -- Se o front antigo mandar vazio negativo, zeramos vazio e baixamos cheio.
      IF COALESCE(NEW.full_qty_change, 0) = 0 THEN
        NEW.full_qty_change := -COALESCE(NEW.exchange_qty_change, 0);
      END IF;

      IF COALESCE(NEW.empty_qty_change, 0) < 0 THEN
        NEW.empty_qty_change := 0;
      END IF;
    ELSIF NEW.type = 'adjustment' THEN
      -- Ajuste manual com +troca e cheio zerado: baixa cheio automaticamente.
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

COMMIT;

NOTIFY pgrst, 'reload schema';

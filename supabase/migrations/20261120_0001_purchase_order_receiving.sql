-- ============================================================
-- GasMaster — Compras de Gás: pedido + previsão + recebimento
-- 20/11/2026
-- ============================================================

BEGIN;

-- 1) Compra/pedido: previsão e status de entrega.
-- Durante a migração o default inicial é "received" para preservar
-- semanticamente todas as chegadas históricas já lançadas no estoque.
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

-- 2) Quantidade efetivamente recebida por item.
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER NOT NULL DEFAULT 0;

-- Backfill seguro das compras históricas.
UPDATE public.purchase_items pi
SET received_quantity = pi.quantity,
    empty_returned = pi.quantity
WHERE pi.received_quantity = 0
  AND pi.purchase_id IN (
    SELECT p.id
    FROM public.purchases p
    WHERE COALESCE(p.delivery_status, 'received') = 'received'
  );

UPDATE public.purchases
SET received_at = COALESCE(received_at, purchased_at)
WHERE delivery_status = 'received'
  AND received_at IS NULL;

-- Daqui em diante, novas compras nascem aguardando entrega.
ALTER TABLE public.purchases
  ALTER COLUMN delivery_status SET DEFAULT 'ordered';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_delivery_status_check'
      AND conrelid = 'public.purchases'::regclass
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_delivery_status_check
      CHECK (delivery_status IN ('ordered', 'partial', 'received'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_items_received_quantity_check'
      AND conrelid = 'public.purchase_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_items
      ADD CONSTRAINT purchase_items_received_quantity_check
      CHECK (
        received_quantity >= 0
        AND received_quantity <= quantity
      );
  END IF;
END
$$;

-- 3) Histórico de cada recebimento físico.
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  received_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  receipt_id UUID NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_item_id UUID NOT NULL REFERENCES public.purchase_items(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchases_delivery_status
  ON public.purchases(company_id, delivery_status);

CREATE INDEX IF NOT EXISTS idx_purchases_expected_delivery
  ON public.purchases(company_id, expected_delivery_date);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_purchase
  ON public.purchase_receipts(purchase_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt
  ON public.purchase_receipt_items(receipt_id);

-- 4) RLS do histórico de recebimentos.
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_receipts_company_isolation"
  ON public.purchase_receipts;

CREATE POLICY "purchase_receipts_company_isolation"
ON public.purchase_receipts
FOR ALL
USING (company_id = auth_company_id())
WITH CHECK (company_id = auth_company_id());

DROP POLICY IF EXISTS "purchase_receipt_items_via_receipt"
  ON public.purchase_receipt_items;

CREATE POLICY "purchase_receipt_items_via_receipt"
ON public.purchase_receipt_items
FOR ALL
USING (
  receipt_id IN (
    SELECT pr.id
    FROM public.purchase_receipts pr
    WHERE pr.company_id = auth_company_id()
  )
)
WITH CHECK (
  receipt_id IN (
    SELECT pr.id
    FROM public.purchase_receipts pr
    WHERE pr.company_id = auth_company_id()
  )
);

-- 5) Recebimento atômico.
-- Tudo acontece na mesma transação:
-- histórico + quantidade recebida + estoque + status da compra.
CREATE OR REPLACE FUNCTION public.receive_purchase_delivery(
  p_purchase_id UUID,
  p_company_id UUID,
  p_received_at TIMESTAMPTZ,
  p_items JSONB,
  p_received_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_receipt_id UUID;
  v_item JSONB;
  v_purchase_item public.purchase_items%ROWTYPE;
  v_purchase_item_id UUID;
  v_qty INTEGER;
  v_remaining INTEGER;
  v_total_received INTEGER := 0;
  v_total_remaining INTEGER := 0;
  v_new_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_company_id IS DISTINCT FROM auth_company_id() THEN
    RAISE EXCEPTION 'Empresa inválida para o usuário autenticado.';
  END IF;

  SELECT *
  INTO v_purchase
  FROM public.purchases
  WHERE id = p_purchase_id
    AND company_id = p_company_id
    AND COALESCE(is_deleted, FALSE) = FALSE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra não encontrada.';
  END IF;

  IF v_purchase.delivery_status = 'received' THEN
    RAISE EXCEPTION 'Esta compra já foi recebida integralmente.';
  END IF;

  IF p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item para recebimento.';
  END IF;

  INSERT INTO public.purchase_receipts (
    purchase_id,
    company_id,
    received_at,
    notes,
    received_by
  )
  VALUES (
    p_purchase_id,
    p_company_id,
    COALESCE(p_received_at, NOW()),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    p_received_by
  )
  RETURNING id INTO v_receipt_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
  LOOP
    v_purchase_item_id := NULLIF(v_item->>'purchase_item_id', '')::UUID;
    v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);

    IF v_purchase_item_id IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Item ou quantidade de recebimento inválida.';
    END IF;

    SELECT *
    INTO v_purchase_item
    FROM public.purchase_items
    WHERE id = v_purchase_item_id
      AND purchase_id = p_purchase_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item da compra não encontrado.';
    END IF;

    v_remaining :=
      COALESCE(v_purchase_item.quantity, 0)
      - COALESCE(v_purchase_item.received_quantity, 0);

    IF v_qty > v_remaining THEN
      RAISE EXCEPTION
        'Quantidade recebida de % excede o restante (%).',
        v_purchase_item.product_name,
        v_remaining;
    END IF;

    UPDATE public.purchase_items
    SET received_quantity = received_quantity + v_qty,
        empty_returned = received_quantity + v_qty
    WHERE id = v_purchase_item.id;

    INSERT INTO public.purchase_receipt_items (
      receipt_id,
      purchase_item_id,
      product_id,
      product_name,
      quantity
    )
    VALUES (
      v_receipt_id,
      v_purchase_item.id,
      v_purchase_item.product_id,
      v_purchase_item.product_name,
      v_qty
    );

    -- O trigger atual do estoque também normaliza purchase para -vazios.
    -- Mantemos o valor explícito para facilitar auditoria.
    INSERT INTO public.stock_movements (
      company_id,
      product_id,
      type,
      full_qty_change,
      empty_qty_change,
      exchange_qty_change,
      hub_pending_qty_change,
      reference_id,
      reference_type,
      reason,
      performed_by,
      created_at
    )
    VALUES (
      p_company_id,
      v_purchase_item.product_id,
      'purchase',
      v_qty,
      -v_qty,
      0,
      0,
      v_receipt_id,
      'purchase_receipt',
      'Recebimento físico da compra #' || COALESCE(v_purchase.purchase_number::TEXT, ''),
      p_received_by,
      COALESCE(p_received_at, NOW())
    );

    v_total_received := v_total_received + v_qty;
  END LOOP;

  IF v_total_received <= 0 THEN
    RAISE EXCEPTION 'Nenhuma quantidade foi informada para recebimento.';
  END IF;

  SELECT COALESCE(
    SUM(GREATEST(quantity - received_quantity, 0)),
    0
  )
  INTO v_total_remaining
  FROM public.purchase_items
  WHERE purchase_id = p_purchase_id;

  IF v_total_remaining = 0 THEN
    v_new_status := 'received';

    UPDATE public.purchases
    SET delivery_status = 'received',
        received_at = COALESCE(p_received_at, NOW()),
        updated_at = NOW()
    WHERE id = p_purchase_id;
  ELSE
    v_new_status := 'partial';

    UPDATE public.purchases
    SET delivery_status = 'partial',
        received_at = NULL,
        updated_at = NOW()
    WHERE id = p_purchase_id;
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'status', v_new_status,
    'received_quantity', v_total_received,
    'remaining_quantity', v_total_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_purchase_delivery(
  UUID, UUID, TIMESTAMPTZ, JSONB, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.receive_purchase_delivery(
  UUID, UUID, TIMESTAMPTZ, JSONB, UUID, TEXT
) TO authenticated;

COMMIT;

-- Conferência rápida.
SELECT
  p.purchase_number,
  p.delivery_status,
  p.expected_delivery_date,
  p.received_at,
  SUM(pi.quantity) AS ordered_qty,
  SUM(pi.received_quantity) AS received_qty
FROM public.purchases p
JOIN public.purchase_items pi ON pi.purchase_id = p.id
WHERE COALESCE(p.is_deleted, FALSE) = FALSE
GROUP BY
  p.id,
  p.purchase_number,
  p.delivery_status,
  p.expected_delivery_date,
  p.received_at
ORDER BY p.purchase_number DESC
LIMIT 20;

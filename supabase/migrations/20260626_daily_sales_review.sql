-- =========================================================
-- SISTEMA GÁS - Conferência de Vendas do Dia
-- Revisão leve das vendas lançadas, aviso configurável e pendências
-- =========================================================

BEGIN;

-- Helpers de permissões, caso ainda não existam no ambiente.
CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(role, 'operator') FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.auth_has_role(roles TEXT[])
RETURNS BOOLEAN AS $$
  SELECT COALESCE(public.auth_user_role() = ANY(roles), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Configuração do aviso em settings.extra.
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;

INSERT INTO public.settings (company_id, gas_povo_delivery_fee, low_stock_alert_qty, extra)
SELECT
  c.id,
  20.00,
  35,
  '{}'::jsonb
FROM public.companies c
WHERE NOT EXISTS (
  SELECT 1 FROM public.settings s WHERE s.company_id = c.id
);

UPDATE public.settings
SET extra = jsonb_set(
  COALESCE(extra, '{}'::jsonb),
  '{daily_sales_review}',
  COALESCE(extra->'daily_sales_review', jsonb_build_object(
    'enabled', true,
    'time', '19:20',
    'repeat_enabled', true,
    'repeat_interval_minutes', 15,
    'days', jsonb_build_array(1, 2, 3, 4, 5, 6),
    'roles', jsonb_build_array('admin', 'manager', 'operator'),
    'message', 'Antes de encerrar, confira se todas as vendas de hoje foram lançadas corretamente.'
  )),
  true
);

-- Registro principal da conferência por dia.
CREATE TABLE IF NOT EXISTS public.daily_sales_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  sales_count INTEGER NOT NULL DEFAULT 0,
  cylinders_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  machine_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_sales_reviews_status_check CHECK (status IN ('pending', 'reviewed', 'has_issue')),
  CONSTRAINT daily_sales_reviews_unique_day UNIQUE (company_id, review_date)
);

-- Pendências sinalizadas dentro da conferência.
CREATE TABLE IF NOT EXISTS public.daily_sales_review_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'open',
  description TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_sales_review_issues_type_check CHECK (type IN (
    'wrong_sale',
    'duplicate_sale',
    'missing_sale',
    'wrong_payment',
    'stock_difference',
    'other'
  )),
  CONSTRAINT daily_sales_review_issues_status_check CHECK (status IN ('open', 'resolved', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_daily_sales_reviews_company_date
ON public.daily_sales_reviews(company_id, review_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_sales_review_issues_company_date
ON public.daily_sales_review_issues(company_id, review_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_sales_review_issues_sale
ON public.daily_sales_review_issues(sale_id);

-- updated_at automático, usando a função já existente do projeto quando disponível.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_daily_sales_reviews_updated_at ON public.daily_sales_reviews;
    CREATE TRIGGER trg_daily_sales_reviews_updated_at
    BEFORE UPDATE ON public.daily_sales_reviews
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS trg_daily_sales_review_issues_updated_at ON public.daily_sales_review_issues;
    CREATE TRIGGER trg_daily_sales_review_issues_updated_at
    BEFORE UPDATE ON public.daily_sales_review_issues
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.daily_sales_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales_review_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_sales_reviews_select_company ON public.daily_sales_reviews;
CREATE POLICY daily_sales_reviews_select_company ON public.daily_sales_reviews
FOR SELECT
USING (company_id = public.auth_company_id());

DROP POLICY IF EXISTS daily_sales_reviews_insert_operator ON public.daily_sales_reviews;
CREATE POLICY daily_sales_reviews_insert_operator ON public.daily_sales_reviews
FOR INSERT
WITH CHECK (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager','operator'])
);

DROP POLICY IF EXISTS daily_sales_reviews_update_operator ON public.daily_sales_reviews;
CREATE POLICY daily_sales_reviews_update_operator ON public.daily_sales_reviews
FOR UPDATE
USING (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager','operator'])
)
WITH CHECK (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager','operator'])
);

DROP POLICY IF EXISTS daily_sales_review_issues_select_company ON public.daily_sales_review_issues;
CREATE POLICY daily_sales_review_issues_select_company ON public.daily_sales_review_issues
FOR SELECT
USING (company_id = public.auth_company_id());

DROP POLICY IF EXISTS daily_sales_review_issues_insert_operator ON public.daily_sales_review_issues;
CREATE POLICY daily_sales_review_issues_insert_operator ON public.daily_sales_review_issues
FOR INSERT
WITH CHECK (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager','operator'])
);

DROP POLICY IF EXISTS daily_sales_review_issues_update_manager ON public.daily_sales_review_issues;
CREATE POLICY daily_sales_review_issues_update_manager ON public.daily_sales_review_issues
FOR UPDATE
USING (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager'])
)
WITH CHECK (
  company_id = public.auth_company_id()
  AND public.auth_has_role(ARRAY['admin','manager'])
);

COMMIT;

NOTIFY pgrst, 'reload schema';

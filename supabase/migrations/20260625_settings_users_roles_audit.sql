-- =========================================================
-- Configurações 2.0: usuários, roles, auditoria e segurança operacional
-- =========================================================

BEGIN;

-- 1) Perfis de acesso
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('admin', 'manager', 'operator', 'viewer'));

UPDATE public.profiles
SET role = 'operator'
WHERE role IS NULL OR role NOT IN ('admin', 'manager', 'operator', 'viewer');

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'operator';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2) Configurações operacionais dentro de settings.extra
ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}'::jsonb;

UPDATE public.settings
SET extra = COALESCE(extra, '{}'::jsonb) || jsonb_build_object(
  'full_no_return_initial_qty', COALESCE((extra->>'full_no_return_initial_qty')::int, 69),
  'require_cancel_sale_reason', COALESCE((extra->>'require_cancel_sale_reason')::boolean, true),
  'require_stock_adjustment_reason', COALESCE((extra->>'require_stock_adjustment_reason')::boolean, true),
  'require_purchase_delete_reason', COALESCE((extra->>'require_purchase_delete_reason')::boolean, true),
  'block_sale_edit_after_days', COALESCE((extra->>'block_sale_edit_after_days')::int, 3),
  'retroactive_sales_admin_only', COALESCE((extra->>'retroactive_sales_admin_only')::boolean, false),
  'arrival_subtracts_empty', COALESCE((extra->>'arrival_subtracts_empty')::boolean, true),
  'exchange_out_subtracts_full', COALESCE((extra->>'exchange_out_subtracts_full')::boolean, true),
  'allow_negative_stock', COALESCE((extra->>'allow_negative_stock')::boolean, false)
);

-- 3) Auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
ON public.audit_logs(company_id, created_at DESC);

-- 4) Helpers de permissões no banco
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

-- 5) RLS auxiliar para empresas, perfis e auditoria.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_own ON public.companies;
CREATE POLICY companies_select_own ON public.companies
FOR SELECT
USING (id = public.auth_company_id());

DROP POLICY IF EXISTS companies_update_admin_manager ON public.companies;
CREATE POLICY companies_update_admin_manager ON public.companies
FOR UPDATE
USING (id = public.auth_company_id() AND public.auth_has_role(ARRAY['admin','manager']))
WITH CHECK (id = public.auth_company_id() AND public.auth_has_role(ARRAY['admin','manager']));

DROP POLICY IF EXISTS profiles_admin_manage_company ON public.profiles;
CREATE POLICY profiles_admin_manage_company ON public.profiles
FOR UPDATE
USING (company_id = public.auth_company_id() AND public.auth_has_role(ARRAY['admin']))
WITH CHECK (company_id = public.auth_company_id() AND public.auth_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS audit_logs_select_company ON public.audit_logs;
CREATE POLICY audit_logs_select_company ON public.audit_logs
FOR SELECT
USING (company_id = public.auth_company_id());

DROP POLICY IF EXISTS audit_logs_insert_company ON public.audit_logs;
CREATE POLICY audit_logs_insert_company ON public.audit_logs
FOR INSERT
WITH CHECK (company_id = public.auth_company_id());

-- Restrição adicional: só admin/gerente escreve configurações quando houver políticas permissivas existentes.
DROP POLICY IF EXISTS settings_update_role_guard ON public.settings;
CREATE POLICY settings_update_role_guard ON public.settings AS RESTRICTIVE
FOR UPDATE
USING (public.auth_has_role(ARRAY['admin','manager']))
WITH CHECK (public.auth_has_role(ARRAY['admin','manager']));

DROP POLICY IF EXISTS settings_insert_role_guard ON public.settings;
CREATE POLICY settings_insert_role_guard ON public.settings AS RESTRICTIVE
FOR INSERT
WITH CHECK (public.auth_has_role(ARRAY['admin','manager']));

COMMIT;

NOTIFY pgrst, 'reload schema';

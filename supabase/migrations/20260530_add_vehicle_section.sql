-- =========================================================
-- SEÇÃO DE VEÍCULOS - DESPESAS, ABASTECIMENTOS E KM
-- =========================================================

BEGIN;

-- 1. Ajustes na tabela de despesas para aceitar forma de pagamento e origem
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id),
ADD COLUMN IF NOT EXISTS source_type TEXT,
ADD COLUMN IF NOT EXISTS source_id UUID;

-- Ajusta categorias de despesa
ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_category_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_category_check
CHECK (category IN (
  'salary','rent','electricity','water','internet',
  'fuel','maintenance','tax','vehicle','other'
));

-- Ajusta recorrência para deixar claro que sem recorrência é despesa única
ALTER TABLE public.expenses
DROP CONSTRAINT IF EXISTS expenses_recurrence_check;

ALTER TABLE public.expenses
ADD CONSTRAINT expenses_recurrence_check
CHECK (recurrence IN ('none','once','weekly','biweekly','monthly','yearly'));

ALTER TABLE public.expenses
ALTER COLUMN recurrence SET DEFAULT 'none';

-- 2. Tabela de veículos
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'car' CHECK (type IN ('motorcycle','car','van','truck','other')),
  plate TEXT,
  model TEXT,
  year INTEGER,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de despesas/abastecimentos dos veículos
CREATE TABLE IF NOT EXISTS public.vehicle_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES public.payment_methods(id),
  type TEXT NOT NULL DEFAULT 'fuel' CHECK (type IN ('fuel','maintenance','document','insurance','tire','wash','other')),
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  fuel_type TEXT CHECK (fuel_type IS NULL OR fuel_type IN ('gasoline','ethanol','diesel','diesel_s10','gnv','flex','other')),
  liters NUMERIC(10,3),
  unit_price NUMERIC(10,3),
  odometer_km NUMERIC(12,1),
  station_name TEXT,
  station_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (amount >= 0),
  CHECK (liters IS NULL OR liters >= 0),
  CHECK (unit_price IS NULL OR unit_price >= 0),
  CHECK (odometer_km IS NULL OR odometer_km >= 0)
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON public.expenses(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_expenses_source ON public.expenses(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_company ON public.vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_company_date ON public.vehicle_expenses(company_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_vehicle ON public.vehicle_expenses(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_expenses_payment_method ON public.vehicle_expenses(payment_method_id);

-- 5. Updated_at automático
DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON public.vehicles;
CREATE TRIGGER trg_vehicles_updated_at
BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_vehicle_expenses_updated_at ON public.vehicle_expenses;
CREATE TRIGGER trg_vehicle_expenses_updated_at
BEFORE UPDATE ON public.vehicle_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 6. RLS
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicles_company_isolation" ON public.vehicles;
CREATE POLICY "vehicles_company_isolation" ON public.vehicles
FOR ALL USING (company_id = public.auth_company_id())
WITH CHECK (company_id = public.auth_company_id());

DROP POLICY IF EXISTS "vehicle_expenses_company_isolation" ON public.vehicle_expenses;
CREATE POLICY "vehicle_expenses_company_isolation" ON public.vehicle_expenses
FOR ALL USING (company_id = public.auth_company_id())
WITH CHECK (company_id = public.auth_company_id());

COMMIT;

NOTIFY pgrst, 'reload schema';

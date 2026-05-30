-- ============================================================
-- GASMASTER - Schema Supabase/PostgreSQL
-- Versão MVP 1.0
-- ============================================================

-- Habilitar extensões
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABELA: companies (multi-empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: profiles (usuários)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: products (produtos)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  unit TEXT DEFAULT 'un',
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  gas_povo_sale_price NUMERIC(10,2) NOT NULL DEFAULT 100.23,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  is_active BOOLEAN DEFAULT TRUE,
  is_cylinder BOOLEAN DEFAULT TRUE,
  weight_kg NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: payment_methods (formas de pagamento)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','pix','credit','debit','vale_hub','gas_povo','other')),
  has_delivery_fee BOOLEAN DEFAULT FALSE,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  requires_machine BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: card_machines (maquininhas)
-- ============================================================
CREATE TABLE IF NOT EXISTS card_machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  brand TEXT,
  color TEXT,
  provider TEXT,
  fee_credit NUMERIC(5,4) DEFAULT 0,
  fee_debit NUMERIC(5,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: customers (clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'individual' CHECK (type IN ('individual','daycare','company','fixed','occasional')),
  cpf_cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  neighborhood TEXT,
  city TEXT,
  responsible_name TEXT,
  notes TEXT,
  default_payment_method_id UUID REFERENCES payment_methods(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preços especiais por cliente/produto
CREATE TABLE IF NOT EXISTS customer_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  special_price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, product_id)
);

-- ============================================================
-- TABELA: suppliers (fornecedores)
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  contact_name TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preços por fornecedor/produto
CREATE TABLE IF NOT EXISTS supplier_prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  cost_price NUMERIC(10,2) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, product_id)
);

-- ============================================================
-- TABELA: stock_balances (saldo atual do estoque)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  full_qty INTEGER DEFAULT 0,
  empty_qty INTEGER DEFAULT 0,
  exchange_qty INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, product_id),
  CHECK (full_qty >= 0),
  CHECK (empty_qty >= 0),
  CHECK (exchange_qty >= 0)
);

-- ============================================================
-- TABELA: stock_movements (movimentações de estoque)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  product_id UUID REFERENCES products(id),
  type TEXT NOT NULL CHECK (type IN (
    'sale','purchase','return_empty','return_full',
    'adjustment','purchase_return','loss','exchange_out','exchange_in'
  )),
  full_qty_change INTEGER DEFAULT 0,
  empty_qty_change INTEGER DEFAULT 0,
  exchange_qty_change INTEGER DEFAULT 0,
  reference_id UUID,
  reference_type TEXT,
  reason TEXT,
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: sales (vendas)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  sale_number SERIAL,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  payment_method_id UUID REFERENCES payment_methods(id),
  card_machine_id UUID REFERENCES card_machines(id),
  channel TEXT DEFAULT 'street' CHECK (channel IN ('street','counter','delivery','other')),
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_fee NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'completed' CHECK (status IN ('completed','cancelled','pending')),
  notes TEXT,
  sold_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: sale_items (itens da venda)
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  cost_price NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  empty_returned BOOLEAN DEFAULT FALSE,
  empty_qty_returned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: purchases (chegada de gás / compras)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  purchase_number SERIAL,
  supplier_id UUID REFERENCES suppliers(id),
  supplier_name TEXT,
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: purchase_items (itens da compra)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(10,2) NOT NULL,
  total_cost NUMERIC(10,2) NOT NULL,
  empty_returned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: expenses (despesas)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN (
    'salary','rent','electricity','water','internet',
    'fuel','maintenance','tax','other'
  )),
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  recurrence TEXT DEFAULT 'once' CHECK (recurrence IN ('once','monthly','weekly','yearly')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at TIMESTAMPTZ,
  paid_amount NUMERIC(10,2),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: settings (configurações da empresa)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id) UNIQUE,
  gas_povo_delivery_fee NUMERIC(10,2) DEFAULT 20.00,
  low_stock_alert_qty INTEGER DEFAULT 5,
  currency TEXT DEFAULT 'BRL',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  extra JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABELA: audit_logs (logs de auditoria)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX idx_sales_company_sold_at ON sales(company_id, sold_at DESC);
CREATE INDEX idx_sales_payment_method ON sales(payment_method_id);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX idx_stock_movements_company_product ON stock_movements(company_id, product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at DESC);
CREATE INDEX idx_expenses_company_due ON expenses(company_id, due_date);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_purchases_company_date ON purchases(company_id, purchased_at DESC);
CREATE INDEX idx_customers_company ON customers(company_id);

-- ============================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================

-- Atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger de updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','profiles','products','payment_methods','card_machines',
    'customers','suppliers','sales','purchases','expenses','settings'
  ] LOOP
    EXECUTE format('
      CREATE TRIGGER trg_%s_updated_at
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END $$;

-- Função para atualizar saldo de estoque
CREATE OR REPLACE FUNCTION update_stock_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_full INTEGER;
  v_empty INTEGER;
  v_exchange INTEGER;
BEGIN
  INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty)
  VALUES (NEW.company_id, NEW.product_id, 0, 0, 0)
  ON CONFLICT (company_id, product_id) DO NOTHING;

  SELECT full_qty, empty_qty, exchange_qty
  INTO v_full, v_empty, v_exchange
  FROM stock_balances
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id
  FOR UPDATE;

  v_full := COALESCE(v_full, 0) + COALESCE(NEW.full_qty_change, 0);
  v_empty := COALESCE(v_empty, 0) + COALESCE(NEW.empty_qty_change, 0);
  v_exchange := COALESCE(v_exchange, 0) + COALESCE(NEW.exchange_qty_change, 0);

  IF v_full < 0 THEN
    RAISE EXCEPTION 'Estoque de cheios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_empty < 0 THEN
    RAISE EXCEPTION 'Estoque de vazios insuficiente para o produto %', NEW.product_id;
  END IF;

  IF v_exchange < 0 THEN
    RAISE EXCEPTION 'Estoque em troca insuficiente para o produto %', NEW.product_id;
  END IF;

  UPDATE stock_balances
  SET full_qty = v_full,
      empty_qty = v_empty,
      exchange_qty = v_exchange,
      updated_at = NOW()
  WHERE company_id = NEW.company_id
    AND product_id = NEW.product_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stock_movement_balance
AFTER INSERT ON stock_movements
FOR EACH ROW EXECUTE FUNCTION update_stock_balance();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: retorna company_id do usuário logado
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper: verifica se usuário é admin
CREATE OR REPLACE FUNCTION auth_is_admin()
RETURNS BOOLEAN AS $$
  SELECT role = 'admin' FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Políticas: profiles
CREATE POLICY "profiles_select_own_company" ON profiles
  FOR SELECT USING (company_id = auth_company_id());

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Políticas: tabelas da empresa (genérico)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'products','payment_methods','card_machines','customers',
    'suppliers','stock_balances','stock_movements','sales',
    'purchases','expenses','settings','audit_logs'
  ] LOOP
    EXECUTE format('
      CREATE POLICY "%s_company_isolation" ON %s
        FOR ALL USING (company_id = auth_company_id());
    ', t, t);
  END LOOP;
END $$;

-- Sale items / purchase items (via join)
CREATE POLICY "sale_items_via_sale" ON sale_items
  FOR ALL USING (
    sale_id IN (SELECT id FROM sales WHERE company_id = auth_company_id())
  );

CREATE POLICY "purchase_items_via_purchase" ON purchase_items
  FOR ALL USING (
    purchase_id IN (SELECT id FROM purchases WHERE company_id = auth_company_id())
  );

CREATE POLICY "customer_prices_policy" ON customer_prices
  FOR ALL USING (
    customer_id IN (SELECT id FROM customers WHERE company_id = auth_company_id())
  );

CREATE POLICY "supplier_prices_policy" ON supplier_prices
  FOR ALL USING (
    supplier_id IN (SELECT id FROM suppliers WHERE company_id = auth_company_id())
  );

-- ============================================================
-- SEED - Dados iniciais de exemplo
-- ============================================================

-- Empresa demo
INSERT INTO companies (id, name, cnpj, address, phone, email)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'GásMaster Distribuidora',
  '12.345.678/0001-90',
  'Rua das Flores, 123 - Centro',
  '(11) 99999-9999',
  'contato@gasmaster.com.br'
) ON CONFLICT DO NOTHING;

-- Configurações iniciais
INSERT INTO settings (company_id, gas_povo_delivery_fee, low_stock_alert_qty)
VALUES ('00000000-0000-0000-0000-000000000001', 20.00, 5)
ON CONFLICT DO NOTHING;

-- Produtos padrão
INSERT INTO products (company_id, name, code, sale_price, gas_povo_sale_price, cost_price, is_cylinder, weight_kg, min_stock)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Botijão P13', 'P13', 110.00, 100.23, 75.00, true, 13, 10),
  ('00000000-0000-0000-0000-000000000001', 'Botijão P45', 'P45', 280.00, 100.23, 210.00, true, 45, 3)
ON CONFLICT DO NOTHING;

-- Estoque inicial atual da empresa
INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty)
SELECT '00000000-0000-0000-0000-000000000001', id, 118, 122, 7
FROM products
WHERE company_id = '00000000-0000-0000-0000-000000000001' AND code = 'P13'
ON CONFLICT (company_id, product_id) DO UPDATE
  SET full_qty = EXCLUDED.full_qty,
      empty_qty = EXCLUDED.empty_qty,
      exchange_qty = EXCLUDED.exchange_qty,
      updated_at = NOW();

INSERT INTO stock_balances (company_id, product_id, full_qty, empty_qty, exchange_qty)
SELECT '00000000-0000-0000-0000-000000000001', id, 0, 4, 0
FROM products
WHERE company_id = '00000000-0000-0000-0000-000000000001' AND code = 'P45'
ON CONFLICT (company_id, product_id) DO UPDATE
  SET full_qty = EXCLUDED.full_qty,
      empty_qty = EXCLUDED.empty_qty,
      exchange_qty = EXCLUDED.exchange_qty,
      updated_at = NOW();

-- Formas de pagamento
INSERT INTO payment_methods (company_id, name, type, has_delivery_fee, delivery_fee, requires_machine)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Dinheiro', 'cash', false, 0, false),
  ('00000000-0000-0000-0000-000000000001', 'Pix', 'pix', false, 0, false),
  ('00000000-0000-0000-0000-000000000001', 'Cartão de Crédito', 'credit', false, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'Cartão de Débito', 'debit', false, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'Vale Hub / Ultragaz', 'vale_hub', false, 0, true),
  ('00000000-0000-0000-0000-000000000001', 'Gás do Povo', 'gas_povo', true, 20.00, true)
ON CONFLICT DO NOTHING;

-- Maquininhas
INSERT INTO card_machines (company_id, name, brand, color, provider, fee_credit, fee_debit)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Máquina Preta', 'InfinitePay', 'black', 'InfinitePay', 0.0299, 0.0150),
  ('00000000-0000-0000-0000-000000000001', 'Máquina Laranja', 'Itaú', 'orange', 'Itaú', 0.0350, 0.0180),
  ('00000000-0000-0000-0000-000000000001', 'Máquina Azul', 'Gás do Povo', 'blue', 'Gás do Povo', 0.0250, 0.0150)
ON CONFLICT DO NOTHING;

-- Fornecedor padrão
INSERT INTO suppliers (company_id, name, cnpj, phone, contact_name)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ultragaz', '61.602.940/0001-00', '0800-722-8580', 'Central Ultragaz')
ON CONFLICT DO NOTHING;

-- Despesas fixas de exemplo
INSERT INTO expenses (company_id, name, category, amount, due_date, recurrence, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Aluguel', 'rent', 1500.00, CURRENT_DATE + INTERVAL '5 days', 'monthly', 'pending'),
  ('00000000-0000-0000-0000-000000000001', 'Salário Entregador', 'salary', 1800.00, CURRENT_DATE + INTERVAL '10 days', 'monthly', 'pending'),
  ('00000000-0000-0000-0000-000000000001', 'Conta de Luz', 'electricity', 250.00, CURRENT_DATE - INTERVAL '2 days', 'monthly', 'overdue'),
  ('00000000-0000-0000-0000-000000000001', 'Internet', 'internet', 120.00, CURRENT_DATE + INTERVAL '15 days', 'monthly', 'pending')
ON CONFLICT DO NOTHING;

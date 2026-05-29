-- =========================================================
-- ADICIONA PREÇO ESPECÍFICO DO GÁS DO POVO POR PRODUTO
-- =========================================================

BEGIN;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS gas_povo_sale_price NUMERIC(10,2) NOT NULL DEFAULT 100.23;

UPDATE products
SET gas_povo_sale_price = 100.23
WHERE gas_povo_sale_price IS NULL
   OR code = 'P13';

COMMIT;

-- Conferência
SELECT
  name AS produto,
  code AS codigo,
  sale_price AS preco_venda_padrao,
  gas_povo_sale_price AS preco_gas_do_povo
FROM products
WHERE UPPER(COALESCE(code, '')) IN ('P13', 'P45')
   OR UPPER(COALESCE(name, '')) LIKE '%P13%'
   OR UPPER(COALESCE(name, '')) LIKE '%P45%'
ORDER BY name;

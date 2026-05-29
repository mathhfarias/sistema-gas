# 🔥 GásMaster — Sistema de Gestão para Distribuidora de GLP

Sistema web moderno para controle de vendas, estoque, clientes, fornecedores, despesas e lucro de distribuidoras de gás GLP.

**Stack:** React + Vite · Tailwind CSS · Supabase · Netlify

---

## 📋 Funcionalidades do MVP

- ✅ Autenticação via Supabase Auth
- ✅ Dashboard com resumo do dia
- ✅ Lançamento rápido de vendas
- ✅ Controle de estoque (cheios/vazios)
- ✅ Registro de chegada de gás (compras)
- ✅ Cadastro de clientes (PF, PJ, creches, fixos)
- ✅ Cadastro de fornecedores
- ✅ Cadastro de produtos
- ✅ Despesas e contas a pagar com lembretes
- ✅ Relatório de lucro/prejuízo (DRE)
- ✅ Relatório por forma de pagamento e maquininha
- ✅ Configurações da empresa e do sistema
- ✅ RLS por empresa (multi-tenant preparado)

---

## 🚀 Instalação Local

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta no [Supabase](https://supabase.com) (gratuita)
- Conta na [Netlify](https://netlify.com) (gratuita)

### Passo 1 — Clone e instale

```bash
# Acesse a pasta do projeto
cd gasmaster

# Instale as dependências
npm install
```

### Passo 2 — Configure o Supabase

1. Acesse [app.supabase.com](https://app.supabase.com) e crie um novo projeto
2. Aguarde o banco subir (~2 minutos)
3. Vá em **SQL Editor** → **New Query**
4. Cole o conteúdo completo do arquivo `supabase_schema.sql`
5. Clique em **Run** para criar todas as tabelas, triggers, RLS e dados seed

### Passo 3 — Crie seu usuário

Ainda no Supabase:

1. Vá em **Authentication → Users → Invite User**
2. Informe seu e-mail e envie o convite
3. Acesse o link recebido e defina sua senha
4. Depois, vá no **SQL Editor** e execute:

```sql
-- Substitua pelo seu email e pelo UUID do usuário criado
-- O UUID aparece em Authentication > Users
INSERT INTO profiles (id, company_id, full_name, role, is_active)
VALUES (
  'SEU-UUID-DO-USUARIO',
  '00000000-0000-0000-0000-000000000001',  -- empresa demo do seed
  'Seu Nome',
  'admin',
  true
);
```

### Passo 4 — Configure as variáveis de ambiente

```bash
# Copie o exemplo
cp .env.example .env.local
```

Edite `.env.local` com os dados do seu projeto Supabase:

```env
VITE_SUPABASE_URL=https://XXXXXXXXXXX.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> As chaves ficam em: **Supabase → Settings → API**

### Passo 5 — Rode localmente

```bash
npm run dev
```

Acesse: [http://localhost:5173](http://localhost:5173)

---

## 🌐 Deploy na Netlify

### Opção A — Deploy pelo GitHub (recomendado)

1. Suba o projeto para um repositório GitHub
2. Acesse [app.netlify.com](https://app.netlify.com)
3. Clique em **Add new site → Import an existing project**
4. Selecione o repositório do GitHub
5. Configure:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
6. Vá em **Site configuration → Environment variables** e adicione:
   - `VITE_SUPABASE_URL` → sua URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` → sua chave anon do Supabase
7. Clique em **Deploy site**

### Opção B — Deploy via CLI

```bash
# Instale o CLI da Netlify
npm install -g netlify-cli

# Faça login
netlify login

# Build e deploy
npm run build
netlify deploy --prod --dir=dist
```

> ⚠️ Nunca commite o arquivo `.env.local` no repositório.

---

## 📁 Estrutura do Projeto

```
gasmaster/
├── supabase_schema.sql        # SQL completo: tabelas, RLS, seed
├── netlify.toml               # Configuração do deploy
├── .env.example               # Modelo de variáveis de ambiente
├── vite.config.js
├── tailwind.config.js
└── src/
    ├── main.jsx               # Entry point
    ├── App.jsx                # Rotas
    ├── styles/
    │   └── globals.css        # Classes utilitárias globais
    ├── lib/
    │   └── supabase.js        # Cliente Supabase
    ├── utils/
    │   └── format.js          # Formatação BR: moeda, datas, máscaras
    ├── hooks/
    │   ├── useAuth.jsx        # Contexto de autenticação
    │   └── useSupabaseQuery.js# Hook genérico de fetch
    ├── layouts/
    │   └── AppLayout.jsx      # Sidebar + topbar
    ├── components/
    │   └── ui.jsx             # Componentes reutilizáveis
    ├── services/
    │   ├── salesService.js    # Lógica de vendas
    │   ├── stockService.js    # Lógica de estoque
    │   └── financialService.js# DRE e relatórios
    └── pages/
        ├── LoginPage.jsx
        ├── DashboardPage.jsx
        ├── NewSalePage.jsx    # Lançamento rápido
        ├── SalesPage.jsx
        ├── StockPage.jsx
        ├── PurchasesPage.jsx  # Chegada de gás
        ├── CustomersPage.jsx
        ├── SuppliersPage.jsx
        ├── ProductsPage.jsx
        ├── ExpensesPage.jsx
        ├── ReportsPage.jsx
        └── SettingsPage.jsx
```

---

## 🗄️ Banco de Dados — Tabelas

| Tabela | Descrição |
|---|---|
| `companies` | Empresas (multi-tenant) |
| `profiles` | Usuários com vínculo à empresa |
| `products` | Produtos (P13, P45, etc.) |
| `customers` | Clientes (PF, PJ, creches) |
| `suppliers` | Fornecedores |
| `payment_methods` | Formas de pagamento |
| `card_machines` | Maquininhas |
| `sales` | Cabeçalho das vendas |
| `sale_items` | Itens de cada venda |
| `stock_balances` | Saldo atual por produto |
| `stock_movements` | Histórico de movimentações |
| `purchases` | Chegada de gás |
| `purchase_items` | Itens de cada compra |
| `expenses` | Despesas fixas e variáveis |
| `settings` | Configurações da empresa |
| `audit_logs` | Log de alterações |

---

## ⚙️ Regras de Negócio

| Regra | Detalhe |
|---|---|
| Venda | Reduz cheios; aumenta vazios se casco retornado |
| Compra | Aumenta cheios; reduz vazios (troca) |
| Cancelamento | Reverte o estoque automaticamente |
| Gás do Povo | Taxa de entrega R$ 20,00 via `settings` |
| Ajuste manual | Motivo obrigatório; gera histórico |
| Lucro líquido | Receita − CMV − Despesas pagas |
| Estoque baixo | `full_qty <= products.min_stock` |

---

## 🔐 Segurança

- **RLS ativado** em todas as tabelas: cada usuário só acessa dados da sua empresa
- Chaves do Supabase ficam **apenas em variáveis de ambiente**
- A `anon key` do Supabase é pública por design — o que protege são as políticas RLS
- Para funções sensíveis (ex: emissão de NF-e), usar **Supabase Edge Functions** com `service_role`

---

## 🗺️ Roadmap Futuro

### Fase 2 — Operacional
- [ ] PWA com notificações push
- [ ] App do motorista (React Native / Expo)
- [ ] Rota de entrega do dia
- [ ] Impressão de recibo/pedido

### Fase 3 — Integrações
- [ ] Geração de NF-e / NFC-e
- [ ] Integração Ultragaz (portal do revendedor)
- [ ] Relatório mensal para prestação de contas
- [ ] Exportação Excel/CSV

### Fase 4 — Escala
- [ ] Multi-filial
- [ ] Módulo de usuários e permissões avançadas
- [ ] API pública (webhooks)
- [ ] Painel do franqueador

---

## 🛠️ Scripts disponíveis

```bash
npm run dev      # Desenvolvimento local
npm run build    # Build de produção
npm run preview  # Pré-visualização do build
```

---

## 📞 Suporte

Sistema desenvolvido como MVP funcional para distribuidoras de GLP.
Para dúvidas sobre configuração do Supabase ou Netlify, consulte a documentação oficial:

- [Supabase Docs](https://supabase.com/docs)
- [Netlify Docs](https://docs.netlify.com)
- [Vite Docs](https://vitejs.dev)

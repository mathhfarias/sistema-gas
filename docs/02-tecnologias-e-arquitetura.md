# 02 — Tecnologias e Arquitetura

## Front-end

O front-end é construído com:

- React
- Vite
- JavaScript
- Componentes reutilizáveis
- Rotas internas da aplicação
- Deploy estático via Netlify

## Back-end / Banco

O sistema usa Supabase como backend principal:

- PostgreSQL
- Auth
- Row Level Security, RLS
- Políticas de acesso por empresa e perfil
- Tabelas operacionais para vendas, estoque, despesas, chegadas, usuários e configurações

## Deploy

O deploy é feito pelo Netlify a partir do GitHub.

Fluxo esperado:

1. Criar branch.
2. Fazer alteração local.
3. Testar com `npm run build`.
4. Subir branch para GitHub.
5. Abrir Pull Request.
6. Conferir deploy preview.
7. Fazer merge na `main`.
8. Netlify publica a versão de produção.

## Variáveis de ambiente

No React com Vite, variáveis iniciadas com `VITE_` ficam disponíveis no navegador. Por isso, somente chaves públicas de front-end podem usar esse prefixo.

Permitido no front-end:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nunca colocar no front-end:

- Senha do banco
- `SUPABASE_SERVICE_ROLE_KEY`
- Tokens fiscais
- Tokens da Ultragaz
- Senhas privadas
- Chaves secretas

## Estrutura recomendada do projeto

```txt
src/
├── components/
├── layouts/
├── pages/
├── services/
├── utils/
└── App.jsx

supabase/
└── migrations/

docs/
└── documentação do sistema
```

## Pontos de atenção

- O banco deve ser a fonte da verdade para regras críticas.
- O front-end pode esconder botões e telas, mas a segurança forte precisa estar no Supabase via RLS.
- Integrações futuras com Nota Fiscal e Ultragaz devem passar por backend/serverless, nunca diretamente pelo front-end.

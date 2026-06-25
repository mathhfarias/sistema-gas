# Sistema Gás / GásMaster

Sistema web para controle operacional de revenda de gás GLP, criado para apoiar a rotina da loja em vendas, estoque, chegada de gás, despesas, clientes, fornecedores, veículos, calendário, relatórios, usuários e permissões.

## Objetivo

O objetivo do Sistema Gás é centralizar a operação diária da loja, reduzindo controles manuais em caderno e planilhas, melhorando a conferência de estoque físico x digital e permitindo uma base mais segura para integrações futuras, como emissão de Nota Fiscal e integração com Ultragaz.

## Módulos principais

- Dashboard
- Nova Venda
- Vendas
- Estoque
- Chegada de Gás
- Clientes
- Fornecedores
- Produtos
- Veículos
- Calendário
- Despesas
- Relatórios
- Configurações
- Usuários e Permissões

## Tecnologias

- React
- Vite
- JavaScript
- Supabase
- PostgreSQL
- Row Level Security, ou RLS
- Netlify
- GitHub

## Documentação

A documentação completa fica na pasta `docs/`:

1. [Visão geral](docs/01-visao-geral.md)
2. [Tecnologias e arquitetura](docs/02-tecnologias-e-arquitetura.md)
3. [Regras de negócio](docs/03-regras-de-negocio.md)
4. [Banco de dados](docs/04-banco-de-dados.md)
5. [RLS e segurança](docs/05-rls-e-seguranca.md)
6. [Fluxos operacionais](docs/06-fluxos-operacionais.md)
7. [Histórico de problemas corrigidos](docs/07-problemas-corrigidos.md)
8. [Roadmap de melhorias](docs/08-roadmap-melhorias.md)
9. [Guia de manutenção](docs/09-guia-de-manutencao.md)
10. [Checklist de fechamento diário](docs/10-checklist-fechamento-diario.md)

## Variáveis de ambiente

O projeto deve usar variáveis locais em `.env.local`, que nunca devem ser versionadas no GitHub.

Exemplo seguro:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Nunca versionar:

- Senha do banco
- Service role key do Supabase
- Tokens fiscais
- Tokens de integração com Ultragaz
- Chaves privadas

## Fluxo Git oficial

Toda alteração deve ser feita em branch separada, com Pull Request para `main`:

```bash
cd ~/Desktop/sistema-gas

git checkout main
git pull origin main
git checkout -b nome-da-feature

npm install
npm run build
npm run dev

git add .
git commit -m "descrição da alteração"
git push -u origin nome-da-feature
```

Depois abrir Pull Request no GitHub, conferir o deploy preview do Netlify e só então fazer merge.

## Status atual de segurança

Já existe uma primeira camada de segurança com roles e RLS para empresas, perfis, configurações e auditoria. A próxima evolução recomendada é implementar RLS operacional nas tabelas de vendas, estoque, compras, despesas, produtos, fornecedores, veículos e clientes.

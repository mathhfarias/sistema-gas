# 01 — Visão Geral

O Sistema Gás, também chamado de GásMaster, é uma aplicação web criada para controlar a operação de uma revenda de gás GLP.

Ele nasceu para resolver problemas práticos da loja, principalmente:

- Controle de vendas por forma de pagamento.
- Controle de estoque de botijões cheios, vazios, troca e HUB.
- Registro de chegada de gás.
- Registro de despesas.
- Controle de clientes, fornecedores e produtos.
- Controle de veículos e gastos operacionais.
- Relatórios gerenciais.
- Permissões de usuários.
- Base segura para futuras integrações fiscais e operacionais.

## Módulos do sistema

### Dashboard

Mostra indicadores rápidos da operação, como faturamento, contas em atraso, estoque e alertas.

### Nova Venda

Tela de registro de vendas, com suporte a diferentes formas de pagamento, pagamento dividido, canal de venda e regras de estoque.

### Vendas

Histórico das vendas realizadas, com possibilidade de consultar, editar ou cancelar, conforme permissões.

### Estoque

Controle dos botijões por produto, normalmente P13 e P45, separando:

- Cheios
- Vazios
- Em troca
- HUB a retornar

### Chegada de Gás

Registro de compras/entradas de botijões. A regra operacional é que toda chegada aumenta cheios e subtrai vazios na mesma quantidade recebida.

### Despesas

Controle financeiro de contas, despesas, vencimentos, pagamentos e pendências em atraso.

### Relatórios

Área de análise gerencial com vendas, formas de pagamento, estoque, despesas, tipos de venda e outras visões.

### Configurações

Dados da empresa, parâmetros operacionais, usuários, permissões, configurações de segurança e histórico de alterações críticas.

## Princípio operacional

O sistema deve refletir a loja real. Sempre que houver divergência entre estoque físico e digital, a prioridade é corrigir o saldo atual e registrar o motivo.

O objetivo é reduzir lançamentos manuais via SQL com melhorias de tela, principalmente no fechamento diário e nas correções operacionais.

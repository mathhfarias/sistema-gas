# 04 — Banco de Dados

Este documento descreve as tabelas principais do Sistema Gás.

## companies

Dados da empresa/loja.

Campos esperados:

- Nome
- CNPJ
- Telefone
- E-mail
- Endereço

Usada como referência principal para multiempresa e filtros por `company_id`.

## profiles

Usuários do sistema vinculados à autenticação.

Campos importantes:

- `id`
- `company_id`
- `full_name`
- `email`
- `role`
- `is_active`

Roles conhecidas:

- `admin`
- `manager`
- `operator`
- `viewer`

## products

Produtos vendidos/controlados.

Exemplos:

- Botijão P13
- Botijão P45

Campos operacionais importantes:

- Preço normal
- Preço rua/entrega
- Preço Gás do Povo
- Preço vazio/casco
- Preço cheio sem retorno
- Custo

## payment_methods

Formas de pagamento.

Exemplos:

- Dinheiro
- Pix
- Cartão de Crédito
- Cartão de Débito
- Gás do Povo
- Vale Hub / Ultragaz

## card_machines

Máquinas de cartão.

Exemplos:

- Máquina preta — InfinitePay
- Máquina laranja — Itaú
- Máquina azul — Gás do Povo

## sales

Cabeçalho das vendas.

Guarda informações como:

- Cliente
- Canal
- Forma de pagamento principal
- Total
- Status
- Data da venda
- Observações

## sale_items

Itens vendidos.

Campos importantes:

- Produto
- Quantidade
- Valor unitário
- Total
- Tipo da venda, como troca, vazio/casco ou cheio sem retorno
- Informação se houve retorno de vazio

## sale_payments

Pagamentos da venda.

Permite pagamento dividido.

Exemplo:

```txt
Venda #X
- Dinheiro R$ 91,00
- Débito R$ 24,00
```

## stock_balances

Saldo atual de estoque por produto.

Campos principais:

- `full_qty` — cheios
- `empty_qty` — vazios
- `exchange_qty` — em troca
- `hub_pending_qty` — HUB a retornar

## stock_movements

Histórico de movimentações de estoque.

Registra:

- Tipo de movimentação
- Produto
- Alteração em cheios
- Alteração em vazios
- Alteração em troca
- Alteração em HUB
- Motivo
- Usuário
- Referência da venda/chegada/ajuste

## purchases

Chegadas de gás/compras.

Campos importantes:

- Número da chegada
- Fornecedor
- Data
- Frete
- Total
- Status de exclusão lógica

## purchase_items

Itens da chegada.

Exemplo:

```txt
117x Botijão P13
```

## expenses

Despesas da loja.

Campos esperados:

- Descrição
- Valor
- Vencimento
- Data de pagamento
- Status
- Categoria

## vehicles e vehicle_expenses

Controle de veículos e despesas relacionadas, como abastecimento.

## calendar_events

Eventos e lembretes operacionais.

Exemplos:

- Retorno HUB
- Despesa a pagar
- Evento manual
- Lembrete operacional

## settings

Configurações operacionais.

Exemplos:

- Taxa de entrega Gás do Povo
- Alerta de estoque baixo
- Histórico inicial de cheios sem retorno
- Parâmetros de segurança operacional
- Configurações em `extra`

## audit_logs

Histórico de alterações críticas.

Deve registrar:

- Quem alterou
- O que alterou
- Antes
- Depois
- Motivo
- Data/hora

## Observações importantes

- Tabelas operacionais devem usar `company_id`.
- Soft delete deve ser preferido em vez de exclusão definitiva.
- Relatórios devem ignorar registros com `is_deleted = true` quando aplicável.

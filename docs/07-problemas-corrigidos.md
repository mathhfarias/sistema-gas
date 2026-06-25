# 07 — Histórico de Problemas Corrigidos

Este arquivo registra problemas importantes já tratados no sistema.

## Exposição de `.env` no GitHub

Problema:

- Variáveis de ambiente foram versionadas.
- Incluíam `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e senha do banco.

Correções realizadas:

- `.env` removido do versionamento atual.
- `.gitignore` atualizado.
- `.env.example` criado.
- Senha do banco trocada.
- Histórico do GitHub limpo com `git-filter-repo`.

## Rota `/chegada-gas` quebrada

Problema:

- A URL redirecionava para Dashboard sem erro claro.

Correção:

- Rota ajustada.
- Rota inválida passou a exibir página não encontrada.

## Auth duplicado

Problema:

- Evento `SIGNED_IN` disparava mais de uma vez.

Correção:

- Listener de autenticação ajustado para evitar duplicidade e fazer unsubscribe corretamente.

## Botões sem acessibilidade

Problema:

- Botões iconográficos sem texto e sem `aria-label`.

Correção:

- `aria-label` adicionado em botões principais.

## Chegada de gás alterando estoque indevidamente

Problema:

- Alteração de valor/frete em chegada baixava vazios novamente.

Correção:

- Edição financeira deixou de movimentar estoque.
- Estoque só muda quando produto/quantidade são alterados ou quando há exclusão operacional.

## Duplicidade de chegada de gás

Problema:

- Chegadas duplicadas geravam estoque incorreto.

Correção:

- Soft delete para chegadas.
- Relatórios devem ignorar chegadas excluídas.
- Estoque físico foi usado como referência final quando reversão automática ficou bloqueada por regra de negócio.

## Pagamento dividido

Problema:

- Cliente podia pagar parte em uma forma e parte em outra, mas o sistema não registrava.

Correção:

- Criada estrutura `sale_payments`.
- Tela passou a aceitar pagamento dividido.

## Despesas em atraso fora do mês

Problema:

- Dashboard mostrava despesa atrasada, mas Despesas filtradas no mês atual não mostravam.

Correção:

- Alerta para pendências de meses anteriores.

## Data divergente por timezone

Problema:

- Uma despesa aparecia com datas diferentes em telas diferentes.

Correção:

- Tratamento de datas puras `YYYY-MM-DD` como data local.

## Faturamento cortado no Dashboard

Problema:

- Valor principal do card aparecia com reticências.

Correção:

- Ajuste visual para exibir valor completo.

# 08 — Roadmap de Melhorias

Este roadmap organiza as próximas evoluções recomendadas.

## Prioridade 1 — RLS Operacional

Implementar RLS completa nas tabelas:

- sales
- sale_items
- sale_payments
- stock_balances
- stock_movements
- purchases
- purchase_items
- expenses
- products
- suppliers
- customers
- vehicles
- vehicle_expenses
- calendar_events

Objetivo:

- Garantir que permissões existam também no banco, não só na interface.

## Prioridade 2 — Auditoria forte

Criar auditoria obrigatória para:

- Cancelar venda.
- Editar venda antiga.
- Ajustar estoque.
- Excluir chegada.
- Alterar preço de produto.
- Alterar configurações.
- Alterar role de usuário.

Cada ação deve registrar:

- Usuário.
- Data/hora.
- Ação.
- Valor anterior.
- Valor novo.
- Motivo.

## Prioridade 3 — Fechamento diário

Criar tela de Fechamento do Dia com:

- Total vendido.
- Quantidade de botijões.
- Dinheiro.
- Pix.
- Crédito por máquina.
- Débito por máquina.
- Gás do Povo.
- Vale Hub.
- Taxas.
- Estoque físico informado.
- Diferença físico x digital.
- Observação do fechamento.

Isso deve reduzir a necessidade de SQL manual para inserir vendas esquecidas.

## Prioridade 4 — Prevenção de duplicidade

Criar alertas automáticos:

- Possível chegada duplicada.
- Venda repetida em curto intervalo.
- Mesmo valor, forma e horário próximos.
- Chegada maior que vazios disponíveis.
- Alteração de chegada que impacta estoque.

## Prioridade 5 — Relatórios gerenciais

Melhorias recomendadas:

- Lucro por período.
- Custo médio por botijão.
- Custo com frete.
- Margem por canal.
- Vendas por funcionário.
- Vendas por forma de pagamento.
- Vendas por máquina.
- Evolução de estoque.
- HUB a retornar.
- Botijões sem retorno.
- Casco/vazio vendidos.

## Prioridade 6 — Segurança de integração

Antes de Nota Fiscal e Ultragaz:

- Criar backend/serverless para integrações.
- Nunca expor tokens no React.
- Criar logs de emissão.
- Criar status de nota.
- Criar fluxo de cancelamento.
- Criar permissões específicas para emissão fiscal.

## Prioridade 7 — Experiência do usuário

Melhorias visuais/operacionais:

- Mensagens de erro mais claras.
- Confirmações antes de ações críticas.
- Atalhos de lançamento rápido.
- Busca melhorada.
- Filtros salvos por usuário.
- Exportação PDF/Excel.
- Tela de ajuda operacional.

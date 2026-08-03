# Parcelamento InfinitePay no GásMaster

## O que foi adicionado

Na tela **Nova Venda**, o botão **Parcelar pagamento** abre uma modalidade própria para cartão de crédito. O lançamento grava:

- forma de pagamento e maquininha;
- bandeira;
- quantidade de parcelas (2x a 12x);
- valor bruto pago pelo cliente;
- taxa percentual e valor da taxa;
- valor líquido a ser creditado;
- plano e data prevista de recebimento;
- origem da taxa usada no momento da venda.

A taxa aplicada fica salva em `sale_payments`. Assim, uma atualização futura da tabela de taxas não altera o histórico de vendas anteriores.

## Taxas pré-configuradas

A migração inclui um snapshot das taxas da InfinitePay para **Maquininha/InfiniteTap**, plano inicial e recebimento em **1 dia útil**, consultado em 03/08/2026. A tabela oficial estava disponível em:

https://www.infinitepay.io/taxas

As taxas são inseridas somente para maquininhas cujo nome, marca ou provedor contenha `InfinitePay` ou `CloudWalk`. Para outras maquininhas, a taxa pode ser informada manualmente na venda ou cadastrada em `card_machine_rates`.

Exemplo validado:

- venda: R$ 125,00;
- Visa/Mastercard em 2x: 5,39%;
- taxa: R$ 6,74;
- líquido: R$ 118,26.

## Publicação

1. No Supabase, execute `supabase/migrations/20260803_add_installment_payments.sql`.
2. Confirme que a maquininha InfinitePay está ativa e identificada por nome, marca ou provedor.
3. Publique o front-end atualizado.
4. Faça uma venda de teste e confira o novo box **Vendas Parceladas** em **Relatórios**.

## Observações financeiras

O faturamento bruto continua sendo o valor pago pelo cliente. A taxa da operadora aparece separadamente no DRE e reduz o lucro líquido. O relatório mostra quantidade de vendas parceladas, valor bruto, taxas e valor líquido.

A previsão de um dia útil ignora feriados bancários; ela considera apenas fins de semana. A data realmente creditada pode variar conforme regras e processamento da operadora.

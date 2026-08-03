# Teste local — Parcelamento InfinitePay

Esta versão foi montada a partir do ZIP funcional enviado em 03/08/2026.

## 1. Atualize o banco de teste/produção

Antes de abrir as telas modificadas, entre no **Supabase → SQL Editor**, copie todo o conteúdo do arquivo:

`EXECUTAR_NO_SUPABASE_ANTES.sql`

e execute uma vez. O script cria os campos de parcelamento, a tabela de taxas e cadastra a tabela da InfinitePay para maquininhas identificadas como `InfinitePay` ou `CloudWalk`.

## 2. Rode o projeto

Abra o terminal dentro da pasta do projeto e execute:

```bash
npm install
npm start
```

Também funciona com:

```bash
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

> O `.env.local` desta pasta veio do projeto funcional enviado pelo proprietário. Não publique esse arquivo no GitHub.

## 3. Teste principal

1. Entre em **Nova venda**.
2. Selecione um produto de R$ 125,00.
3. Clique em **Parcelar pagamento**.
4. Selecione **Cartão de Crédito**.
5. Selecione a maquininha **InfinitePay**.
6. Selecione **Visa** e **2x**.
7. Confira a prévia esperada:
   - cliente paga: **R$ 125,00**;
   - parcelas: **2x de R$ 62,50**;
   - taxa: **5,39% / R$ 6,74**;
   - crédito líquido: **R$ 118,26**.
8. Registre a venda.
9. Abra **Vendas** e confirme que aparece `2x` e o valor líquido.
10. Abra **Relatórios**, selecione o período da venda e confira o box **Vendas Parceladas**.

## 4. Testes de regressão

Antes de publicar, confirme também:

- venda normal em dinheiro ou Pix;
- venda no débito/crédito à vista;
- pagamento dividido;
- edição de uma venda existente;
- baixa de estoque de cheios e entrada de vazios;
- relatório de vendas e DRE.

## 5. Observações

- A previsão de um dia útil ignora feriados e considera apenas sábado e domingo.
- A taxa usada fica gravada em `sale_payments`, preservando o histórico.
- A taxa pode ser alterada manualmente no lançamento quando a operadora apresentar um valor diferente.

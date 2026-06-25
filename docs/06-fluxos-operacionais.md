# 06 — Fluxos Operacionais

## Lançar venda normal

1. Acessar Nova Venda.
2. Selecionar produto P13.
3. Selecionar tipo: Gás com troca.
4. Selecionar forma de pagamento.
5. Informar canal: Rua ou Portaria.
6. Finalizar venda.

Resultado esperado no estoque:

```txt
Cheios: -1
Vazios: +1
```

## Lançar venda com pagamento dividido

1. Acessar Nova Venda.
2. Informar produto e valor.
3. Ativar pagamento dividido.
4. Informar cada forma de pagamento e valor.
5. Conferir se a soma bate com o total.
6. Finalizar.

Exemplo:

```txt
Dinheiro: R$ 91,00
Débito: R$ 24,00
Total: R$ 115,00
```

## Lançar Gás do Povo

1. Selecionar P13.
2. Forma de pagamento: Gás do Povo.
3. Usar máquina azul quando aplicável.
4. Canal rua pode incluir taxa.
5. Finalizar venda.

P45 não deve ser vendido nessa modalidade.

## Lançar Vale Hub / Ultragaz

1. Selecionar P13.
2. Forma de pagamento: Vale Hub / Ultragaz.
3. Finalizar venda.

Resultado esperado:

```txt
Cheios: -1
Vazios: +1
HUB a retornar: +1
```

## Baixar HUB

Usado quando o retorno operacional ao HUB/Ultragaz é concluído.

Resultado esperado:

```txt
HUB a retornar: -1
Cheios: 0
Vazios: 0
```

## Registrar chegada de gás

1. Acessar Chegada de Gás.
2. Selecionar fornecedor.
3. Informar produto e quantidade.
4. Informar valor unitário.
5. Informar frete.
6. Conferir valor unitário com frete.
7. Salvar.

Resultado esperado:

```txt
Cheios: +quantidade
Vazios: -quantidade
```

## Alterar chegada de gás

Alterações financeiras não podem mexer no estoque:

- Frete
- Valor unitário
- Fornecedor
- Observação

Alterações que podem mexer no estoque:

- Quantidade
- Produto
- Exclusão operacional

## Excluir chegada duplicada

Quando uma chegada foi duplicada:

1. Identificar qual é a válida.
2. Marcar a duplicada como excluída.
3. Reverter estoque, se necessário.
4. Manter histórico/auditoria.
5. Garantir que relatórios ignorem a excluída.

## Fechamento diário

Conferir:

- Quantidade de botijões vendidos.
- Faturamento por forma de pagamento.
- Totais por máquina.
- Gás do Povo.
- Vale Hub.
- Taxas de entrega.
- Estoque físico x digital.
- Diferenças encontradas.

## Ajuste de estoque

Ajustes devem ser exceção. Quando acontecerem, registrar:

- Estoque físico contado.
- Estoque digital antes.
- Motivo do ajuste.
- Usuário responsável.
- Data e hora.

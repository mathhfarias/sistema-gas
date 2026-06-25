# 03 — Regras de Negócio

Este documento registra as regras operacionais conhecidas do Sistema Gás.

## Produtos principais

### Botijão P13

Produto principal da operação.

Controles de estoque:

- Cheios
- Vazios
- Em troca
- HUB a retornar

### Botijão P45

Produto controlado separadamente. Não deve ser vendido como Gás do Povo.

## Tipos de venda de botijão

### Venda normal com troca

Usada quando o cliente compra o gás e devolve o botijão vazio.

Regra de estoque:

```txt
Cheios: -1
Vazios: +1
Troca: 0
HUB: 0
```

### Venda de vazio / casco

Usada quando o cliente compra apenas o botijão vazio/casco para ter uma base de troca.

Preço operacional definido:

```txt
R$ 200,00
```

Regra de estoque:

```txt
Cheios: 0
Vazios: -1
```

### Venda de cheio sem retorno

Usada quando o cliente compra o botijão cheio e não devolve vazio.

Preço operacional definido:

```txt
R$ 300,00
```

Regra de estoque:

```txt
Cheios: -1
Vazios: 0
```

### Venda Gás do Povo

Regras conhecidas:

- Permitido para P13.
- P45 deve ter valor de Gás do Povo zerado/bloqueado.
- Pode ter taxa de entrega quando for venda de rua.
- Normalmente associado à máquina azul.

Exemplos de valores usados:

```txt
R$ 100,23
R$ 107,02
R$ 120,23 quando inclui taxa de R$ 20,00
R$ 127,02 quando inclui taxa de R$ 20,00
```

Regra de estoque, quando há troca normal:

```txt
Cheios: -1
Vazios: +1
```

### Vale Hub / Ultragaz

Venda operacional ligada ao portal HUB/Ultragaz.

Regras definidas:

- Não usa maquininha comum.
- Baixa 1 cheio.
- Entra 1 vazio.
- Soma 1 em HUB a retornar.
- Baixar HUB depois não mexe em cheios/vazios; apenas reduz o contador HUB.

Regra de estoque:

```txt
Cheios: -1
Vazios: +1
HUB a retornar: +1
```

Baixa de HUB:

```txt
Cheios: 0
Vazios: 0
HUB a retornar: -1
```

## Pagamento dividido

Uma venda pode ser paga com mais de uma forma de pagamento.

Exemplo:

```txt
Dinheiro: R$ 100,00
Pix: R$ 25,00
Total: R$ 125,00
```

O estoque deve movimentar apenas uma vez por venda, independentemente da quantidade de formas de pagamento.

## Chegada de gás

Regra principal:

```txt
Toda chegada aumenta cheios e subtrai vazios na mesma quantidade recebida.
```

Exemplo:

```txt
Chegou 103 P13:
Cheios: +103
Vazios: -103
```

A alteração de informações financeiras da chegada não deve mexer no estoque.

Não mexem no estoque:

- Valor unitário
- Frete
- Fornecedor
- Observação
- Data, quando não altera a quantidade/produto

Mexem no estoque:

- Nova chegada
- Alteração de quantidade
- Alteração de produto
- Exclusão operacional da chegada, quando aplicável

## Frete na chegada

A tela calcula o valor unitário com frete:

```txt
Valor unitário com frete = (valor dos produtos + frete) / quantidade
```

Exemplo:

```txt
Valor dos botijões: R$ 8.318,00
Frete: R$ 661,72
Quantidade: 103
Total: R$ 8.979,72
Unitário com frete: R$ 87,18
```

## Troca

Quando um botijão cheio entra para troca, ele deve sair dos cheios e entrar em troca.

```txt
Cheios: -1
Troca: +1
```

Essa regra evita que o sistema mantenha um cheio disponível que fisicamente não pode ser vendido.

## Despesas em atraso

Despesas atrasadas de meses anteriores devem continuar visíveis no contexto do mês atual, ou pelo menos gerar alerta claro. O usuário não pode pensar que está tudo em dia apenas porque o filtro mensal não exibe vencimentos antigos.

# 10 — Checklist de Fechamento Diário

Este checklist ajuda a fechar a operação do dia e reduzir diferenças entre caderno, sistema e estoque físico.

## 1. Conferir vendas do sistema

No módulo Vendas, filtrar o dia atual e anotar:

- Quantidade de botijões vendidos.
- Faturamento total.
- Vendas canceladas.
- Taxas de entrega.

## 2. Conferir por forma de pagamento

Comparar sistema x caixa/maquininhas:

```txt
Dinheiro:
Pix:
Crédito máquina preta:
Débito máquina preta:
Crédito máquina laranja:
Débito máquina laranja:
Máquina azul / Gás do Povo:
Vale Hub / Ultragaz:
```

## 3. Conferir pagamentos divididos

Verificar se vendas marcadas com divisão no caderno foram lançadas como pagamento dividido no sistema.

Exemplo:

```txt
Dinheiro R$ 91,00 + Débito R$ 24,00 = Venda R$ 115,00
```

## 4. Conferir Gás do Povo

Verificar:

- Quantidade de vendas.
- Vendas com taxa.
- Total da máquina azul.
- Se não houve P45 vendido como Gás do Povo.

## 5. Conferir Vale Hub

Verificar:

- Quantidade de vendas Hub.
- Total financeiro, quando aplicável.
- HUB a retornar.

Regra esperada:

```txt
Venda Hub: -1 cheio, +1 vazio, +1 HUB
Baixa Hub: -1 HUB
```

## 6. Conferir estoque físico

Contar fisicamente:

```txt
P13 cheios:
P13 vazios:
P13 em troca:
P13 HUB:
P45 cheios:
P45 vazios:
```

Comparar com Dashboard/Estoque.

## 7. Registrar diferenças

Se houver diferença:

- Não ajustar sem motivo.
- Procurar vendas esquecidas.
- Procurar chegada duplicada.
- Procurar venda cancelada/editada.
- Procurar ajuste de troca/HUB.

## 8. Fechar o dia

Ao final, registrar:

```txt
Data:
Responsável:
Total de vendas:
Total financeiro:
Estoque físico:
Diferenças encontradas:
Ajustes feitos:
Observações:
```

## Melhor melhoria futura

Criar uma tela própria de Fechamento Diário para substituir este checklist manual e gerar relatório automático.

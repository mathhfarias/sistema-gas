# 05 — RLS e Segurança

## Objetivo da segurança

A segurança do Sistema Gás deve proteger:

- Dados da empresa.
- Estoque.
- Vendas.
- Chegadas de gás.
- Despesas.
- Usuários e permissões.
- Configurações sensíveis.
- Futuras integrações fiscais e Ultragaz.

## Roles do sistema

### admin

Acesso total.

Pode:

- Gerenciar usuários.
- Alterar configurações.
- Acessar todas as telas.
- Alterar dados críticos.
- Consultar auditoria.

### manager

Perfil gerencial.

Pode:

- Acessar operação e relatórios.
- Corrigir vendas, estoque e despesas, conforme regras.
- Consultar auditoria.

Não deve:

- Gerenciar usuários críticos.
- Alterar dados sensíveis da empresa sem autorização.

### operator

Perfil de funcionário operacional.

Pode:

- Registrar vendas.
- Consultar estoque.
- Consultar clientes.
- Acessar calendário operacional, se autorizado.

Não deve:

- Alterar configurações.
- Excluir chegada.
- Alterar produtos/preços.
- Ajustar estoque manualmente sem permissão.

### viewer

Perfil de consulta.

Pode:

- Visualizar informações autorizadas.

Não pode:

- Criar, editar, excluir ou cancelar registros.

## RLS já entregue

A primeira camada de RLS cobre:

### companies

Regra:

```txt
Usuário só acessa a própria empresa.
Admin e gerente podem atualizar dados da empresa.
```

### profiles

Regra:

```txt
Usuários acessam perfis da própria empresa.
Admin gerencia roles e status de usuários.
```

### settings

Regra:

```txt
Admin e gerente podem alterar configurações.
Usuários autorizados podem consultar configurações da própria empresa.
```

### audit_logs

Regra:

```txt
Usuários da empresa podem consultar logs permitidos.
Sistema pode inserir logs da própria empresa.
```

## Funções auxiliares

Foram previstas funções auxiliares no banco:

```txt
auth_company_id()
auth_user_role()
auth_has_role(...)
```

Essas funções servem para simplificar políticas RLS e validar permissões no banco.

## RLS ainda recomendada

A próxima camada deve proteger tabelas operacionais:

- `sales`
- `sale_items`
- `sale_payments`
- `stock_balances`
- `stock_movements`
- `purchases`
- `purchase_items`
- `expenses`
- `products`
- `suppliers`
- `customers`
- `vehicles`
- `vehicle_expenses`
- `calendar_events`

## Regras recomendadas para a próxima camada

### Vendas

- Admin, gerente e operador podem criar venda.
- Viewer apenas consulta.
- Cancelamento só admin/gerente.
- Edição retroativa só admin/gerente.

### Estoque

- Consulta liberada conforme perfil.
- Ajuste manual só admin/gerente.
- Movimentações automáticas devem ser registradas por venda/chegada.

### Chegada de gás

- Criar chegada: admin/gerente.
- Editar valor/frete: admin/gerente.
- Excluir chegada: admin.
- Operador não deve excluir chegada.

### Produtos e preços

- Consulta liberada conforme perfil.
- Alteração de preço só admin/gerente.

### Despesas

- Consulta conforme perfil.
- Criação/edição: admin/gerente.
- Pagamento/baixa: admin/gerente.

## Variáveis sensíveis

Nunca versionar:

- `.env`
- `.env.local`
- Senha do banco
- Service role
- Tokens fiscais
- Tokens de integração

O histórico do Git já foi limpo após exposição anterior de `.env`, e a senha do banco foi trocada.

## Recomendação de segurança

Para qualquer integração futura:

- Não chamar API fiscal diretamente do React.
- Não colocar token da Ultragaz no front-end.
- Usar backend ou função serverless.
- Registrar logs de emissão, cancelamento e erro.

# 09 — Guia de Manutenção

## Fluxo oficial de alteração

Nunca alterar direto na `main`.

```bash
cd ~/Desktop/sistema-gas

git checkout main
git pull origin main
git checkout -b nome-da-branch
```

Depois da alteração:

```bash
npm install
npm run build
npm run dev
```

Se estiver tudo certo:

```bash
git status
git add .
git commit -m "mensagem clara"
git push -u origin nome-da-branch
```

Abrir Pull Request no GitHub e conferir deploy preview no Netlify.

## Cuidados com arquivos zip

Ao copiar arquivos de um zip, sempre conferir onde está o `package.json`.

```bash
cd ~/Desktop
find nome-da-pasta-extraida -maxdepth 5 -name "package.json" -print
```

Se o `package.json` estiver em pasta aninhada, copiar da pasta correta.

Evitar `rsync --delete` sem confirmar o caminho, porque ele pode remover o `package.json` da raiz do projeto.

## Comandos úteis

### Ver branch atual

```bash
git branch --show-current
```

### Ver status

```bash
git status
```

### Atualizar main

```bash
git checkout main
git pull origin main
```

### Testar build

```bash
npm run build
```

### Rodar local

```bash
npm run dev
```

## Variáveis de ambiente

O `.env.local` deve ficar apenas na máquina local.

Nunca versionar:

```txt
.env
.env.local
.env.production
.env.development
```

O `.gitignore` deve conter:

```txt
.env
.env.local
.env.production
.env.development
.env.*.local
```

## Migrations Supabase

Ao criar migration:

1. Salvar em `supabase/migrations/`.
2. Rodar no Supabase SQL Editor.
3. Fazer commit da migration.
4. Documentar o que ela altera.

## Quando algo der errado no deploy

Conferir:

- Netlify Deploys.
- Log do build.
- Variáveis de ambiente no Netlify.
- Se `package.json` está na raiz.
- Se a branch correta foi mergeada.

## Quando algo der errado no estoque

1. Conferir estoque físico.
2. Conferir `stock_balances`.
3. Conferir `stock_movements`.
4. Identificar venda/chegada/ajuste que causou diferença.
5. Corrigir saldo atual com SQL claro e motivo registrado.

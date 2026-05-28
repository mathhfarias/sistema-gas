// Formatar moeda em Real Brasileiro
export function formatCurrency(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

// Formatar número para moeda sem símbolo
export function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '0,00'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Parsear string de moeda para número
export function parseCurrency(str) {
  if (!str) return 0
  const cleaned = String(str)
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned) || 0
}

// Formatar data para pt-BR
export function formatDate(date, options = {}) {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  })
}

// Formatar data e hora
export function formatDateTime(date) {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d)) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Hoje como string YYYY-MM-DD
export function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// Início e fim do mês atual
export function currentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

// Máscara de CPF/CNPJ
export function maskCpfCnpj(value) {
  const v = String(value || '').replace(/\D/g, '')
  if (v.length <= 11) {
    return v
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return v
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// Máscara de telefone
export function maskPhone(value) {
  const v = String(value || '').replace(/\D/g, '')
  if (v.length <= 10) {
    return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  }
  return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

// Máscara de moeda ao digitar
export function maskCurrency(value) {
  const v = String(value || '').replace(/\D/g, '')
  if (!v) return ''
  const num = parseFloat(v) / 100
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Truncar texto
export function truncate(str, len = 30) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

// Categorias de despesas
export const EXPENSE_CATEGORIES = {
  salary: 'Salário',
  rent: 'Aluguel',
  electricity: 'Conta de Luz',
  water: 'Conta de Água',
  internet: 'Internet',
  fuel: 'Combustível',
  maintenance: 'Manutenção',
  tax: 'Impostos',
  other: 'Outros',
}

// Tipos de cliente
export const CUSTOMER_TYPES = {
  individual: 'Pessoa Física',
  daycare: 'Creche',
  company: 'Empresa',
  fixed: 'Cliente Fixo',
  occasional: 'Avulso',
}

// Status de despesa
export const EXPENSE_STATUS = {
  pending: { label: 'Pendente', color: 'yellow' },
  paid: { label: 'Pago', color: 'green' },
  overdue: { label: 'Atrasado', color: 'red' },
  cancelled: { label: 'Cancelado', color: 'gray' },
}

// Formas de pagamento
export const PAYMENT_TYPES = {
  cash: 'Dinheiro',
  pix: 'Pix',
  credit: 'Crédito',
  debit: 'Débito',
  vale_hub: 'Vale Hub',
  gas_povo: 'Gás do Povo',
  other: 'Outro',
}

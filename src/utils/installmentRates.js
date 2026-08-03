/**
 * Taxas padrão InfinitePay — Maquininha/InfiniteTap, plano inicial (até R$ 20 mil/mês),
 * recebimento em 1 dia útil. Snapshot da tabela oficial consultada em 03/08/2026.
 *
 * As taxas efetivamente usadas pela venda são gravadas em sale_payments. A tabela
 * card_machine_rates do Supabase tem prioridade sobre estes valores de contingência.
 */
export const INFINITEPAY_INITIAL_RATES = {
  visa_mastercard: {
    1: 3.15,
    2: 5.39,
    3: 6.12,
    4: 6.85,
    5: 7.57,
    6: 8.28,
    7: 8.99,
    8: 9.69,
    9: 10.38,
    10: 11.06,
    11: 11.74,
    12: 12.40,
  },
  other: {
    1: 4.91,
    2: 6.47,
    3: 7.20,
    4: 7.92,
    5: 8.63,
    6: 9.33,
    7: 10.03,
    8: 10.72,
    9: 11.41,
    10: 12.08,
    11: 12.75,
    12: 13.41,
  },
}

export const CARD_BRAND_OPTIONS = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'elo', label: 'Elo' },
  { value: 'amex', label: 'American Express' },
  { value: 'hiper', label: 'Hiper' },
  { value: 'hipercard', label: 'Hipercard' },
]

export function cardBrandGroup(cardBrand) {
  return ['visa', 'mastercard'].includes(String(cardBrand || '').toLowerCase())
    ? 'visa_mastercard'
    : 'other'
}

export function isInfinitePayMachine(machine) {
  const text = [machine?.name, machine?.brand, machine?.provider]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes('infinite') || text.includes('cloudwalk')
}

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function getStoredOrDefaultRate({ rates = [], machine, cardBrand, installments }) {
  const group = cardBrandGroup(cardBrand)
  const count = Number(installments || 1)
  const stored = rates.find(rate =>
    rate.card_machine_id === machine?.id &&
    rate.receipt_plan === '1_business_day' &&
    rate.card_brand_group === group &&
    Number(rate.installments) === count &&
    rate.is_active !== false
  )

  if (stored) {
    return {
      percentage: Number(stored.fee_percentage || 0),
      source: stored.source || 'Taxa configurada no Supabase',
      rateId: stored.id,
      receiptDays: Number(stored.receipt_days || 1),
    }
  }

  if (isInfinitePayMachine(machine)) {
    return {
      percentage: Number(INFINITEPAY_INITIAL_RATES[group]?.[count] || 0),
      source: 'InfinitePay — tabela oficial consultada em 03/08/2026',
      rateId: null,
      receiptDays: 1,
    }
  }

  return { percentage: 0, source: 'Taxa informada manualmente', rateId: null, receiptDays: 1 }
}

export function nextBusinessDateISO(value = new Date(), businessDays = 1) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  let remaining = Math.max(0, Number(businessDays || 0))
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) remaining -= 1
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

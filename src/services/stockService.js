import { supabase } from '../lib/supabase'

function normalizeQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? Math.trunc(quantity) : 0
}

function validatePositiveQuantity(quantity, label = 'quantidade') {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: { message: `Informe uma ${label} maior que zero.` } }
  }
  return null
}

export const stockService = {
  /**
   * Retorna saldo atual do estoque por produto.
   */
  async getBalances(company_id) {
    return supabase
      .from('stock_balances')
      .select('*, products(id, name, code, min_stock, is_cylinder)')
      .eq('company_id', company_id)
      .order('products(name)')
  },

  /**
   * Registra chegada de gás (compra).
   *
   * Regra atual:
   * - Entrada de cheios: full_qty aumenta.
   * - Vazios devolvidos no ato da compra: empty_qty diminui.
   * - Frete fica registrado na compra e entra no custo total da chegada.
   *
   * Para troca enviada antes ao fornecedor, usar receiveFromExchange().
   */
  async registerPurchase(payload) {
    const {
      company_id,
      supplier_id,
      supplier_name,
      items, // [{ product_id, product_name, quantity, unit_cost, empty_returned }]
      notes,
      purchased_at,
      freight_cost = 0,
      created_by,
    } = payload

    const items_cost = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
    const normalizedFreightCost = Number(freight_cost || 0)
    const total_cost = items_cost + normalizedFreightCost

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        company_id,
        supplier_id,
        supplier_name,
        total_cost,
        freight_cost: normalizedFreightCost,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        created_by,
      })
      .select()
      .single()

    if (purchaseError) return { error: purchaseError }

    const purchaseItems = items.map(i => ({
      purchase_id: purchase.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_cost: i.unit_cost,
      total_cost: i.quantity * i.unit_cost,
      empty_returned: i.empty_returned || 0,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) return { error: itemsError }

    for (const item of items) {
      const { error } = await supabase.from('stock_movements').insert({
        company_id,
        product_id: item.product_id,
        type: 'purchase',
        full_qty_change: item.quantity,
        empty_qty_change: -(item.empty_returned || 0),
        exchange_qty_change: 0,
        reference_id: purchase.id,
        reference_type: 'purchase',
        performed_by: created_by,
      })

      if (error) return { error }
    }

    return { data: purchase, error: null }
  },

  /**
   * Ajuste manual de estoque.
   */
  async manualAdjustment({
    company_id,
    product_id,
    full_qty_change,
    empty_qty_change,
    exchange_qty_change,
    hub_pending_qty_change,
    reason,
    performed_by,
  }) {
    if (!reason?.trim()) {
      return { error: { message: 'O motivo do ajuste é obrigatório.' } }
    }

    const normalizedExchangeChange = normalizeQuantity(exchange_qty_change)
    const normalizedFullChange = normalizeQuantity(full_qty_change)

    // Regra operacional: sempre que um botijão entrar em troca, ele sai do saldo de cheios.
    // Isso evita ficar com 1 cheio a mais quando um botijão cheio é separado por vazamento/defeito.
    const finalFullChange = normalizedExchangeChange > 0 && normalizedFullChange === 0
      ? -normalizedExchangeChange
      : normalizedFullChange

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'adjustment',
      full_qty_change: finalFullChange,
      empty_qty_change: normalizeQuantity(empty_qty_change),
      exchange_qty_change: normalizedExchangeChange,
      hub_pending_qty_change: normalizeQuantity(hub_pending_qty_change),
      reason,
      performed_by,
    })
  },

  /**
   * Envia botijões cheios para troca com fornecedor.
   * Fluxo: cheios diminui, em troca aumenta.
   */
  async sendToExchange({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'exchange_out',
      full_qty_change: -qty,
      empty_qty_change: 0,
      exchange_qty_change: qty,
      hub_pending_qty_change: 0,
      reason: reason?.trim() || 'Envio de botijão cheio para troca',
      performed_by,
    })
  },

  /**
   * Recebe botijões cheios vindos da troca.
   * Fluxo: em troca diminui, cheios aumenta.
   */
  async receiveFromExchange({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'exchange_in',
      full_qty_change: qty,
      empty_qty_change: 0,
      exchange_qty_change: -qty,
      hub_pending_qty_change: 0,
      reason: reason?.trim() || 'Recebimento de cheios da troca',
      performed_by,
    })
  },



  /**
   * Baixa botijões pendentes do Vale Hub / Ultragaz após retorno no portal.
   * Fluxo: HUB a retornar diminui. O saldo de vazios NÃO é alterado.
   */
  async returnHub({ company_id, product_id, quantity, reason, performed_by }) {
    const qty = normalizeQuantity(quantity)
    const invalid = validatePositiveQuantity(qty)
    if (invalid) return invalid

    return supabase.from('stock_movements').insert({
      company_id,
      product_id,
      type: 'hub_return',
      full_qty_change: 0,
      empty_qty_change: 0,
      exchange_qty_change: 0,
      hub_pending_qty_change: -qty,
      reason: reason?.trim() || 'Retorno realizado no portal HUB / Ultragaz',
      performed_by,
    })
  },

  /**
   * Histórico de movimentações.
   */
  async getMovements({ company_id, product_id, limit = 50, offset = 0 } = {}) {
    let query = supabase
      .from('stock_movements')
      .select('*, products(name, code), profiles(full_name)')
      .eq('company_id', company_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (product_id) query = query.eq('product_id', product_id)

    return query
  },
}

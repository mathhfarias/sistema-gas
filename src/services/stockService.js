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


function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function allocatePurchaseCosts(items, freightCost = 0, discountCredit = 0) {
  const normalizedItems = (items || []).map(item => {
    const quantity = normalizeQuantity(item.quantity)
    const rawTotal = Number(
      item.total_cost ??
      item.product_total ??
      (Number(item.unit_cost || 0) * quantity)
    )

    return {
      ...item,
      quantity,
      total_cost: roundMoney(rawTotal),
    }
  })

  const productsTotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + Number(item.total_cost || 0), 0)
  )
  const freight = roundMoney(freightCost)
  const discount = roundMoney(discountCredit)

  let freightAllocated = 0
  let discountAllocated = 0

  const calculatedItems = normalizedItems.map((item, index) => {
    const isLast = index === normalizedItems.length - 1
    const ratio = productsTotal > 0 ? item.total_cost / productsTotal : 0

    const freightShare = isLast
      ? roundMoney(freight - freightAllocated)
      : roundMoney(freight * ratio)

    const discountShare = isLast
      ? roundMoney(discount - discountAllocated)
      : roundMoney(discount * ratio)

    freightAllocated = roundMoney(freightAllocated + freightShare)
    discountAllocated = roundMoney(discountAllocated + discountShare)

    const finalTotal = roundMoney(item.total_cost + freightShare - discountShare)
    const grossUnit = item.quantity > 0 ? item.total_cost / item.quantity : 0
    const finalUnit = item.quantity > 0 ? finalTotal / item.quantity : 0

    return {
      ...item,
      unit_cost: roundMoney(grossUnit),
      freight_allocated: freightShare,
      discount_allocated: discountShare,
      final_total_cost: finalTotal,
      final_unit_cost: Number(finalUnit.toFixed(4)),
      empty_returned: item.quantity,
    }
  })

  return {
    items: calculatedItems,
    productsTotal,
    freight,
    discount,
    totalCost: roundMoney(productsTotal + freight - discount),
  }
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
      items,
      notes,
      purchased_at,
      freight_cost = 0,
      discount_credit = 0,
      created_by,
    } = payload

    const costs = allocatePurchaseCosts(items, freight_cost, discount_credit)

    if (!costs.items.length || costs.items.some(item => !item.product_id || item.quantity <= 0)) {
      return { error: { message: 'Informe produto e quantidade maior que zero em todos os itens.' } }
    }

    if (costs.items.some(item => item.total_cost <= 0)) {
      return { error: { message: 'Informe o valor total dos produtos em todos os itens.' } }
    }

    if (costs.discount < 0 || costs.totalCost < 0) {
      return { error: { message: 'Descontos/créditos não podem deixar o custo líquido da chegada negativo.' } }
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert({
        company_id,
        supplier_id,
        supplier_name,
        total_cost: costs.totalCost,
        freight_cost: costs.freight,
        discount_credit: costs.discount,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        created_by,
      })
      .select()
      .single()

    if (purchaseError) return { error: purchaseError }

    const purchaseItems = costs.items.map(item => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
      freight_allocated: item.freight_allocated,
      discount_allocated: item.discount_allocated,
      final_total_cost: item.final_total_cost,
      final_unit_cost: item.final_unit_cost,
      empty_returned: item.quantity,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) return { error: itemsError }

    for (const item of costs.items) {
      const { error } = await supabase.from('stock_movements').insert({
        company_id,
        product_id: item.product_id,
        type: 'purchase',
        full_qty_change: item.quantity,
        empty_qty_change: -item.quantity,
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
   * Altera uma chegada já registrada e ajusta o estoque pela diferença.
   *
   * Regra operacional:
   * - Cada item recebido aumenta cheios pela quantidade recebida.
   * - A mesma quantidade recebida baixa vazios automaticamente.
   * - Ao editar, não revertemos tudo; calculamos a diferença por produto para evitar estoque negativo temporário.
   */
  async updatePurchase(payload) {
    const {
      purchase_id,
      company_id,
      supplier_id,
      supplier_name,
      items,
      notes,
      purchased_at,
      freight_cost = 0,
      discount_credit = 0,
      created_by,
    } = payload

    if (!purchase_id) {
      return { error: { message: 'Compra/chegada não informada.' } }
    }

    const costs = allocatePurchaseCosts(items, freight_cost, discount_credit)
    const normalizedItems = costs.items

    if (!normalizedItems.length || normalizedItems.some(item => !item.product_id || item.quantity <= 0)) {
      return { error: { message: 'Informe produto e quantidade maior que zero em todos os itens.' } }
    }

    if (normalizedItems.some(item => item.total_cost <= 0)) {
      return { error: { message: 'Informe o valor total dos produtos em todos os itens.' } }
    }

    if (costs.discount < 0 || costs.totalCost < 0) {
      return { error: { message: 'Descontos/créditos não podem deixar o custo líquido da chegada negativo.' } }
    }

    // Estoque só muda quando produto ou quantidade mudarem.
    const { data: oldItems, error: oldItemsError } = await supabase
      .from('purchase_items')
      .select('product_id, quantity')
      .eq('purchase_id', purchase_id)

    if (oldItemsError) return { error: oldItemsError }

    const currentByProduct = new Map()
    for (const item of oldItems || []) {
      const key = item.product_id
      const quantity = normalizeQuantity(item.quantity)
      const current = currentByProduct.get(key) || { full: 0, empty: 0, exchange: 0, hub: 0 }
      current.full += quantity
      current.empty -= quantity
      currentByProduct.set(key, current)
    }

    const desiredByProduct = new Map()
    for (const item of normalizedItems) {
      const key = item.product_id
      const current = desiredByProduct.get(key) || {
        product_id: item.product_id,
        product_name: item.product_name,
        full: 0,
        empty: 0,
        exchange: 0,
        hub: 0,
      }
      current.full += item.quantity
      current.empty -= item.quantity
      desiredByProduct.set(key, current)
    }

    const productIds = new Set([...currentByProduct.keys(), ...desiredByProduct.keys()])

    for (const productId of productIds) {
      const current = currentByProduct.get(productId) || { full: 0, empty: 0, exchange: 0, hub: 0 }
      const desired = desiredByProduct.get(productId) || { full: 0, empty: 0, exchange: 0, hub: 0 }
      const fullDiff = desired.full - current.full
      const emptyDiff = desired.empty - current.empty
      const exchangeDiff = desired.exchange - current.exchange
      const hubDiff = desired.hub - current.hub

      if (fullDiff || emptyDiff || exchangeDiff || hubDiff) {
        const { error: movementError } = await supabase.from('stock_movements').insert({
          company_id,
          product_id: productId,
          type: 'adjustment',
          full_qty_change: fullDiff,
          empty_qty_change: emptyDiff,
          exchange_qty_change: exchangeDiff,
          hub_pending_qty_change: hubDiff,
          reference_id: purchase_id,
          reference_type: 'purchase_edit',
          reason: 'Ajuste automático por alteração de quantidade/produto da chegada de gás',
          performed_by: created_by,
        })

        if (movementError) return { error: movementError }
      }
    }

    const { error: purchaseError } = await supabase
      .from('purchases')
      .update({
        supplier_id,
        supplier_name,
        total_cost: costs.totalCost,
        freight_cost: costs.freight,
        discount_credit: costs.discount,
        notes,
        purchased_at: purchased_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase_id)
      .eq('company_id', company_id)

    if (purchaseError) return { error: purchaseError }

    const { error: deleteItemsError } = await supabase
      .from('purchase_items')
      .delete()
      .eq('purchase_id', purchase_id)

    if (deleteItemsError) return { error: deleteItemsError }

    const purchaseItems = normalizedItems.map(item => ({
      purchase_id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
      freight_allocated: item.freight_allocated,
      discount_allocated: item.discount_allocated,
      final_total_cost: item.final_total_cost,
      final_unit_cost: item.final_unit_cost,
      empty_returned: item.quantity,
    }))

    const { error: itemsError } = await supabase
      .from('purchase_items')
      .insert(purchaseItems)

    if (itemsError) return { error: itemsError }

    return { data: { id: purchase_id }, error: null }
  },

  /**
   * Exclui uma chegada de gás de forma segura.
   *
   * A exclusão é lógica: a chegada fica marcada como excluída e deixa de aparecer na tela.
   * O estoque é revertido com base nos itens da chegada:
   * - remove os cheios que tinham entrado;
   * - devolve os vazios que tinham sido baixados.
   */
  async deletePurchase({ purchase_id, company_id, performed_by, reason }) {
    if (!purchase_id) {
      return { error: { message: 'Chegada não informada.' } }
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .select('id, purchase_number, is_deleted')
      .eq('id', purchase_id)
      .eq('company_id', company_id)
      .single()

    if (purchaseError) return { error: purchaseError }

    if (purchase?.is_deleted) {
      return { error: { message: 'Essa chegada já está excluída.' } }
    }

    const { data: oldItems, error: itemsError } = await supabase
      .from('purchase_items')
      .select('product_id, quantity')
      .eq('purchase_id', purchase_id)

    if (itemsError) return { error: itemsError }

    const byProduct = new Map()
    for (const item of oldItems || []) {
      if (!item.product_id) continue
      const quantity = normalizeQuantity(item.quantity)
      if (quantity <= 0) continue
      byProduct.set(item.product_id, (byProduct.get(item.product_id) || 0) + quantity)
    }

    const now = new Date().toISOString()
    const finalReason = reason?.trim() || `Exclusão da chegada #${purchase?.purchase_number || ''}`

    const movements = [...byProduct.entries()].map(([product_id, quantity]) => ({
      company_id,
      product_id,
      type: 'adjustment',
      full_qty_change: -quantity,
      empty_qty_change: quantity,
      exchange_qty_change: 0,
      hub_pending_qty_change: 0,
      reference_id: purchase_id,
      reference_type: 'purchase_delete',
      reason: `${finalReason}. Reversão de estoque da chegada excluída.`,
      performed_by,
      created_at: now,
    }))

    if (movements.length) {
      const { error: movementError } = await supabase
        .from('stock_movements')
        .insert(movements)

      if (movementError) return { error: movementError }
    }

    const { error: updateError } = await supabase
      .from('purchases')
      .update({
        is_deleted: true,
        deleted_at: now,
        deleted_by: performed_by,
        updated_at: now,
      })
      .eq('id', purchase_id)
      .eq('company_id', company_id)

    if (updateError) return { error: updateError }

    return { data: { id: purchase_id }, error: null }
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

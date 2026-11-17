// src/utils/exportSalesExcelReport.js

const MONEY = '"R$" #,##0.00'
const INT = '#,##0'
const DATE_TIME = 'dd/mm/yyyy hh:mm'

const n = value => {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const round = value => Math.round((n(value) + Number.EPSILON) * 100) / 100

function safeDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayKey(value) {
  const d = safeDate(value)
  if (!d) return ''
  const pad = v => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateBR(value) {
  const d = safeDate(value)
  return d ? d.toLocaleDateString('pt-BR') : '—'
}

function dateTimeBR(value) {
  const d = safeDate(value)
  return d ? d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—'
}

function statusLabel(value) {
  return ({ completed: 'Concluída', cancelled: 'Cancelada', pending: 'Pendente' })[value] || value || '—'
}

function channelLabel(value) {
  return ({ street: 'Rua', counter: 'Portaria', delivery: 'Entrega', other: 'Outro' })[value] || value || '—'
}

function kindLabel(value) {
  return ({
    exchange: 'Gás com troca',
    empty_cylinder: 'Vazio / casco',
    full_no_return: 'Cheio sem retorno',
  })[value] || value || 'Gás com troca'
}

function paymentsOf(sale) {
  if (sale?.sale_payments?.length) {
    return sale.sale_payments.map(p => ({
      name: p.payment_methods?.name || 'Pagamento',
      amount: n(p.amount),
      installments: Math.max(1, n(p.installments) || 1),
      fee: n(p.fee_amount),
      net: n(p.net_amount ?? p.amount),
    }))
  }
  return [{
    name: sale?.payment_methods?.name || 'Pagamento',
    amount: n(sale?.total),
    installments: 1,
    fee: 0,
    net: n(sale?.total),
  }]
}

function paymentLabel(sale) {
  return paymentsOf(sale)
    .map(p => `${p.name}${p.installments > 1 ? ` ${p.installments}x` : ''}`)
    .join(' + ')
}

function itemsLabel(sale) {
  return (sale?.sale_items || [])
    .map(i => `${n(i.quantity)}x ${i.product_name}${i.sale_kind && i.sale_kind !== 'exchange' ? ` (${kindLabel(i.sale_kind)})` : ''}`)
    .join(', ')
}

function header(row, fill = '1E3A5F') {
  row.height = 24
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
}

function widths(sheet, values) {
  values.forEach((value, index) => { sheet.getColumn(index + 1).width = value })
}

function borders(sheet, startRow, endRow, endCol) {
  for (let r = startRow; r <= endRow; r += 1) {
    for (let c = 1; c <= endCol; c += 1) {
      const cell = sheet.getCell(r, c)
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = { bottom: { style: 'hair', color: { argb: 'D7DEE6' } } }
    }
  }
}

function chartPng({ title, labels, datasets, money = false }) {
  const canvas = document.createElement('canvas')
  canvas.width = 1420
  canvas.height = 500
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height

  const cardX = 8
  const cardY = 8
  const cardW = W - 16
  const cardH = H - 16

  const left = 112
  const right = 42
  const top = 112
  const bottom = 102
  const plotX = cardX + left
  const plotY = cardY + top
  const plotW = cardW - left - right
  const plotH = cardH - top - bottom
  const palette = ['#2563eb', '#16a34a', '#7c3aed', '#f59e0b']

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  const formatExact = value => {
    if (money) {
      const formatted = new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n(value))
      return labels.length > 12 ? formatted : `R$ ${formatted}`
    }
    return new Intl.NumberFormat('pt-BR', {
      maximumFractionDigits: 0,
    }).format(Math.round(n(value)))
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  roundRect(cardX, cardY, cardW, cardH, 16)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = '#17324d'
  ctx.font = 'bold 32px Arial'
  ctx.fillText(title, cardX + 22, cardY + 32)

  if (!labels.length) {
    ctx.fillStyle = '#64748b'
    ctx.font = '18px Arial'
    ctx.fillText('Sem dados para o período selecionado.', cardX + 22, cardY + 78)
    return canvas.toDataURL('image/png')
  }

  const all = datasets.flatMap(d => d.values.map(n))
  const max = Math.max(1, ...all)
  const yMax = max * 1.18

  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(plotX, plotY)
  ctx.lineTo(plotX, plotY + plotH)
  ctx.lineTo(plotX + plotW, plotY + plotH)
  ctx.stroke()

  for (let i = 0; i <= 4; i += 1) {
    const y = plotY + plotH * i / 4
    const value = yMax * (4 - i) / 4

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plotX, y)
    ctx.lineTo(plotX + plotW, y)
    ctx.stroke()

    ctx.fillStyle = '#64748b'
    ctx.font = '14px Arial'
    const label = money
      ? new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
          maximumFractionDigits: 0,
        }).format(value)
      : new Intl.NumberFormat('pt-BR', {
          maximumFractionDigits: 0,
        }).format(Math.round(value))
    ctx.fillText(label, cardX + 4, y + 4)
  }

  let legendX = plotX
  datasets.forEach((d, idx) => {
    ctx.fillStyle = d.color || palette[idx % palette.length]
    ctx.fillRect(legendX, cardY + 48, 15, 15)
    ctx.fillStyle = '#334155'
    ctx.font = '15px Arial'
    ctx.fillText(d.name, legendX + 22, cardY + 61)
    legendX += 46 + ctx.measureText(d.name).width
  })

  const groupW = plotW / labels.length
  const barW = Math.max(4, Math.min(60, (groupW * 0.76) / Math.max(1, datasets.length)))

  labels.forEach((label, index) => {
    const center = plotX + (index + 0.5) * groupW
    const totalBarW = barW * datasets.length

    datasets.forEach((d, dIndex) => {
      const value = n(d.values[index])
      const h = value / yMax * plotH
      const x = center - totalBarW / 2 + dIndex * barW
      const y = plotY + plotH - h

      ctx.fillStyle = d.color || palette[dIndex % palette.length]
      ctx.fillRect(x + 1, y, Math.max(2, barW - 2), h)

      if (value > 0) {
        const exact = formatExact(value)
        ctx.save()
        ctx.fillStyle = '#1f2937'

        if (labels.length > 12) {
          // Gráficos diários: rótulos maiores, porém curtos, com rotação vertical.
          ctx.translate(x + barW / 2, Math.max(cardY + 78, y - 12))
          ctx.rotate(-Math.PI / 2)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'middle'
          ctx.font = 'bold 13px Arial'
        } else {
          ctx.translate(x + barW / 2, Math.max(cardY + 78, y - 10))
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.font = 'bold 16px Arial'
        }

        ctx.fillText(exact, 0, 0)
        ctx.restore()
      }
    })

    const every = Math.max(1, Math.ceil(labels.length / 12))
    if (index % every === 0 || index === labels.length - 1) {
      ctx.save()
      ctx.translate(center, plotY + plotH + 22)
      ctx.rotate(-Math.PI / 7)
      ctx.fillStyle = '#475569'
      ctx.font = '14px Arial'
      const text = String(label).length > 18 ? `${String(label).slice(0, 16)}…` : String(label)
      ctx.fillText(text, -ctx.measureText(text).width / 2, 0)
      ctx.restore()
    }
  })

  return canvas.toDataURL('image/png')
}

function aggregate(sales, purchases) {
  const productMap = new Map()
  const dailyMap = new Map()
  const paymentMap = new Map()
  const channelMap = new Map()
  const weekdayMap = new Map([
    [0, { label: 'Domingo', gas: 0, orders: 0, revenue: 0 }],
    [1, { label: 'Segunda', gas: 0, orders: 0, revenue: 0 }],
    [2, { label: 'Terça', gas: 0, orders: 0, revenue: 0 }],
    [3, { label: 'Quarta', gas: 0, orders: 0, revenue: 0 }],
    [4, { label: 'Quinta', gas: 0, orders: 0, revenue: 0 }],
    [5, { label: 'Sexta', gas: 0, orders: 0, revenue: 0 }],
    [6, { label: 'Sábado', gas: 0, orders: 0, revenue: 0 }],
  ])

  const kpis = {
    revenue: 0,
    orders: 0,
    gasSold: 0,
    emptySold: 0,
    deliveryFees: 0,
    receiptAdjustments: 0,
    netReceipts: 0,
    purchased: 0,
    purchaseCost: 0,
    purchaseFreight: 0,
    purchaseCredits: 0,
  }

  for (const sale of (sales || []).filter(s => s.status === 'completed')) {
    const saleRevenue = n(sale.total)
    kpis.orders += 1
    kpis.revenue += saleRevenue
    kpis.deliveryFees += n(sale.delivery_fee)

    const soldAt = safeDate(sale.sold_at)
    const day = dayKey(sale.sold_at)
    if (day && !dailyMap.has(day)) dailyMap.set(day, { revenue: 0, gas: 0, orders: 0 })
    if (day) {
      dailyMap.get(day).revenue += saleRevenue
      dailyMap.get(day).orders += 1
    }

    const channel = channelLabel(sale.channel)
    const channelCurrent = channelMap.get(channel) || { revenue: 0, orders: 0, gas: 0 }
    channelCurrent.revenue += saleRevenue
    channelCurrent.orders += 1
    channelMap.set(channel, channelCurrent)

    if (soldAt) {
      const weekday = weekdayMap.get(soldAt.getDay())
      weekday.orders += 1
      weekday.revenue += saleRevenue
    }

    for (const p of paymentsOf(sale)) {
      const adjustment = round(p.amount - p.net)
      const current = paymentMap.get(p.name) || { amount: 0, adjustments: 0, net: 0, count: 0 }
      current.amount += p.amount
      current.adjustments += adjustment
      current.net += p.net
      current.count += 1
      paymentMap.set(p.name, current)
      kpis.receiptAdjustments += adjustment
      kpis.netReceipts += p.net
    }

    let saleGasQty = 0

    for (const item of sale.sale_items || []) {
      const key = item.product_id || item.product_name
      const current = productMap.get(key) || {
        product: item.product_name || 'Produto',
        bought: 0, soldGas: 0, soldEmpty: 0,
        salesRevenue: 0, purchaseCost: 0,
      }

      const qty = n(item.quantity)
      if ((item.sale_kind || 'exchange') === 'empty_cylinder') {
        current.soldEmpty += qty
        kpis.emptySold += qty
      } else {
        current.soldGas += qty
        kpis.gasSold += qty
        saleGasQty += qty
        if (day) dailyMap.get(day).gas += qty
      }

      current.salesRevenue += n(item.total)
      productMap.set(key, current)
    }

    channelCurrent.gas += saleGasQty
    channelMap.set(channel, channelCurrent)

    if (soldAt) {
      weekdayMap.get(soldAt.getDay()).gas += saleGasQty
    }
  }

  for (const purchase of purchases || []) {
    kpis.purchaseCost += n(purchase.total_cost)
    kpis.purchaseFreight += n(purchase.freight_cost)
    kpis.purchaseCredits += n(purchase.discount_credit)

    for (const item of purchase.purchase_items || []) {
      const key = item.product_id || item.product_name
      const current = productMap.get(key) || {
        product: item.product_name || 'Produto',
        bought: 0, soldGas: 0, soldEmpty: 0,
        salesRevenue: 0, purchaseCost: 0,
      }
      const qty = n(item.quantity)
      const finalTotal = n(item.final_total_cost) > 0
        ? n(item.final_total_cost)
        : n(item.total_cost) + n(item.freight_allocated) - n(item.discount_allocated)

      current.bought += qty
      current.purchaseCost += finalTotal
      kpis.purchased += qty
      productMap.set(key, current)
    }
  }

  kpis.revenue = round(kpis.revenue)
  kpis.deliveryFees = round(kpis.deliveryFees)
  kpis.receiptAdjustments = round(kpis.receiptAdjustments)
  kpis.netReceipts = round(kpis.netReceipts)
  kpis.purchaseCost = round(kpis.purchaseCost)
  kpis.purchaseFreight = round(kpis.purchaseFreight)
  kpis.purchaseCredits = round(kpis.purchaseCredits)
  kpis.difference = kpis.purchased - kpis.gasSold
  kpis.ticket = kpis.orders ? round(kpis.revenue / kpis.orders) : 0

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({ day, label: day.split('-').reverse().join('/'), ...values }))

  const payments = [...paymentMap.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.amount - a.amount)

  const channels = [...channelMap.entries()]
    .map(([name, values]) => ({ name, ...values }))
    .sort((a, b) => b.revenue - a.revenue)

  // Ordem operacional: segunda a domingo.
  const weekdays = [1, 2, 3, 4, 5, 6, 0]
    .map(day => weekdayMap.get(day))

  const products = [...productMap.values()]
    .map(p => ({
      ...p,
      difference: p.bought - p.soldGas,
      averagePurchase: p.bought ? p.purchaseCost / p.bought : 0,
      averageSale: (p.soldGas + p.soldEmpty) ? p.salesRevenue / (p.soldGas + p.soldEmpty) : 0,
    }))
    .sort((a, b) => a.product.localeCompare(b.product, 'pt-BR'))

  return { kpis, daily, payments, channels, weekdays, products }
}

function addSummary(workbook, report, meta) {
  const s = workbook.addWorksheet('Resumo', { views: [{ showGridLines: false }] })
  widths(s, [25, 20, 4, 25, 20, 4, 19, 19, 19, 19, 19, 19])

  s.mergeCells('A1:L1')
  s.getCell('A1').value = `${meta.companyName} — Relatório de Vendas e Compras`
  s.getCell('A1').font = { bold: true, size: 18, color: { argb: '17324D' } }
  s.getRow(1).height = 30

  s.mergeCells('A2:L2')
  s.getCell('A2').value = `CNPJ: ${meta.cnpj}   •   Telefone: ${meta.phone}`
  s.getCell('A2').font = { bold: true, color: { argb: '475569' } }

  s.mergeCells('A3:L3')
  s.getCell('A3').value = `Endereço: ${meta.address}`
  s.getCell('A3').font = { color: { argb: '475569' } }

  s.mergeCells('A4:L4')
  s.getCell('A4').value = `Período: ${meta.startLabel} a ${meta.endLabel} · Gerado em ${dateTimeBR(new Date())}`
  s.getCell('A4').font = { italic: true, color: { argb: '64748B' } }

  const items = [
    ['Faturamento', report.kpis.revenue, MONEY],
    ['Pedidos concluídos', report.kpis.orders, INT],
    ['Botijões vendidos (cheios)', report.kpis.gasSold, INT],
    ['Botijões comprados', report.kpis.purchased, INT],
    ['Comprado − vendido', report.kpis.difference, INT],
    ['Custo líquido das compras', report.kpis.purchaseCost, MONEY],
    ['Ticket médio', report.kpis.ticket, MONEY],
    ['Taxas de entrega', report.kpis.deliveryFees, MONEY],
    ['Taxas / ajustes recebimento', report.kpis.receiptAdjustments, MONEY],
    ['Recebimento líquido', report.kpis.netReceipts, MONEY],
    ['Cascos/vazios vendidos', report.kpis.emptySold, INT],
    ['Créditos nas compras', report.kpis.purchaseCredits, MONEY],
  ]

  let row = 6
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i]
    const b = items[i + 1]
    s.getCell(row, 1).value = a[0]
    s.getCell(row, 2).value = a[1]
    s.getCell(row, 2).numFmt = a[2]
    s.getCell(row, 4).value = b[0]
    s.getCell(row, 5).value = b[1]
    s.getCell(row, 5).numFmt = b[2]

    for (const c of [1, 4]) s.getCell(row, c).font = { bold: true, color: { argb: '475569' } }
    for (const c of [2, 5]) s.getCell(row, c).font = { bold: true, size: 12, color: { argb: '17324D' } }
    row += 1
  }

  row += 1
  s.getRow(row).values = ['Produto', 'Comprados', 'Vendidos (cheios)', 'Cascos vendidos', 'Diferença']
  header(s.getRow(row), '315B7D')
  report.products.forEach(p => s.addRow([p.product, p.bought, p.soldGas, p.soldEmpty, p.difference]))
  const productEnd = s.lastRow.number
  borders(s, row + 1, productEnd, 5)

  const paymentHeader = productEnd + 3
  s.getRow(paymentHeader).values = ['Forma de pagamento', 'Bruto', 'Ajuste bruto − líquido', 'Líquido', 'Lançamentos']
  header(s.getRow(paymentHeader), '315B7D')
  report.payments.forEach(p => s.addRow([p.name, round(p.amount), round(p.adjustments), round(p.net), p.count]))

  for (let r = paymentHeader + 1; r <= s.lastRow.number; r += 1) {
    for (const c of [2, 3, 4]) s.getCell(r, c).numFmt = MONEY
    s.getCell(r, 5).numFmt = INT
  }

  const dailyRevenueImg = chartPng({
    title: 'Faturamento por dia',
    labels: report.daily.map(x => x.label),
    datasets: [{ name: 'Faturamento', values: report.daily.map(x => x.revenue), color: '#2563eb' }],
    money: true,
  })

  const dailyGasImg = chartPng({
    title: 'Botijões vendidos por dia',
    labels: report.daily.map(x => x.label),
    datasets: [{ name: 'Botijões cheios', values: report.daily.map(x => x.gas), color: '#0891b2' }],
  })

  const productsChart = report.products.filter(x => x.bought || x.soldGas).slice(0, 12)
  const productImg = chartPng({
    title: 'Comprado × vendido',
    labels: productsChart.map(x => x.product),
    datasets: [
      { name: 'Comprados', values: productsChart.map(x => x.bought), color: '#16a34a' },
      { name: 'Vendidos', values: productsChart.map(x => x.soldGas), color: '#2563eb' },
    ],
  })

  const channelImg = chartPng({
    title: 'Faturamento por canal',
    labels: report.channels.map(x => x.name),
    datasets: [{ name: 'Faturamento', values: report.channels.map(x => x.revenue), color: '#f59e0b' }],
    money: true,
  })

  const payChart = report.payments.slice(0, 10)
  const payImg = chartPng({
    title: 'Vendas por forma de pagamento',
    labels: payChart.map(x => x.name),
    datasets: [{ name: 'Valor bruto', values: payChart.map(x => x.amount), color: '#7c3aed' }],
    money: true,
  })

  const weekdayImg = chartPng({
    title: 'Botijões vendidos por dia da semana',
    labels: report.weekdays.map(x => x.label),
    datasets: [{ name: 'Botijões cheios', values: report.weekdays.map(x => x.gas), color: '#dc2626' }],
  })

  const dailyRevenueId = workbook.addImage({ base64: dailyRevenueImg, extension: 'png' })
  const dailyGasId = workbook.addImage({ base64: dailyGasImg, extension: 'png' })
  const productId = workbook.addImage({ base64: productImg, extension: 'png' })
  const channelId = workbook.addImage({ base64: channelImg, extension: 'png' })
  const payId = workbook.addImage({ base64: payImg, extension: 'png' })
  const weekdayId = workbook.addImage({ base64: weekdayImg, extension: 'png' })

  // Mesmo layout aprovado, só com gráficos um pouco maiores.
  const chartWidth = 660
  const chartHeight = 330
  const leftCol = 0.15
  const rightCol = 6.35

  const row1 = 27.0
  const row2 = 49.0
  const row3 = 71.0

  s.addImage(dailyGasId,     { tl: { col: leftCol,  row: row1 }, ext: { width: chartWidth, height: chartHeight } })
  s.addImage(dailyRevenueId, { tl: { col: rightCol, row: row1 }, ext: { width: chartWidth, height: chartHeight } })

  s.addImage(weekdayId,      { tl: { col: leftCol,  row: row2 }, ext: { width: chartWidth, height: chartHeight } })
  s.addImage(channelId,      { tl: { col: rightCol, row: row2 }, ext: { width: chartWidth, height: chartHeight } })

  s.addImage(payId,          { tl: { col: leftCol,  row: row3 }, ext: { width: chartWidth, height: chartHeight } })
  s.addImage(productId,      { tl: { col: rightCol, row: row3 }, ext: { width: chartWidth, height: chartHeight } })

}

function addSales(workbook, sales) {
  const s = workbook.addWorksheet('Vendas', { views: [{ state: 'frozen', ySplit: 1 }] })
  s.addRow([
    'Nº', 'Data/Hora', 'Cliente', 'Status', 'Canal', 'Itens',
    'Botijões cheios', 'Cascos/vazios', 'Pagamento',
    'Subtotal', 'Taxa entrega', 'Desconto', 'Total',
    'Taxas cartão', 'Líquido', 'Vendedor', 'Observações',
  ])
  header(s.getRow(1))
  widths(s, [10, 19, 28, 13, 13, 45, 15, 14, 32, 15, 14, 13, 15, 14, 15, 24, 35])

  ;[...(sales || [])].sort((a, b) => new Date(a.sold_at) - new Date(b.sold_at)).forEach(sale => {
    const gas = (sale.sale_items || [])
      .filter(i => (i.sale_kind || 'exchange') !== 'empty_cylinder')
      .reduce((sum, i) => sum + n(i.quantity), 0)
    const empty = (sale.sale_items || [])
      .filter(i => i.sale_kind === 'empty_cylinder')
      .reduce((sum, i) => sum + n(i.quantity), 0)
    const pay = paymentsOf(sale)
    s.addRow([
      sale.sale_number,
      safeDate(sale.sold_at),
      sale.customer_name || 'Consumidor',
      statusLabel(sale.status),
      channelLabel(sale.channel),
      itemsLabel(sale),
      gas,
      empty,
      paymentLabel(sale),
      n(sale.subtotal),
      n(sale.delivery_fee),
      n(sale.discount),
      n(sale.total),
      round(pay.reduce((sum, p) => sum + p.fee, 0)),
      round(pay.reduce((sum, p) => sum + p.net, 0)),
      sale.profiles?.full_name || '—',
      sale.notes || '',
    ])
  })

  s.autoFilter = { from: 'A1', to: 'Q1' }
  for (let r = 2; r <= s.lastRow.number; r += 1) {
    s.getCell(r, 2).numFmt = DATE_TIME
    for (const c of [10, 11, 12, 13, 14, 15]) s.getCell(r, c).numFmt = MONEY
    for (const c of [7, 8]) s.getCell(r, c).numFmt = INT
  }
  borders(s, 2, s.lastRow.number, 17)
}

function addPurchases(workbook, purchases) {
  const s = workbook.addWorksheet('Compras', { views: [{ state: 'frozen', ySplit: 1 }] })
  s.addRow([
    'Nº chegada', 'Data/Hora', 'Fornecedor', 'Produto', 'Quantidade',
    'Valor produtos', 'Produto/un.', 'Frete rateado', 'Crédito rateado',
    'Custo final item', 'Custo final/un.', 'Frete chegada',
    'Créditos chegada', 'Total líquido chegada', 'Observações',
  ])
  header(s.getRow(1))
  widths(s, [12, 19, 28, 20, 12, 16, 14, 16, 16, 17, 15, 15, 17, 19, 35])

  ;[...(purchases || [])].sort((a, b) => new Date(a.purchased_at) - new Date(b.purchased_at)).forEach(p => {
    for (const item of p.purchase_items || []) {
      const qty = n(item.quantity)
      const gross = n(item.total_cost)
      const freight = n(item.freight_allocated)
      const credit = n(item.discount_allocated)
      const finalTotal = n(item.final_total_cost) > 0 ? n(item.final_total_cost) : gross + freight - credit
      const finalUnit = n(item.final_unit_cost) > 0 ? n(item.final_unit_cost) : (qty ? finalTotal / qty : n(item.unit_cost))
      s.addRow([
        p.purchase_number, safeDate(p.purchased_at), p.supplier_name || '—',
        item.product_name || '—', qty, gross, qty ? round(gross / qty) : n(item.unit_cost),
        freight, credit, round(finalTotal), round(finalUnit),
        n(p.freight_cost), n(p.discount_credit), n(p.total_cost), p.notes || '',
      ])
    }
  })

  s.autoFilter = { from: 'A1', to: 'O1' }
  for (let r = 2; r <= s.lastRow.number; r += 1) {
    s.getCell(r, 2).numFmt = DATE_TIME
    s.getCell(r, 5).numFmt = INT
    for (let c = 6; c <= 14; c += 1) s.getCell(r, c).numFmt = MONEY
  }
  borders(s, 2, s.lastRow.number, 15)
}

function addProducts(workbook, products) {
  const s = workbook.addWorksheet('Produtos', { views: [{ state: 'frozen', ySplit: 1 }] })
  s.addRow([
    'Produto', 'Comprados', 'Vendidos (cheios)', 'Cascos/vazios vendidos',
    'Comprado − vendido', 'Receita de itens', 'Custo líquido compras',
    'Custo médio compra/un.', 'Preço médio venda/un.',
  ])
  header(s.getRow(1))
  widths(s, [25, 14, 18, 21, 19, 18, 20, 22, 22])
  products.forEach(p => s.addRow([
    p.product, p.bought, p.soldGas, p.soldEmpty, p.difference,
    round(p.salesRevenue), round(p.purchaseCost), round(p.averagePurchase), round(p.averageSale),
  ]))
  s.autoFilter = { from: 'A1', to: 'I1' }
  for (let r = 2; r <= s.lastRow.number; r += 1) {
    for (let c = 2; c <= 5; c += 1) s.getCell(r, c).numFmt = INT
    for (let c = 6; c <= 9; c += 1) s.getCell(r, c).numFmt = MONEY
  }
  borders(s, 2, s.lastRow.number, 9)
}

export async function exportSalesExcelReport({
  sales = [],
  purchases = [],
  companyName = 'GasMaster',
  companyCnpj = '57.960.495/0001-18',
  companyAddress = 'Rua Aracy Valente, 30, Parque Mikail, Guarulhos - SP, CEP 07142-390',
  companyPhone = '(11) 99893-4050',
  range,
} = {}) {
  const module = await import('exceljs')
  const ExcelJS = module.default || module

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'GasMaster'
  workbook.created = new Date()
  workbook.title = 'Relatório Gerencial GasMaster'

  const report = aggregate(sales, purchases)
  addSummary(workbook, report, {
    companyName,
    cnpj: companyCnpj,
    address: companyAddress,
    phone: companyPhone,
    startLabel: dateBR(range?.start),
    endLabel: dateBR(range?.end),
  })
  addSales(workbook, sales)
  addPurchases(workbook, purchases)
  addProducts(workbook, report.products)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const start = dayKey(range?.start) || 'inicio'
  const end = dayKey(range?.end) || 'fim'
  const filename = `relatorio-vendas-compras-${start}-a-${end}.xlsx`

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)

  return { filename, summary: report.kpis }
}

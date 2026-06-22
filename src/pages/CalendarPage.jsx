import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  CalendarDays,
  CheckCircle,
  Trash2,
  Receipt,
  Truck,
  Car,
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PageHeader, PageLoader, EmptyState, Modal } from '../components/ui'
import { formatCurrency } from '../utils/format'

const MONTH_OPTIONS = [
  { value: 1, label: 'Jan', full: 'Janeiro' },
  { value: 2, label: 'Fev', full: 'Fevereiro' },
  { value: 3, label: 'Mar', full: 'Março' },
  { value: 4, label: 'Abr', full: 'Abril' },
  { value: 5, label: 'Mai', full: 'Maio' },
  { value: 6, label: 'Jun', full: 'Junho' },
  { value: 7, label: 'Jul', full: 'Julho' },
  { value: 8, label: 'Ago', full: 'Agosto' },
  { value: 9, label: 'Set', full: 'Setembro' },
  { value: 10, label: 'Out', full: 'Outubro' },
  { value: 11, label: 'Nov', full: 'Novembro' },
  { value: 12, label: 'Dez', full: 'Dezembro' },
]

const YEAR_OPTIONS = [2026, 2027, 2028, 2029, 2030]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const EVENT_TYPES = [
  { value: 'general', label: 'Geral' },
  { value: 'bill', label: 'Conta a pagar' },
  { value: 'hub', label: 'Retorno HUB' },
  { value: 'purchase', label: 'Chegada de gás' },
  { value: 'vehicle', label: 'Veículo' },
  { value: 'reminder', label: 'Lembrete' },
]

const TYPE_META = {
  expense: { label: 'Despesa', icon: Receipt, className: 'bg-warning-50 text-warning-700 border-warning-100', dot: 'bg-warning-500' },
  vehicle_expense: { label: 'Veículo', icon: Car, className: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500' },
  bill: { label: 'Conta', icon: Receipt, className: 'bg-warning-50 text-warning-700 border-warning-100', dot: 'bg-warning-500' },
  hub: { label: 'HUB', icon: Truck, className: 'bg-purple-50 text-purple-700 border-purple-100', dot: 'bg-purple-500' },
  purchase: { label: 'Chegada', icon: Truck, className: 'bg-success-50 text-success-700 border-success-100', dot: 'bg-success-500' },
  vehicle: { label: 'Veículo', icon: Car, className: 'bg-brand-50 text-brand-700 border-brand-100', dot: 'bg-brand-500' },
  reminder: { label: 'Lembrete', icon: Clock, className: 'bg-orange-50 text-orange-700 border-orange-100', dot: 'bg-orange-500' },
  general: { label: 'Geral', icon: CalendarDays, className: 'bg-slate-100 text-slate-700 border-slate-200', dot: 'bg-slate-500' },
}

function todayInput() {
  const d = new Date()
  return toDateInput(d)
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateOnly(dateValue) {
  const [year, month, day] = String(dateValue || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatDateLabel(dateValue, options = {}) {
  const date = parseDateOnly(dateValue)
  if (!date) return 'Sem data'
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', ...options })
}

function monthRange(filter) {
  const start = new Date(Number(filter.year), Number(filter.month) - 1, 1)
  const end = new Date(Number(filter.year), Number(filter.month), 0)
  return {
    start: toDateInput(start),
    end: toDateInput(end),
  }
}

function buildDefaultFilter() {
  const today = new Date()
  const currentYear = today.getFullYear()
  return {
    month: today.getMonth() + 1,
    year: YEAR_OPTIONS.includes(currentYear) ? currentYear : YEAR_OPTIONS[0],
  }
}

function eventDateValue(event) {
  return String(event.date || event.event_date || event.due_date || event.expense_date || '').slice(0, 10)
}

function sortEvents(a, b) {
  const da = eventDateValue(a)
  const db = eventDateValue(b)
  if (da !== db) return da.localeCompare(db)
  return String(a.title || '').localeCompare(String(b.title || ''))
}

function statusLabel(status) {
  const map = {
    pending: 'Pendente',
    paid: 'Pago',
    overdue: 'Atrasado',
    done: 'Concluído',
    cancelled: 'Cancelado',
  }
  return map[status] || status || 'Pendente'
}

function buildCalendarDays(filter) {
  const year = Number(filter.year)
  const monthIndex = Number(filter.month) - 1
  const firstDay = new Date(year, monthIndex, 1)
  const lastDay = new Date(year, monthIndex + 1, 0)
  const blanks = firstDay.getDay()
  const totalDays = lastDay.getDate()
  const cells = []

  for (let i = 0; i < blanks; i += 1) {
    cells.push({ key: `blank-${i}`, empty: true })
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex, day)
    const dateKey = toDateInput(date)
    cells.push({ key: dateKey, dateKey, day, isToday: dateKey === todayInput() })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}`, empty: true })
  }

  return cells
}

export default function CalendarPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState(buildDefaultFilter())
  const [selectedDate, setSelectedDate] = useState(todayInput())
  const [manualEvents, setManualEvents] = useState([])
  const [expenses, setExpenses] = useState([])
  const [vehicleExpenses, setVehicleExpenses] = useState([])
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (companyId) loadCalendar()
  }, [companyId, filter.month, filter.year])

  useEffect(() => {
    const current = parseDateOnly(selectedDate)
    if (!current) return
    if (current.getFullYear() !== Number(filter.year) || current.getMonth() + 1 !== Number(filter.month)) {
      setSelectedDate(toDateInput(new Date(Number(filter.year), Number(filter.month) - 1, 1)))
    }
  }, [filter.month, filter.year])

  async function loadCalendar() {
    setLoading(true)
    const range = monthRange(filter)

    const [manualRes, expensesRes, vehicleRes] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('*')
        .eq('company_id', companyId)
        .gte('event_date', range.start)
        .lte('event_date', range.end)
        .order('event_date'),
      supabase
        .from('expenses')
        .select('id, name, amount, due_date, status, category')
        .eq('company_id', companyId)
        .gte('due_date', range.start)
        .lte('due_date', range.end)
        .order('due_date'),
      supabase
        .from('vehicle_expenses')
        .select('id, description, amount, expense_date, type, vehicles(name, plate)')
        .eq('company_id', companyId)
        .gte('expense_date', range.start)
        .lte('expense_date', range.end)
        .order('expense_date'),
    ])

    if (manualRes.error) toast.error('Erro ao carregar eventos manuais')
    if (expensesRes.error) toast.error('Erro ao carregar despesas do calendário')
    if (vehicleRes.error) toast.error('Erro ao carregar eventos de veículos')

    setManualEvents(manualRes.data || [])
    setExpenses(expensesRes.data || [])
    setVehicleExpenses(vehicleRes.data || [])
    setLoading(false)
  }

  const events = useMemo(() => {
    const expenseEvents = expenses.map(exp => ({
      id: `expense-${exp.id}`,
      source: 'expense',
      type: 'expense',
      title: exp.name,
      date: exp.due_date,
      amount: Number(exp.amount || 0),
      status: exp.status,
      notes: 'Despesa cadastrada na seção Despesas',
    }))

    const vehicleEvents = vehicleExpenses.map(exp => ({
      id: `vehicle-${exp.id}`,
      source: 'vehicle_expense',
      type: 'vehicle_expense',
      title: exp.description,
      date: exp.expense_date,
      amount: Number(exp.amount || 0),
      status: 'done',
      notes: exp.vehicles?.name ? `${exp.vehicles.name}${exp.vehicles.plate ? ` • ${exp.vehicles.plate}` : ''}` : 'Despesa de veículo',
    }))

    const manual = manualEvents.map(event => ({
      id: event.id,
      source: 'calendar_events',
      type: event.type || 'general',
      title: event.title,
      date: event.event_date,
      amount: event.amount ? Number(event.amount) : null,
      status: event.status || 'pending',
      notes: event.notes,
      raw: event,
    }))

    return [...expenseEvents, ...vehicleEvents, ...manual].sort(sortEvents)
  }, [expenses, vehicleExpenses, manualEvents])

  const eventsByDate = useMemo(() => {
    return events.reduce((acc, event) => {
      const date = eventDateValue(event)
      if (!acc[date]) acc[date] = []
      acc[date].push(event)
      return acc
    }, {})
  }, [events])

  const calendarDays = useMemo(() => buildCalendarDays(filter), [filter])
  const selectedEvents = eventsByDate[selectedDate] || []
  const pendingEvents = events.filter(e => ['pending', 'overdue'].includes(e.status)).length
  const totalExpenses = events.reduce((sum, event) => sum + Number(event.amount || 0), 0)
  const hubEvents = events.filter(e => e.type === 'hub').length
  const selectedTotal = selectedEvents.reduce((sum, event) => sum + Number(event.amount || 0), 0)
  const monthName = MONTH_OPTIONS.find(m => m.value === Number(filter.month))?.full || 'Mês'

  if (loading) return <PageLoader />

  function goToPreviousMonth() {
    setFilter(prev => {
      if (Number(prev.month) === 1) return { month: 12, year: Number(prev.year) - 1 }
      return { ...prev, month: Number(prev.month) - 1 }
    })
  }

  function goToNextMonth() {
    setFilter(prev => {
      if (Number(prev.month) === 12) return { month: 1, year: Number(prev.year) + 1 }
      return { ...prev, month: Number(prev.month) + 1 }
    })
  }

  function goToToday() {
    const today = new Date()
    setFilter({ month: today.getMonth() + 1, year: today.getFullYear() })
    setSelectedDate(todayInput())
  }

  async function markDone(event) {
    if (event.source !== 'calendar_events') return
    const { error } = await supabase
      .from('calendar_events')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', event.id)
      .eq('company_id', companyId)

    if (error) { toast.error('Erro ao concluir evento'); return }
    toast.success('Evento concluído!')
    loadCalendar()
  }

  async function deleteEvent(event) {
    if (event.source !== 'calendar_events') return
    if (!confirm(`Excluir evento "${event.title}"?`)) return

    const { error } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', event.id)
      .eq('company_id', companyId)

    if (error) { toast.error('Erro ao excluir evento'); return }
    toast.success('Evento excluído!')
    loadCalendar()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário"
        subtitle="Planner operacional com contas, HUB, veículos e lembretes"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus className="w-4 h-4" /> Novo Evento
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card border-l-4 border-l-brand-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eventos no mês</p>
          <p className="text-2xl font-display font-bold text-brand-700 mt-1">{events.length}</p>
        </div>
        <div className="card border-l-4 border-l-warning-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendentes</p>
          <p className="text-2xl font-display font-bold text-warning-700 mt-1">{pendingEvents}</p>
        </div>
        <div className="card border-l-4 border-l-purple-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eventos HUB</p>
          <p className="text-2xl font-display font-bold text-purple-700 mt-1">{hubEvents}</p>
        </div>
        <div className="card border-l-4 border-l-success-500">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valores no mês</p>
          <p className="text-2xl font-display font-bold text-success-700 mt-1">{formatCurrency(totalExpenses)}</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button className="btn-outline btn-sm" onClick={goToPreviousMonth} title="Mês anterior" aria-label="Mês anterior">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <h2 className="font-display font-bold text-xl text-slate-900">{monthName} de {filter.year}</h2>
              <p className="text-xs text-slate-500">Clique em uma data para visualizar os detalhes do dia.</p>
            </div>
            <button className="btn-outline btn-sm" onClick={goToNextMonth} title="Próximo mês" aria-label="Próximo mês">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="form-group mb-0">
              <label className="label">Mês</label>
              <select className="input min-w-[110px]" value={filter.month} onChange={e => setFilter(prev => ({ ...prev, month: Number(e.target.value) }))}>
                {MONTH_OPTIONS.map(month => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group mb-0">
              <label className="label">Ano</label>
              <select className="input min-w-[110px]" value={filter.year} onChange={e => setFilter(prev => ({ ...prev, year: Number(e.target.value) }))}>
                {YEAR_OPTIONS.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <button className="btn-outline" onClick={goToToday}>Hoje</button>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 -mx-6 -mt-4 px-6 py-3">
            {WEEKDAYS.map(day => (
              <div key={day} className="text-center text-xs font-bold uppercase tracking-wide text-slate-500">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-100 -mx-6 -mb-4">
            {calendarDays.map(cell => {
              if (cell.empty) return <div key={cell.key} className="min-h-[115px] bg-white/60" />

              const dayEvents = eventsByDate[cell.dateKey] || []
              const isSelected = selectedDate === cell.dateKey

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateKey)}
                  className={`min-h-[115px] bg-white text-left p-2.5 transition-colors hover:bg-brand-50/40 ${isSelected ? 'ring-2 ring-brand-500 relative z-10 bg-brand-50/60' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      cell.isToday ? 'bg-brand-600 text-white' : isSelected ? 'bg-white text-brand-700' : 'text-slate-700'
                    }`}>
                      {cell.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[11px] font-semibold text-slate-500">{dayEvents.length}</span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map(event => {
                      const meta = TYPE_META[event.type] || TYPE_META.general
                      return (
                        <div key={event.id} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 bg-slate-50 rounded-md px-1.5 py-1 truncate">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                          <span className="truncate">{event.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 3 && (
                      <p className="text-[11px] font-semibold text-brand-600">+{dayEvents.length - 3} item(ns)</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="card sticky top-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data selecionada</p>
              <h3 className="font-display font-bold text-lg text-slate-900 capitalize">
                {formatDateLabel(selectedDate, { weekday: 'long' })}
              </h3>
              {selectedTotal > 0 && <p className="text-sm text-slate-500">Total do dia: {formatCurrency(selectedTotal)}</p>}
            </div>
            <button className="btn-primary btn-sm" onClick={() => setShowModal(true)}>
              <Plus className="w-3.5 h-3.5" /> Evento
            </button>
          </div>

          {!selectedEvents.length ? (
            <EmptyState
              icon={CalendarDays}
              title="Nenhum item neste dia"
              description="Clique em Evento para criar um lembrete manual nesta data."
            />
          ) : (
            <div className="space-y-2.5">
              {selectedEvents.map(event => (
                <CalendarEventRow
                  key={event.id}
                  event={event}
                  onDone={() => markDone(event)}
                  onDelete={() => deleteEvent(event)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <EventModal
        open={showModal}
        companyId={companyId}
        userId={profile?.id}
        initialDate={selectedDate}
        onClose={() => setShowModal(false)}
        onSuccess={() => { setShowModal(false); loadCalendar() }}
      />
    </div>
  )
}

function CalendarEventRow({ event, onDone, onDelete }) {
  const meta = TYPE_META[event.type] || TYPE_META.general
  const Icon = meta.icon
  const isManual = event.source === 'calendar_events'
  const isDone = ['paid', 'done'].includes(event.status)
  const isOverdue = event.status === 'overdue'

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-xl border ${meta.className}`}>
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm text-slate-900">{event.title}</p>
            <span className={`badge ${isOverdue ? 'badge-red' : isDone ? 'badge-green' : 'badge-yellow'}`}>
              {statusLabel(event.status)}
            </span>
            <span className="text-xs font-medium opacity-80">{meta.label}</span>
          </div>
          {event.notes && <p className="text-xs text-slate-500 mt-0.5">{event.notes}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pl-12">
        {event.amount != null ? (
          <p className="font-semibold text-sm text-slate-800">{formatCurrency(event.amount)}</p>
        ) : <span />}

        {isManual && (
          <div className="flex gap-1 justify-end">
            {!isDone && (
              <button className="btn-outline btn-sm" onClick={onDone} title="Concluir" aria-label="Concluir evento">
                <CheckCircle className="w-3.5 h-3.5" />
              </button>
            )}
            <button className="btn-outline btn-sm text-danger-600 hover:text-danger-700" onClick={onDelete} title="Excluir" aria-label="Excluir evento">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function EventModal({ open, companyId, userId, initialDate, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    type: 'general',
    event_date: initialDate || todayInput(),
    amount: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(prev => ({ ...prev, event_date: initialDate || todayInput() }))
    }
  }, [open, initialDate])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) { toast.error('Informe o título do evento'); return }
    if (!form.event_date) { toast.error('Informe a data do evento'); return }

    setSubmitting(true)
    const { error } = await supabase.from('calendar_events').insert({
      company_id: companyId,
      title: form.title.trim(),
      type: form.type,
      event_date: form.event_date,
      amount: form.amount ? Number(String(form.amount).replace(',', '.')) : null,
      notes: form.notes || null,
      status: 'pending',
      created_by: userId,
    })
    setSubmitting(false)

    if (error) { toast.error('Erro ao criar evento'); return }
    toast.success('Evento criado!')
    setForm({ title: '', type: 'general', event_date: initialDate || todayInput(), amount: '', notes: '' })
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo evento no calendário">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="form-group">
          <label className="label">Título *</label>
          <input
            className="input"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Ex: Retornar HUB Ultragaz, pagar aluguel, manutenção da moto..."
            required
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="form-group">
            <label className="label">Tipo</label>
            <select className="input" value={form.type} onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}>
              {EVENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Data *</label>
            <input
              type="date"
              className="input"
              value={form.event_date}
              onChange={e => setForm(prev => ({ ...prev, event_date: e.target.value }))}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label className="label">Valor opcional</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={form.amount}
            onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
            placeholder="0,00"
          />
        </div>

        <div className="form-group">
          <label className="label">Observações</label>
          <textarea
            className="input resize-none"
            rows={3}
            value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Detalhes importantes do evento"
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar evento'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

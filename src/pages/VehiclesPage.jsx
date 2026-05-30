import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Car, Bike, Truck, Fuel, Wrench, Receipt, MapPin, Gauge,
  CalendarDays, CreditCard, Trash2, AlertTriangle, Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSupabaseQuery } from '../hooks/useSupabaseQuery'
import { PageHeader, PageLoader, EmptyState, Modal, FormField, SelectInput } from '../components/ui'
import { formatCurrency, formatDate, formatNumber, parseCurrency, maskCurrency, PAYMENT_TYPES } from '../utils/format'

const VEHICLE_TYPES = [
  { value: 'motorcycle', label: 'Moto' },
  { value: 'car', label: 'Carro' },
  { value: 'van', label: 'Van / HR' },
  { value: 'truck', label: 'Caminhão' },
  { value: 'other', label: 'Outro' },
]

const VEHICLE_TYPE_LABELS = VEHICLE_TYPES.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {})

const EXPENSE_TYPES = [
  { value: 'fuel', label: 'Abastecimento' },
  { value: 'maintenance', label: 'Manutenção' },
  { value: 'document', label: 'Documento / Licenciamento' },
  { value: 'insurance', label: 'Seguro' },
  { value: 'tire', label: 'Pneu' },
  { value: 'wash', label: 'Lavagem' },
  { value: 'other', label: 'Outra despesa' },
]

const EXPENSE_TYPE_LABELS = EXPENSE_TYPES.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {})

const FUEL_TYPES = [
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'diesel_s10', label: 'Diesel S10' },
  { value: 'gnv', label: 'GNV' },
  { value: 'flex', label: 'Flex' },
  { value: 'other', label: 'Outro' },
]

const FUEL_TYPE_LABELS = FUEL_TYPES.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {})

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Pago' },
  { value: 'pending', label: 'Pendente' },
]

const VEHICLE_PAYMENT_TYPES = ['cash', 'pix', 'credit', 'debit']

function currentDate() {
  return new Date().toISOString().slice(0, 10)
}

function getMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return { start, end }
}

function vehicleIcon(type) {
  if (type === 'motorcycle') return Bike
  if (type === 'van' || type === 'truck') return Truck
  return Car
}

function buildExpenseName(vehicleName, type) {
  const label = EXPENSE_TYPE_LABELS[type] || 'Despesa'
  return `Veículo - ${vehicleName} - ${label}`
}

function getExpenseCategory(type) {
  if (type === 'fuel') return 'fuel'
  if (['maintenance', 'tire', 'wash'].includes(type)) return 'maintenance'
  if (['document', 'insurance'].includes(type)) return 'tax'
  return 'other'
}

export default function VehiclesPage() {
  const { profile } = useAuth()
  const companyId = profile?.company_id
  const userId = profile?.id
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [editingVehicle, setEditingVehicle] = useState(null)

  const { data: vehicles, loading: vehiclesLoading, refetch: refetchVehicles } = useSupabaseQuery(
    () => supabase
      .from('vehicles')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name'),
    [companyId]
  )

  const { data: paymentMethods, loading: paymentLoading } = useSupabaseQuery(
    () => supabase
      .from('payment_methods')
      .select('id, name, type, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name'),
    [companyId]
  )

  const { data: vehicleExpenses, loading: expensesLoading, refetch: refetchExpenses } = useSupabaseQuery(
    () => supabase
      .from('vehicle_expenses')
      .select('*, vehicles(name, plate, type), payment_methods(name, type), expenses(status)')
      .eq('company_id', companyId)
      .order('expense_date', { ascending: false })
      .limit(80),
    [companyId]
  )

  const loading = vehiclesLoading || expensesLoading || paymentLoading
  const vehicleList = vehicles || []
  const expenseList = vehicleExpenses || []

  const monthStats = useMemo(() => {
    const { start, end } = getMonthRange()
    const monthItems = expenseList.filter(item => {
      const date = new Date(item.expense_date)
      return date >= start && date <= end
    })
    const fuelItems = monthItems.filter(item => item.type === 'fuel')
    const totalExpenses = monthItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalFuel = fuelItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
    const totalLiters = fuelItems.reduce((sum, item) => sum + Number(item.liters || 0), 0)
    const odometers = fuelItems
      .map(item => Number(item.odometer_km || 0))
      .filter(value => value > 0)
      .sort((a, b) => a - b)
    const kmTracked = odometers.length >= 2 ? odometers[odometers.length - 1] - odometers[0] : 0

    return {
      totalExpenses,
      totalFuel,
      totalLiters,
      avgLiterPrice: totalLiters > 0 ? totalFuel / totalLiters : 0,
      kmTracked,
      fuelCount: fuelItems.length,
    }
  }, [expenseList])

  async function handleDeleteExpense(item) {
    if (!confirm(`Excluir a despesa "${item.description}"?`)) return

    const { error } = await supabase
      .from('vehicle_expenses')
      .delete()
      .eq('id', item.id)

    if (error) {
      toast.error('Erro ao excluir despesa do veículo')
      return
    }

    if (item.expense_id) {
      await supabase.from('expenses').delete().eq('id', item.expense_id)
    }

    toast.success('Despesa excluída')
    refetchExpenses()
  }

  function handleNewVehicle() {
    setEditingVehicle(null)
    setVehicleModalOpen(true)
  }

  function handleEditVehicle(vehicle) {
    setEditingVehicle(vehicle)
    setVehicleModalOpen(true)
  }

  async function handleDeleteVehicle(vehicle) {
    const vehicleItems = expenseList.filter(item => item.vehicle_id === vehicle.id)
    const message = vehicleItems.length > 0
      ? `O veículo "${vehicle.name}" possui ${vehicleItems.length} despesa(s) lançada(s). Ele será desativado, mantendo o histórico. Continuar?`
      : `Excluir o veículo "${vehicle.name}"?`

    if (!confirm(message)) return

    const { error } = await supabase
      .from('vehicles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', vehicle.id)
      .eq('company_id', companyId)

    if (error) {
      toast.error(error.message || 'Erro ao excluir veículo')
      return
    }

    toast.success('Veículo removido da lista')
    refetchVehicles()
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Veículos"
        subtitle="Controle de frota, abastecimentos, quilometragem e despesas dos veículos"
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-outline" onClick={handleNewVehicle}>
              <Car className="w-4 h-4" /> Novo Veículo
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setSelectedVehicleId(vehicleList[0]?.id || '')
                setExpenseModalOpen(true)
              }}
              disabled={vehicleList.length === 0}
            >
              <Plus className="w-4 h-4" /> Nova Despesa
            </button>
          </div>
        }
      />

      {vehicleList.length === 0 && (
        <div className="card border-warning-200 bg-warning-50/60 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-warning-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-warning-900">Cadastre o primeiro veículo</p>
            <p className="text-sm text-warning-800 mt-0.5">
              Para lançar abastecimento, manutenção ou qualquer despesa de veículo, primeiro cadastre sua moto, carro ou futura HR.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard title="Gasto do mês" value={formatCurrency(monthStats.totalExpenses)} icon={Receipt} color="blue" />
        <SummaryCard title="Combustível" value={formatCurrency(monthStats.totalFuel)} icon={Fuel} color="orange" />
        <SummaryCard title="Litros" value={`${formatNumber(monthStats.totalLiters, 2)} L`} icon={Fuel} color="green" />
        <SummaryCard title="Preço médio/L" value={formatCurrency(monthStats.avgLiterPrice)} icon={CreditCard} color="yellow" />
        <SummaryCard title="Km registrados" value={monthStats.kmTracked ? `${formatNumber(monthStats.kmTracked, 0)} km` : '—'} icon={Gauge} color="gray" />
      </div>

      <section className="space-y-3">
        <h2 className="section-title">Veículos cadastrados</h2>
        {vehicleList.length === 0 ? (
          <EmptyState
            icon={Car}
            title="Nenhum veículo cadastrado"
            description="Cadastre a moto, carro ou HR para começar o controle de combustível e despesas."
            action={<button className="btn-primary btn-sm" onClick={handleNewVehicle}><Plus className="w-3.5 h-3.5" /> Novo Veículo</button>}
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {vehicleList.map(vehicle => {
              const Icon = vehicleIcon(vehicle.type)
              const vehicleItems = expenseList.filter(item => item.vehicle_id === vehicle.id)
              const total = vehicleItems.reduce((sum, item) => sum + Number(item.amount || 0), 0)
              const lastFuel = vehicleItems.find(item => item.type === 'fuel')

              return (
                <div key={vehicle.id} className="card card-hover">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{vehicle.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {VEHICLE_TYPE_LABELS[vehicle.type] || vehicle.type}
                        {vehicle.plate ? ` · ${vehicle.plate}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Gasto registrado: <b>{formatCurrency(total)}</b>
                      </p>
                      {lastFuel && (
                        <p className="text-xs text-slate-500 mt-1">
                          Último abastecimento: {formatDate(lastFuel.expense_date)} · {formatCurrency(lastFuel.amount)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <button
                      className="btn-outline btn-sm col-span-3 sm:col-span-1"
                      onClick={() => { setSelectedVehicleId(vehicle.id); setExpenseModalOpen(true) }}
                    >
                      <Plus className="w-3.5 h-3.5" /> Despesa
                    </button>
                    <button
                      className="btn-outline btn-sm"
                      onClick={() => handleEditVehicle(vehicle)}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button
                      className="btn-danger btn-sm"
                      onClick={() => handleDeleteVehicle(vehicle)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="section-title">Últimas despesas de veículos</h2>
        {expenseList.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma despesa de veículo lançada"
            description="Abastecimentos, manutenções e outros gastos aparecerão aqui e também entram na seção Despesas da empresa."
          />
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Veículo</th>
                    <th>Tipo</th>
                    <th>Detalhes</th>
                    <th>Pagamento</th>
                    <th className="text-right">Valor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenseList.map(item => (
                    <tr key={item.id}>
                      <td>{formatDate(item.expense_date)}</td>
                      <td>
                        <div className="font-medium text-slate-800">{item.vehicles?.name || '—'}</div>
                        <div className="text-xs text-slate-500">{item.vehicles?.plate || VEHICLE_TYPE_LABELS[item.vehicles?.type] || ''}</div>
                      </td>
                      <td>{EXPENSE_TYPE_LABELS[item.type] || item.type}</td>
                      <td>
                        <div className="text-sm text-slate-700">{item.description}</div>
                        {item.type === 'fuel' && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            {FUEL_TYPE_LABELS[item.fuel_type] || item.fuel_type || 'Combustível'}
                            {item.liters ? ` · ${formatNumber(item.liters, 2)} L` : ''}
                            {item.unit_price ? ` · ${formatCurrency(item.unit_price)}/L` : ''}
                            {item.odometer_km ? ` · ${formatNumber(item.odometer_km, 0)} km` : ''}
                          </div>
                        )}
                        {(item.station_name || item.station_address) && (
                          <div className="text-xs text-slate-500 mt-0.5 flex gap-1 items-center">
                            <MapPin className="w-3 h-3" />
                            <span>{[item.station_name, item.station_address].filter(Boolean).join(' · ')}</span>
                          </div>
                        )}
                      </td>
                      <td>{item.payment_methods?.name || '—'}</td>
                      <td className="text-right font-bold">{formatCurrency(item.amount)}</td>
                      <td className="text-right">
                        <button className="btn-danger btn-sm" onClick={() => handleDeleteExpense(item)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <VehicleModal
        open={vehicleModalOpen}
        companyId={companyId}
        vehicle={editingVehicle}
        onClose={() => { setVehicleModalOpen(false); setEditingVehicle(null) }}
        onSuccess={() => { setVehicleModalOpen(false); setEditingVehicle(null); refetchVehicles() }}
      />

      <VehicleExpenseModal
        open={expenseModalOpen}
        companyId={companyId}
        userId={userId}
        vehicles={vehicleList}
        paymentMethods={paymentMethods || []}
        initialVehicleId={selectedVehicleId}
        onClose={() => setExpenseModalOpen(false)}
        onSuccess={() => { setExpenseModalOpen(false); refetchExpenses() }}
      />
    </div>
  )
}

function SummaryCard({ title, value, icon: Icon, color }) {
  const colors = {
    blue: 'bg-brand-50 text-brand-600',
    orange: 'bg-orange-50 text-orange-600',
    green: 'bg-success-50 text-success-600',
    yellow: 'bg-warning-50 text-warning-600',
    gray: 'bg-slate-100 text-slate-500',
  }
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xl font-display font-bold text-slate-900 mt-1 truncate">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors[color] || colors.blue}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  )
}

function VehicleModal({ open, companyId, vehicle, onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('motorcycle')
  const [plate, setPlate] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isEditing = Boolean(vehicle?.id)

  useEffect(() => {
    if (!open) return

    setName(vehicle?.name || '')
    setType(vehicle?.type || 'motorcycle')
    setPlate(vehicle?.plate || '')
    setModel(vehicle?.model || '')
    setYear(vehicle?.year ? String(vehicle.year) : '')
    setNotes(vehicle?.notes || '')
  }, [open, vehicle])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)

    const payload = {
      company_id: companyId,
      name,
      type,
      plate: plate || null,
      model: model || null,
      year: year ? Number(year) : null,
      notes: notes || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    const query = isEditing
      ? supabase.from('vehicles').update(payload).eq('id', vehicle.id).eq('company_id', companyId)
      : supabase.from('vehicles').insert(payload)

    const { error } = await query

    setSubmitting(false)
    if (error) {
      toast.error(error.message || (isEditing ? 'Erro ao atualizar veículo' : 'Erro ao cadastrar veículo'))
      return
    }

    toast.success(isEditing ? 'Veículo atualizado' : 'Veículo cadastrado')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar veículo' : 'Novo veículo'} maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nome do veículo" required>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Moto entrega, HR, Fiorino" required />
        </FormField>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectInput label="Tipo" value={type} onChange={setType} options={VEHICLE_TYPES} />
          <FormField label="Placa">
            <input className="input uppercase" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="ABC1D23" />
          </FormField>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Modelo">
            <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="Ex.: Honda CG, Hyundai HR" />
          </FormField>
          <FormField label="Ano">
            <input className="input" type="number" value={year} onChange={e => setYear(e.target.value)} placeholder="2026" />
          </FormField>
        </div>
        <FormField label="Observações">
          <textarea className="input min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Detalhes do veículo, documentos, uso, etc." />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={submitting}>{submitting ? 'Salvando...' : (isEditing ? 'Atualizar veículo' : 'Salvar veículo')}</button>
        </div>
      </form>
    </Modal>
  )
}

function VehicleExpenseModal({ open, companyId, userId, vehicles, paymentMethods, initialVehicleId, onClose, onSuccess }) {
  const [vehicleId, setVehicleId] = useState(initialVehicleId || vehicles[0]?.id || '')
  const [type, setType] = useState('fuel')
  const [description, setDescription] = useState('Abastecimento')
  const [amount, setAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(currentDate())
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [status, setStatus] = useState('paid')
  const [fuelType, setFuelType] = useState('gasoline')
  const [liters, setLiters] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [odometerKm, setOdometerKm] = useState('')
  const [stationName, setStationName] = useState('')
  const [stationAddress, setStationAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return

    setVehicleId(initialVehicleId || vehicles[0]?.id || '')
    setType('fuel')
    setDescription('Abastecimento')
    setAmount('')
    setExpenseDate(currentDate())
    setPaymentMethodId('')
    setStatus('paid')
    setFuelType('gasoline')
    setLiters('')
    setUnitPrice('')
    setOdometerKm('')
    setStationName('')
    setStationAddress('')
    setNotes('')
  }, [open, initialVehicleId, vehicles])

  const selectedVehicle = vehicles.find(v => v.id === vehicleId)
  const paymentOptions = paymentMethods
    .filter(pm => VEHICLE_PAYMENT_TYPES.includes(pm.type))
    .sort((a, b) => VEHICLE_PAYMENT_TYPES.indexOf(a.type) - VEHICLE_PAYMENT_TYPES.indexOf(b.type))
    .map(pm => ({ value: pm.id, label: `${pm.name}${PAYMENT_TYPES[pm.type] ? ` (${PAYMENT_TYPES[pm.type]})` : ''}` }))

  function handleTypeChange(value) {
    setType(value)
    const label = EXPENSE_TYPE_LABELS[value] || 'Despesa'
    setDescription(label)
  }

  function handleUnitPriceChange(value) {
    setUnitPrice(value)
    const parsedLiters = Number(String(liters || '').replace(',', '.')) || 0
    const parsedPrice = parseCurrency(value)
    if (parsedLiters > 0 && parsedPrice > 0) {
      setAmount(maskCurrency(Math.round(parsedLiters * parsedPrice * 100).toString()))
    }
  }

  function handleLitersChange(value) {
    setLiters(value)
    const parsedLiters = Number(String(value || '').replace(',', '.')) || 0
    const parsedPrice = parseCurrency(unitPrice)
    if (parsedLiters > 0 && parsedPrice > 0) {
      setAmount(maskCurrency(Math.round(parsedLiters * parsedPrice * 100).toString()))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedVehicle) {
      toast.error('Selecione um veículo')
      return
    }
    if (!paymentMethodId) {
      toast.error('Informe a forma de pagamento')
      return
    }

    const amountValue = parseCurrency(amount)
    if (amountValue <= 0) {
      toast.error('Informe um valor válido')
      return
    }

    setSubmitting(true)

    const expensePayload = {
      company_id: companyId,
      name: buildExpenseName(selectedVehicle.name, type),
      category: getExpenseCategory(type),
      amount: amountValue,
      due_date: expenseDate,
      recurrence: 'none',
      status,
      paid_at: status === 'paid' ? `${expenseDate}T12:00:00` : null,
      paid_amount: status === 'paid' ? amountValue : null,
      notes: notes || null,
      created_by: userId,
      payment_method_id: paymentMethodId,
      source_type: 'vehicle',
    }

    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert(expensePayload)
      .select('id')
      .single()

    if (expenseError) {
      setSubmitting(false)
      toast.error(expenseError.message || 'Erro ao criar despesa')
      return
    }

    const vehicleExpensePayload = {
      company_id: companyId,
      vehicle_id: vehicleId,
      expense_id: expense.id,
      type,
      description: description || EXPENSE_TYPE_LABELS[type],
      amount: amountValue,
      expense_date: expenseDate,
      payment_method_id: paymentMethodId,
      fuel_type: type === 'fuel' ? fuelType : null,
      liters: type === 'fuel' && liters ? Number(String(liters).replace(',', '.')) : null,
      unit_price: type === 'fuel' && unitPrice ? parseCurrency(unitPrice) : null,
      odometer_km: type === 'fuel' && odometerKm ? Number(odometerKm) : null,
      station_name: type === 'fuel' && stationName ? stationName : null,
      station_address: type === 'fuel' && stationAddress ? stationAddress : null,
      notes: notes || null,
      created_by: userId,
    }

    const { data: vehicleExpense, error: vehicleExpenseError } = await supabase
      .from('vehicle_expenses')
      .insert(vehicleExpensePayload)
      .select('id')
      .single()

    if (vehicleExpenseError) {
      await supabase.from('expenses').delete().eq('id', expense.id)
      setSubmitting(false)
      toast.error(vehicleExpenseError.message || 'Erro ao criar despesa do veículo')
      return
    }

    await supabase
      .from('expenses')
      .update({ source_id: vehicleExpense.id })
      .eq('id', expense.id)

    setSubmitting(false)
    toast.success('Despesa de veículo lançada')
    onSuccess()
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova despesa de veículo" maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectInput
            label="Veículo"
            value={vehicleId}
            onChange={setVehicleId}
            options={vehicles.map(v => ({ value: v.id, label: `${v.name}${v.plate ? ` - ${v.plate}` : ''}` }))}
            placeholder="Selecione"
            required
          />
          <SelectInput label="Tipo de despesa" value={type} onChange={handleTypeChange} options={EXPENSE_TYPES} required />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Descrição" required>
            <input className="input" value={description} onChange={e => setDescription(e.target.value)} required />
          </FormField>
          <FormField label="Data" required>
            <input className="input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} required />
          </FormField>
        </div>

        {type === 'fuel' && (
          <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <SelectInput label="Tipo de combustível" value={fuelType} onChange={setFuelType} options={FUEL_TYPES} />
              <FormField label="Km / Odômetro">
                <input className="input" type="number" min="0" value={odometerKm} onChange={e => setOdometerKm(e.target.value)} placeholder="Ex.: 12450" />
              </FormField>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Litros abastecidos">
                <input className="input" inputMode="decimal" value={liters} onChange={e => handleLitersChange(e.target.value)} placeholder="Ex.: 12,50" />
              </FormField>
              <FormField label="Valor por litro">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input className="input pl-8" value={unitPrice} onChange={e => handleUnitPriceChange(maskCurrency(e.target.value))} placeholder="0,00" inputMode="numeric" />
                </div>
              </FormField>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Posto / local">
                <input className="input" value={stationName} onChange={e => setStationName(e.target.value)} placeholder="Nome do posto" />
              </FormField>
              <FormField label="Endereço do abastecimento">
                <input className="input" value={stationAddress} onChange={e => setStationAddress(e.target.value)} placeholder="Opcional" />
              </FormField>
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4">
          <FormField label="Valor total" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
              <input className="input pl-8" value={amount} onChange={e => setAmount(maskCurrency(e.target.value))} placeholder="0,00" inputMode="numeric" required />
            </div>
          </FormField>
          <SelectInput label="Forma de pagamento" value={paymentMethodId} onChange={setPaymentMethodId} options={paymentOptions} placeholder="Selecione" required />
          <SelectInput label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} required />
        </div>

        <FormField label="Observações">
          <textarea className="input min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex.: abastecimento para entrega, revisão, troca de pneu, etc." />
        </FormField>

        <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 text-sm text-brand-900">
          Esta despesa será registrada também na seção <b>Despesas</b> da empresa, sem recorrência, para entrar no financeiro.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar despesa'}</button>
        </div>
      </form>
    </Modal>
  )
}

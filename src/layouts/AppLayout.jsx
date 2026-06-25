import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, Building2,
  Receipt, BarChart3, Settings, LogOut, Menu, X, Flame, ChevronDown,
  PlusCircle, Box, ChevronRight, Car, CalendarDays,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { can, roleLabel } from '../utils/permissions'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'dashboard' },
  { to: '/vendas/nova', icon: PlusCircle, label: 'Nova Venda', highlight: true, permission: 'newSale' },
  { to: '/vendas', icon: ShoppingCart, label: 'Vendas', permission: 'sales' },
  { to: '/estoque', icon: Box, label: 'Estoque', permission: 'stock' },
  { to: '/chegada-gas', icon: Truck, label: 'Chegada de Gás', permission: 'purchases' },
  { to: '/clientes', icon: Users, label: 'Clientes', permission: 'customers' },
  { to: '/fornecedores', icon: Building2, label: 'Fornecedores', permission: 'suppliers' },
  { to: '/produtos', icon: Package, label: 'Produtos', permission: 'products' },
  { to: '/veiculos', icon: Car, label: 'Veículos', permission: 'vehicles' },
  { to: '/calendario', icon: CalendarDays, label: 'Calendário', permission: 'calendar' },
  { to: '/despesas', icon: Receipt, label: 'Despesas', permission: 'expenses' },
  { to: '/relatorios', icon: BarChart3, label: 'Relatórios', permission: 'reports' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações', permission: 'settings' },
]

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const role = profile?.role || 'operator'
  const visibleNavItems = NAV_ITEMS.filter(item => can(role, item.permission))

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-100 flex flex-col
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0 lg:z-auto
      `}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-100">
          <div className="w-8 h-8 bg-gradient-to-br from-brand-600 to-orange-500 rounded-lg flex items-center justify-center shadow">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-slate-900 text-lg tracking-tight">GásMaster</span>
          <button
            className="ml-auto lg:hidden text-slate-400 hover:text-slate-600"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu lateral"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleNavItems.map(({ to, icon: Icon, label, highlight }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/vendas'}
              className={({ isActive }) =>
                highlight
                  ? `sidebar-link ${isActive ? 'active' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`
                  : `sidebar-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {highlight && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-60" />}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
              {profile?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {profile?.full_name || 'Usuário'}
              </p>
              <p className="text-xs text-slate-500">{roleLabel(profile?.role)}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-slate-400 hover:text-danger-600 transition-colors"
              title="Sair"
              aria-label="Sair do sistema"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar mobile */}
        <header className="h-16 bg-white border-b border-slate-100 flex items-center px-4 gap-4 lg:hidden">
          <button
            className="text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu lateral"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-brand-600 to-orange-500 rounded-md flex items-center justify-center">
              <Flame className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-display font-bold text-slate-900">GásMaster</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import SalesPage from './pages/SalesPage'
import NewSalePage from './pages/NewSalePage'
import StockPage from './pages/StockPage'
import PurchasesPage from './pages/PurchasesPage'
import CustomersPage from './pages/CustomersPage'
import SuppliersPage from './pages/SuppliersPage'
import ExpensesPage from './pages/ExpensesPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'
import ProductsPage from './pages/ProductsPage'
import VehiclesPage from './pages/VehiclesPage'
import CalendarPage from './pages/CalendarPage'
import { can } from './utils/permissions'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}


function PermissionRoute({ permission, children }) {
  const { profile, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!can(profile?.role, permission)) {
    return <AccessDeniedPage />
  }
  return children
}

function AccessDeniedPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="card max-w-md text-center">
        <h1 className="font-display text-xl font-bold text-slate-900">Acesso restrito</h1>
        <p className="text-sm text-slate-500 mt-2">
          Seu perfil não tem permissão para acessar esta área. Fale com um administrador da loja.
        </p>
        <Link to="/dashboard" className="btn-primary mt-4 inline-flex">
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">Carregando…</p>
      </div>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="card max-w-md text-center">
        <h1 className="font-display text-xl font-bold text-slate-900">Página não encontrada</h1>
        <p className="text-sm text-slate-500 mt-2">
          A rota acessada não existe ou foi alterada. Use o menu lateral para continuar.
        </p>
        <Link to="/dashboard" className="btn-primary mt-4 inline-flex">
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <AppLayout />
            </PrivateRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="vendas" element={<PermissionRoute permission="sales"><SalesPage /></PermissionRoute>} />
            <Route path="vendas/nova" element={<PermissionRoute permission="newSale"><NewSalePage /></PermissionRoute>} />
            <Route path="estoque" element={<PermissionRoute permission="stock"><StockPage /></PermissionRoute>} />
            <Route path="chegada-gas" element={<PermissionRoute permission="purchases"><PurchasesPage /></PermissionRoute>} />
            <Route path="compras" element={<Navigate to="/chegada-gas" replace />} />
            <Route path="clientes" element={<PermissionRoute permission="customers"><CustomersPage /></PermissionRoute>} />
            <Route path="fornecedores" element={<PermissionRoute permission="suppliers"><SuppliersPage /></PermissionRoute>} />
            <Route path="despesas" element={<PermissionRoute permission="expenses"><ExpensesPage /></PermissionRoute>} />
            <Route path="relatorios" element={<PermissionRoute permission="reports"><ReportsPage /></PermissionRoute>} />
            <Route path="produtos" element={<PermissionRoute permission="products"><ProductsPage /></PermissionRoute>} />
            <Route path="veiculos" element={<PermissionRoute permission="vehicles"><VehiclesPage /></PermissionRoute>} />
            <Route path="calendario" element={<PermissionRoute permission="calendar"><CalendarPage /></PermissionRoute>} />
            <Route path="configuracoes" element={<PermissionRoute permission="settings"><SettingsPage /></PermissionRoute>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={
            <PrivateRoute>
              <NotFoundPage />
            </PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

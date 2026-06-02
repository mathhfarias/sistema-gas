import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
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
            <Route path="vendas" element={<SalesPage />} />
            <Route path="vendas/nova" element={<NewSalePage />} />
            <Route path="estoque" element={<StockPage />} />
            <Route path="compras" element={<PurchasesPage />} />
            <Route path="clientes" element={<CustomersPage />} />
            <Route path="fornecedores" element={<SuppliersPage />} />
            <Route path="despesas" element={<ExpensesPage />} />
            <Route path="relatorios" element={<ReportsPage />} />
            <Route path="produtos" element={<ProductsPage />} />
            <Route path="veiculos" element={<VehiclesPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="configuracoes" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Gerente',
  operator: 'Operador',
  viewer: 'Consulta',
}

export const ROLE_DESCRIPTIONS = {
  admin: 'Acessa tudo, gerencia usuários e configurações críticas.',
  manager: 'Acessa operação, relatórios, estoque e correções, mas não gerencia admins.',
  operator: 'Cadastra vendas e consulta informações operacionais do dia a dia.',
  viewer: 'Apenas visualiza dashboards, estoque e relatórios.',
}

export const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Gerente' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Consulta' },
]

export const PERMISSIONS = {
  dashboard: ['admin', 'manager', 'operator', 'viewer'],
  newSale: ['admin', 'manager', 'operator'],
  sales: ['admin', 'manager', 'operator', 'viewer'],
  stock: ['admin', 'manager', 'operator', 'viewer'],
  purchases: ['admin', 'manager'],
  customers: ['admin', 'manager', 'operator'],
  suppliers: ['admin', 'manager'],
  products: ['admin', 'manager'],
  vehicles: ['admin', 'manager'],
  calendar: ['admin', 'manager', 'operator', 'viewer'],
  expenses: ['admin', 'manager'],
  reports: ['admin', 'manager', 'viewer'],
  settings: ['admin'],
  manageUsers: ['admin'],
  audit: ['admin', 'manager'],
}

export function can(role, permission) {
  const allowedRoles = PERMISSIONS[permission] || []
  return allowedRoles.includes(role || 'operator')
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || 'Operador'
}

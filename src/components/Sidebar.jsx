import { NavLink } from 'react-router-dom'

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
  }`

export default function Sidebar({ role }) {
  const adminLinks = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/revendas', label: 'Revendas' },
  ]
  const revendaLinks = [
    { to: '/app/dashboard', label: 'Dashboard' },
    { to: '/app/clientes', label: 'Clientes' },
    { to: '/app/financeiro', label: 'Financeiro' },
    { to: '/app/configuracoes', label: 'Configurações' },
  ]
  const links = role === 'admin' ? adminLinks : revendaLinks
  const badge = role === 'admin' ? 'Admin' : 'Revenda'

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-950">
      <div className="border-b border-gray-800 px-4 py-5">
        <div className="text-lg font-bold text-white">Gestor IPTV</div>
        <span className="mt-1 inline-block rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs text-indigo-200">
          {badge}
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {links.map(({ to, label }) => (
          <NavLink key={to} to={to} className={linkClass} end={to.endsWith('dashboard')}>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}

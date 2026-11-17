import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  CakeSlice,
  Images,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Package,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navigation = [
  { name: 'Panel principal', href: '/admin', icon: LayoutDashboard },
  { name: 'Cotizaciones', href: '/admin/cotizaciones', icon: ClipboardList },
  { name: 'Pedidos y pagos', href: '/admin/pedidos', icon: Package },
  { name: 'Agenda', href: '/admin/agenda', icon: CalendarDays },
  { name: 'Clientes', href: '/admin/clientes', icon: Users },
  { name: 'Catálogo y precios', href: '/admin/catalogo', icon: CakeSlice },
  { name: 'Fotografías', href: '/admin/fotografias', icon: Images },
];

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onClose }) => {
  const { logout, user } = useAuth();

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Cerrar menú"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300">
              <CakeSlice className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-lg font-bold tracking-tight text-white">MAYI</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Eventos y pastelería
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 md:hidden" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-6">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Operación
          </div>
          {navigation.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              end={item.href === '/admin'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3.5 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/70 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-500/40 bg-cyan-500/20 text-sm font-semibold text-cyan-300">
              {user?.name?.[0]?.toUpperCase() || 'M'}
            </div>
            <div className="truncate">
              <p className="truncate text-xs font-medium text-white">{user?.name || 'Administradora'}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.email || 'Mayi'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </>
  );
};

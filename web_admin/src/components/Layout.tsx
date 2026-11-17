import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

const titles: Record<string, string> = {
  '/admin': 'Resumen del negocio',
  '/admin/cotizaciones': 'Cotizador express',
  '/admin/pedidos': 'Pedidos y pagos',
  '/admin/agenda': 'Agenda de producción',
  '/admin/clientes': 'Clientes',
  '/admin/catalogo': 'Catálogo y precios',
  '/admin/fotografias': 'Fotografías propias',
};

export const Layout: React.FC = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="admin-theme min-h-screen bg-slate-950 text-slate-100">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="min-h-screen md:ml-64 flex flex-col min-w-0">
        <Navbar
          title={titles[location.pathname] || 'Mayi'}
          onMenuClick={() => setMobileOpen((open) => !open)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

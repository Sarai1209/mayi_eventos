import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { QuotesPage } from './pages/QuotesPage';
import { OrdersPage } from './pages/OrdersPage';
import { AgendaPage } from './pages/AgendaPage';
import { CustomersPage } from './pages/CustomersPage';
import { CatalogPage } from './pages/CatalogPage';
import { MediaPage } from './pages/MediaPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-cyan-400">
        Cargando Mayi...
      </div>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/admin/login" replace />;
};

export const AdminApp: React.FC = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/login" element={<LoginPage />} />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="cotizaciones" element={<QuotesPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="clientes" element={<CustomersPage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="fotografias" element={<MediaPage />} />
        </Route>
        <Route path="/login" element={<Navigate to="/admin/login" replace />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
);

export default AdminApp;

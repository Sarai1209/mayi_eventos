import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, ClipboardList, CreditCard, RefreshCw, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { DashboardSummary } from '../types';
import { formatCOP, mayicService } from '../services/mayicService';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      setSummary(await mayicService.dashboard());
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el resumen.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Resumen de Mayi</h2>
          <p className="mt-1 text-sm text-slate-400">
            Cotizaciones, pagos y producción desde un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={load} className="action-secondary">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </button>
          <Link to="/admin/cotizaciones" className="action-primary">
            <ClipboardList className="h-4 w-4" /> Nueva cotización
          </Link>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {loading ? (
        <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin text-cyan-400" /> Cargando resumen…
        </div>
      ) : summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Pedidos registrados" value={summary.total_orders} subtitle="Todos los estados" icon={<ClipboardList className="h-5 w-5" />} />
            <MetricCard title="Anticipos por verificar" value={summary.pending_verification} subtitle="Requieren conciliación manual" color="amber" icon={<AlertCircle className="h-5 w-5" />} />
            <MetricCard title="Pedidos confirmados" value={summary.confirmed_orders} subtitle="Con anticipo verificado" color="emerald" icon={<CalendarDays className="h-5 w-5" />} />
            <MetricCard title="Pagos recibidos del mes" value={formatCOP(summary.month_revenue)} subtitle="Anticipos y saldos registrados" color="indigo" icon={<Wallet className="h-5 w-5" />} />
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h3 className="font-semibold text-white">Próximas entregas y montajes</h3>
                <p className="mt-1 text-xs text-slate-500">Pedidos con anticipo verificado</p>
              </div>
              <Link to="/admin/agenda" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">Ver agenda</Link>
            </div>
            {summary.upcoming.length ? (
              <div className="divide-y divide-slate-800">
                {summary.upcoming.map((order) => (
                  <div key={order.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{order.customer.name} <span className="ml-1 text-xs text-slate-500">{order.code}</span></p>
                      <p className="mt-1 text-sm text-slate-400">
                        {new Date(`${order.service_date}T12:00:00`).toLocaleDateString('es-CO')} · {order.time_slot === 'MORNING' ? 'Mañana' : order.time_slot === 'AFTERNOON' ? 'Tarde' : 'Noche'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-white">{formatCOP(order.total_amount)}</span>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                <CreditCard className="mx-auto mb-3 h-7 w-7 text-slate-600" />
                Aún no hay pedidos confirmados en la agenda.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

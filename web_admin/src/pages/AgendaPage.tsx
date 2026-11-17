import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { AgendaDay } from '../types';
import { mayicService } from '../services/mayicService';
import { StatusBadge } from '../components/StatusBadge';

const monthNames = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const AgendaPage: React.FC = () => {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [days, setDays] = useState<Record<string, AgendaDay>>({});
  const [selectedDate, setSelectedDate] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setDays(await mayicService.agenda(month.getFullYear(), month.getMonth() + 1));
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cargar la agenda.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [month]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(firstWeekday).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [month]);

  const moveMonth = (amount: number) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setSelectedDate('');
  };

  const dayKey = (day: number) => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const selectedOrders = selectedDate ? days[selectedDate]?.orders || [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Agenda de producción</h2>
        <p className="mt-1 text-sm text-slate-400">Solo los anticipos verificados bloquean una franja. El semáforo muestra el cupo confirmado.</p>
      </div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <button onClick={() => moveMonth(-1)} aria-label="Mes anterior" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><ChevronLeft className="h-5 w-5" /></button>
            <h3 className="text-lg font-semibold capitalize text-white">{monthNames[month.getMonth()]} {month.getFullYear()}</h3>
            <button onClick={() => moveMonth(1)} aria-label="Mes siguiente" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-slate-500 sm:gap-2">
            {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day) => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {cells.map((day, index) => {
              const key = day ? dayKey(day) : `blank-${index}`;
              const schedule = day ? days[key] : undefined;
              const isSelected = selectedDate === key;
              return (
                <button
                  type="button"
                  key={key}
                  disabled={!day}
                  onClick={() => day && setSelectedDate(key)}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition ${
                    !day ? 'invisible' : isSelected ? 'bg-cyan-500 text-slate-950' : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {day}
                  {day && (
                    <span className={`mt-1 h-2 w-2 rounded-full ${
                      !schedule ? 'bg-emerald-500' : schedule.status === 'RED' ? 'bg-rose-500' : 'bg-amber-400'
                    }`} />
                  )}
                  {schedule && <span className="absolute right-1 top-1 text-[9px] text-slate-400">{schedule.orders.length}</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-800 pt-4 text-xs text-slate-400">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Disponible</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Capacidad parcial</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Capacidad completa</span>
          </div>
          {loading && <p className="mt-3 text-xs text-slate-500">Actualizando agenda…</p>}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4">
            <CalendarDays className="h-4 w-4 text-cyan-300" />
            <h3 className="font-semibold text-white">{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' }) : 'Selecciona un día'}</h3>
          </div>
          {selectedDate && selectedOrders.length ? (
            <div className="space-y-3 p-4">
              {selectedOrders.map((order) => <article key={order.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-white">{order.customer.name}</p><StatusBadge status={order.status} /></div>
                <p className="mt-2 text-sm text-slate-400">{order.service_type === 'ON_SITE' ? 'Montaje presencial' : 'Entrega en taller'} · {order.time_slot === 'MORNING' ? 'Mañana' : order.time_slot === 'AFTERNOON' ? 'Tarde' : 'Noche'}</p>
                <p className="mt-1 text-xs text-slate-500">{order.code} · {order.customer.phone}</p>
              </article>)}
            </div>
          ) : selectedDate ? (
            <div className="p-8 text-center text-sm text-slate-500">Sin pedidos confirmados para esta fecha.</div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Selecciona un día del calendario para consultar sus reservas.</div>
          )}
        </section>
      </div>
    </div>
  );
};

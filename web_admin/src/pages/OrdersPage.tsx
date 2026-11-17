import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, Download, RefreshCw, Upload } from 'lucide-react';
import { Order } from '../types';
import { formatCOP, mayicService, statusLabels } from '../services/mayicService';
import { StatusBadge } from '../components/StatusBadge';

export const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [files, setFiles] = useState<Record<number, File | undefined>>({});
  const [references, setReferences] = useState<Record<number, string>>({});
  const [methods, setMethods] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setOrders(await mayicService.orders());
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const run = async (id: number, action: () => Promise<unknown>, message: string) => {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(message);
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No fue posible actualizar el pedido.');
    } finally {
      setBusy(null);
    }
  };

  const upload = (order: Order) => {
    const file = files[order.id];
    if (!file) {
      setError('Selecciona el comprobante antes de cargarlo.');
      return;
    }
    void run(order.id, () => mayicService.uploadProof(order.id, file, references[order.id] || ''), 'Soporte cargado. El anticipo queda pendiente de verificación.');
  };

  const reject = (order: Order) => {
    const reason = window.prompt('Motivo para rechazar el comprobante:');
    if (reason?.trim()) void run(order.id, () => mayicService.rejectProof(order.id, reason), 'Soporte rechazado; la cotización volvió a quedar pendiente.');
  };

  const downloadProof = async (order: Order) => {
    try {
      const blob = await mayicService.proof(order.id);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `comprobante-${order.code}`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo descargar el comprobante.');
    }
  };

  const visible = filter === 'ALL' ? orders : orders.filter((order) => order.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h2 className="text-xl font-bold text-white">Pedidos y pagos</h2><p className="mt-1 text-sm text-slate-400">Verifica los anticipos y autoriza las entregas solo cuando el pedido esté liquidado.</p></div>
        <button onClick={load} className="action-secondary"><RefreshCw className="h-4 w-4" />Actualizar</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ['ALL', 'Todos'],
          ['WEB_REQUEST_PENDING', 'Solicitudes web'],
          ['QUOTE_PENDING', 'Cotizados'],
          ['PAYMENT_REVIEW', 'Por verificar'],
          ['DEPOSIT_CONFIRMED', 'Confirmados'],
          ['PAID_DELIVERED', 'Liquidados'],
          ['EXPIRED', 'Vencidos'],
        ].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-xs font-medium ${filter === value ? 'bg-cyan-500 text-slate-950' : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-white'}`}>{label}</button>)}
      </div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div>}
      {loading ? <div className="py-12 text-center text-sm text-slate-500">Cargando pedidos…</div> : visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-500">No hay pedidos para este filtro.</div>
      ) : (
        <div className="space-y-4">
          {visible.map((order) => (
            <article key={order.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex flex-col justify-between gap-4 lg:flex-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{order.customer.name}</h3><span className="font-mono text-xs text-slate-500">{order.code}</span><StatusBadge status={order.status} /></div>
                  <p className="mt-1 text-sm text-slate-400">{order.customer.phone} · {new Date(`${order.service_date}T12:00:00`).toLocaleDateString('es-CO')} · {order.service_type === 'ON_SITE' ? 'Montaje presencial' : 'Entrega en taller'}</p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span>{order.status === 'WEB_REQUEST_PENDING' ? 'Estimado: ' : 'Total: '}<b className="text-slate-200">{formatCOP(order.total_amount)}{order.details.requires_manual_quote ? ' + por cotizar' : ''}</b></span>
                    {order.status === 'WEB_REQUEST_PENDING'
                      ? <span>El pedido aún no está confirmado ni cotizado</span>
                      : <><span>Anticipo: <b className="text-slate-200">{formatCOP(order.deposit_amount)}</b></span><span>Saldo: <b className="text-slate-200">{formatCOP(order.balance_amount)}</b></span></>}
                    <span>{statusLabels[order.status]}</span>
                  </div>
                </div>
                {order.status === 'WEB_REQUEST_PENDING' && (
                  <div className="flex flex-col gap-2 lg:w-[280px]">
                    <a
                      className="action-secondary justify-center"
                      href={`https://wa.me/${order.customer.phone.replace(/\D/g, '').length === 10 ? `57${order.customer.phone.replace(/\D/g, '')}` : order.customer.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >Contactar por WhatsApp</a>
                    {order.details.requires_manual_quote && <p className="text-xs text-amber-300">Hay productos sin precio configurado; confirma el valor antes de cotizar.</p>}
                  </div>
                )}
                {order.status === 'QUOTE_PENDING' && (
                  <div className="flex flex-col gap-2 lg:w-[430px]">
                    {order.rejection_reason && <p className="text-xs text-amber-300">Rechazo anterior: {order.rejection_reason}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={(e) => setFiles({ ...files, [order.id]: e.target.files?.[0] })} className="min-w-0 flex-1 text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:text-slate-200" />
                      <input value={references[order.id] || ''} onChange={(e) => setReferences({ ...references, [order.id]: e.target.value })} placeholder="Referencia bancaria" className="form-input sm:max-w-44" />
                    </div>
                    <button disabled={busy === order.id} onClick={() => upload(order)} className="action-secondary justify-center"><Upload className="h-4 w-4" />{busy === order.id ? 'Cargando…' : 'Cargar soporte de anticipo'}</button>
                  </div>
                )}
                {order.status === 'PAYMENT_REVIEW' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {order.proof_available && <button onClick={() => downloadProof(order)} className="action-secondary"><Download className="h-4 w-4" />Comprobante</button>}
                    <button disabled={busy === order.id} onClick={() => void run(order.id, () => mayicService.confirmDeposit(order.id), 'Anticipo confirmado y fecha reservada.')} className="action-primary"><Check className="h-4 w-4" />Confirmar anticipo</button>
                    <button disabled={busy === order.id} onClick={() => reject(order)} className="rounded-xl border border-rose-500/30 px-4 py-2.5 text-sm font-medium text-rose-300 hover:bg-rose-500/10">Rechazar soporte</button>
                  </div>
                )}
                {order.status === 'DEPOSIT_CONFIRMED' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select className="form-input w-auto" value={methods[order.id] || 'CASH'} onChange={(e) => setMethods({ ...methods, [order.id]: e.target.value })}><option value="CASH">Efectivo</option><option value="BANK_TRANSFER">Transferencia</option><option value="CARD">Tarjeta</option></select>
                    <button disabled={busy === order.id} onClick={() => void run(order.id, () => mayicService.settle(order.id, methods[order.id] || 'CASH'), 'Pedido liquidado y despacho autorizado.')} className="action-primary">Liquidar y autorizar despacho</button>
                  </div>
                )}
              </div>
              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Detalle</p>
                {order.details.origin === 'STOREFRONT' && (
                  <div className="mb-3 space-y-1 text-xs text-slate-400">
                    <p>Hora: {order.details.event_time} · Modalidad: {order.details.delivery_mode}</p>
                    {order.details.delivery_address && <p>Dirección: {order.details.delivery_address}</p>}
                  </div>
                )}
                <div className="space-y-3">
                  {order.details.items.map((item, index) => (
                    <div key={`${item.item_id}-${index}`} className="text-xs text-slate-400">
                      <p>{item.quantity} × {item.name} · {order.details.requires_manual_quote && item.unit_price === 0 ? 'Precio por confirmar' : formatCOP(item.subtotal)}</p>
                      {item.customizations && Object.entries(item.customizations).filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value)).length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3 text-slate-500">
                          {Object.entries(item.customizations)
                            .filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))
                            .map(([label, value]) => (
                              <li key={label}>{label.replace('__', ' — ')}: {Array.isArray(value) ? value.join(', ') : value}</li>
                            ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
                {order.details.notes && <p className="mt-2 text-xs text-slate-500">{order.details.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

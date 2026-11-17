import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { CatalogItem, Order } from '../types';
import { formatCOP, mayicService, QuotePayload } from '../services/mayicService';

const dateAfterThreeDays = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface QuoteLine {
  item_id: number;
  quantity: number;
}

export const QuotesPage: React.FC = () => {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  const [productType, setProductType] = useState('CAKE');
  const [serviceType, setServiceType] = useState('WORKSHOP');
  const [serviceDate, setServiceDate] = useState(dateAfterThreeDays);
  const [timeSlot, setTimeSlot] = useState('MORNING');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<Order | null>(null);

  useEffect(() => {
    mayicService.catalog().then((items) => {
      const active = items.filter((item) => item.active);
      setCatalog(active);
      setLines(active.length ? [{ item_id: active[0].id, quantity: 1 }] : []);
    }).catch((requestError: any) => {
      setError(requestError.response?.data?.message || 'No se pudo cargar el catálogo.');
    });
  }, []);

  const total = useMemo(
    () => lines.reduce((sum, line) => {
      const item = catalog.find((candidate) => candidate.id === line.item_id);
      return sum + (item?.unit_price || 0) * line.quantity;
    }, 0),
    [catalog, lines],
  );

  const updateLine = (index: number, patch: Partial<QuoteLine>) => {
    setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line));
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCreated(null);
    setSaving(true);
    const payload: QuotePayload = {
      customer,
      product_type: productType,
      service_type: serviceType,
      service_date: serviceDate,
      time_slot: timeSlot,
      items: lines,
      notes,
    };
    try {
      setCreated(await mayicService.createQuote(payload));
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo crear la cotización.');
    } finally {
      setSaving(false);
    }
  };

  const whatsappUrl = created
    ? `https://wa.me/${created.customer.phone.replace(/\D/g, '').replace(/^0/, '57')}?text=${encodeURIComponent(
      `Hola ${created.customer.name}, te comparto la cotización ${created.code} de Mayi.\nTotal: ${formatCOP(created.total_amount)}\nAnticipo (50%): ${formatCOP(created.deposit_amount)}\nFecha solicitada: ${created.service_date}. La cotización vence en 48 horas.`,
    )}`
    : '';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">Cotizador express</h2>
        <p className="mt-1 text-sm text-slate-400">Calcula el total y el anticipo del 50% con los precios vigentes del catálogo.</p>
      </div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      {created && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
            <div className="flex-1">
              <p className="font-semibold text-emerald-200">Cotización {created.code} creada</p>
              <p className="mt-1 text-sm text-emerald-100/80">Total {formatCOP(created.total_amount)} · Anticipo 50%: {formatCOP(created.deposit_amount)} · Vigencia de 48 horas.</p>
              <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                Enviar por WhatsApp <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={create} className="space-y-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <h3 className="mb-4 font-semibold text-white">Datos del cliente</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="form-label">Nombre<input className="form-input" required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label>
            <label className="form-label">WhatsApp / teléfono<input className="form-input" required type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></label>
            <label className="form-label">Correo (opcional)<input className="form-input" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <h3 className="mb-4 font-semibold text-white">Servicio y entrega</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="form-label">Tipo de producto<select className="form-input" value={productType} onChange={(e) => setProductType(e.target.value)}><option value="CAKE">Torta temática</option><option value="DESSERT_TABLE">Mesa de postres</option><option value="EVENT_SETUP">Montaje / decoración</option></select></label>
            <label className="form-label">Modalidad<select className="form-input" value={serviceType} onChange={(e) => setServiceType(e.target.value)}><option value="WORKSHOP">Entrega en taller</option><option value="ON_SITE">Montaje presencial</option></select></label>
            <label className="form-label">Fecha solicitada<input className="form-input" type="date" min={dateAfterThreeDays()} required value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
            <label className="form-label">Franja horaria<select className="form-input" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}><option value="MORNING">Mañana</option><option value="AFTERNOON">Tarde</option><option value="EVENING">Noche</option></select></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h3 className="font-semibold text-white">Productos y adicionales</h3><p className="mt-1 text-xs text-slate-500">El precio final se calcula y valida nuevamente en el servidor.</p></div>
            <button type="button" onClick={() => setLines([...lines, { item_id: catalog[0]?.id || 0, quantity: 1 }])} disabled={!catalog.length} className="action-secondary"><Plus className="h-4 w-4" />Agregar</button>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => {
              const selected = catalog.find((item) => item.id === line.item_id);
              return (
                <div key={`${index}-${line.item_id}`} className="grid items-end gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-[1fr_110px_150px_40px]">
                  <label className="form-label">Producto<select className="form-input" value={line.item_id} required onChange={(e) => updateLine(index, { item_id: Number(e.target.value) })}>{catalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatCOP(item.unit_price)}</option>)}</select></label>
                  <label className="form-label">Cantidad<input className="form-input" type="number" min="1" max="100" required value={line.quantity} onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })} /></label>
                  <div className="pb-3 text-sm font-semibold text-slate-200">{formatCOP((selected?.unit_price || 0) * line.quantity)}</div>
                  <button type="button" title="Quitar línea" onClick={() => setLines(lines.filter((_, position) => position !== index))} className="mb-3 rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
            {!lines.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">Agrega productos activos al catálogo para cotizar.</p>}
          </div>
          <label className="form-label mt-4">Notas del pedido<textarea className="form-input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Diseño, sabores, referencias…" /></label>
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs text-slate-500">Total cotizado</p><p className="text-2xl font-bold text-white">{formatCOP(total)}</p><p className="mt-1 text-sm text-cyan-300">Anticipo 50%: {formatCOP(total * 0.5)}</p></div>
            <button type="submit" disabled={saving || !lines.length} className="action-primary justify-center">{saving ? 'Guardando…' : 'Crear cotización'}</button>
          </div>
        </section>
      </form>
    </div>
  );
};

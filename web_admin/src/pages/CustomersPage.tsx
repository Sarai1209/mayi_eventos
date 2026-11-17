import React, { useEffect, useState } from 'react';
import { AlertCircle, Plus, Users } from 'lucide-react';
import { Customer } from '../types';
import { mayicService } from '../services/mayicService';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setCustomers(await mayicService.customers());
      setError('');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mayicService.createCustomer(form);
      setForm({ name: '', phone: '', email: '' });
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo guardar el cliente.');
    }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-white">Clientes</h2><p className="mt-1 text-sm text-slate-400">Los clientes también se agregan automáticamente al emitir una cotización.</p></div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      <form onSubmit={save} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="form-label">Nombre<input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="form-label">Teléfono / WhatsApp<input className="form-input" required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="form-label">Correo opcional<input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <button type="submit" className="action-primary self-end justify-center"><Plus className="h-4 w-4" />Guardar cliente</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4"><Users className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold text-white">Directorio</h3><span className="ml-auto text-xs text-slate-500">{customers.length} clientes</span></div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Cargando clientes…</p> : customers.length ? (
          <div className="divide-y divide-slate-800">{customers.map((customer) => <div key={customer.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="font-medium text-white">{customer.name}</span><span className="text-sm text-slate-400">{customer.phone}</span><span className="text-sm text-slate-500">{customer.email || 'Sin correo registrado'}</span></div>)}</div>
        ) : <p className="p-10 text-center text-sm text-slate-500">Todavía no hay clientes registrados.</p>}
      </section>
    </div>
  );
};

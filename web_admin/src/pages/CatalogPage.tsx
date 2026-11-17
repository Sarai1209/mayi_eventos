import React, { useEffect, useState } from 'react';
import { AlertCircle, CakeSlice, ImagePlus, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { CatalogItem, CustomizationField, ImageCategory } from '../types';
import { formatCOP, mayicService } from '../services/mayicService';

const categories = [
  ['CAKE', 'Tortas'],
  ['SAVORY', 'Línea salada'],
  ['DESSERT', 'Postres'],
  ['DRINK', 'Bebidas'],
  ['TABLE', 'Montajes de mesa'],
  ['FINISH', 'Acabados'],
  ['EXTRA', 'Adicionales'],
  ['SETUP', 'Montaje y transporte'],
];

const imageCategoryByProductCategory: Partial<Record<string, ImageCategory>> = {
  CAKE: 'CAKE',
  SAVORY: 'SAVORY',
  DESSERT: 'DESSERT',
  DRINK: 'DRINK',
  TABLE: 'TABLE',
};

export const CatalogPage: React.FC = () => {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [form, setForm] = useState({ name: '', category: 'CAKE', description: '', unit_price: '' });
  const [editing, setEditing] = useState<number | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editingOptions, setEditingOptions] = useState<number | null>(null);
  const [optionsDraft, setOptionsDraft] = useState<CustomizationField[]>([]);
  const [uploadingChoice, setUploadingChoice] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      setItems(await mayicService.catalog());
      setError('');
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cargar el catálogo.');
    }
  };
  useEffect(() => { load(); }, []);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      await mayicService.saveCatalogItem({ ...form, unit_price: Number(form.unit_price), active: true });
      setForm({ name: '', category: 'CAKE', description: '', unit_price: '' });
      setNotice('Producto agregado al catálogo.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo guardar el producto.');
    }
  };

  const updatePrice = async (item: CatalogItem) => {
    setError('');
    try {
      await mayicService.saveCatalogItem({ ...item, unit_price: Number(editPrice) });
      setEditing(null);
      setNotice('Precio actualizado.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo actualizar el precio.');
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    try {
      await mayicService.saveCatalogItem({ ...item, active: !item.active });
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cambiar el estado del producto.');
    }
  };

  const saveOptions = async (item: CatalogItem) => {
    setError('');
    try {
      await mayicService.saveCatalogItem({ ...item, customization_fields: optionsDraft });
      setEditingOptions(null);
      setNotice('Opciones de personalización actualizadas.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || requestError.message || 'No se pudieron guardar las opciones.');
    }
  };

  const updateOptionField = (index: number, patch: Partial<CustomizationField>) => {
    setOptionsDraft((current) => current.map((field, fieldIndex) =>
      fieldIndex === index ? { ...field, ...patch } : field,
    ));
  };

  const updateOptionChoice = (
    fieldIndex: number,
    choiceIndex: number,
    patch: Partial<CustomizationField['choices'][number]>,
  ) => {
    setOptionsDraft((current) => current.map((field, index) => index === fieldIndex
      ? { ...field, choices: field.choices.map((choice, optionIndex) =>
        optionIndex === choiceIndex ? { ...choice, ...patch } : choice,
      ) }
      : field));
  };

  const uploadChoiceImage = async (
    item: CatalogItem,
    fieldIndex: number,
    choiceIndex: number,
    file?: File,
  ) => {
    if (!file) return;
    const category = imageCategoryByProductCategory[item.category];
    if (!category) {
      setError('Las fotos para alternativas solo están disponibles en productos de tortas, salados, postres, bebidas y montajes.');
      return;
    }
    const key = `${fieldIndex}-${choiceIndex}`;
    setUploadingChoice(key);
    setError('');
    setNotice('');
    try {
      const [uploaded] = await mayicService.uploadImages([file], category, item.id);
      const published = await mayicService.updateImage(uploaded.id, { is_published: true });
      updateOptionChoice(fieldIndex, choiceIndex, {
        image_id: published.id,
        image_url: published.url,
      });
      setNotice(`Foto de «${optionsDraft[fieldIndex].choices[choiceIndex].label}» cargada. Guarda las opciones para publicarla en el catálogo.`);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cargar la foto de esta alternativa.');
    } finally {
      setUploadingChoice(null);
    }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold text-white">Catálogo y precios</h2><p className="mt-1 text-sm text-slate-400">Los precios aquí definidos alimentan el cálculo de las cotizaciones.</p></div>
      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4" />{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}
      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1.2fr_150px_auto]">
        <label className="form-label">Nombre<input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="form-label">Categoría<select className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-label">Descripción<input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <label className="form-label">Precio COP<input className="form-input" type="number" min="0" step="100" required value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></label>
        <button type="submit" className="action-primary self-end justify-center"><Plus className="h-4 w-4" />Agregar</button>
      </form>

      <div className="space-y-4">
        {categories.map(([category, label]) => {
          const group = items.filter((item) => item.category === category);
          if (!group.length) return null;
          return <section key={category} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-4"><CakeSlice className="h-4 w-4 text-cyan-300" /><h3 className="font-semibold text-white">{label}</h3></div>
            <div className="divide-y divide-slate-800">{group.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="min-w-0 flex-1"><p className="font-medium text-white">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.description || 'Sin descripción'}</p></div>
              <div className="flex items-center gap-3">
                {editing === item.id ? <>
                  <input className="form-input w-32" type="number" min="0" step="100" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} />
                  <button onClick={() => updatePrice(item)} title="Guardar precio" className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/10"><Save className="h-4 w-4" /></button>
                </> : <>
                  <span className="min-w-28 text-right font-semibold text-slate-100">{formatCOP(item.unit_price)}</span>
                  <button onClick={() => { setEditing(item.id); setEditPrice(String(item.unit_price)); }} title="Editar precio" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><Pencil className="h-4 w-4" /></button>
                </>}
                <button onClick={() => toggleActive(item)} className={`rounded-lg px-3 py-2 text-xs font-medium ${item.active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>{item.active ? 'Activo' : 'Inactivo'}</button>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  setEditingOptions(editingOptions === item.id ? null : item.id);
                  setOptionsDraft((item.customization_fields || []).map((field) => ({
                    ...field,
                    choices: field.choices.map((choice) => ({ ...choice })),
                  })));
                }}
              >
                {editingOptions === item.id ? 'Cerrar opciones' : 'Personalización'}
              </button>
              {editingOptions === item.id && (
                <div className="w-full space-y-4">
                  <p className="text-xs text-slate-400">Configura los campos que verá el cliente. Las alternativas pueden tener recargos en COP.</p>
                  {optionsDraft.map((field, fieldIndex) => (
                    <div key={`${item.id}-${fieldIndex}`} className="space-y-3 rounded-xl border border-slate-700 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="form-label">Nombre del campo<input className="form-input" value={field.label} onChange={(event) => updateOptionField(fieldIndex, { label: event.target.value })} /></label>
                        <label className="form-label">Tipo<select className="form-input" value={field.type} onChange={(event) => updateOptionField(fieldIndex, { type: event.target.value as CustomizationField['type'], choices: event.target.value === 'select' ? field.choices : [], multiple: event.target.value === 'select' ? field.multiple : false, max_selections: event.target.value === 'select' ? field.max_selections : null })}><option value="select">Una opción</option><option value="text">Texto corto</option><option value="textarea">Texto largo</option></select></label>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-300">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={field.required} onChange={(event) => updateOptionField(fieldIndex, { required: event.target.checked })} />Obligatorio</label>
                        {field.type === 'select' && <label className="flex items-center gap-2"><input type="checkbox" checked={field.allow_other} onChange={(event) => updateOptionField(fieldIndex, { allow_other: event.target.checked })} />Permitir «Otro / Personalizar»</label>}
                        {field.type === 'select' && <label className="flex items-center gap-2"><input type="checkbox" checked={!!field.multiple} onChange={(event) => updateOptionField(fieldIndex, { multiple: event.target.checked })} />Permitir varias selecciones</label>}
                        {field.type === 'select' && field.multiple && <label className="flex items-center gap-2">Máximo (opcional)<input className="form-input w-24" type="number" min="1" value={field.max_selections ?? ''} onChange={(event) => updateOptionField(fieldIndex, { max_selections: event.target.value ? Number(event.target.value) : null })} /></label>}
                        <button type="button" className="text-rose-300 hover:text-rose-200" onClick={() => setOptionsDraft((current) => current.filter((_, index) => index !== fieldIndex))}>Eliminar campo</button>
                      </div>
                      {field.type === 'select' && <div className="space-y-2">
                        {field.choices.map((choice, choiceIndex) => {
                          const uploadKey = `${fieldIndex}-${choiceIndex}`;
                          return <div key={choiceIndex} className="grid gap-2 rounded-lg border border-slate-800 p-3 sm:grid-cols-[1fr_160px_auto]">
                            <input className="form-input" aria-label="Nombre de la alternativa" value={choice.label} placeholder="Ej. Chocolate" onChange={(event) => updateOptionChoice(fieldIndex, choiceIndex, { label: event.target.value })} />
                            <input className="form-input" aria-label="Recargo en pesos" type="number" min="0" step="100" value={choice.surcharge} onChange={(event) => updateOptionChoice(fieldIndex, choiceIndex, { surcharge: Number(event.target.value) })} />
                            <button type="button" className="rounded-lg px-3 text-xs text-rose-300 hover:bg-rose-500/10" onClick={() => updateOptionField(fieldIndex, { choices: field.choices.filter((_, index) => index !== choiceIndex) })}>Quitar</button>
                            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
                              {choice.image_url && <img className="h-16 w-16 rounded-lg object-cover" src={choice.image_url} alt={`Foto de ${choice.label}`} />}
                              {choice.image_id && !choice.image_url && <span className="text-xs text-amber-300">La foto anterior ya no está disponible o no está publicada. Vuelve a cargarla.</span>}
                              <label className="action-secondary cursor-pointer">
                                <ImagePlus className="h-4 w-4" />
                                {uploadingChoice === uploadKey ? 'Subiendo foto...' : choice.image_url ? 'Cambiar foto' : 'Subir foto de esta opción'}
                                <input
                                  className="sr-only"
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  disabled={uploadingChoice !== null}
                                  onChange={(event) => {
                                    void uploadChoiceImage(item, fieldIndex, choiceIndex, event.target.files?.[0]);
                                    event.currentTarget.value = '';
                                  }}
                                />
                              </label>
                              {choice.image_url && <button type="button" className="text-xs text-rose-300 hover:text-rose-200" onClick={() => updateOptionChoice(fieldIndex, choiceIndex, { image_id: undefined, image_url: null })}><Trash2 className="mr-1 inline h-3 w-3" />Quitar foto</button>}
                              <span className="text-xs text-slate-500">JPG, PNG o WebP · máximo 5 MB</span>
                            </div>
                          </div>;
                        })}
                        <button type="button" className="text-xs text-cyan-300 hover:text-cyan-200" onClick={() => updateOptionField(fieldIndex, { choices: [...field.choices, { label: '', surcharge: 0 }] })}>+ Agregar alternativa</button>
                      </div>}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800" onClick={() => setOptionsDraft((current) => [...current, { label: '', type: 'select', required: false, allow_other: false, multiple: false, max_selections: null, choices: [{ label: '', surcharge: 0 }] }])}>+ Agregar campo</button>
                    <button type="button" className="action-primary" onClick={() => saveOptions(item)}><Save className="h-4 w-4" />Guardar opciones</button>
                  </div>
                </div>
              )}
            </div>)}</div>
          </section>;
        })}
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Eye, EyeOff, ImagePlus, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import { CatalogItem, ImageCategory, ManagedImage } from '../types';
import { mayicService } from '../services/mayicService';

const imageCategories: Array<{ value: ImageCategory; label: string; productCategory?: string }> = [
  { value: 'CAKE', label: 'Tortas', productCategory: 'CAKE' },
  { value: 'SAVORY', label: 'Línea salada', productCategory: 'SAVORY' },
  { value: 'DESSERT', label: 'Línea dulce', productCategory: 'DESSERT' },
  { value: 'DRINK', label: 'Bebidas', productCategory: 'DRINK' },
  { value: 'TABLE', label: 'Montajes de mesa', productCategory: 'TABLE' },
  { value: 'FEATURED', label: 'Fotografías principales y banners' },
];

type UploadCategory = ImageCategory | 'CAKE_FLAVOR' | 'CAKE_FILLING';

const uploadCategories: Array<{ value: UploadCategory; label: string; productCategory?: string }> = [
  imageCategories[0],
  { value: 'CAKE_FLAVOR', label: 'Sabores del bizcocho', productCategory: 'CAKE' },
  { value: 'CAKE_FILLING', label: 'Rellenos', productCategory: 'CAKE' },
  ...imageCategories.slice(1),
];

type Assignment = {
  category: ImageCategory;
  catalog_item_id: number | null;
  position_x: number;
  position_y: number;
  zoom: number;
};

export const MediaPage: React.FC = () => {
  const [images, setImages] = useState<ManagedImage[]>([]);
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const previewUrls = useRef<string[]>([]);
  const [assignments, setAssignments] = useState<Record<number, Assignment>>({});
  const [category, setCategory] = useState<UploadCategory>('CAKE');
  const [productId, setProductId] = useState('');
  const [choiceLabel, setChoiceLabel] = useState('');
  const [filter, setFilter] = useState<ImageCategory | 'ALL'>('ALL');
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [replacing, setReplacing] = useState<{ id: number; file: File; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const productsForCategory = useMemo(() => {
    const productCategory = uploadCategories.find((entry) => entry.value === category)?.productCategory;
    return products.filter((item) =>
      item.category === productCategory
      && !(item.category === 'CAKE' && ['sabores del bizcocho', 'rellenos'].includes(item.name.trim().toLocaleLowerCase('es'))),
    );
  }, [category, products]);
  const isCakeOptionCategory = category === 'CAKE_FLAVOR' || category === 'CAKE_FILLING';
  const selectedProduct = productsForCategory.find((item) => String(item.id) === productId);
  const selectedOptionField = selectedProduct?.customization_fields.find((field) =>
    category === 'CAKE_FLAVOR' ? /sabor|bizcocho/i.test(field.label) : /relleno/i.test(field.label),
  );
  const selectedOptionChoices = selectedOptionField?.choices || [];

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [catalog, assets] = await Promise.all([mayicService.catalog(), mayicService.images()]);
      setProducts(catalog);
      setImages(assets);
      setAssignments(Object.fromEntries(assets.map((asset) => [
        asset.id,
        {
          category: asset.category,
          catalog_item_id: asset.catalog_item_id,
          position_x: asset.position_x,
          position_y: asset.position_y,
          zoom: asset.zoom,
        },
      ])));
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudieron cargar las fotografías.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    let active = true;
    Promise.all(images.map(async (image) => {
      const blob = await mayicService.imageFile(image.id);
      return [image.id, URL.createObjectURL(blob)] as const;
    })).then((entries) => {
      if (!active) {
        entries.forEach(([, url]) => URL.revokeObjectURL(url));
        return;
      }
      previewUrls.current.forEach(URL.revokeObjectURL);
      previewUrls.current = entries.map(([, url]) => url);
      const urls = Object.fromEntries(entries);
      setPreviews(urls);
    }).catch((requestError: any) => {
      if (active) setError(requestError.response?.data?.message || 'No se pudieron previsualizar las fotografías guardadas.');
    });
    return () => {
      active = false;
    };
  }, [images]);

  useEffect(() => () => previewUrls.current.forEach(URL.revokeObjectURL), []);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setFilePreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  useEffect(() => () => {
    if (replacing) URL.revokeObjectURL(replacing.url);
  }, [replacing]);

  const changeCategory = (next: UploadCategory) => {
    setCategory(next);
    setProductId('');
    setChoiceLabel('');
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files.length) {
      setError('Selecciona al menos una fotografía.');
      return;
    }
    setError('');
    setNotice('');
    if (isCakeOptionCategory && (!selectedProduct || !selectedOptionField || !choiceLabel || files.length !== 1)) {
      setError('Selecciona la torta, el sabor o relleno y una sola fotografía.');
      return;
    }
    setBusy(true);
    try {
      if (isCakeOptionCategory) {
        if (!selectedProduct || !selectedOptionField) {
          throw new Error('No se pudo encontrar la torta y opción seleccionadas. Vuelve a seleccionarlas.');
        }
        const [uploaded] = await mayicService.uploadImages(
          files,
          'CAKE',
          selectedProduct.id,
        );
        const published = await mayicService.updateImage(uploaded.id, { is_published: true });
        const customizationFields = selectedProduct.customization_fields.map((field) => ({
          ...field,
          choices: field.choices.map((choice) =>
            field.label === selectedOptionField.label && choice.label === choiceLabel
              ? { ...choice, image_id: published.id, image_url: undefined }
              : choice,
          ),
        }));
        await mayicService.saveCatalogItem({
          ...selectedProduct,
          customization_fields: customizationFields,
        });
        setNotice(`Foto guardada para «${choiceLabel}» en ${selectedProduct.name}. Ya aparece en la tienda.`);
      } else {
        await mayicService.uploadImages(files, category, productId ? Number(productId) : null);
        setNotice('Fotografías guardadas como borrador. Revisa la vista previa y publícalas cuando estén listas.');
      }
      setFiles([]);
      setChoiceLabel('');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudieron guardar las fotografías.');
    } finally {
      setBusy(false);
    }
  };

  const updateAssignment = (imageId: number, patch: Partial<Assignment>) => {
    setAssignments((current) => ({
      ...current,
      [imageId]: { ...current[imageId], ...patch },
    }));
  };

  const saveAssignment = async (image: ManagedImage) => {
    const assignment = assignments[image.id];
    setBusy(true);
    setError('');
    try {
      await mayicService.updateImage(image.id, assignment);
      setNotice('Asociación y encuadre de la fotografía guardados.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo actualizar la asociación.');
    } finally {
      setBusy(false);
    }
  };

  const togglePublished = async (image: ManagedImage) => {
    setBusy(true);
    setError('');
    try {
      await mayicService.updateImage(image.id, { is_published: !image.is_published });
      setNotice(image.is_published ? 'Fotografía retirada del catálogo público.' : 'Fotografía publicada en el catálogo.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo cambiar el estado de publicación.');
    } finally {
      setBusy(false);
    }
  };

  const replace = async () => {
    if (!replacing) return;
    setBusy(true);
    setError('');
    try {
      await mayicService.replaceImage(replacing.id, replacing.file);
      setNotice('Fotografía reemplazada. La nueva imagen conserva el estado de publicación anterior.');
      URL.revokeObjectURL(replacing.url);
      setReplacing(null);
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo reemplazar la fotografía.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: ManagedImage) => {
    if (!window.confirm(`¿Eliminar la fotografía "${image.original_name}"? Esta acción no se puede deshacer.`)) return;
    setBusy(true);
    setError('');
    try {
      await mayicService.deleteImage(image.id);
      setNotice('Fotografía eliminada.');
      await load();
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || 'No se pudo eliminar la fotografía.');
    } finally {
      setBusy(false);
    }
  };

  const shownImages = images.filter((image) => filter === 'ALL' || image.category === filter);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Fotografías propias de MayC</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Sube fotos reales desde tu computador o celular. Las cargas quedan privadas hasta que las publiques.
            Se aceptan JPG, PNG y WebP de hasta 5 MB cada una.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="action-secondary" disabled={loading || busy}>
          <RefreshCw className="h-4 w-4" />Actualizar
        </button>
      </header>

      {error && <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">{notice}</div>}

      <form onSubmit={upload} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div>
          <h3 className="font-semibold text-white">Agregar fotografías</h3>
          <p className="mt-1 text-xs text-slate-400">{isCakeOptionCategory
            ? 'Elige una torta y una opción. La foto se asociará directamente a ese sabor o relleno.'
            : 'Puedes elegir varias. Antes de publicar, cada archivo se guarda como borrador y puedes revisar su vista previa.'}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-label">Categoría
            <select className="form-input" value={category} onChange={(event) => changeCategory(event.target.value as UploadCategory)}>
              {uploadCategories.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
          {category !== 'FEATURED' && <label className="form-label">{isCakeOptionCategory ? 'Torta' : 'Producto (opcional)'}
            <select className="form-input" required={isCakeOptionCategory} value={productId} onChange={(event) => { setProductId(event.target.value); setChoiceLabel(''); }}>
              <option value="">{isCakeOptionCategory ? 'Selecciona una torta' : 'Solo organizar por categoría'}</option>
              {productsForCategory.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>}
          {isCakeOptionCategory && selectedProduct && <label className="form-label sm:col-span-2">{category === 'CAKE_FLAVOR' ? 'Sabor del bizcocho' : 'Relleno'}
            <select className="form-input" required value={choiceLabel} onChange={(event) => setChoiceLabel(event.target.value)}>
              <option value="">Selecciona la opción para esta foto</option>
              {selectedOptionChoices.map((choice) => <option key={choice.label} value={choice.label}>{choice.label}</option>)}
            </select>
            {!selectedOptionChoices.length && <span className="text-xs text-amber-300">Esta torta no tiene opciones de este tipo configuradas todavía.</span>}
          </label>}
        </div>
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/60 p-5 text-center hover:border-cyan-400">
          <ImagePlus className="h-7 w-7 text-cyan-300" />
          <span className="text-sm font-medium text-slate-200">Seleccionar fotografías</span>
          <span className="text-xs text-slate-500">{isCakeOptionCategory ? 'Una foto por sabor o relleno · JPG, PNG o WebP · máximo 5 MB' : 'JPG, PNG o WebP · máximo 10 por carga'}</span>
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple={!isCakeOptionCategory} onChange={(event) => setFiles(Array.from(event.target.files || []))} />
        </label>
        {files.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {files.map((file, index) => <div key={`${file.name}-${index}`} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
            <img className="h-28 w-full object-cover" src={filePreviews[index]} alt={`Vista previa de ${file.name}`} />
            <p className="truncate p-2 text-xs text-slate-300" title={file.name}>{file.name}</p>
          </div>)}
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{isCakeOptionCategory ? 'La foto se guardará y aparecerá junto a la opción seleccionada en la tienda.' : 'Al cargar, las imágenes todavía no serán visibles para los clientes.'}</p>
          <button type="submit" className="action-primary" disabled={busy || !files.length}>
            <Upload className="h-4 w-4" />{busy ? 'Guardando...' : isCakeOptionCategory ? 'Guardar foto de la opción' : 'Guardar como borrador'}
          </button>
        </div>
      </form>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-white">Biblioteca de imágenes</h3><p className="mt-1 text-xs text-slate-500">{images.length} fotografía(s) guardada(s)</p></div>
          <label className="form-label flex-row items-center gap-2">Organizar
            <select className="form-input min-w-48" value={filter} onChange={(event) => setFilter(event.target.value as ImageCategory | 'ALL')}>
              <option value="ALL">Todas las categorías</option>
              {imageCategories.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
        </div>
        {loading ? <p className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">Cargando biblioteca...</p>
          : shownImages.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400"><Camera className="mx-auto mb-2 h-7 w-7 text-slate-500" />Todavía no hay fotografías en esta categoría.</div>
            : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shownImages.map((image) => {
                const assignment = assignments[image.id] || {
                  category: image.category,
                  catalog_item_id: image.catalog_item_id,
                  position_x: image.position_x,
                  position_y: image.position_y,
                  zoom: image.zoom,
                };
                const validProducts = products.filter((product) => product.category === imageCategories.find((entry) => entry.value === assignment.category)?.productCategory);
                return <article key={image.id} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <div className="media-frame-preview">
                    {previews[image.id] ? <img
                      src={previews[image.id]}
                      alt={`Vista previa: ${image.original_name}`}
                      style={{
                        objectPosition: `${assignment.position_x}% ${assignment.position_y}%`,
                        transform: `scale(${assignment.zoom / 100})`,
                        transformOrigin: `${assignment.position_x}% ${assignment.position_y}%`,
                      }}
                    /> : <div className="grid h-full place-items-center bg-slate-950 text-slate-500"><Camera className="h-8 w-8" /></div>}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium text-white" title={image.original_name}>{image.original_name}</p><p className="mt-1 text-xs text-slate-500">{image.is_published ? 'Visible en la tienda' : 'Borrador privado'}</p></div>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${image.is_published ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{image.is_published ? 'Publicada' : 'Borrador'}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="form-label">Categoría
                        <select className="form-input" value={assignment.category} onChange={(event) => updateAssignment(image.id, { category: event.target.value as ImageCategory, catalog_item_id: null })}>
                          {imageCategories.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
                        </select>
                      </label>
                      {assignment.category !== 'FEATURED' && <label className="form-label">Producto
                        <select className="form-input" value={assignment.catalog_item_id ?? ''} onChange={(event) => updateAssignment(image.id, { catalog_item_id: event.target.value ? Number(event.target.value) : null })}>
                          <option value="">Sin producto</option>
                          {validProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </label>}
                    </div>
                    <fieldset className="space-y-3 rounded-xl border border-slate-700 p-3">
                      <legend className="px-1 text-xs font-semibold text-slate-300">Ajustar encuadre de la foto</legend>
                      <label className="media-range-control">Encuadre horizontal <span>{assignment.position_x}%</span>
                        <input type="range" min="0" max="100" value={assignment.position_x} onChange={(event) => updateAssignment(image.id, { position_x: Number(event.target.value) })} />
                      </label>
                      <label className="media-range-control">Encuadre vertical <span>{assignment.position_y}%</span>
                        <input type="range" min="0" max="100" value={assignment.position_y} onChange={(event) => updateAssignment(image.id, { position_y: Number(event.target.value) })} />
                      </label>
                      <label className="media-range-control">Acercamiento <span>{assignment.zoom}%</span>
                        <input type="range" min="100" max="200" step="5" value={assignment.zoom} onChange={(event) => updateAssignment(image.id, { zoom: Number(event.target.value) })} />
                      </label>
                      <p className="text-[11px] leading-relaxed text-slate-500">Mueve el foco y ajusta el acercamiento hasta que se vea como quieres en las tarjetas del catálogo.</p>
                    </fieldset>
                    <button
                      type="button"
                      className="action-secondary w-full justify-center"
                      disabled={busy || (
                        assignment.category === image.category
                        && assignment.catalog_item_id === image.catalog_item_id
                        && assignment.position_x === image.position_x
                        && assignment.position_y === image.position_y
                        && assignment.zoom === image.zoom
                      )}
                      onClick={() => void saveAssignment(image)}
                    >
                      <Save className="h-4 w-4" />Guardar encuadre y asociación
                    </button>
                    {replacing?.id === image.id && <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-slate-950 p-3">
                      <img className="h-32 w-full rounded-lg object-cover" src={replacing.url} alt={`Vista previa para reemplazar ${image.original_name}`} />
                      <p className="truncate text-xs text-slate-300">{replacing.file.name}</p>
                      <div className="flex gap-2">
                        <button type="button" className="action-primary flex-1 justify-center" disabled={busy} onClick={() => void replace()}>Confirmar reemplazo</button>
                        <button type="button" aria-label="Cancelar reemplazo" className="action-secondary" onClick={() => { URL.revokeObjectURL(replacing.url); setReplacing(null); }}><X className="h-4 w-4" /></button>
                      </div>
                    </div>}
                    <div className="flex flex-wrap gap-2">
                      <label className="action-secondary flex-1 cursor-pointer justify-center">
                        <RefreshCw className="h-4 w-4" />Cambiar foto
                        <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            if (replacing) URL.revokeObjectURL(replacing.url);
                            setReplacing({ id: image.id, file, url: URL.createObjectURL(file) });
                          }
                          event.target.value = '';
                        }} />
                      </label>
                      <button type="button" className={`action-secondary flex-1 justify-center ${image.is_published ? 'text-amber-300' : 'text-emerald-300'}`} disabled={busy} onClick={() => void togglePublished(image)}>
                        {image.is_published ? <><EyeOff className="h-4 w-4" />Retirar</> : <><Eye className="h-4 w-4" />Publicar</>}
                      </button>
                      <button type="button" title="Eliminar fotografía" aria-label={`Eliminar ${image.original_name}`} className="action-secondary text-rose-300" disabled={busy} onClick={() => void remove(image)}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </article>;
              })}
            </div>}
      </section>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Heart,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CatalogItem, CustomizationField, ManagedImage, ProductImage } from '../types';
import { formatCOP, mayicService } from '../services/mayicService';

type StoreCategory = 'CAKE' | 'SAVORY' | 'DESSERT' | 'DRINK' | 'TABLE';
type CakeInfoTab = 'sizes' | 'flavors' | 'fillings';

interface CartLine {
  id: string;
  item: CatalogItem;
  quantity: number;
  customizations: Record<string, string | string[]>;
}

const categorySections: Array<{ key: StoreCategory; title: string; eyebrow: string; description: string }> = [
  { key: 'CAKE', title: 'Catálogo de tortas', eyebrow: 'Para celebrar', description: 'Un pastelito hecho a tu medida hace cualquier momento inolvidable.' },
  { key: 'SAVORY', title: 'Línea salada', eyebrow: 'Para compartir', description: 'Bocados deliciosos, preparados con amor para tus invitados.' },
  { key: 'DESSERT', title: 'Línea dulce', eyebrow: 'Un toque dulce', description: 'Pequeños antojos y postres para endulzar la celebración.' },
  { key: 'DRINK', title: 'Bebidas', eyebrow: 'Para brindar', description: 'Completa tu mesa con bebidas frescas para todos.' },
  { key: 'TABLE', title: 'Montajes de mesa', eyebrow: 'Momentos especiales', description: 'Decoración con detalles cuidados para que solo disfrutes.' },
];

const ImagePlaceholder: React.FC<{ label?: string }> = ({ label = 'Foto propia próximamente' }) => (
  <div className="store-image-placeholder" role="img" aria-label={label}>
    <Camera size={25} strokeWidth={1.4} />
    <span>{label}</span>
  </div>
);

const imageFrameStyle = (image: ProductImage): React.CSSProperties => ({
  objectPosition: `${image.position_x ?? 50}% ${image.position_y ?? 50}%`,
  transform: `scale(${(image.zoom ?? 100) / 100})`,
  transformOrigin: `${image.position_x ?? 50}% ${image.position_y ?? 50}%`,
});

const categoryLabel = (category: string) =>
  categorySections.find((section) => section.key === category)?.title || 'Mayi recomienda';

const categoryGuidance: Record<StoreCategory, { title: string; description: string }> = {
  CAKE: {
    title: 'Arma tu torta paso a paso',
    description: 'Elige tamaño, sabores y acabados disponibles para esta presentación. Si buscas algo diferente, cuéntanos tu idea.',
  },
  SAVORY: {
    title: 'Prepara tu pedido salado',
    description: 'Indica la cantidad y las variedades que necesites. Si una variedad no aparece, puedes solicitarla en las indicaciones.',
  },
  DESSERT: {
    title: 'Personaliza tu pedido dulce',
    description: 'Revisa las opciones disponibles para este postre, define la cantidad y agrega instrucciones si tienes una solicitud especial.',
  },
  DRINK: {
    title: 'Elige tu bebida',
    description: 'Selecciona la variedad publicada y la cantidad. Las opciones no configuradas se pueden consultar en las observaciones.',
  },
  TABLE: {
    title: 'Cuéntanos sobre tu evento',
    description: 'Selecciona un montaje y comparte los detalles del lugar y la celebración. El total puede requerir confirmación según el servicio.',
  },
};

const fieldSelection = (value: string | string[] | undefined): string[] => {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
};

export const StorefrontPage: React.FC = () => {
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [featuredImages, setFeaturedImages] = useState<ManagedImage[]>([]);
  const [productImageIndexes, setProductImageIndexes] = useState<Record<number, number>>({});
  const [featuredImageIndex, setFeaturedImageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const saved = window.localStorage.getItem('mayi-store-cart');
      const parsed = saved ? JSON.parse(saved) as CartLine[] : [];
      return Array.isArray(parsed)
        ? parsed.map((line) => ({ ...line, customizations: line.customizations || {}, item: { ...line.item, customization_fields: line.item.customization_fields || [] } }))
        : [];
    } catch {
      return [];
    }
  });
  const [favorites, setFavorites] = useState<number[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [configuringItem, setConfiguringItem] = useState<CatalogItem | null>(null);
  const [configuringLineId, setConfiguringLineId] = useState<string | null>(null);
  const [draftCustomizations, setDraftCustomizations] = useState<Record<string, string | string[]>>({});
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [referenceFileName, setReferenceFileName] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [deliveryMode, setDeliveryMode] = useState('Recoger en el local');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [toast, setToast] = useState('');
  const [cakeInfoTab, setCakeInfoTab] = useState<CakeInfoTab>('sizes');

  useEffect(() => {
    mayicService.publicCatalog()
      .then((catalog) => {
        setProducts(catalog);
        setCart((current) => current.map((line) => ({
          ...line,
          item: catalog.find((item) => item.id === line.item.id) || line.item,
        })));
      })
      .catch((requestError: any) => {
        setError(requestError.response?.data?.message || 'No pudimos cargar el catálogo. Intenta actualizar la página.');
      })
      .finally(() => setLoading(false));
    mayicService.publicImages('FEATURED')
      .then(setFeaturedImages)
      .catch(() => setError('No se pudieron cargar las fotografías principales.'));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    try {
      window.localStorage.setItem('mayi-store-cart', JSON.stringify(cart));
    } catch {
      setError('No se pudo guardar el pedido en este dispositivo. Revisa el espacio disponible del navegador.');
    }
  }, [cart]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es');
    return products.filter((item) =>
      ['CAKE', 'SAVORY', 'DESSERT', 'DRINK', 'TABLE'].includes(item.category)
      && !(item.category === 'CAKE' && ['sabores del bizcocho', 'rellenos'].includes(item.name.trim().toLocaleLowerCase('es')))
      && (!favoritesOnly || favorites.includes(item.id))
      && (!term || `${item.name} ${item.description || ''}`.toLocaleLowerCase('es').includes(term)),
    );
  }, [products, search, favoritesOnly, favorites]);

  const productGroups = useMemo(
    () => Object.fromEntries(
      categorySections.map(({ key }) => [key, filteredProducts.filter((item) => item.category === key)]),
    ) as Record<StoreCategory, CatalogItem[]>,
    [filteredProducts],
  );

  const totalItems = cart.reduce((total, line) => total + line.quantity, 0);
  const lineSurcharge = (line: CartLine) => (line.item.customization_fields || []).reduce((total, field) => {
    const selected = fieldSelection(line.customizations[field.label]);
    return total + selected.reduce((fieldTotal, value) =>
      fieldTotal + (field.choices.find((choice) => choice.label === value)?.surcharge || 0), 0);
  }, 0);
  const lineTotal = (line: CartLine) => (line.item.unit_price + lineSurcharge(line)) * line.quantity;
  const totalPrice = cart.reduce((total, line) => total + lineTotal(line), 0);
  const hasUnpricedProducts = cart.some((line) => line.item.unit_price <= 0);
  const draftSurcharge = configuringItem
    ? (configuringItem.customization_fields || []).reduce((total, field) => {
      const selected = fieldSelection(draftCustomizations[field.label]);
      return total + selected.reduce((fieldTotal, value) =>
        fieldTotal + (field.choices.find((choice) => choice.label === value)?.surcharge || 0), 0);
    }, 0)
    : 0;
  const draftUnitPrice = configuringItem ? configuringItem.unit_price + draftSurcharge : 0;

  const openConfigurator = (item: CatalogItem, line?: CartLine) => {
    setConfiguringItem(item);
    setConfiguringLineId(line?.id || null);
    setDraftCustomizations(line ? { ...line.customizations } : {});
    setDraftQuantity(line?.quantity || 1);
    setReferenceFileName(line?.customizations.__imagenReferencia as string || '');
    setCartOpen(false);
  };

  const closeConfigurator = () => {
    if (configuringLineId) setCartOpen(true);
    setConfiguringItem(null);
    setConfiguringLineId(null);
  };

  const createCartLine = (item: CatalogItem): CartLine => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    item,
    quantity: 1,
    customizations: {},
  });

  const toggleMultipleChoice = (field: CustomizationField, choice: string) => {
    const current = fieldSelection(draftCustomizations[field.label]);
    const next = current.includes(choice)
      ? current.filter((entry) => entry !== choice)
      : [...current, choice];
    if (field.max_selections && next.length > field.max_selections) {
      setToast(`Puedes elegir hasta ${field.max_selections} opciones en «${field.label}».`);
      return;
    }
    setDraftCustomizations((values) => ({ ...values, [field.label]: next }));
  };

  const saveConfiguredProduct = (event: React.FormEvent) => {
    event.preventDefault();
    if (!configuringItem) return;
    const missingField = (configuringItem.customization_fields || []).find((field) => {
      const selected = fieldSelection(draftCustomizations[field.label]);
      if (field.type !== 'select') {
        return field.required && !String(draftCustomizations[field.label] || '').trim();
      }
      return field.required && selected.length === 0
        || selected.includes('Otro') && !String(draftCustomizations[`${field.label}__otro`] || '').trim();
    });
    if (missingField) {
      setToast(`Completa «${missingField.label}» para continuar.`);
      return;
    }
    if (!Number.isInteger(draftQuantity) || draftQuantity < 1 || draftQuantity > 100) {
      setToast('La cantidad debe estar entre 1 y 100.');
      return;
    }
    const customizations = {
      ...draftCustomizations,
      __imagenReferencia: referenceFileName,
    };
    if (configuringLineId) {
      setCart((current) => current.map((line) => line.id === configuringLineId
        ? { ...line, item: configuringItem, quantity: draftQuantity, customizations }
        : line));
      setToast('Actualizamos las opciones de tu producto.');
    } else {
      setCart((current) => [...current, {
        ...createCartLine(configuringItem),
        quantity: draftQuantity,
        customizations,
      }]);
      setToast(`${configuringItem.name} agregado a tu pedido.`);
    }
    setConfiguringItem(null);
    setConfiguringLineId(null);
    setCartOpen(true);
  };

  const changeQuantity = (lineId: string, amount: number) => {
    setCart((current) => current
      .map((line) => line.id === lineId ? { ...line, quantity: Math.min(100, line.quantity + amount) } : line)
      .filter((line) => line.quantity > 0));
  };

  const toggleFavorite = (itemId: number) => {
    setFavorites((current) => current.includes(itemId)
      ? current.filter((id) => id !== itemId)
      : [...current, itemId]);
  };

  const sendWhatsAppOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return;
    if (!customerName.trim()) {
      setCheckoutError('Escribe tu nombre para continuar.');
      document.getElementById('store-customer-name')?.focus();
      return;
    }
    if (customerPhone.replace(/\D/g, '').length < 7) {
      setCheckoutError('Escribe un número de WhatsApp válido para que Mayi pueda contactarte.');
      document.getElementById('store-customer-phone')?.focus();
      return;
    }
    if (!eventDate || eventDate < minimumEventDate) {
      setCheckoutError('Elige una fecha con al menos 3 días de anticipación.');
      document.getElementById('store-event-date')?.focus();
      return;
    }
    if (!eventTime) {
      setCheckoutError('Selecciona la hora del pedido.');
      document.getElementById('store-event-time')?.focus();
      return;
    }
    if ((deliveryMode === 'Domicilio' || deliveryMode === 'Servicio en el evento') && !deliveryAddress.trim()) {
      setCheckoutError('Escribe la dirección de entrega o el lugar del evento.');
      document.getElementById('store-delivery-address')?.focus();
      return;
    }
    const unavailableItem = cart.find((line) => !products.some((item) => item.id === line.item.id));
    if (unavailableItem) {
      setCheckoutError(`${unavailableItem.item.name} ya no está disponible en el catálogo. Retíralo del pedido y vuelve a intentar.`);
      return;
    }
    const missingCustomization = cart.find((line) =>
      (line.item.customization_fields || []).some((field) =>
        field.type !== 'select' && field.required
          && !String(line.customizations[field.label] || '').trim()
        || field.type === 'select' && field.required
          && fieldSelection(line.customizations[field.label]).length === 0
        || field.type === 'select' && fieldSelection(line.customizations[field.label]).includes('Otro')
          && !String(line.customizations[`${field.label}__otro`] || '').trim(),
      ),
    );
    if (missingCustomization) {
      setCheckoutError(`Completa las opciones obligatorias de ${missingCustomization.item.name}.`);
      return;
    }
    const detail = cart.map((cartLine) => {
      const { item, quantity, customizations } = cartLine;
      const line = [`• ${quantity} × ${item.name}: ${item.unit_price > 0 ? formatCOP(lineTotal(cartLine)) : 'Precio a confirmar'}`];
      (item.customization_fields || []).forEach((field) => {
        const values = fieldSelection(customizations[field.label]);
        const detailValues = values.map((value) => value === 'Otro'
          ? `Otro: ${String(customizations[`${field.label}__otro`] || '')}`
          : value);
        if (detailValues.length) line.push(`   ${field.label}: ${detailValues.join(', ')}`);
      });
      if (String(customizations.__solicitudAdicional || '').trim()) {
        line.push(`   Solicitud adicional: ${String(customizations.__solicitudAdicional).trim()}`);
      }
      if (customizations.__imagenReferencia) {
        line.push(`   Imagen de referencia para adjuntar: ${customizations.__imagenReferencia}`);
      }
      return line.join('\n');
    }).join('\n');
    const message = [
      `¡Hola, Mayi! Soy ${customerName}. Quiero cotizar este pedido:`,
      '',
      detail,
      '',
      `Fecha del evento/entrega: ${eventDate || 'Por definir'}`,
      `Hora: ${eventTime || 'Por definir'}`,
      `Entrega: ${deliveryMode}${(deliveryMode === 'Domicilio' || deliveryMode === 'Servicio en el evento') && deliveryAddress.trim() ? ` - ${deliveryAddress.trim()}` : ''}`,
      `Observaciones: ${orderNotes.trim() || 'Ninguna'}`,
      `${hasUnpricedProducts ? `Total parcial de referencia: ${formatCOP(totalPrice)} (hay productos por cotizar)` : `Total estimado: ${formatCOP(totalPrice)}`}`,
      `Mi WhatsApp: ${customerPhone}`,
      '¿Me ayudas a confirmar disponibilidad y el valor final?',
    ];
    setCheckoutError('');
    setSubmittingOrder(true);
    try {
      const savedOrder = await mayicService.createStoreOrder({
        customer: { name: customerName.trim(), phone: customerPhone.trim() },
        service_date: eventDate,
        event_time: eventTime,
        delivery_mode: deliveryMode,
        delivery_address: deliveryAddress.trim(),
        notes: orderNotes.trim(),
        items: cart.map(({ item, quantity, customizations }) => ({
          item_id: item.id,
          quantity,
          customizations,
        })),
      });
      message.splice(1, 0, `Referencia de solicitud: ${savedOrder.code}`);
      window.location.assign(`https://wa.me/573138688314?text=${encodeURIComponent(message.join('\n'))}`);
    } catch (requestError: any) {
      setCheckoutError(requestError.response?.data?.message || 'No pudimos guardar tu solicitud. Intenta de nuevo; todavía no se abrió WhatsApp.');
    } finally {
      setSubmittingOrder(false);
    }
  };

    const minimumEventDate = (() => {
      const date = new Date();
      date.setDate(date.getDate() + 3);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    })();

    return (
    <div className="storefront min-h-screen">
      <header className="store-header">
        <div className="store-header-inner">
          <a href="#inicio" className="store-brand" aria-label="Mayi Eventos, inicio">
            <span className="store-brand-script">Mayi</span>
            <span className="store-brand-detail">Eventos y Pastelería</span>
            <span className="store-brand-location">Girardot · Hecho con amor</span>
          </a>
          <button
            type="button"
            className="store-menu-toggle"
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <nav className={`store-nav ${mobileMenuOpen ? 'store-nav-open' : ''}`}>
            <a href="#tortas" onClick={() => setMobileMenuOpen(false)}>Catálogo de tortas</a>
            <a href="#salado" onClick={() => setMobileMenuOpen(false)}>Línea salada</a>
            <a href="#dulce" onClick={() => setMobileMenuOpen(false)}>Línea dulce</a>
            <a href="#bebidas" onClick={() => setMobileMenuOpen(false)}>Bebidas</a>
            <a href="#montajes" onClick={() => setMobileMenuOpen(false)}>Montajes de mesa</a>
          </nav>
          <div className="store-header-actions">
            <label className="store-search">
              <Search size={15} />
              <input aria-label="Buscar en el catálogo" placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} />
              {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}><X size={13} /></button>}
            </label>
            <button type="button" className="store-favorite-count" aria-pressed={favoritesOnly} aria-label={`${favorites.length} favoritos`} onClick={() => setFavoritesOnly((only) => !only)}>
              <Heart size={16} />
              {favorites.length > 0 && <span>{favorites.length}</span>}
            </button>
            <button type="button" className="store-cart-button" onClick={() => setCartOpen(true)}>
              <ShoppingBag size={15} />
              <span>Mi pedido</span>
              <span className="store-cart-count">{totalItems}</span>
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="store-hero" id="inicio">
          <div className="store-hero-inner">
            <div className="store-hero-copy">
              <span className="store-eyebrow"><Sparkles size={13} /> Pastelería · Eventos · Experiencias</span>
              <h1>Cada torta es hecha con amor y los mejores ingredientes para que tu celebración sea inolvidable.</h1>
              <p>Momentos especiales merecen sabores únicos. Creamos dulces recuerdos especialmente para ti.</p>
              <div className="store-hero-actions">
                <a className="store-button-primary" href="#tortas">Arma tu cotización <ArrowRight size={15} /></a>
                <a className="store-button-outline" href="#dulce">Descubre el catálogo</a>
              </div>
              <div className="store-hero-note"><span className="store-note-dot" /> Pedidos personalizados en Girardot y alrededores</div>
            </div>
            <div className="store-hero-photo-wrap">
              <div className="store-hero-photo-frame">
                {featuredImages.length > 0 ? (
                  <img
                    src={featuredImages[featuredImageIndex % featuredImages.length].url}
                    alt={featuredImages[featuredImageIndex % featuredImages.length].original_name}
                    style={imageFrameStyle(featuredImages[featuredImageIndex % featuredImages.length])}
                  />
                ) : <ImagePlaceholder label="Aquí irá una fotografía propia de MayC" />}
              </div>
              {featuredImages.length > 1 && <div className="store-featured-controls">
                <button type="button" aria-label="Fotografía principal anterior" onClick={() => setFeaturedImageIndex((index) => (index - 1 + featuredImages.length) % featuredImages.length)}><ChevronLeft size={17} /></button>
                <span>{featuredImageIndex + 1} / {featuredImages.length}</span>
                <button type="button" aria-label="Fotografía principal siguiente" onClick={() => setFeaturedImageIndex((index) => (index + 1) % featuredImages.length)}><ChevronRight size={17} /></button>
              </div>}
              <div className="store-photo-sticker"><span>Hecho</span><strong>con amor</strong><Heart size={16} fill="currentColor" /></div>
              <div className="store-hero-photo-caption">Un detalle dulce, un recuerdo para siempre</div>
            </div>
          </div>
          <a href="#tortas" className="store-scroll-cue"><ArrowDown size={16} /><span>Descubre nuestras delicias</span></a>
        </section>

        <section className="store-values" aria-label="Nuestra promesa">
          <div><span className="store-value-icon">✳</span><p><strong>Hecho a mano</strong><small>Con cariño en cada detalle</small></p></div>
          <span className="store-value-divider" />
          <div><span className="store-value-icon">♡</span><p><strong>Ingredientes frescos</strong><small>Calidad que se siente</small></p></div>
          <span className="store-value-divider" />
          <div><span className="store-value-icon">✿</span><p><strong>Para tus momentos</strong><small>Celebraciones a tu manera</small></p></div>
        </section>

        <div className="store-catalog">
          {error && <div className="store-error"><span>{error}</span><button type="button" onClick={() => window.location.reload()}>Intentar de nuevo</button></div>}
          {loading && <div className="store-loading"><span className="store-loader" />Preparando el catálogo con mucho amor…</div>}
          {!loading && !error && !filteredProducts.length && (
            <div className="store-empty-search">
              <Search size={23} />
              <p>{favoritesOnly ? 'Aún no tienes productos favoritos en esta búsqueda.' : `No encontramos productos para “${search}”.`}</p>
              <button type="button" onClick={() => { setSearch(''); setFavoritesOnly(false); }}>Ver todo el catálogo</button>
            </div>
          )}

          {categorySections.map(({ key, title, eyebrow, description }) => {
            const group = productGroups[key];
            if (!group?.length) return null;
            const sectionId = key === 'CAKE' ? 'tortas'
              : key === 'SAVORY' ? 'salado'
                : key === 'DESSERT' ? 'dulce'
                  : key === 'DRINK' ? 'bebidas' : 'montajes';
            const isDrink = key === 'DRINK';
            const collectCakeOptions = (pattern: RegExp) => {
              const options = new Map<string, CustomizationField['choices'][number]>();
              group.flatMap((item) => item.customization_fields || [])
                .filter((field) => pattern.test(field.label))
                .flatMap((field) => field.choices)
                .forEach((choice) => {
                  const optionKey = `${choice.label}:${choice.surcharge}`;
                  const existing = options.get(optionKey);
                  if (!existing || (!existing.image_url && choice.image_url)) {
                    options.set(optionKey, choice);
                  }
                });
              return Array.from(options.values());
            };
            const legacyFlavorPhotos = new Map(
                products
                  .filter((item) =>
                    item.category === 'CAKE'
                    && item.name.trim().toLocaleLowerCase('es') === 'sabores del bizcocho'
                    && item.images?.length
                    && item.description?.trim(),
                  )
                  .map((item) => [item.description!.trim().toLocaleLowerCase('es'), item.images[0]]),
            );
            const cakeFlavorOptions = key === 'CAKE'
                ? collectCakeOptions(/sabor|bizcocho/i).map((option) => {
                  const legacyPhoto = legacyFlavorPhotos.get(option.label.toLocaleLowerCase('es'));
                  return !option.image_url && legacyPhoto
                    ? { ...option, image_url: legacyPhoto.url }
                    : option;
                })
                : [];
            const cakeFillingOptions = key === 'CAKE' ? collectCakeOptions(/relleno/i) : [];
            return (
              <section key={key} className={`store-section ${isDrink ? 'store-drinks-section' : ''}`} id={sectionId}>
                <div className="store-section-heading">
                  <span className="store-section-eyebrow">{eyebrow}</span>
                  <h2>{title}</h2>
                  <p>{description}</p>
                  {key === 'CAKE' && (
                    <>
                      <div className="store-pills" role="tablist" aria-label="Información de las tortas">
                        {([
                          ['sizes', 'Tamaños & precios'],
                          ['flavors', 'Sabores del bizcocho'],
                          ['fillings', 'Rellenos'],
                        ] as const).map(([tab, label]) => (
                          <button
                            key={tab}
                            id={`cake-tab-${tab}`}
                            type="button"
                            role="tab"
                            aria-selected={cakeInfoTab === tab}
                            aria-controls="cake-tab-panel"
                            className={cakeInfoTab === tab ? 'store-pill-active' : ''}
                            onClick={() => setCakeInfoTab(tab)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div
                        id="cake-tab-panel"
                        className="store-cake-info-panel"
                        role="tabpanel"
                        aria-labelledby={`cake-tab-${cakeInfoTab}`}
                      >
                        {cakeInfoTab === 'sizes' && (
                          <>
                            <h3>Tamaños disponibles</h3>
                            <p>Las porciones y precios de referencia aparecen en cada presentación. Elige «Personalizar» para ver las opciones disponibles para ese tamaño.</p>
                            <div className="store-cake-option-grid">
                              {group.map((item) => (
                                <article className="store-cake-option-card" key={item.id}>
                                  <div className="store-cake-option-image">
                                    {item.images?.[0] ? <img src={item.images[0].url} alt={item.name} loading="lazy" style={imageFrameStyle(item.images[0])} /> : <ImagePlaceholder />}
                                    <span className="store-cake-option-price">{item.unit_price ? formatCOP(item.unit_price) : 'Cotizar'}</span>
                                  </div>
                                  <div className="store-cake-option-copy">
                                    <h4>{item.name}</h4>
                                    <span>{item.description || 'Torta preparada para tu celebración'}</span>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </>
                        )}
                        {cakeInfoTab === 'flavors' && (
                          <>
                            <h3>Sabores del bizcocho</h3>
                            <p>Las opciones y recargos se muestran según la configuración de cada presentación.</p>
                            <div className="store-cake-option-grid">
                              {cakeFlavorOptions.length ? cakeFlavorOptions.map((option) => (
                                <article className="store-cake-option-card" key={`${option.label}-${option.surcharge}`}>
                                  <div className={`store-cake-option-image ${option.image_url ? '' : 'store-cake-option-placeholder'}`}>
                                    {option.image_url
                                      ? <img src={option.image_url} alt={`Sabor ${option.label}`} loading="lazy" />
                                      : <ImagePlaceholder label="Foto propia pendiente" />}
                                    {option.surcharge > 0 && <span className="store-cake-option-badge">Recargo</span>}
                                  </div>
                                  <div className="store-cake-option-copy">
                                    <h4>{option.label}</h4>
                                    <span>{option.surcharge > 0 ? `Recargo ${formatCOP(option.surcharge)}` : 'Sin recargo configurado'}</span>
                                  </div>
                                </article>
                              )) : <p>No hay sabores configurados todavía.</p>}
                            </div>
                          </>
                        )}
                        {cakeInfoTab === 'fillings' && (
                          <>
                            <h3>Rellenos</h3>
                            <p>Las opciones aplican solo a las presentaciones que las ofrecen. El precio se actualiza al seleccionar un relleno.</p>
                            <div className="store-cake-option-grid">
                              {cakeFillingOptions.length ? cakeFillingOptions.map((option) => (
                                <article className="store-cake-option-card" key={`${option.label}-${option.surcharge}`}>
                                  <div className={`store-cake-option-image ${option.image_url ? '' : 'store-cake-option-placeholder'}`}>
                                    {option.image_url
                                      ? <img src={option.image_url} alt={`Relleno ${option.label}`} loading="lazy" />
                                      : <ImagePlaceholder label="Foto propia pendiente" />}
                                    {option.surcharge > 0 && <span className="store-cake-option-badge">Recargo</span>}
                                  </div>
                                  <div className="store-cake-option-copy">
                                    <h4>{option.label}</h4>
                                    <span>{option.surcharge > 0 ? `Recargo ${formatCOP(option.surcharge)}` : 'Sin recargo configurado'}</span>
                                  </div>
                                </article>
                              )) : <p>Este catálogo aún no tiene rellenos configurados.</p>}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className={`store-product-grid ${key === 'TABLE' ? 'store-table-grid' : ''}`}>
                    {group.map((item) => {
                      const gallery = item.images || [];
                      const galleryIndex = gallery.length ? (productImageIndexes[item.id] || 0) % gallery.length : 0;
                      const photo = gallery[galleryIndex];
                      const favorite = favorites.includes(item.id);
                      const inCart = cart.filter((line) => line.item.id === item.id)
                        .reduce((total, line) => total + line.quantity, 0);
                      return (
                        <article className="store-product-card" key={item.id}>
                          <div className="store-product-image-wrap">
                            {photo ? <img className="store-product-image" src={photo.url} alt={`${item.name} — ${photo.original_name}`} loading="lazy" style={imageFrameStyle(photo)} /> : <ImagePlaceholder />}
                            {gallery.length > 1 && <div className="store-product-gallery-controls">
                              <button type="button" aria-label={`Foto anterior de ${item.name}`} onClick={() => setProductImageIndexes((current) => ({ ...current, [item.id]: (galleryIndex - 1 + gallery.length) % gallery.length }))}><ChevronLeft size={15} /></button>
                              <span>{galleryIndex + 1}/{gallery.length}</span>
                              <button type="button" aria-label={`Foto siguiente de ${item.name}`} onClick={() => setProductImageIndexes((current) => ({ ...current, [item.id]: (galleryIndex + 1) % gallery.length }))}><ChevronRight size={15} /></button>
                            </div>}
                            <span className="store-product-tag">{key === 'CAKE' ? 'Personalizable' : categoryLabel(key)}</span>
                            <button type="button" className={`store-heart ${favorite ? 'store-heart-active' : ''}`} aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'} onClick={() => toggleFavorite(item.id)}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></button>
                          </div>
                          <div className="store-product-info">
                            <div className="store-product-title-row"><h3>{item.name}</h3>{inCart > 0 && <span className="store-added-indicator"><Check size={11} /> {inCart}</span>}</div>
                            <p>{item.description || 'Preparado artesanalmente, con ingredientes frescos.'}</p>
                            <div className="store-product-bottom">
                              <span className="store-product-price">{item.unit_price ? formatCOP(item.unit_price) : 'Cotizar'}{item.unit_price > 0 && <small> / unidad</small>}</span>
                              <button type="button" className="store-add-button" onClick={() => openConfigurator(item)}>{key === 'CAKE' || key === 'TABLE' ? 'Personalizar' : 'Elegir opciones'} <Plus size={13} /></button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
                {key === 'CAKE' && <aside className="store-cake-note"><Sparkles size={14} /><span>¿Tienes una idea especial? Personalizamos tu torta con rellenos, acabados y detalles pensados solo para ti.</span><a href="#montajes">Cuéntanos tu idea <ArrowRight size={13} /></a></aside>}
                {key === 'TABLE' && <p className="store-delivery-note"><span>✿</span> Transporte y montaje se cotizan según ubicación, horario y disponibilidad.</p>}
              </section>
            );
          })}
        </div>

        <section className="store-cta">
          <div className="store-cta-flower">✿</div>
          <span className="store-section-eyebrow">Un momento especial comienza aquí</span>
          <h2>¿Celebramos algo bonito?</h2>
          <p>Cuéntanos qué imaginas. Juntas hacemos que suceda.</p>
          <a className="store-button-primary" href="https://wa.me/573138688314?text=Hola%20Mayi%2C%20quiero%20cotizar%20algo%20especial" target="_blank" rel="noreferrer">Hablemos por WhatsApp <ArrowRight size={15} /></a>
        </section>
      </main>

      <footer className="store-footer">
        <div className="store-footer-main">
          <a href="#inicio" className="store-brand store-footer-brand"><span className="store-brand-script">Mayi</span><span className="store-brand-detail">Eventos y Pastelería</span><span className="store-brand-location">Hecho con amor en Girardot</span></a>
          <div className="store-footer-contact"><strong>¿Hacemos algo delicioso?</strong><a href="tel:+573138688314">+57 313 868 8314</a><a href="mailto:mayic.eventos@gmail.com">mayic.eventos@gmail.com</a></div>
          <div className="store-footer-links"><strong>Explora</strong><a href="#tortas">Catálogo de tortas</a><a href="#salado">Línea salada</a><a href="#dulce">Línea dulce</a><a href="#montajes">Montajes de mesa</a></div>
        </div>
        <div className="store-footer-bottom"><span>© {new Date().getFullYear()} Mayi Eventos y Pastelería</span><span>Girardot, Cundinamarca · Colombia</span><span>Con cariño, para celebrar contigo ♡</span></div>
      </footer>

      {toast && <div className="store-toast"><Check size={15} />{toast}</div>}

      {configuringItem && (
        <div className="store-configurator-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfigurator(); }}>
          <section className="store-configurator" role="dialog" aria-modal="true" aria-labelledby="store-configurator-title">
            <header className="store-configurator-header">
              <div>
                <span className="store-section-eyebrow">{categoryLabel(configuringItem.category)}</span>
                <h2 id="store-configurator-title">{configuringLineId ? 'Edita tu selección' : categoryGuidance[configuringItem.category as StoreCategory].title}</h2>
                <p>{categoryGuidance[configuringItem.category as StoreCategory].description}</p>
              </div>
              <button type="button" aria-label="Cerrar personalización" onClick={closeConfigurator}><X size={20} /></button>
            </header>

            <form className="store-configurator-form" onSubmit={saveConfiguredProduct}>
              <div className="store-configurator-product">
                <strong>{configuringItem.name}</strong>
                <span>{configuringItem.description || 'Revisa las opciones de este producto antes de agregarlo.'}</span>
                <small>{configuringItem.unit_price > 0 ? `Precio base: ${formatCOP(configuringItem.unit_price)}` : 'Precio base: se confirma con Mayi'}</small>
              </div>

              {configuringItem.customization_fields.length > 0 && (
                <div className="store-configurator-fields">
                  {configuringItem.customization_fields.map((field, index) => {
                    const selectedValues = fieldSelection(draftCustomizations[field.label]);
                    const otherSelected = selectedValues.includes('Otro');
                    const hasChoiceImages = field.choices.some((choice) => choice.image_url);
                    return (
                      <fieldset className="store-configurator-field" key={field.label}>
                        <legend><span>{String(index + 1).padStart(2, '0')}</span>{field.label}{field.required && <b>Requerido</b>}</legend>
                        {field.type === 'select' && field.multiple ? (
                          <div className={`store-choice-list ${hasChoiceImages ? 'store-choice-image-grid' : ''}`}>
                            <small>{field.max_selections
                              ? `Elige hasta ${field.max_selections} opciones.`
                              : 'Puedes elegir varias opciones.'}</small>
                            {field.choices.map((choice) => (
                              <label className={`store-choice-option ${hasChoiceImages ? 'store-choice-option-image' : ''}`} key={choice.label}>
                                <input
                                  type="checkbox"
                                  checked={selectedValues.includes(choice.label)}
                                  onChange={() => toggleMultipleChoice(field, choice.label)}
                                />
                                {hasChoiceImages && <span className="store-choice-image-wrap">
                                  {choice.image_url
                                    ? <img src={choice.image_url} alt={`Opción ${choice.label}`} loading="lazy" />
                                    : <span className="store-choice-image-placeholder">Foto propia pendiente</span>}
                                </span>}
                                <span className="store-choice-label">{choice.label}</span>
                                {choice.surcharge > 0 && <small>+{formatCOP(choice.surcharge)}</small>}
                              </label>
                            ))}
                            {field.allow_other && (
                              <label className="store-choice-option">
                                <input
                                  type="checkbox"
                                  checked={otherSelected}
                                  onChange={() => toggleMultipleChoice(field, 'Otro')}
                                />
                                <span>Otra combinación / tengo otra idea</span>
                              </label>
                            )}
                          </div>
                        ) : field.type === 'select' ? (
                          hasChoiceImages ? (
                            <div className="store-choice-list store-choice-image-grid">
                              <small>Elige la opción que prefieres.</small>
                              {field.choices.map((choice) => (
                                <label className="store-choice-option store-choice-option-image" key={choice.label}>
                                  <input
                                    type="radio"
                                    name={`store-choice-${configuringItem.id}-${field.label}`}
                                    checked={String(draftCustomizations[field.label] || '') === choice.label}
                                    onChange={() => setDraftCustomizations((values) => ({ ...values, [field.label]: choice.label }))}
                                  />
                                  <span className="store-choice-image-wrap">
                                    {choice.image_url
                                      ? <img src={choice.image_url} alt={`Opción ${choice.label}`} loading="lazy" />
                                      : <span className="store-choice-image-placeholder">Foto propia pendiente</span>}
                                  </span>
                                  <span className="store-choice-label">{choice.label}</span>
                                  {choice.surcharge > 0 && <small>+{formatCOP(choice.surcharge)}</small>}
                                </label>
                              ))}
                              {field.allow_other && (
                                <label className="store-choice-option store-choice-other-option">
                                  <input
                                    type="radio"
                                    name={`store-choice-${configuringItem.id}-${field.label}`}
                                    checked={otherSelected}
                                    onChange={() => setDraftCustomizations((values) => ({ ...values, [field.label]: 'Otro' }))}
                                  />
                                  <span>Otro / Personalizar a mi gusto</span>
                                </label>
                              )}
                            </div>
                          ) : (
                            <select
                              value={String(draftCustomizations[field.label] || '')}
                              onChange={(event) => setDraftCustomizations((values) => ({ ...values, [field.label]: event.target.value }))}
                            >
                              <option value="">Selecciona una opción</option>
                              {field.choices.map((choice) => (
                                <option key={choice.label} value={choice.label}>
                                  {choice.label}{choice.surcharge > 0 ? ` (+${formatCOP(choice.surcharge)})` : ''}
                                </option>
                              ))}
                              {field.allow_other && <option value="Otro">Otro / Personalizar a mi gusto</option>}
                            </select>
                          )
                        ) : field.type === 'textarea' ? (
                          <textarea
                            required={field.required}
                            value={String(draftCustomizations[field.label] || '')}
                            onChange={(event) => setDraftCustomizations((values) => ({ ...values, [field.label]: event.target.value }))}
                            placeholder="Escribe aquí tu solicitud"
                            rows={3}
                          />
                        ) : (
                          <input
                            required={field.required}
                            value={String(draftCustomizations[field.label] || '')}
                            onChange={(event) => setDraftCustomizations((values) => ({ ...values, [field.label]: event.target.value }))}
                            placeholder="Escribe aquí tu preferencia"
                          />
                        )}
                        {otherSelected && field.allow_other && (
                          <input
                            className="store-other-description"
                            required
                            value={String(draftCustomizations[`${field.label}__otro`] || '')}
                            onChange={(event) => setDraftCustomizations((values) => ({ ...values, [`${field.label}__otro`]: event.target.value }))}
                            placeholder="Describe qué combinación u opción quieres"
                            aria-label={`Describe otro: ${field.label}`}
                          />
                        )}
                      </fieldset>
                    );
                  })}
                </div>
              )}
              {(configuringItem.category === 'SAVORY' || configuringItem.category === 'DESSERT')
                && !configuringItem.customization_fields.some((field) => field.type === 'select')
                && <p className="store-configurator-info">Aún no hay variedades registradas para este producto. Si tienes una preferencia, escríbela abajo; Mayi confirmará si está disponible y su precio.</p>}

              <section className="store-configurator-field store-extra-request">
                <label htmlFor="store-extra-request">¿Tienes otra idea o necesitas algo que no aparece? (opcional)</label>
                <textarea
                  id="store-extra-request"
                  value={String(draftCustomizations.__solicitudAdicional || '')}
                  onChange={(event) => setDraftCustomizations((values) => ({ ...values, __solicitudAdicional: event.target.value }))}
                  placeholder="Cuéntanos qué imaginas. Mayi confirmará si es posible y su valor."
                  rows={3}
                />
              </section>

              <section className="store-configurator-field">
                <label htmlFor="store-reference-image">Foto de referencia (opcional)</label>
                <input
                  id="store-reference-image"
                  type="file"
                  accept="image/*"
                  onChange={(event) => setReferenceFileName(event.target.files?.[0]?.name || '')}
                />
                <small>{referenceFileName
                  ? `${referenceFileName} — recuerda adjuntarla en WhatsApp.`
                  : 'La página no envía archivos a WhatsApp. Si eliges una foto, adjúntala al mensaje antes de enviarlo.'}</small>
              </section>

              <div className="store-configurator-quantity">
                <label htmlFor="store-product-quantity">Cantidad</label>
                <div className="store-quantity">
                  <button type="button" aria-label="Quitar una unidad" onClick={() => setDraftQuantity((quantity) => Math.max(1, quantity - 1))}><Minus size={12} /></button>
                  <input id="store-product-quantity" type="number" min="1" max="100" value={draftQuantity} onChange={(event) => setDraftQuantity(Number(event.target.value))} />
                  <button type="button" aria-label="Agregar una unidad" onClick={() => setDraftQuantity((quantity) => Math.min(100, quantity + 1))}><Plus size={12} /></button>
                </div>
              </div>

              <div className="store-configurator-total">
                <div><span>{configuringItem.unit_price > 0 ? 'Precio estimado con opciones' : 'Precio por confirmar'}</span><small>La disponibilidad y el valor final se confirman por WhatsApp.</small></div>
                <strong>{configuringItem.unit_price > 0 ? formatCOP(draftUnitPrice * draftQuantity) : draftSurcharge > 0 ? `Base por cotizar + ${formatCOP(draftSurcharge * draftQuantity)}` : 'A cotizar'}</strong>
              </div>

              <div className="store-configurator-actions">
                <button type="button" className="store-button-outline" onClick={closeConfigurator}>Cancelar</button>
                <button type="submit" className="store-button-primary">{configuringLineId ? 'Guardar cambios' : 'Agregar al pedido'} <ArrowRight size={15} /></button>
              </div>
            </form>
          </section>
        </div>
      )}

      {cartOpen && (
        <div className="store-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
          <aside className="store-cart-drawer" aria-label="Tu pedido" aria-modal="true" role="dialog">
            <div className="store-drawer-heading"><div><span className="store-section-eyebrow">Hecho a tu medida</span><h2>Tu pedido <span>({totalItems})</span></h2></div><button type="button" aria-label="Cerrar pedido" onClick={() => setCartOpen(false)}><X size={20} /></button></div>
            {!cart.length ? (
              <div className="store-cart-empty"><span><ShoppingBag size={28} /></span><h3>Tu pedido comienza aquí</h3><p>Agrega tus favoritos y te ayudamos a personalizar cada detalle.</p><button type="button" onClick={() => setCartOpen(false)}>Explorar el catálogo <ArrowRight size={14} /></button></div>
            ) : (
              <>
                <div className="store-cart-lines">{cart.map((line) => (
                  <div className="store-cart-line" key={line.id}>
                    <div className="store-cart-line-photo">{line.item.images?.[0] ? <img src={line.item.images[0].url} alt="" style={imageFrameStyle(line.item.images[0])} /> : <ImagePlaceholder label="Sin fotografía" />}</div>
                    <div className="store-cart-line-details">
                      <span>{line.item.name}</span>
                      <small>{line.item.unit_price > 0 ? `${formatCOP(line.item.unit_price + lineSurcharge(line))} antes de cantidad` : 'Precio a cotizar'}</small>
                      <div className="store-quantity">
                        <button type="button" aria-label="Quitar una unidad" onClick={() => changeQuantity(line.id, -1)}><Minus size={12} /></button>
                        <span>{line.quantity}</span>
                        <button type="button" aria-label="Agregar una unidad" onClick={() => changeQuantity(line.id, 1)}><Plus size={12} /></button>
                      </div>
                    </div>
                    <strong>{line.item.unit_price ? formatCOP(lineTotal(line)) : 'Cotizar'}</strong>
                    <button type="button" className="store-edit-line" onClick={() => openConfigurator(line.item, line)}>Editar opciones</button>
                    <button type="button" className="store-remove-line" aria-label={`Eliminar ${line.item.name}`} onClick={() => setCart((current) => current.filter((entry) => entry.id !== line.id))}><Trash2 size={15} /></button>
                    {(!!line.item.customization_fields?.length
                      || line.customizations.__solicitudAdicional
                      || line.customizations.__imagenReferencia) && (
                      <ul className="store-cart-customization-summary">
                        {line.item.customization_fields.map((field) => {
                          const detail = fieldSelection(line.customizations[field.label]).map((entry) => entry === 'Otro'
                            ? `Otro: ${String(line.customizations[`${field.label}__otro`] || '')}`
                            : entry).join(', ');
                          return detail ? <li key={field.label}><span>{field.label}:</span> {detail}</li> : null;
                        })}
                        {String(line.customizations.__solicitudAdicional || '').trim() && <li><span>Solicitud adicional:</span> {String(line.customizations.__solicitudAdicional)}</li>}
                        {String(line.customizations.__imagenReferencia || '').trim() && <li><span>Referencia:</span> {String(line.customizations.__imagenReferencia)} (adjuntar en WhatsApp)</li>}
                      </ul>
                    )}
                  </div>
                ))}</div>
                <form id="store-order-form" className="store-checkout" noValidate onSubmit={sendWhatsAppOrder}>
                  <div className="store-checkout-intro">
                    <strong>Último paso: revisa y continúa por WhatsApp</strong>
                    <span>Completa tus datos. Se abrirá WhatsApp con el pedido listo; allí debes tocar «Enviar».</span>
                  </div>
                  <label>Tu nombre *<input id="store-customer-name" required value={customerName} onChange={(event) => { setCustomerName(event.target.value); setCheckoutError(''); }} placeholder="¿Cómo te llamas?" autoComplete="name" /></label>
                  <label>Tu WhatsApp *<input id="store-customer-phone" required type="tel" value={customerPhone} onChange={(event) => { setCustomerPhone(event.target.value); setCheckoutError(''); }} placeholder="Tu número de contacto" autoComplete="tel" /></label>
                  <label>Fecha del evento o entrega *<input id="store-event-date" required type="date" min={minimumEventDate} value={eventDate} onChange={(event) => { setEventDate(event.target.value); setCheckoutError(''); }} /><small>Solicita con al menos 3 días de anticipación.</small></label>
                  <label>Hora de entrega *<input id="store-event-time" required type="time" value={eventTime} onChange={(event) => { setEventTime(event.target.value); setCheckoutError(''); }} /></label>
                  <label>Modalidad de entrega<select value={deliveryMode} onChange={(event) => setDeliveryMode(event.target.value)}><option>Recoger en el local</option><option>Domicilio</option><option>Servicio en el evento</option></select></label>
                  {(deliveryMode === 'Domicilio' || deliveryMode === 'Servicio en el evento') && <label>{deliveryMode === 'Domicilio' ? 'Dirección de entrega *' : 'Lugar del evento *'}<input id="store-delivery-address" required value={deliveryAddress} onChange={(event) => { setDeliveryAddress(event.target.value); setCheckoutError(''); }} placeholder={deliveryMode === 'Domicilio' ? 'Dirección y barrio' : 'Dirección y lugar del evento'} autoComplete="street-address" /></label>}
                  <label>Observaciones adicionales<textarea value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} rows={3} placeholder="Detalles importantes de tu pedido" /></label>
                  <div className="store-cart-total"><span>{hasUnpricedProducts ? 'Total parcial estimado' : 'Total estimado'}</span><strong>{formatCOP(totalPrice)}{hasUnpricedProducts && ' + por cotizar'}</strong></div>
                  <p>Antes de confirmar, Mayi verificará disponibilidad y cualquier valor pendiente. Si elegiste una imagen, adjúntala al mensaje.</p>
                  {checkoutError && <p className="store-checkout-error" role="alert">{checkoutError}</p>}
                  <button type="submit" disabled={submittingOrder} className="store-whatsapp-button">{submittingOrder ? 'Guardando tu solicitud…' : 'Guardar y continuar a WhatsApp'} <ArrowRight size={15} /></button>
                  <small className="store-deposit-note"><ChevronDown size={13} /> El pedido no queda confirmado hasta que Mayi verifique disponibilidad y anticipo.</small>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
};

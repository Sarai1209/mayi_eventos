import api from './api';
import { AgendaDay, CatalogItem, Customer, DashboardSummary, ImageCategory, ManagedImage, Order } from '../types';

export interface QuotePayload {
  customer: { name: string; phone: string; email?: string };
  product_type: string;
  service_type: string;
  service_date: string;
  time_slot: string;
  items: Array<{ item_id: number; quantity: number }>;
  notes?: string;
}

export interface StoreOrderPayload {
  customer: { name: string; phone: string };
  service_date: string;
  event_time: string;
  delivery_mode: string;
  delivery_address: string;
  notes: string;
  items: Array<{
    item_id: number;
    quantity: number;
    customizations: Record<string, string | string[]>;
  }>;
}

export const mayicService = {
  async publicCatalog(): Promise<CatalogItem[]> {
    return (await api.get('/public/catalog')).data;
  },
  async createStoreOrder(data: StoreOrderPayload): Promise<Order> {
    return (await api.post('/public/orders', data)).data;
  },
  async publicImages(category: ImageCategory): Promise<ManagedImage[]> {
    return (await api.get('/public/images', { params: { category } })).data;
  },
  async images(): Promise<ManagedImage[]> {
    return (await api.get('/images')).data;
  },
  async imageFile(imageId: number): Promise<Blob> {
    return (await api.get(`/images/${imageId}/file`, { responseType: 'blob' })).data;
  },
  async uploadImages(files: File[], category: ImageCategory, catalogItemId: number | null): Promise<ManagedImage[]> {
    const form = new FormData();
    files.forEach((file) => form.append('images', file));
    form.append('category', category);
    if (catalogItemId !== null) form.append('catalog_item_id', String(catalogItemId));
    return (await api.post('/images', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  async replaceImage(imageId: number, file: File): Promise<ManagedImage> {
    const form = new FormData();
    form.append('image', file);
    return (await api.put(`/images/${imageId}/file`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  async updateImage(imageId: number, changes: Partial<Pick<ManagedImage, 'category' | 'catalog_item_id' | 'is_published' | 'position_x' | 'position_y' | 'zoom'>>): Promise<ManagedImage> {
    return (await api.patch(`/images/${imageId}`, changes)).data;
  },
  async deleteImage(imageId: number): Promise<void> {
    await api.delete(`/images/${imageId}`);
  },
  async dashboard(): Promise<DashboardSummary> {
    return (await api.get('/dashboard')).data;
  },
  async customers(): Promise<Customer[]> {
    return (await api.get('/customers')).data;
  },
  async createCustomer(data: Omit<Customer, 'id'>): Promise<Customer> {
    return (await api.post('/customers', data)).data;
  },
  async catalog(): Promise<CatalogItem[]> {
    return (await api.get('/catalog')).data;
  },
  async saveCatalogItem(item: Partial<CatalogItem>): Promise<CatalogItem> {
    if (item.id) return (await api.put(`/catalog/${item.id}`, item)).data;
    return (await api.post('/catalog', item)).data;
  },
  async orders(): Promise<Order[]> {
    return (await api.get('/orders')).data;
  },
  async createQuote(data: QuotePayload): Promise<Order> {
    return (await api.post('/orders', data)).data;
  },
  async uploadProof(orderId: number, file: File, reference: string): Promise<Order> {
    const form = new FormData();
    form.append('proof', file);
    form.append('reference', reference);
    return (await api.post(`/orders/${orderId}/proof`, form)).data;
  },
  async confirmDeposit(orderId: number): Promise<Order> {
    return (await api.post(`/orders/${orderId}/confirm-deposit`)).data;
  },
  async rejectProof(orderId: number, reason: string): Promise<Order> {
    return (await api.post(`/orders/${orderId}/reject-proof`, { reason })).data;
  },
  async settle(orderId: number, payment_method: string, reference?: string): Promise<Order> {
    return (await api.post(`/orders/${orderId}/settle`, { payment_method, reference })).data;
  },
  async agenda(year: number, month: number): Promise<Record<string, AgendaDay>> {
    return (await api.get('/agenda', { params: { year, month } })).data;
  },
  async proof(orderId: number): Promise<Blob> {
    return (await api.get(`/orders/${orderId}/proof`, { responseType: 'blob' })).data;
  },
};

export const formatCOP = (amount: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(amount);

export const statusLabels: Record<string, string> = {
  WEB_REQUEST_PENDING: 'Solicitud web por revisar',
  QUOTE_PENDING: 'Cotizado',
  PAYMENT_REVIEW: 'Por verificar',
  DEPOSIT_CONFIRMED: 'Anticipo confirmado',
  PAID_DELIVERED: 'Liquidado / entregado',
  EXPIRED: 'Vencido',
};

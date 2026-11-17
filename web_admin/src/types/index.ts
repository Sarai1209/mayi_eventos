export interface AuthUser {
  id: number;
  name: string;
  email: string;
  access_token: string;
}

export type OrderStatus =
  | 'WEB_REQUEST_PENDING'
  | 'QUOTE_PENDING'
  | 'PAYMENT_REVIEW'
  | 'DEPOSIT_CONFIRMED'
  | 'PAID_DELIVERED'
  | 'EXPIRED';

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
}

export interface CatalogItem {
  id: number;
  name: string;
  category: string;
  description?: string;
  unit_price: number;
  active: boolean;
  customization_fields: CustomizationField[];
  images: ProductImage[];
}

export interface ProductImage {
  id: number;
  original_name: string;
  position_x: number;
  position_y: number;
  zoom: number;
  url: string;
}

export type ImageCategory = 'CAKE' | 'SAVORY' | 'DESSERT' | 'DRINK' | 'TABLE' | 'FEATURED';

export interface ManagedImage {
  id: number;
  catalog_item_id: number | null;
  product_name: string | null;
  category: ImageCategory;
  original_name: string;
  content_type: string;
  position_x: number;
  position_y: number;
  zoom: number;
  is_published: boolean;
  url: string | null;
  created_at: string;
}

export interface CustomizationField {
  label: string;
  type: 'select' | 'text' | 'textarea';
  required: boolean;
  allow_other: boolean;
  multiple?: boolean;
  max_selections?: number | null;
  choices: Array<{
    label: string;
    surcharge: number;
    image_id?: number;
    image_url?: string | null;
  }>;
}

export interface Order {
  id: number;
  code: string;
  customer: Customer;
  product_type: string;
  service_type: string;
  service_date: string;
  time_slot: string;
  details: {
    items: Array<{
      item_id: number;
      name: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
      category?: string;
      customizations?: Record<string, string | string[]>;
    }>;
    notes?: string;
    origin?: string;
    delivery_mode?: string;
    delivery_address?: string;
    event_time?: string;
    requires_manual_quote?: boolean;
  };
  total_amount: number;
  deposit_amount: number;
  balance_amount: number;
  status: OrderStatus;
  expires_at: string;
  proof_available: boolean;
  proof_reference?: string;
  rejection_reason?: string;
  deposit_confirmed_at?: string;
  settled_at?: string;
  payment_method?: string;
  created_at: string;
}

export interface DashboardSummary {
  total_orders: number;
  pending_verification: number;
  confirmed_orders: number;
  month_revenue: number;
  upcoming: Order[];
}

export interface AgendaDay {
  status: 'RED' | 'YELLOW';
  orders: Order[];
}

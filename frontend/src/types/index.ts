export interface Client {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  bonus_balance: number;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  client: Client;
}

export interface Product {
  id: number;
  title: string;
  description: string | null;
  price: number;
  collection: string | null;
  image_url: string | null;
  in_stock: boolean;
}

export type OrderStatus =
  | "new"
  | "processing"
  | "confirmed"
  | "shipped"
  | "done"
  | "cancelled";

export interface Order {
  id: number;
  client_id: number;
  product_id: number;
  quantity: number;
  status: OrderStatus;
  comment: string | null;
  created_at: string;
  product: Product;
}

export interface BonusEvent {
  id: number;
  amount: number;
  reason: string;
  created_at: string;
}

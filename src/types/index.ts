// Common Types and Interfaces

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// User Types
export interface User {
  id: number;
  email: string;
  password?: string; // Optional for when password is excluded
  full_name: string;
  phone?: string;
  role: 'admin' | 'staff' | 'customer';
  customer_code?: string;
  address?: string;
  date_of_birth?: Date;
  gender?: 'male' | 'female' | 'other';
  loyalty_points?: number;
  total_spent?: number;
  notes?: string;
  push_token?: string; // Push notification token
  device_type?: string; // Device type (ios/android)
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserRequest {
  phone: string;
  password: string;
  full_name: string;
  email?: string;
  role?: 'admin' | 'staff' | 'customer';
}

export interface LoginRequest {
  email?: string;
  phone?: string;
  password: string;
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
  refreshToken: string;
}

// Customer Types
export interface Customer {
  id: number;
  user_id?: number;
  customer_code: string;
  address?: string;
  date_of_birth?: Date;
  gender?: 'male' | 'female' | 'other';
  loyalty_points: number;
  total_spent: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Vehicle Types
export interface Vehicle {
  id: number;
  user_id: number;
  license_plate: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  engine_number?: string;
  chassis_number?: string;
  mileage?: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Service Types
export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Service {
  id: number;
  category_id?: number;
  name: string;
  slug: string;
  description?: string;
  short_description?: string;
  price?: number;
  min_price?: number;
  max_price?: number;
  duration_minutes?: number;
  image_url?: string;
  is_featured: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Parts Types
export interface Part {
  id: number;
  part_code: string;
  name: string;
  description?: string;
  brand?: string;
  unit?: string;
  purchase_price?: number;
  selling_price?: number;
  quantity_in_stock: number;
  min_stock_level: number;
  max_stock_level: number;
  location?: string;
  image_url?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// Appointment Types
export interface Appointment {
  id: number;
  appointment_code: string;
  customer_id?: number;
  vehicle_id?: number;
  service_id?: number;
  appointment_date: Date;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  reminder_sent: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAppointmentRequest {
  customer_id?: number;
  vehicle_id?: number;
  service_id?: number;
  appointment_date: string;
  appointment_time: string;
  notes?: string;
  customer_info?: {
    full_name: string;
    phone: string;
    email?: string;
  };
  vehicle_info?: {
    license_plate: string;
    brand?: string;
    model?: string;
  };
}

// Repair Types
export interface Repair {
  id: number;
  repair_code: string;
  appointment_id?: number;
  customer_id?: number;
  vehicle_id?: number;
  mechanic_id?: number;
  status: 'pending' | 'diagnosing' | 'waiting_parts' | 'in_progress' | 'completed' | 'cancelled';
  diagnosis?: string;
  work_description?: string;
  start_date?: Date;
  completion_date?: Date;
  total_amount: number;
  parts_cost: number;
  labor_cost: number;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Invoice Types
export interface Invoice {
  id: number;
  invoice_number: string;
  repair_id?: number;
  customer_id?: number;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: 'pending' | 'partial' | 'paid' | 'refunded';
  payment_method?: 'cash' | 'card' | 'transfer' | 'other';
  payment_date?: Date;
  due_date?: Date;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

// Express Request Extensions
declare global {
  namespace Express {
    interface Request {
      user?: User;
      customer?: Customer;
      resourceOwnership?: {
        resourceId: string;
        ownerIdField: string;
        globalPermissions: string[];
      };
    }
  }
}

export interface JwtPayload {
  userId: number;
  email: string;
  role: string;
}

// Database Query Helpers
export interface QueryOptions {
  where?: Record<string, any>;
  orderBy?: string;
  limit?: number;
  offset?: number;
  include?: string[];
}

export interface DatabaseConnection {
  query: (sql: string, params?: any[]) => Promise<any>;
  execute: (sql: string, params?: any[]) => Promise<any>;
  release: () => void;
}
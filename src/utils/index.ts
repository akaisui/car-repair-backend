// Utility Functions

import { ApiResponse, PaginatedResponse, PaginationParams } from '../types';

/**
 * Create standardized API response
 */
export function createApiResponse<T>(
  success: boolean,
  message: string,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    message,
    data,
    error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  pagination: PaginationParams,
  message = 'Data retrieved successfully'
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / pagination.limit);
  const hasNext = pagination.page < totalPages;
  const hasPrev = pagination.page > 1;

  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    },
  };
}

/**
 * Generate unique codes
 */
export function generateCode(prefix: string, length: number = 6): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, length).toUpperCase();
  return `${prefix}${timestamp}${random}`;
}

/**
 * Generate customer code
 */
export function generateCustomerCode(): string {
  return generateCode('KH', 4);
}

/**
 * Generate appointment code
 */
export function generateAppointmentCode(): string {
  return generateCode('AP', 6);
}

/**
 * Generate repair code
 */
export function generateRepairCode(): string {
  return generateCode('RP', 6);
}

/**
 * Generate invoice number
 */
export function generateInvoiceNumber(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const time = Date.now().toString().slice(-4);
  return `INV${year}${month}${day}${time}`;
}

/**
 * Parse pagination parameters
 */
export function parsePaginationParams(query: any): PaginationParams {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 10));
  const sortBy = query.sortBy || 'created_at';
  const sortOrder = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  return { page, limit, sortBy, sortOrder };
}

/**
 * Calculate offset for pagination
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Vietnamese format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^(0|\+84)[3-9][0-9]{8}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Validate license plate (Vietnamese format)
 */
export function isValidLicensePlate(plate: string): boolean {
  const plateRegex = /^[0-9]{2}[A-Z]{1,2}-[0-9]{4,5}$/;
  return plateRegex.test(plate.replace(/\s/g, '').toUpperCase());
}

/**
 * Format currency (VND)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}

/**
 * Format date for Vietnamese locale
 */
export function formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };

  return new Intl.DateTimeFormat('vi-VN', { ...defaultOptions, ...options }).format(date);
}

/**
 * Sanitize string input
 */
export function sanitizeString(str: string): string {
  return str.trim().replace(/[<>\"']/g, '');
}

/**
 * Generate random string
 */
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sleep utility for testing
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Convert snake_case to camelCase
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convert database row to camelCase object
 */
export function dbRowToCamelCase(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toCamelCase(key)] = value;
  }
  return result;
}

/**
 * Calculate loyalty points based on amount
 */
export function calculateLoyaltyPoints(amount: number, rate: number = 0.01): number {
  return Math.floor(amount * rate);
}

/**
 * Check if date is in the future
 */
export function isFutureDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Get time slots for a date
 */
export function getTimeSlots(startHour = 8, endHour = 18, intervalMinutes = 30): string[] {
  const slots: string[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    for (let minute = 0; minute < 60; minute += intervalMinutes) {
      const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeSlot);
    }
  }

  return slots;
}

/**
 * Error handler utility
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export { AppError as HttpError };
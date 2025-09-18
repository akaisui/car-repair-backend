import User from '../models/User';
import Vehicle, { VehicleSearchFilters } from '../models/Vehicle';
import Appointment from '../models/Appointment';

export interface ExportOptions {
  format: 'csv' | 'json' | 'excel';
  filename?: string;
  filters?: any;
  columns?: string[];
  includeHeaders?: boolean;
}

export interface ExportResult {
  filename: string;
  content: string | Buffer;
  mimeType: string;
  size: number;
}

/**
 * Export Service
 * Handles data export functionality for customers, vehicles, and other entities
 */
export default class ExportService {
  /**
   * Export users to various formats
   */
  static async exportUsers(options: ExportOptions): Promise<ExportResult> {
    const filters: any = options.filters || {};

    const users = await User.findAll({
      orderBy: 'created_at DESC'
    });

    const filename = options.filename || `customers_${new Date().toISOString().split('T')[0]}`;

    switch (options.format) {
      case 'json':
        return this.exportToJSON(customers, `${filename}.json`);

      case 'csv':
        return this.exportUsersToCSV(users, `${filename}.csv`, options.columns);

      case 'excel':
        // For now, return CSV format (Excel functionality would require additional libraries)
        return this.exportUsersToCSV(users, `${filename}.csv`, options.columns);

      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Export vehicles to various formats
   */
  static async exportVehicles(options: ExportOptions): Promise<ExportResult> {
    const filters: VehicleSearchFilters = options.filters || {};

    const vehicles = await Vehicle.search(filters, {
      orderBy: 'created_at DESC'
    });

    const filename = options.filename || `vehicles_${new Date().toISOString().split('T')[0]}`;

    switch (options.format) {
      case 'json':
        return this.exportToJSON(vehicles, `${filename}.json`);

      case 'csv':
        return this.exportVehiclesToCSV(vehicles, `${filename}.csv`, options.columns);

      case 'excel':
        return this.exportVehiclesToCSV(vehicles, `${filename}.csv`, options.columns);

      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Export appointments to various formats
   */
  static async exportAppointments(options: ExportOptions & {
    date_from?: string;
    date_to?: string;
    status?: string;
  }): Promise<ExportResult> {
    const appointments = await Appointment.search({
      date_from: options.date_from,
      date_to: options.date_to,
      status: options.status,
      ...options.filters
    }, {
      orderBy: 'appointment_date DESC, appointment_time DESC'
    });

    const filename = options.filename || `appointments_${new Date().toISOString().split('T')[0]}`;

    switch (options.format) {
      case 'json':
        return this.exportToJSON(appointments, `${filename}.json`);

      case 'csv':
        return this.exportAppointmentsToCSV(appointments, `${filename}.csv`, options.columns);

      case 'excel':
        return this.exportAppointmentsToCSV(appointments, `${filename}.csv`, options.columns);

      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Export customer loyalty report
   */
  static async exportUserLoyaltyReport(options: ExportOptions): Promise<ExportResult> {
    const users = await User.findAll({
      orderBy: 'loyalty_points DESC'
    });

    const loyaltyReport = customers.map(customer => ({
      customer_code: customer.customer_code,
      full_name: customer.full_name,
      email: customer.email,
      phone: customer.phone,
      loyalty_points: customer.loyalty_points || 0,
      total_spent: customer.total_spent || 0,
      loyalty_percentage: customer.total_spent ?
        ((customer.loyalty_points || 0) / (customer.total_spent / 1000)).toFixed(2) : '0',
      created_at: customer.created_at
    }));

    const filename = options.filename || `loyalty_report_${new Date().toISOString().split('T')[0]}`;

    switch (options.format) {
      case 'json':
        return this.exportToJSON(loyaltyReport, `${filename}.json`);

      case 'csv':
        return this.exportLoyaltyReportToCSV(loyaltyReport, `${filename}.csv`);

      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Export vehicle maintenance report
   */
  static async exportVehicleMaintenanceReport(daysSinceLastService: number = 180): Promise<ExportResult> {
    const vehicles = await Vehicle.getVehiclesNeedingMaintenance(daysSinceLastService);

    const maintenanceReport = vehicles.map(vehicle => ({
      license_plate: vehicle.license_plate,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      customer_name: vehicle.customer_name,
      customer_phone: vehicle.customer_phone,
      last_service_date: vehicle.last_service_date,
      days_since_service: vehicle.days_since_service,
      maintenance_urgency: this.getMaintenanceUrgency(vehicle.days_since_service)
    }));

    const filename = `maintenance_report_${new Date().toISOString().split('T')[0]}.csv`;

    return this.exportMaintenanceReportToCSV(maintenanceReport, filename);
  }

  /**
   * Export data to JSON format
   */
  private static exportToJSON(data: any[], filename: string): ExportResult {
    const content = JSON.stringify(data, null, 2);

    return {
      filename,
      content,
      mimeType: 'application/json',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Export customers to CSV format
   */
  private static exportUsersToCSV(users: any[], filename: string, customColumns?: string[]): ExportResult {
    const defaultColumns = [
      'id', 'customer_code', 'full_name', 'email', 'phone',
      'address', 'gender', 'date_of_birth', 'loyalty_points',
      'total_spent', 'created_at'
    ];

    const columns = customColumns || defaultColumns;

    const headers = columns.map(col => this.formatColumnHeader(col));
    const csvHeader = headers.join(',');

    const csvRows = customers.map(customer =>
      columns.map(col => this.formatCSVValue(customer[col])).join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const content = '\ufeff' + csvContent; // Add BOM for UTF-8

    return {
      filename,
      content,
      mimeType: 'text/csv; charset=utf-8',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Export vehicles to CSV format
   */
  private static exportVehiclesToCSV(vehicles: any[], filename: string, customColumns?: string[]): ExportResult {
    const defaultColumns = [
      'id', 'license_plate', 'brand', 'model', 'year', 'color',
      'engine_number', 'chassis_number', 'mileage', 'customer_name',
      'customer_phone', 'created_at'
    ];

    const columns = customColumns || defaultColumns;

    const headers = columns.map(col => this.formatColumnHeader(col));
    const csvHeader = headers.join(',');

    const csvRows = vehicles.map(vehicle =>
      columns.map(col => this.formatCSVValue(vehicle[col])).join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const content = '\ufeff' + csvContent;

    return {
      filename,
      content,
      mimeType: 'text/csv; charset=utf-8',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Export appointments to CSV format
   */
  private static exportAppointmentsToCSV(appointments: any[], filename: string, customColumns?: string[]): ExportResult {
    const defaultColumns = [
      'id', 'appointment_code', 'appointment_date', 'appointment_time',
      'status', 'customer_name', 'customer_phone', 'service_name',
      'license_plate', 'notes', 'created_at'
    ];

    const columns = customColumns || defaultColumns;

    const headers = columns.map(col => this.formatColumnHeader(col));
    const csvHeader = headers.join(',');

    const csvRows = appointments.map(appointment =>
      columns.map(col => this.formatCSVValue(appointment[col])).join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const content = '\ufeff' + csvContent;

    return {
      filename,
      content,
      mimeType: 'text/csv; charset=utf-8',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Export loyalty report to CSV
   */
  private static exportLoyaltyReportToCSV(loyaltyData: any[], filename: string): ExportResult {
    const headers = [
      'Customer Code', 'Full Name', 'Email', 'Phone',
      'Loyalty Points', 'Total Spent', 'Loyalty Rate %', 'Member Since'
    ];

    const csvHeader = headers.join(',');

    const csvRows = loyaltyData.map(customer => [
      this.formatCSVValue(customer.customer_code),
      this.formatCSVValue(customer.full_name),
      this.formatCSVValue(customer.email),
      this.formatCSVValue(customer.phone),
      customer.loyalty_points,
      customer.total_spent,
      customer.loyalty_percentage,
      this.formatCSVValue(customer.created_at)
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const content = '\ufeff' + csvContent;

    return {
      filename,
      content,
      mimeType: 'text/csv; charset=utf-8',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Export maintenance report to CSV
   */
  private static exportMaintenanceReportToCSV(maintenanceData: any[], filename: string): ExportResult {
    const headers = [
      'License Plate', 'Brand', 'Model', 'Year', 'Customer Name',
      'Customer Phone', 'Last Service Date', 'Days Since Service', 'Urgency Level'
    ];

    const csvHeader = headers.join(',');

    const csvRows = maintenanceData.map(vehicle => [
      this.formatCSVValue(vehicle.license_plate),
      this.formatCSVValue(vehicle.brand),
      this.formatCSVValue(vehicle.model),
      vehicle.year || '',
      this.formatCSVValue(vehicle.customer_name),
      this.formatCSVValue(vehicle.customer_phone),
      this.formatCSVValue(vehicle.last_service_date),
      vehicle.days_since_service || 'Never',
      this.formatCSVValue(vehicle.maintenance_urgency)
    ].join(','));

    const csvContent = [csvHeader, ...csvRows].join('\n');
    const content = '\ufeff' + csvContent;

    return {
      filename,
      content,
      mimeType: 'text/csv; charset=utf-8',
      size: Buffer.byteLength(content, 'utf8')
    };
  }

  /**
   * Format column header for CSV
   */
  private static formatColumnHeader(columnName: string): string {
    return columnName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Format value for CSV (handle quotes and commas)
   */
  private static formatCSVValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If the value contains quotes, double them
    const escapedValue = stringValue.replace(/"/g, '""');

    // If the value contains commas, newlines, or quotes, wrap in quotes
    if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
      return `"${escapedValue}"`;
    }

    return escapedValue;
  }

  /**
   * Determine maintenance urgency based on days since last service
   */
  private static getMaintenanceUrgency(daysSinceService: number | null): string {
    if (!daysSinceService) return 'Unknown';

    if (daysSinceService > 365) return 'Critical';
    if (daysSinceService > 270) return 'High';
    if (daysSinceService > 180) return 'Medium';
    return 'Low';
  }

  /**
   * Get available export formats
   */
  static getAvailableFormats(): string[] {
    return ['csv', 'json', 'excel'];
  }

  /**
   * Validate export options
   */
  static validateExportOptions(options: ExportOptions): void {
    if (!options.format || !this.getAvailableFormats().includes(options.format)) {
      throw new Error('Invalid export format. Supported formats: csv, json, excel');
    }

    if (options.filename && !/^[a-zA-Z0-9._-]+$/.test(options.filename)) {
      throw new Error('Invalid filename. Only alphanumeric characters, dots, underscores, and hyphens are allowed');
    }
  }

  /**
   * Get export statistics
   */
  static async getExportStatistics(): Promise<{
    total_customers: number;
    total_vehicles: number;
    total_appointments: number;
    vip_customers: number;
    vehicles_needing_maintenance: number;
  }> {
    const [
      totalCustomers,
      totalVehicles,
      totalAppointments,
      vipCustomers,
      vehiclesNeedingMaintenance
    ] = await Promise.all([
      User.count({ role: 'customer' }),
      Vehicle.count(),
      Appointment.count(),
      User.count({ loyalty_points: { '>=': 1000 } }),
      Vehicle.getVehiclesNeedingMaintenance(180)
    ]);

    return {
      total_customers: totalCustomers,
      total_vehicles: totalVehicles,
      total_appointments: totalAppointments,
      vip_customers: vipCustomers,
      vehicles_needing_maintenance: vehiclesNeedingMaintenance.length
    };
  }
}
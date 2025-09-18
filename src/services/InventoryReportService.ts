import { Pool } from 'mysql2/promise';
import db from '../config/database';
import ExportService from './ExportService';

export interface InventoryReportData {
  part_id: number;
  part_name: string;
  part_code: string;
  category_name?: string;
  current_quantity: number;
  min_stock_level?: number;
  max_stock_level?: number;
  unit_price: number;
  total_value: number;
  location?: string;
  status: string;
  last_movement_date?: Date;
  stock_status: 'out_of_stock' | 'low_stock' | 'normal' | 'overstock';
  days_since_last_movement?: number;
}

export interface StockMovementReportData {
  movement_id: number;
  part_id: number;
  part_name: string;
  part_code: string;
  movement_type: string;
  quantity: number;
  unit_cost?: number;
  total_cost?: number;
  reference_type?: string;
  reference_id?: number;
  notes?: string;
  performed_by_name: string;
  created_at: Date;
}

export interface InventoryAnalytics {
  overview: {
    total_parts: number;
    total_value: number;
    out_of_stock_count: number;
    low_stock_count: number;
    overstock_count: number;
    inactive_parts_count: number;
  };
  category_breakdown: Array<{
    category_name: string;
    part_count: number;
    total_value: number;
    avg_stock_level: number;
  }>;
  stock_status_distribution: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
  top_value_parts: Array<{
    part_id: number;
    part_name: string;
    part_code: string;
    total_value: number;
  }>;
  slow_moving_parts: Array<{
    part_id: number;
    part_name: string;
    part_code: string;
    days_since_last_movement: number;
    current_quantity: number;
  }>;
}

export interface MovementAnalytics {
  overview: {
    total_movements_30days: number;
    total_value_in_30days: number;
    total_value_out_30days: number;
    net_value_change_30days: number;
  };
  daily_movements: Array<{
    date: string;
    total_in: number;
    total_out: number;
    net_movement: number;
  }>;
  movement_type_distribution: Array<{
    movement_type: string;
    count: number;
    percentage: number;
  }>;
  top_moving_parts: Array<{
    part_id: number;
    part_name: string;
    part_code: string;
    total_movements: number;
    total_in: number;
    total_out: number;
  }>;
  performance_by_staff: Array<{
    user_id: number;
    user_name: string;
    total_movements: number;
    accuracy_rate: number;
  }>;
}

export class InventoryReportService {
  private static pool: Pool = db;

  static async generateInventoryReport(
    filters: {
      category_id?: number;
      stock_status?: string;
      location?: string;
      date_from?: string;
      date_to?: string;
    } = {}
  ): Promise<InventoryReportData[]> {
    let query = `
      SELECT
        p.id as part_id,
        p.name as part_name,
        p.part_code,
        pc.name as category_name,
        p.current_quantity,
        p.min_stock_level,
        p.max_stock_level,
        p.unit_price,
        (p.current_quantity * p.unit_price) as total_value,
        p.location,
        p.status,
        (
          SELECT MAX(created_at)
          FROM stock_movements sm
          WHERE sm.part_id = p.id
        ) as last_movement_date,
        CASE
          WHEN p.current_quantity <= 0 THEN 'out_of_stock'
          WHEN p.min_stock_level IS NOT NULL AND p.current_quantity <= p.min_stock_level THEN 'low_stock'
          WHEN p.max_stock_level IS NOT NULL AND p.current_quantity > p.max_stock_level THEN 'overstock'
          ELSE 'normal'
        END as stock_status,
        DATEDIFF(NOW(), (
          SELECT MAX(created_at)
          FROM stock_movements sm
          WHERE sm.part_id = p.id
        )) as days_since_last_movement
      FROM parts p
      LEFT JOIN part_categories pc ON p.category_id = pc.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.category_id) {
      query += ' AND p.category_id = ?';
      params.push(filters.category_id);
    }

    if (filters.location) {
      query += ' AND p.location LIKE ?';
      params.push(`%${filters.location}%`);
    }

    if (filters.stock_status) {
      const stockStatusCondition = this.getStockStatusCondition(filters.stock_status);
      query += ` AND ${stockStatusCondition}`;
    }

    query += ' ORDER BY p.name';

    const [rows] = await this.pool.execute(query, params);
    return rows as InventoryReportData[];
  }

  static async generateStockMovementReport(
    filters: {
      part_id?: number;
      movement_type?: string;
      date_from?: string;
      date_to?: string;
      performed_by?: number;
      limit?: number;
    } = {}
  ): Promise<StockMovementReportData[]> {
    let query = `
      SELECT
        sm.id as movement_id,
        sm.part_id,
        p.name as part_name,
        p.part_code,
        sm.movement_type,
        sm.quantity,
        sm.unit_cost,
        sm.total_cost,
        sm.reference_type,
        sm.reference_id,
        sm.notes,
        u.full_name as performed_by_name,
        sm.created_at
      FROM stock_movements sm
      JOIN parts p ON sm.part_id = p.id
      LEFT JOIN users u ON sm.performed_by = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.part_id) {
      query += ' AND sm.part_id = ?';
      params.push(filters.part_id);
    }

    if (filters.movement_type) {
      query += ' AND sm.movement_type = ?';
      params.push(filters.movement_type);
    }

    if (filters.date_from) {
      query += ' AND DATE(sm.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(sm.created_at) <= ?';
      params.push(filters.date_to);
    }

    if (filters.performed_by) {
      query += ' AND sm.performed_by = ?';
      params.push(filters.performed_by);
    }

    query += ' ORDER BY sm.created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const [rows] = await this.pool.execute(query, params);
    return rows as StockMovementReportData[];
  }

  static async generateInventoryAnalytics(): Promise<InventoryAnalytics> {
    // Overview statistics
    const [overviewRows] = await this.pool.execute(`
      SELECT
        COUNT(*) as total_parts,
        SUM(current_quantity * unit_price) as total_value,
        SUM(CASE WHEN current_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
        SUM(CASE WHEN min_stock_level IS NOT NULL AND current_quantity <= min_stock_level AND current_quantity > 0 THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN max_stock_level IS NOT NULL AND current_quantity > max_stock_level THEN 1 ELSE 0 END) as overstock_count,
        SUM(CASE WHEN status != 'active' THEN 1 ELSE 0 END) as inactive_parts_count
      FROM parts
    `);

    const overview = (overviewRows as any[])[0] as any;

    // Category breakdown
    const [categoryRows] = await this.pool.execute(`
      SELECT
        COALESCE(pc.name, 'Không phân loại') as category_name,
        COUNT(p.id) as part_count,
        SUM(p.current_quantity * p.unit_price) as total_value,
        AVG(p.current_quantity) as avg_stock_level
      FROM parts p
      LEFT JOIN part_categories pc ON p.category_id = pc.id
      GROUP BY p.category_id, pc.name
      ORDER BY total_value DESC
    `);

    // Stock status distribution
    const totalParts = overview.total_parts || 1;
    const [stockStatusRows] = await this.pool.execute(`
      SELECT
        stock_status,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / ${totalParts}) as percentage
      FROM (
        SELECT
          CASE
            WHEN current_quantity <= 0 THEN 'out_of_stock'
            WHEN min_stock_level IS NOT NULL AND current_quantity <= min_stock_level THEN 'low_stock'
            WHEN max_stock_level IS NOT NULL AND current_quantity > max_stock_level THEN 'overstock'
            ELSE 'normal'
          END as stock_status
        FROM parts
      ) as stock_data
      GROUP BY stock_status
    `);

    // Top value parts
    const [topValueRows] = await this.pool.execute(`
      SELECT
        id as part_id,
        name as part_name,
        part_code,
        (current_quantity * unit_price) as total_value
      FROM parts
      WHERE current_quantity > 0
      ORDER BY total_value DESC
      LIMIT 10
    `);

    // Slow moving parts (no movement in 60+ days)
    const [slowMovingRows] = await this.pool.execute(`
      SELECT
        p.id as part_id,
        p.name as part_name,
        p.part_code,
        COALESCE(DATEDIFF(NOW(), sm.last_movement), 999) as days_since_last_movement,
        p.current_quantity
      FROM parts p
      LEFT JOIN (
        SELECT
          part_id,
          MAX(created_at) as last_movement
        FROM stock_movements
        GROUP BY part_id
      ) sm ON p.id = sm.part_id
      WHERE p.current_quantity > 0
      AND (sm.last_movement IS NULL OR DATEDIFF(NOW(), sm.last_movement) >= 60)
      ORDER BY days_since_last_movement DESC
      LIMIT 20
    `);

    return {
      overview: {
        total_parts: overview.total_parts || 0,
        total_value: overview.total_value || 0,
        out_of_stock_count: overview.out_of_stock_count || 0,
        low_stock_count: overview.low_stock_count || 0,
        overstock_count: overview.overstock_count || 0,
        inactive_parts_count: overview.inactive_parts_count || 0,
      },
      category_breakdown: categoryRows as any[],
      stock_status_distribution: stockStatusRows as any[],
      top_value_parts: topValueRows as any[],
      slow_moving_parts: slowMovingRows as any[],
    };
  }

  static async generateMovementAnalytics(): Promise<MovementAnalytics> {
    // Overview for last 30 days
    const [overviewRows] = await this.pool.execute(`
      SELECT
        COUNT(*) as total_movements_30days,
        SUM(CASE WHEN movement_type IN ('in', 'return') THEN COALESCE(total_cost, unit_cost * quantity, 0) ELSE 0 END) as total_value_in_30days,
        SUM(CASE WHEN movement_type IN ('out', 'loss') THEN COALESCE(total_cost, unit_cost * quantity, 0) ELSE 0 END) as total_value_out_30days,
        SUM(
          CASE
            WHEN movement_type IN ('in', 'return') THEN COALESCE(total_cost, unit_cost * quantity, 0)
            WHEN movement_type IN ('out', 'loss') THEN -COALESCE(total_cost, unit_cost * quantity, 0)
            ELSE 0
          END
        ) as net_value_change_30days
      FROM stock_movements
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);

    const overview = (overviewRows as any[])[0] as any;

    // Daily movements for last 30 days
    const [dailyRows] = await this.pool.execute(`
      SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN movement_type IN ('in', 'return') THEN quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN movement_type IN ('out', 'loss') THEN quantity ELSE 0 END) as total_out,
        SUM(
          CASE
            WHEN movement_type IN ('in', 'return') THEN quantity
            WHEN movement_type IN ('out', 'loss') THEN -quantity
            WHEN movement_type = 'adjustment' THEN quantity
            ELSE 0
          END
        ) as net_movement
      FROM stock_movements
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Movement type distribution
    const totalMovements = overview.total_movements_30days || 1;
    const [movementTypeRows] = await this.pool.execute(`
      SELECT
        movement_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / ${totalMovements}) as percentage
      FROM stock_movements
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY movement_type
      ORDER BY count DESC
    `);

    // Top moving parts (last 30 days)
    const [topMovingRows] = await this.pool.execute(`
      SELECT
        sm.part_id,
        p.name as part_name,
        p.part_code,
        COUNT(*) as total_movements,
        SUM(CASE WHEN sm.movement_type IN ('in', 'return') THEN sm.quantity ELSE 0 END) as total_in,
        SUM(CASE WHEN sm.movement_type IN ('out', 'loss') THEN sm.quantity ELSE 0 END) as total_out
      FROM stock_movements sm
      JOIN parts p ON sm.part_id = p.id
      WHERE sm.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY sm.part_id, p.name, p.part_code
      ORDER BY total_movements DESC
      LIMIT 10
    `);

    // Performance by staff (last 30 days)
    const [staffPerformanceRows] = await this.pool.execute(`
      SELECT
        u.id as user_id,
        u.full_name as user_name,
        COUNT(*) as total_movements,
        100.0 as accuracy_rate
      FROM stock_movements sm
      JOIN users u ON sm.performed_by = u.id
      WHERE sm.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY u.id, u.full_name
      ORDER BY total_movements DESC
      LIMIT 10
    `);

    return {
      overview: {
        total_movements_30days: overview.total_movements_30days || 0,
        total_value_in_30days: overview.total_value_in_30days || 0,
        total_value_out_30days: overview.total_value_out_30days || 0,
        net_value_change_30days: overview.net_value_change_30days || 0,
      },
      daily_movements: dailyRows as any[],
      movement_type_distribution: movementTypeRows as any[],
      top_moving_parts: topMovingRows as any[],
      performance_by_staff: staffPerformanceRows as any[],
    };
  }

  static async exportInventoryReport(
    format: 'csv' | 'json' | 'excel' = 'csv',
    filters: any = {}
  ): Promise<Buffer | string> {
    const data = await this.generateInventoryReport(filters);

    const exportData = data.map((item) => ({
      'Mã phụ tùng': item.part_code,
      'Tên phụ tùng': item.part_name,
      'Danh mục': item.category_name || 'Không phân loại',
      'Số lượng hiện tại': item.current_quantity,
      'Mức tối thiểu': item.min_stock_level || '',
      'Mức tối đa': item.max_stock_level || '',
      'Đơn giá': item.unit_price,
      'Tổng giá trị': item.total_value,
      'Vị trí': item.location || '',
      'Trạng thái': item.status,
      'Tình trạng kho': this.getStockStatusLabel(item.stock_status),
      'Ngày di chuyển cuối': item.last_movement_date || '',
      'Số ngày không di chuyển': item.days_since_last_movement || '',
    }));

    const result = ExportService.exportData(exportData, format, 'inventory_report');
    return result.content;
  }

  static async exportStockMovementReport(
    format: 'csv' | 'json' | 'excel' = 'csv',
    filters: any = {}
  ): Promise<Buffer | string> {
    const data = await this.generateStockMovementReport(filters);

    const exportData = data.map((item) => ({
      'Mã phụ tùng': item.part_code,
      'Tên phụ tùng': item.part_name,
      'Loại di chuyển': this.getMovementTypeLabel(item.movement_type),
      'Số lượng': item.quantity,
      'Đơn giá': item.unit_cost || '',
      'Tổng giá': item.total_cost || '',
      'Loại tham chiếu': item.reference_type || '',
      'Ghi chú': item.notes || '',
      'Người thực hiện': item.performed_by_name,
      'Ngày tạo': item.created_at,
    }));

    const result = ExportService.exportData(exportData, format, 'stock_movement_report');
    return result.content;
  }

  private static getStockStatusCondition(status: string): string {
    switch (status) {
      case 'out_of_stock':
        return 'p.current_quantity <= 0';
      case 'low_stock':
        return 'p.min_stock_level IS NOT NULL AND p.current_quantity <= p.min_stock_level AND p.current_quantity > 0';
      case 'overstock':
        return 'p.max_stock_level IS NOT NULL AND p.current_quantity > p.max_stock_level';
      case 'normal':
        return '(p.min_stock_level IS NULL OR p.current_quantity > p.min_stock_level) AND (p.max_stock_level IS NULL OR p.current_quantity <= p.max_stock_level) AND p.current_quantity > 0';
      default:
        return '1=1';
    }
  }

  private static getStockStatusLabel(status: string): string {
    switch (status) {
      case 'out_of_stock':
        return 'Hết hàng';
      case 'low_stock':
        return 'Sắp hết hàng';
      case 'overstock':
        return 'Tồn kho quá cao';
      case 'normal':
        return 'Bình thường';
      default:
        return 'Không xác định';
    }
  }

  private static getMovementTypeLabel(type: string): string {
    switch (type) {
      case 'in':
        return 'Nhập kho';
      case 'out':
        return 'Xuất kho';
      case 'adjustment':
        return 'Điều chỉnh';
      case 'loss':
        return 'Mất mát';
      case 'return':
        return 'Trả hàng';
      default:
        return type;
    }
  }
}

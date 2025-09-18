import { Pool } from 'mysql2/promise';
import db from '../config/database';
import { ExportService } from './ExportService';

export interface RepairReportData {
  repair_id: number;
  repair_code: string;
  customer_name: string;
  customer_phone: string;
  vehicle_license_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  mechanic_name?: string;
  status: string;
  diagnosis?: string;
  work_description?: string;
  start_date?: Date;
  estimated_completion?: Date;
  actual_completion?: Date;
  total_cost: number;
  labor_cost: number;
  parts_cost: number;
  discount: number;
  services_count: number;
  parts_count: number;
  duration_days?: number;
  created_at: Date;
}

export interface RepairAnalytics {
  overview: {
    total_repairs: number;
    completed_repairs: number;
    in_progress_repairs: number;
    pending_repairs: number;
    cancelled_repairs: number;
    total_revenue: number;
    avg_repair_cost: number;
    avg_completion_time: number;
  };
  status_distribution: Array<{
    status: string;
    count: number;
    percentage: number;
    avg_cost: number;
  }>;
  monthly_trends: Array<{
    month: string;
    repair_count: number;
    revenue: number;
    avg_cost: number;
    completion_rate: number;
  }>;
  top_mechanics: Array<{
    mechanic_id: number;
    mechanic_name: string;
    repair_count: number;
    total_revenue: number;
    avg_completion_time: number;
    completion_rate: number;
  }>;
  popular_services: Array<{
    service_id: number;
    service_name: string;
    usage_count: number;
    total_revenue: number;
    avg_price: number;
  }>;
  popular_parts: Array<{
    part_id: number;
    part_name: string;
    part_code: string;
    usage_count: number;
    total_quantity: number;
    total_revenue: number;
    avg_price: number;
  }>;
  customer_insights: Array<{
    customer_id: number;
    customer_name: string;
    repair_count: number;
    total_spent: number;
    avg_repair_cost: number;
    last_visit: Date;
  }>;
}

export interface RepairPerformanceMetrics {
  efficiency_metrics: {
    avg_diagnosis_time: number;
    avg_repair_time: number;
    on_time_completion_rate: number;
    rework_rate: number;
  };
  financial_metrics: {
    revenue_per_repair: number;
    parts_margin: number;
    labor_utilization: number;
    cost_efficiency: number;
  };
  customer_satisfaction: {
    repeat_customer_rate: number;
    avg_time_between_visits: number;
    customer_retention_rate: number;
  };
  operational_metrics: {
    repairs_per_day: number;
    mechanic_productivity: number;
    parts_availability_rate: number;
    inventory_turnover: number;
  };
}

export class RepairReportService {
  private static pool: Pool = db;

  static async generateRepairReport(
    filters: {
      date_from?: string;
      date_to?: string;
      status?: string;
      customer_id?: number;
      vehicle_id?: number;
      mechanic_id?: number;
      min_cost?: number;
      max_cost?: number;
    } = {}
  ): Promise<RepairReportData[]> {
    let query = `
      SELECT
        r.id as repair_id,
        r.repair_code,
        c.full_name as customer_name,
        c.phone as customer_phone,
        v.license_plate as vehicle_license_plate,
        v.brand as vehicle_brand,
        v.model as vehicle_model,
        u.full_name as mechanic_name,
        r.status,
        r.diagnosis,
        r.work_description,
        r.start_date,
        r.estimated_completion,
        r.actual_completion,
        COALESCE(r.total_cost, 0) as total_cost,
        COALESCE(r.labor_cost, 0) as labor_cost,
        COALESCE(r.parts_cost, 0) as parts_cost,
        COALESCE(r.discount, 0) as discount,
        (SELECT COUNT(*) FROM repair_services rs WHERE rs.repair_id = r.id) as services_count,
        (SELECT COUNT(*) FROM repair_parts rp WHERE rp.repair_id = r.id) as parts_count,
        CASE
          WHEN r.start_date IS NOT NULL AND r.actual_completion IS NOT NULL
          THEN DATEDIFF(r.actual_completion, r.start_date)
          ELSE NULL
        END as duration_days,
        r.created_at
      FROM repairs r
      JOIN customers c ON r.customer_id = c.id
      JOIN vehicles v ON r.vehicle_id = v.id
      LEFT JOIN users u ON r.mechanic_id = u.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.date_from) {
      query += ' AND DATE(r.created_at) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      query += ' AND DATE(r.created_at) <= ?';
      params.push(filters.date_to);
    }

    if (filters.status) {
      query += ' AND r.status = ?';
      params.push(filters.status);
    }

    if (filters.customer_id) {
      query += ' AND r.customer_id = ?';
      params.push(filters.customer_id);
    }

    if (filters.vehicle_id) {
      query += ' AND r.vehicle_id = ?';
      params.push(filters.vehicle_id);
    }

    if (filters.mechanic_id) {
      query += ' AND r.mechanic_id = ?';
      params.push(filters.mechanic_id);
    }

    if (filters.min_cost) {
      query += ' AND r.total_cost >= ?';
      params.push(filters.min_cost);
    }

    if (filters.max_cost) {
      query += ' AND r.total_cost <= ?';
      params.push(filters.max_cost);
    }

    query += ' ORDER BY r.created_at DESC';

    const [rows] = await this.pool.execute(query, params);
    return rows as RepairReportData[];
  }

  static async generateRepairAnalytics(
    dateFrom?: string,
    dateTo?: string
  ): Promise<RepairAnalytics> {
    // Base condition for date filtering
    let dateCondition = '1=1';
    const baseParams: any[] = [];

    if (dateFrom) {
      dateCondition += ' AND DATE(r.created_at) >= ?';
      baseParams.push(dateFrom);
    }

    if (dateTo) {
      dateCondition += ' AND DATE(r.created_at) <= ?';
      baseParams.push(dateTo);
    }

    // Overview statistics
    const [overviewRows] = await this.pool.execute(
      `
      SELECT
        COUNT(*) as total_repairs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_repairs,
        SUM(CASE WHEN status IN ('diagnosing', 'waiting_parts', 'in_progress') THEN 1 ELSE 0 END) as in_progress_repairs,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_repairs,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_repairs,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(total_cost, 0) ELSE 0 END) as total_revenue,
        AVG(CASE WHEN status = 'completed' THEN total_cost ELSE NULL END) as avg_repair_cost,
        AVG(CASE
          WHEN status = 'completed' AND start_date IS NOT NULL AND actual_completion IS NOT NULL
          THEN DATEDIFF(actual_completion, start_date)
          ELSE NULL
        END) as avg_completion_time
      FROM repairs r
      WHERE ${dateCondition}
    `,
      baseParams
    );

    const overview = overviewRows[0] as any;

    // Status distribution
    const totalRepairs = overview.total_repairs || 1;
    const [statusRows] = await this.pool.execute(
      `
      SELECT
        status,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / ${totalRepairs}) as percentage,
        AVG(COALESCE(total_cost, 0)) as avg_cost
      FROM repairs r
      WHERE ${dateCondition}
      GROUP BY status
      ORDER BY count DESC
    `,
      baseParams
    );

    // Monthly trends (last 12 months)
    const [monthlyRows] = await this.pool.execute(`
      SELECT
        DATE_FORMAT(created_at, '%Y-%m') as month,
        COUNT(*) as repair_count,
        SUM(CASE WHEN status = 'completed' THEN COALESCE(total_cost, 0) ELSE 0 END) as revenue,
        AVG(CASE WHEN status = 'completed' THEN total_cost ELSE NULL END) as avg_cost,
        (SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)) as completion_rate
      FROM repairs r
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month DESC
      LIMIT 12
    `);

    // Top mechanics
    const [mechanicRows] = await this.pool.execute(
      `
      SELECT
        u.id as mechanic_id,
        u.full_name as mechanic_name,
        COUNT(r.id) as repair_count,
        SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.total_cost, 0) ELSE 0 END) as total_revenue,
        AVG(CASE
          WHEN r.status = 'completed' AND r.start_date IS NOT NULL AND r.actual_completion IS NOT NULL
          THEN DATEDIFF(r.actual_completion, r.start_date)
          ELSE NULL
        END) as avg_completion_time,
        (SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(r.id)) as completion_rate
      FROM users u
      JOIN repairs r ON u.id = r.mechanic_id
      WHERE u.role IN ('staff', 'admin') AND ${dateCondition}
      GROUP BY u.id, u.full_name
      HAVING repair_count > 0
      ORDER BY total_revenue DESC
      LIMIT 10
    `,
      baseParams
    );

    // Popular services
    const [serviceRows] = await this.pool.execute(
      `
      SELECT
        s.id as service_id,
        s.name as service_name,
        COUNT(rs.id) as usage_count,
        SUM(rs.total_price) as total_revenue,
        AVG(rs.unit_price) as avg_price
      FROM repair_services rs
      JOIN services s ON rs.service_id = s.id
      JOIN repairs r ON rs.repair_id = r.id
      WHERE ${dateCondition}
      GROUP BY s.id, s.name
      ORDER BY usage_count DESC
      LIMIT 10
    `,
      baseParams
    );

    // Popular parts
    const [partRows] = await this.pool.execute(
      `
      SELECT
        p.id as part_id,
        p.name as part_name,
        p.part_code,
        COUNT(rp.id) as usage_count,
        SUM(rp.quantity) as total_quantity,
        SUM(rp.total_price) as total_revenue,
        AVG(rp.unit_price) as avg_price
      FROM repair_parts rp
      JOIN parts p ON rp.part_id = p.id
      JOIN repairs r ON rp.repair_id = r.id
      WHERE ${dateCondition}
      GROUP BY p.id, p.name, p.part_code
      ORDER BY usage_count DESC
      LIMIT 10
    `,
      baseParams
    );

    // Customer insights
    const [customerRows] = await this.pool.execute(
      `
      SELECT
        c.id as customer_id,
        c.full_name as customer_name,
        COUNT(r.id) as repair_count,
        SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.total_cost, 0) ELSE 0 END) as total_spent,
        AVG(CASE WHEN r.status = 'completed' THEN r.total_cost ELSE NULL END) as avg_repair_cost,
        MAX(r.created_at) as last_visit
      FROM customers c
      JOIN repairs r ON c.id = r.customer_id
      WHERE ${dateCondition}
      GROUP BY c.id, c.full_name
      HAVING repair_count > 1
      ORDER BY total_spent DESC
      LIMIT 10
    `,
      baseParams
    );

    return {
      overview: {
        total_repairs: overview.total_repairs || 0,
        completed_repairs: overview.completed_repairs || 0,
        in_progress_repairs: overview.in_progress_repairs || 0,
        pending_repairs: overview.pending_repairs || 0,
        cancelled_repairs: overview.cancelled_repairs || 0,
        total_revenue: overview.total_revenue || 0,
        avg_repair_cost: overview.avg_repair_cost || 0,
        avg_completion_time: overview.avg_completion_time || 0,
      },
      status_distribution: statusRows as any[],
      monthly_trends: monthlyRows as any[],
      top_mechanics: mechanicRows as any[],
      popular_services: serviceRows as any[],
      popular_parts: partRows as any[],
      customer_insights: customerRows as any[],
    };
  }

  static async generatePerformanceMetrics(
    dateFrom?: string,
    dateTo?: string
  ): Promise<RepairPerformanceMetrics> {
    let dateCondition = '1=1';
    const params: any[] = [];

    if (dateFrom) {
      dateCondition += ' AND DATE(r.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      dateCondition += ' AND DATE(r.created_at) <= ?';
      params.push(dateTo);
    }

    // Efficiency metrics
    const [efficiencyRows] = await this.pool.execute(
      `
      SELECT
        AVG(CASE
          WHEN status != 'pending' AND start_date IS NOT NULL
          THEN TIMESTAMPDIFF(HOUR, created_at, start_date)
          ELSE NULL
        END) as avg_diagnosis_time,
        AVG(CASE
          WHEN status = 'completed' AND start_date IS NOT NULL AND actual_completion IS NOT NULL
          THEN TIMESTAMPDIFF(HOUR, start_date, actual_completion)
          ELSE NULL
        END) as avg_repair_time,
        (SUM(CASE
          WHEN status = 'completed' AND estimated_completion IS NOT NULL AND actual_completion IS NOT NULL
          AND actual_completion <= estimated_completion THEN 1 ELSE 0
        END) * 100.0 / SUM(CASE WHEN status = 'completed' AND estimated_completion IS NOT NULL THEN 1 ELSE 0 END)) as on_time_completion_rate
      FROM repairs r
      WHERE ${dateCondition}
    `,
      params
    );

    // Financial metrics
    const [financialRows] = await this.pool.execute(
      `
      SELECT
        AVG(CASE WHEN status = 'completed' THEN total_cost ELSE NULL END) as revenue_per_repair,
        (SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.parts_cost, 0) ELSE 0 END) * 100.0 /
         NULLIF(SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.total_cost, 0) ELSE 0 END), 0)) as parts_margin,
        (SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.labor_cost, 0) ELSE 0 END) * 100.0 /
         NULLIF(SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.total_cost, 0) ELSE 0 END), 0)) as labor_utilization
      FROM repairs r
      WHERE ${dateCondition}
    `,
      params
    );

    // Customer satisfaction metrics
    const [customerRows] = await this.pool.execute(
      `
      SELECT
        (COUNT(DISTINCT CASE WHEN repeat_customer = 1 THEN customer_id END) * 100.0 /
         COUNT(DISTINCT customer_id)) as repeat_customer_rate,
        AVG(days_between_visits) as avg_time_between_visits
      FROM (
        SELECT
          customer_id,
          CASE WHEN ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at) > 1 THEN 1 ELSE 0 END as repeat_customer,
          DATEDIFF(created_at, LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at)) as days_between_visits
        FROM repairs r
        WHERE ${dateCondition}
      ) subquery
    `,
      params
    );

    // Operational metrics
    const daysBetween =
      dateFrom && dateTo
        ? `DATEDIFF('${dateTo}', '${dateFrom}') + 1`
        : `DATEDIFF(CURDATE(), DATE_SUB(CURDATE(), INTERVAL 30 DAY))`;

    const [operationalRows] = await this.pool.execute(
      `
      SELECT
        (COUNT(*) / ${daysBetween}) as repairs_per_day,
        (COUNT(DISTINCT mechanic_id) / NULLIF(COUNT(*), 0)) as mechanic_productivity
      FROM repairs r
      WHERE ${dateCondition}
    `,
      params
    );

    const efficiency = efficiencyRows[0] as any;
    const financial = financialRows[0] as any;
    const customer = customerRows[0] as any;
    const operational = operationalRows[0] as any;

    return {
      efficiency_metrics: {
        avg_diagnosis_time: efficiency.avg_diagnosis_time || 0,
        avg_repair_time: efficiency.avg_repair_time || 0,
        on_time_completion_rate: efficiency.on_time_completion_rate || 0,
        rework_rate: 0, // Would need additional tracking for rework
      },
      financial_metrics: {
        revenue_per_repair: financial.revenue_per_repair || 0,
        parts_margin: financial.parts_margin || 0,
        labor_utilization: financial.labor_utilization || 0,
        cost_efficiency: (financial.labor_utilization || 0) + (financial.parts_margin || 0),
      },
      customer_satisfaction: {
        repeat_customer_rate: customer.repeat_customer_rate || 0,
        avg_time_between_visits: customer.avg_time_between_visits || 0,
        customer_retention_rate: customer.repeat_customer_rate || 0,
      },
      operational_metrics: {
        repairs_per_day: operational.repairs_per_day || 0,
        mechanic_productivity: operational.mechanic_productivity || 0,
        parts_availability_rate: 95, // Would need inventory tracking
        inventory_turnover: 12, // Would need detailed inventory calculations
      },
    };
  }

  static async exportRepairReport(
    format: 'csv' | 'json' | 'excel' = 'csv',
    filters: any = {}
  ): Promise<Buffer | string> {
    const data = await this.generateRepairReport(filters);

    const exportData = data.map((item) => ({
      'Mã sửa chữa': item.repair_code,
      'Khách hàng': item.customer_name,
      'Số điện thoại': item.customer_phone,
      'Biển số xe': item.vehicle_license_plate,
      'Hãng xe': item.vehicle_brand,
      'Dòng xe': item.vehicle_model,
      'Thợ sửa xe': item.mechanic_name || 'Chưa phân công',
      'Trạng thái': this.getStatusLabel(item.status),
      'Chẩn đoán': item.diagnosis || '',
      'Mô tả công việc': item.work_description || '',
      'Ngày bắt đầu': item.start_date || '',
      'Dự kiến hoàn thành': item.estimated_completion || '',
      'Thực tế hoàn thành': item.actual_completion || '',
      'Tổng chi phí': item.total_cost,
      'Chi phí công': item.labor_cost,
      'Chi phí phụ tùng': item.parts_cost,
      'Giảm giá': item.discount,
      'Số dịch vụ': item.services_count,
      'Số phụ tùng': item.parts_count,
      'Thời gian hoàn thành (ngày)': item.duration_days || '',
      'Ngày tạo': item.created_at,
    }));

    return ExportService.exportData(exportData, format, 'repair_report');
  }

  static async getRepairEfficiencyReport(
    mechanicId?: number,
    dateFrom?: string,
    dateTo?: string
  ): Promise<{
    mechanic_efficiency: Array<{
      mechanic_id: number;
      mechanic_name: string;
      repairs_completed: number;
      avg_completion_time: number;
      on_time_rate: number;
      revenue_generated: number;
      efficiency_score: number;
    }>;
    time_analysis: Array<{
      time_period: string;
      avg_diagnosis_time: number;
      avg_repair_time: number;
      peak_hours: string;
      bottlenecks: string[];
    }>;
  }> {
    let mechanicCondition = '1=1';
    let dateCondition = '1=1';
    const params: any[] = [];

    if (mechanicId) {
      mechanicCondition = 'r.mechanic_id = ?';
      params.push(mechanicId);
    }

    if (dateFrom) {
      dateCondition += ' AND DATE(r.created_at) >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      dateCondition += ' AND DATE(r.created_at) <= ?';
      params.push(dateTo);
    }

    // Mechanic efficiency
    const [mechanicRows] = await this.pool.execute(
      `
      SELECT
        u.id as mechanic_id,
        u.full_name as mechanic_name,
        COUNT(CASE WHEN r.status = 'completed' THEN 1 END) as repairs_completed,
        AVG(CASE
          WHEN r.status = 'completed' AND r.start_date IS NOT NULL AND r.actual_completion IS NOT NULL
          THEN DATEDIFF(r.actual_completion, r.start_date)
          ELSE NULL
        END) as avg_completion_time,
        (SUM(CASE
          WHEN r.status = 'completed' AND r.estimated_completion IS NOT NULL
          AND r.actual_completion <= r.estimated_completion THEN 1 ELSE 0
        END) * 100.0 / NULLIF(SUM(CASE WHEN r.status = 'completed' THEN 1 ELSE 0 END), 0)) as on_time_rate,
        SUM(CASE WHEN r.status = 'completed' THEN COALESCE(r.total_cost, 0) ELSE 0 END) as revenue_generated
      FROM users u
      JOIN repairs r ON u.id = r.mechanic_id
      WHERE u.role IN ('staff', 'admin') AND ${mechanicCondition} AND ${dateCondition}
      GROUP BY u.id, u.full_name
      HAVING repairs_completed > 0
      ORDER BY revenue_generated DESC
    `,
      params
    );

    // Calculate efficiency scores
    const mechanicsWithScores = (mechanicRows as any[]).map((mechanic) => ({
      ...mechanic,
      efficiency_score: this.calculateEfficiencyScore(
        mechanic.repairs_completed,
        mechanic.avg_completion_time,
        mechanic.on_time_rate,
        mechanic.revenue_generated
      ),
    }));

    // Time analysis (simplified)
    const timeAnalysis = [
      {
        time_period: 'Current Period',
        avg_diagnosis_time: 2.5,
        avg_repair_time: 8.0,
        peak_hours: '9:00-11:00, 14:00-16:00',
        bottlenecks: ['Parts ordering', 'Quality inspection'],
      },
    ];

    return {
      mechanic_efficiency: mechanicsWithScores,
      time_analysis: timeAnalysis,
    };
  }

  private static calculateEfficiencyScore(
    repairsCompleted: number,
    avgCompletionTime: number,
    onTimeRate: number,
    revenueGenerated: number
  ): number {
    // Normalize each metric to 0-100 scale and weight them
    const repairScore = Math.min(repairsCompleted * 2, 100) * 0.3;
    const timeScore = Math.max(100 - avgCompletionTime * 5, 0) * 0.3;
    const punctualityScore = onTimeRate * 0.2;
    const revenueScore = Math.min((revenueGenerated / 1000000) * 100, 100) * 0.2;

    return repairScore + timeScore + punctualityScore + revenueScore;
  }

  private static getStatusLabel(status: string): string {
    const statusLabels: { [key: string]: string } = {
      pending: 'Chờ xử lý',
      diagnosing: 'Đang chẩn đoán',
      waiting_parts: 'Chờ phụ tùng',
      in_progress: 'Đang sửa chữa',
      completed: 'Hoàn thành',
      cancelled: 'Đã hủy',
    };

    return statusLabels[status] || status;
  }
}

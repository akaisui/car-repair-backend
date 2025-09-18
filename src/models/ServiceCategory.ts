import BaseModel from './BaseModel';

export interface ServiceCategoryData {
  id?: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * ServiceCategory Model
 * Manages service categories for organization
 */
export default class ServiceCategory extends BaseModel {
  protected static tableName = 'service_categories';
  protected static primaryKey = 'id';

  /**
   * Create a new service category
   */
  static async create(data: Omit<ServiceCategoryData, 'id' | 'created_at' | 'updated_at'>): Promise<ServiceCategoryData> {
    return await super.create(data);
  }

  /**
   * Update service category by ID
   */
  static async updateById(id: number, data: Partial<ServiceCategoryData>): Promise<ServiceCategoryData | null> {
    return await super.updateById(id, data);
  }

  /**
   * Find category by slug
   */
  static async findBySlug(slug: string): Promise<ServiceCategoryData | null> {
    return await super.findOne({ slug });
  }

  /**
   * Find active categories ordered by sort_order
   */
  static async findActive(): Promise<ServiceCategoryData[]> {
    return await super.findAll({
      where: { is_active: true },
      orderBy: 'sort_order ASC, name ASC',
    });
  }

  /**
   * Find categories with service count
   */
  static async findWithServiceCount(): Promise<Array<ServiceCategoryData & { service_count: number }>> {
    const query = `
      SELECT
        sc.*,
        COUNT(s.id) as service_count
      FROM ${this.tableName} sc
      LEFT JOIN services s ON sc.id = s.category_id AND s.is_active = ?
      WHERE sc.is_active = ?
      GROUP BY sc.id
      ORDER BY sc.sort_order ASC, sc.name ASC
    `;

    return await this.query(query, [1, 1]); // Both boolean to integer
  }

  /**
   * Get categories for specific classification
   */
  static async findByClassification(classification: 'basic' | 'advanced' | 'special'): Promise<ServiceCategoryData[]> {
    let slugPattern: string;

    switch (classification) {
      case 'basic':
        slugPattern = '%co-ban%|%bao-duong%|%kiem-tra%';
        break;
      case 'advanced':
        slugPattern = '%chuyen-sau%|%dai-tu%|%sua-chua%';
        break;
      case 'special':
        slugPattern = '%dac-biet%|%cuu-ho%|%tai-nha%';
        break;
      default:
        return [];
    }

    const query = `
      SELECT * FROM ${this.tableName}
      WHERE is_active = ?
      AND (${slugPattern.split('|').map(() => 'slug LIKE ?').join(' OR ')})
      ORDER BY sort_order ASC, name ASC
    `;

    const params = [1, ...slugPattern.split('|').map(pattern => pattern.replace(/[%]/g, ''))];

    return await this.query(query, params);
  }

  /**
   * Update sort order for multiple categories
   */
  static async updateSortOrder(updates: Array<{ id: number; sort_order: number }>): Promise<boolean> {
    if (updates.length === 0) return false;

    const connection = await this.getTransaction();

    try {
      for (const update of updates) {
        await connection.execute(
          `UPDATE ${this.tableName} SET sort_order = ?, updated_at = ? WHERE id = ?`,
          [update.sort_order, new Date(), update.id]
        );
      }

      await this.commitTransaction(connection);
      return true;
    } catch (error) {
      await this.rollbackTransaction(connection);
      throw error;
    }
  }

  /**
   * Get next available sort order
   */
  static async getNextSortOrder(): Promise<number> {
    const result = await this.query(
      `SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM ${this.tableName}`
    );

    return result[0]?.next_order || 1;
  }

  /**
   * Get category statistics
   */
  static async getStatistics(): Promise<{
    total: number;
    active: number;
    with_services: number;
    most_used: ServiceCategoryData & { service_count: number };
  }> {
    const [totalResult, activeResult, withServicesResult, mostUsedResult] = await Promise.all([
      this.count(),
      this.count({ is_active: true }),
      this.query(`
        SELECT COUNT(DISTINCT sc.id) as count
        FROM ${this.tableName} sc
        INNER JOIN services s ON sc.id = s.category_id AND s.is_active = true
        WHERE sc.is_active = true
      `),
      this.query(`
        SELECT
          sc.*,
          COUNT(s.id) as service_count
        FROM ${this.tableName} sc
        LEFT JOIN services s ON sc.id = s.category_id AND s.is_active = true
        WHERE sc.is_active = true
        GROUP BY sc.id
        ORDER BY service_count DESC
        LIMIT 1
      `)
    ]);

    return {
      total: totalResult,
      active: activeResult,
      with_services: withServicesResult[0]?.count || 0,
      most_used: mostUsedResult[0] || null
    };
  }

  /**
   * Toggle active status
   */
  static async toggleActive(id: number): Promise<ServiceCategoryData | null> {
    const category = await this.findById(id);
    if (!category) return null;

    return await this.updateById(id, {
      is_active: !category.is_active
    });
  }

  /**
   * Reorder categories
   */
  static async reorder(categoryIds: number[]): Promise<boolean> {
    if (categoryIds.length === 0) return false;

    const updates = categoryIds.map((id, index) => ({
      id,
      sort_order: (index + 1) * 10 // Leave gaps for future insertions
    }));

    return await this.updateSortOrder(updates);
  }

  /**
   * Get predefined categories for auto-setup
   */
  static getPredefinedCategories(): Array<Omit<ServiceCategoryData, 'id' | 'created_at' | 'updated_at'>> {
    return [
      {
        name: 'Sửa chữa cơ bản',
        slug: 'sua-chua-co-ban',
        description: 'Các dịch vụ bảo dưỡng và sửa chữa cơ bản',
        icon: 'wrench',
        sort_order: 10,
        is_active: true
      },
      {
        name: 'Dịch vụ chuyên sâu',
        slug: 'dich-vu-chuyen-sau',
        description: 'Đại tu động cơ, sửa chữa phức tạp',
        icon: 'engine',
        sort_order: 20,
        is_active: true
      },
      {
        name: 'Dịch vụ đặc biệt',
        slug: 'dich-vu-dac-biet',
        description: 'Cứu hộ, sửa xe tại nhà, rửa xe',
        icon: 'emergency',
        sort_order: 30,
        is_active: true
      },
      {
        name: 'Phụ tùng & Phụ kiện',
        slug: 'phu-tung-phu-kien',
        description: 'Lắp đặt và thay thế phụ tùng, phụ kiện',
        icon: 'parts',
        sort_order: 40,
        is_active: true
      }
    ];
  }

  /**
   * Initialize default categories
   */
  static async initializeDefaultCategories(): Promise<ServiceCategoryData[]> {
    const predefinedCategories = this.getPredefinedCategories();
    const createdCategories: ServiceCategoryData[] = [];

    for (const category of predefinedCategories) {
      // Check if category already exists
      const existing = await this.findBySlug(category.slug);
      if (!existing) {
        const created = await this.create(category);
        createdCategories.push(created);
      }
    }

    return createdCategories;
  }
}
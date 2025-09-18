import { Pool } from 'mysql2/promise';

export const up = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    // Create stock_movements table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INT PRIMARY KEY AUTO_INCREMENT,
        part_id INT NOT NULL,
        movement_type ENUM('in', 'out', 'adjustment', 'loss', 'return') NOT NULL,
        quantity INT NOT NULL,
        unit_cost DECIMAL(10, 2),
        total_cost DECIMAL(10, 2),
        reference_type VARCHAR(50),
        reference_id INT,
        notes TEXT,
        performed_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
        FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE RESTRICT,
        INDEX idx_part_id (part_id),
        INDEX idx_movement_type (movement_type),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create inventory_alerts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS inventory_alerts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        part_id INT NOT NULL,
        alert_type ENUM('low_stock', 'out_of_stock', 'overstock', 'expiring') NOT NULL,
        message TEXT NOT NULL,
        is_acknowledged BOOLEAN DEFAULT false,
        acknowledged_by INT,
        acknowledged_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
        FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_part_id (part_id),
        INDEX idx_alert_type (alert_type),
        INDEX idx_acknowledged (is_acknowledged),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create part_categories table (for better organization)
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS part_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        parent_id INT,
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES part_categories(id) ON DELETE SET NULL,
        INDEX idx_slug (slug),
        INDEX idx_parent_id (parent_id),
        INDEX idx_sort_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create vehicle_part_compatibility table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS vehicle_part_compatibility (
        id INT PRIMARY KEY AUTO_INCREMENT,
        part_id INT NOT NULL,
        brand VARCHAR(100),
        model VARCHAR(100),
        year_from INT,
        year_to INT,
        engine_type VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
        INDEX idx_part_id (part_id),
        INDEX idx_brand_model (brand, model),
        INDEX idx_year_range (year_from, year_to)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create part_suppliers table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS part_suppliers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create part_supplier_prices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS part_supplier_prices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        part_id INT NOT NULL,
        supplier_id INT NOT NULL,
        supplier_part_code VARCHAR(100),
        unit_price DECIMAL(10, 2) NOT NULL,
        min_order_quantity INT DEFAULT 1,
        lead_time_days INT DEFAULT 7,
        is_preferred BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES part_suppliers(id) ON DELETE CASCADE,
        INDEX idx_part_id (part_id),
        INDEX idx_supplier_id (supplier_id),
        INDEX idx_preferred (is_preferred),
        UNIQUE KEY unique_part_supplier (part_id, supplier_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Add category_id to parts table if not exists
    await connection.execute(`
      ALTER TABLE parts
      ADD COLUMN category_id INT AFTER id,
      ADD FOREIGN KEY (category_id) REFERENCES part_categories(id) ON DELETE SET NULL,
      ADD INDEX idx_category_id (category_id)
    `).catch(() => {
      // Column might already exist, ignore error
    });

    console.log('✅ Inventory tracking tables created successfully');
  } finally {
    connection.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    // Drop tables in reverse order due to foreign key constraints
    const tables = [
      'part_supplier_prices',
      'part_suppliers',
      'vehicle_part_compatibility',
      'part_categories',
      'inventory_alerts',
      'stock_movements'
    ];

    for (const table of tables) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
    }

    // Remove category_id column from parts table
    await connection.execute(`
      ALTER TABLE parts DROP FOREIGN KEY parts_ibfk_2
    `).catch(() => {});

    await connection.execute(`
      ALTER TABLE parts DROP COLUMN category_id
    `).catch(() => {});

    console.log('✅ Inventory tracking tables dropped successfully');
  } finally {
    connection.release();
  }
};
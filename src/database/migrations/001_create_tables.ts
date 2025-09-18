import { Pool } from 'mysql2/promise';

export const up = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role ENUM('admin', 'staff', 'customer') DEFAULT 'customer',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create customers table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT UNIQUE,
        customer_code VARCHAR(50) UNIQUE,
        address TEXT,
        date_of_birth DATE,
        gender ENUM('male', 'female', 'other'),
        loyalty_points INT DEFAULT 0,
        total_spent DECIMAL(15, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_customer_code (customer_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create service_categories table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS service_categories (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        icon VARCHAR(255),
        sort_order INT DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slug (slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create services table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        category_id INT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        short_description VARCHAR(500),
        price DECIMAL(10, 2),
        min_price DECIMAL(10, 2),
        max_price DECIMAL(10, 2),
        duration_minutes INT,
        image_url VARCHAR(500),
        is_featured BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE SET NULL,
        INDEX idx_category (category_id),
        INDEX idx_slug (slug),
        INDEX idx_featured (is_featured)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create parts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS parts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        part_code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        brand VARCHAR(100),
        unit VARCHAR(50),
        purchase_price DECIMAL(10, 2),
        selling_price DECIMAL(10, 2),
        quantity_in_stock INT DEFAULT 0,
        min_stock_level INT DEFAULT 5,
        max_stock_level INT DEFAULT 100,
        location VARCHAR(100),
        image_url VARCHAR(500),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_part_code (part_code),
        INDEX idx_quantity (quantity_in_stock)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create vehicles table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT,
        license_plate VARCHAR(20) UNIQUE NOT NULL,
        brand VARCHAR(100),
        model VARCHAR(100),
        year INT,
        color VARCHAR(50),
        engine_number VARCHAR(100),
        chassis_number VARCHAR(100),
        mileage INT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_license_plate (license_plate),
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create appointments table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS appointments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        appointment_code VARCHAR(50) UNIQUE NOT NULL,
        customer_id INT,
        vehicle_id INT,
        service_id INT,
        appointment_date DATE NOT NULL,
        appointment_time TIME NOT NULL,
        status ENUM('pending', 'confirmed', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
        notes TEXT,
        reminder_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
        INDEX idx_date (appointment_date),
        INDEX idx_status (status),
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create repairs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS repairs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        repair_code VARCHAR(50) UNIQUE NOT NULL,
        appointment_id INT,
        customer_id INT,
        vehicle_id INT,
        mechanic_id INT,
        status ENUM('pending', 'diagnosing', 'waiting_parts', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
        diagnosis TEXT,
        work_description TEXT,
        start_date DATETIME,
        completion_date DATETIME,
        total_amount DECIMAL(10, 2) DEFAULT 0,
        parts_cost DECIMAL(10, 2) DEFAULT 0,
        labor_cost DECIMAL(10, 2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
        FOREIGN KEY (mechanic_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_repair_code (repair_code),
        INDEX idx_status (status),
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create repair_services junction table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS repair_services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        repair_id INT,
        service_id INT,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10, 2),
        total_price DECIMAL(10, 2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        INDEX idx_repair (repair_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create repair_parts junction table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS repair_parts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        repair_id INT,
        part_id INT,
        quantity INT DEFAULT 1,
        unit_price DECIMAL(10, 2),
        total_price DECIMAL(10, 2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
        FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE,
        INDEX idx_repair (repair_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create invoices table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT PRIMARY KEY AUTO_INCREMENT,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        repair_id INT,
        customer_id INT,
        subtotal DECIMAL(10, 2) DEFAULT 0,
        tax_rate DECIMAL(5, 2) DEFAULT 0,
        tax_amount DECIMAL(10, 2) DEFAULT 0,
        discount_amount DECIMAL(10, 2) DEFAULT 0,
        total_amount DECIMAL(10, 2) DEFAULT 0,
        payment_status ENUM('pending', 'partial', 'paid', 'refunded') DEFAULT 'pending',
        payment_method ENUM('cash', 'card', 'transfer', 'other'),
        payment_date DATETIME,
        due_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_invoice_number (invoice_number),
        INDEX idx_payment_status (payment_status),
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create reviews table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS reviews (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT,
        repair_id INT,
        rating INT CHECK (rating >= 1 AND rating <= 5),
        title VARCHAR(255),
        comment TEXT,
        images JSON,
        is_verified BOOLEAN DEFAULT false,
        is_visible BOOLEAN DEFAULT true,
        admin_response TEXT,
        admin_response_date DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (repair_id) REFERENCES repairs(id) ON DELETE CASCADE,
        INDEX idx_rating (rating),
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create promotions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS promotions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        discount_type ENUM('percentage', 'fixed') DEFAULT 'percentage',
        discount_value DECIMAL(10, 2),
        min_purchase_amount DECIMAL(10, 2) DEFAULT 0,
        max_discount_amount DECIMAL(10, 2),
        usage_limit INT,
        used_count INT DEFAULT 0,
        start_date DATE,
        end_date DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code),
        INDEX idx_dates (start_date, end_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create loyalty_transactions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id INT,
        transaction_type ENUM('earned', 'redeemed', 'expired', 'adjusted') NOT NULL,
        points INT NOT NULL,
        balance_after INT NOT NULL,
        description TEXT,
        reference_type VARCHAR(50),
        reference_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_customer (customer_id),
        INDEX idx_type (transaction_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create notifications table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT,
        type VARCHAR(50),
        title VARCHAR(255),
        message TEXT,
        data JSON,
        is_read BOOLEAN DEFAULT false,
        read_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id),
        INDEX idx_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create refresh_tokens table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at DATETIME NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token(255)),
        INDEX idx_user_id (user_id),
        INDEX idx_expires (expires_at),
        INDEX idx_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create password_reset_tokens table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        token VARCHAR(500) NOT NULL,
        expires_at DATETIME NOT NULL,
        is_used BOOLEAN DEFAULT false,
        used_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token (token(255)),
        INDEX idx_user_id (user_id),
        INDEX idx_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create login_attempts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT,
        success BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_ip_address (ip_address),
        INDEX idx_created_at (created_at),
        INDEX idx_success (success)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create settings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        setting_type VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ All tables created successfully');
  } finally {
    connection.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    // Drop tables in reverse order due to foreign key constraints
    const tables = [
      'settings',
      'login_attempts',
      'password_reset_tokens',
      'refresh_tokens',
      'notifications',
      'loyalty_transactions',
      'promotions',
      'reviews',
      'invoices',
      'repair_parts',
      'repair_services',
      'repairs',
      'appointments',
      'vehicles',
      'parts',
      'services',
      'service_categories',
      'customers',
      'users'
    ];

    for (const table of tables) {
      await connection.execute(`DROP TABLE IF EXISTS ${table}`);
    }

    console.log('✅ All tables dropped successfully');
  } finally {
    connection.release();
  }
};
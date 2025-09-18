const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'car_repair',
  multipleStatements: true
};

const initDatabase = async () => {
  let connection;

  try {
    console.log('🔄 Connecting to MySQL server...');

    // Connect without database first to create it if needed
    const tempConnection = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      multipleStatements: true
    });

    // Create database if it doesn't exist
    console.log(`🔄 Creating database '${DB_CONFIG.database}' if not exists...`);
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();

    // Connect to the specific database
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database successfully');

    // Drop existing tables in correct order (respecting foreign key constraints)
    console.log('🔄 Dropping existing tables...');
    const dropTables = [
      'DROP TABLE IF EXISTS `invoice_parts`',
      'DROP TABLE IF EXISTS `invoice_services`',
      'DROP TABLE IF EXISTS `invoices`',
      'DROP TABLE IF EXISTS `repair_parts`',
      'DROP TABLE IF EXISTS `repair_services`',
      'DROP TABLE IF EXISTS `repairs`',
      'DROP TABLE IF EXISTS `notifications`',
      'DROP TABLE IF EXISTS `appointments`',
      'DROP TABLE IF EXISTS `vehicles`',
      'DROP TABLE IF EXISTS `parts`',
      'DROP TABLE IF EXISTS `services`',
      'DROP TABLE IF EXISTS `users`'
    ];

    for (const dropQuery of dropTables) {
      await connection.execute(dropQuery);
    }

    // Create tables with complete structure
    console.log('🔄 Creating tables...');

    // Users table
    await connection.execute(`
      CREATE TABLE \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`phone\` varchar(20) DEFAULT NULL,
        \`password\` varchar(255) NOT NULL,
        \`role\` enum('admin','staff','customer') NOT NULL DEFAULT 'customer',
        \`address\` text,
        \`avatar\` varchar(500) DEFAULT NULL,
        \`email_verified\` tinyint(1) DEFAULT '0',
        \`phone_verified\` tinyint(1) DEFAULT '0',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`last_login\` timestamp NULL DEFAULT NULL,
        \`push_token\` varchar(500) DEFAULT NULL,
        \`device_type\` enum('ios','android','web') DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`email\` (\`email\`),
        KEY \`role\` (\`role\`),
        KEY \`email_verified\` (\`email_verified\`),
        KEY \`is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Services table
    await connection.execute(`
      CREATE TABLE \`services\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`description\` text,
        \`price\` decimal(10,2) NOT NULL,
        \`duration\` int DEFAULT '60',
        \`category\` varchar(100) DEFAULT NULL,
        \`image\` varchar(500) DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`category\` (\`category\`),
        KEY \`is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Parts table
    await connection.execute(`
      CREATE TABLE \`parts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`part_number\` varchar(100) DEFAULT NULL,
        \`description\` text,
        \`price\` decimal(10,2) NOT NULL,
        \`cost\` decimal(10,2) DEFAULT NULL,
        \`quantity\` int DEFAULT '0',
        \`min_quantity\` int DEFAULT '5',
        \`category\` varchar(100) DEFAULT NULL,
        \`brand\` varchar(100) DEFAULT NULL,
        \`supplier\` varchar(255) DEFAULT NULL,
        \`location\` varchar(100) DEFAULT NULL,
        \`image\` varchar(500) DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`part_number\` (\`part_number\`),
        KEY \`category\` (\`category\`),
        KEY \`brand\` (\`brand\`),
        KEY \`quantity\` (\`quantity\`),
        KEY \`is_active\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Vehicles table
    await connection.execute(`
      CREATE TABLE \`vehicles\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`make\` varchar(100) NOT NULL,
        \`model\` varchar(100) NOT NULL,
        \`year\` int NOT NULL,
        \`color\` varchar(50) DEFAULT NULL,
        \`license_plate\` varchar(20) DEFAULT NULL,
        \`vin\` varchar(50) DEFAULT NULL,
        \`engine_type\` varchar(100) DEFAULT NULL,
        \`fuel_type\` enum('gasoline','diesel','electric','hybrid') DEFAULT 'gasoline',
        \`transmission\` enum('manual','automatic','cvt') DEFAULT 'manual',
        \`mileage\` int DEFAULT '0',
        \`notes\` text,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`user_id\` (\`user_id\`),
        KEY \`make_model\` (\`make\`,\`model\`),
        KEY \`license_plate\` (\`license_plate\`),
        CONSTRAINT \`vehicles_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Appointments table
    await connection.execute(`
      CREATE TABLE \`appointments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`vehicle_id\` int DEFAULT NULL,
        \`service_ids\` json DEFAULT NULL,
        \`appointment_date\` datetime NOT NULL,
        \`estimated_duration\` int DEFAULT '60',
        \`status\` enum('pending','confirmed','in_progress','completed','cancelled') DEFAULT 'pending',
        \`priority\` enum('low','normal','high','urgent') DEFAULT 'normal',
        \`description\` text,
        \`notes\` text,
        \`assigned_staff\` int DEFAULT NULL,
        \`estimated_cost\` decimal(10,2) DEFAULT NULL,
        \`actual_cost\` decimal(10,2) DEFAULT NULL,
        \`payment_status\` enum('pending','paid','refunded') DEFAULT 'pending',
        \`confirmation_token\` varchar(255) DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`user_id\` (\`user_id\`),
        KEY \`vehicle_id\` (\`vehicle_id\`),
        KEY \`assigned_staff\` (\`assigned_staff\`),
        KEY \`appointment_date\` (\`appointment_date\`),
        KEY \`status\` (\`status\`),
        KEY \`priority\` (\`priority\`),
        CONSTRAINT \`appointments_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`appointments_ibfk_2\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`appointments_ibfk_3\` FOREIGN KEY (\`assigned_staff\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Notifications table
    await connection.execute(`
      CREATE TABLE \`notifications\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`type\` varchar(50) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`message\` text NOT NULL,
        \`data\` json DEFAULT NULL,
        \`is_read\` tinyint(1) DEFAULT '0',
        \`read_at\` timestamp NULL DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`user_id\` (\`user_id\`),
        KEY \`type\` (\`type\`),
        KEY \`is_read\` (\`is_read\`),
        KEY \`created_at\` (\`created_at\`),
        CONSTRAINT \`notifications_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Repairs table
    await connection.execute(`
      CREATE TABLE \`repairs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`appointment_id\` int NOT NULL,
        \`vehicle_id\` int NOT NULL,
        \`technician_id\` int DEFAULT NULL,
        \`title\` varchar(255) NOT NULL,
        \`description\` text,
        \`diagnosis\` text,
        \`work_performed\` text,
        \`status\` enum('pending','in_progress','completed','cancelled') DEFAULT 'pending',
        \`priority\` enum('low','normal','high','urgent') DEFAULT 'normal',
        \`started_at\` timestamp NULL DEFAULT NULL,
        \`completed_at\` timestamp NULL DEFAULT NULL,
        \`estimated_hours\` decimal(4,2) DEFAULT NULL,
        \`actual_hours\` decimal(4,2) DEFAULT NULL,
        \`labor_cost\` decimal(10,2) DEFAULT '0.00',
        \`parts_cost\` decimal(10,2) DEFAULT '0.00',
        \`total_cost\` decimal(10,2) DEFAULT '0.00',
        \`warranty_months\` int DEFAULT '3',
        \`quality_rating\` int DEFAULT NULL,
        \`customer_notes\` text,
        \`internal_notes\` text,
        \`before_images\` json DEFAULT NULL,
        \`after_images\` json DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`appointment_id\` (\`appointment_id\`),
        KEY \`vehicle_id\` (\`vehicle_id\`),
        KEY \`technician_id\` (\`technician_id\`),
        KEY \`status\` (\`status\`),
        KEY \`priority\` (\`priority\`),
        CONSTRAINT \`repairs_ibfk_1\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repairs_ibfk_2\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repairs_ibfk_3\` FOREIGN KEY (\`technician_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Repair services table
    await connection.execute(`
      CREATE TABLE \`repair_services\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`repair_id\` int NOT NULL,
        \`service_id\` int NOT NULL,
        \`quantity\` int DEFAULT '1',
        \`unit_price\` decimal(10,2) NOT NULL,
        \`total_price\` decimal(10,2) NOT NULL,
        \`notes\` text,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`repair_id\` (\`repair_id\`),
        KEY \`service_id\` (\`service_id\`),
        CONSTRAINT \`repair_services_ibfk_1\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repair_services_ibfk_2\` FOREIGN KEY (\`service_id\`) REFERENCES \`services\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Repair parts table
    await connection.execute(`
      CREATE TABLE \`repair_parts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`repair_id\` int NOT NULL,
        \`part_id\` int NOT NULL,
        \`quantity\` int NOT NULL,
        \`unit_price\` decimal(10,2) NOT NULL,
        \`total_price\` decimal(10,2) NOT NULL,
        \`notes\` text,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`repair_id\` (\`repair_id\`),
        KEY \`part_id\` (\`part_id\`),
        CONSTRAINT \`repair_parts_ibfk_1\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repair_parts_ibfk_2\` FOREIGN KEY (\`part_id\`) REFERENCES \`parts\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Invoices table
    await connection.execute(`
      CREATE TABLE \`invoices\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_number\` varchar(50) NOT NULL,
        \`appointment_id\` int DEFAULT NULL,
        \`repair_id\` int DEFAULT NULL,
        \`customer_id\` int NOT NULL,
        \`vehicle_id\` int DEFAULT NULL,
        \`issue_date\` date NOT NULL,
        \`due_date\` date DEFAULT NULL,
        \`subtotal\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`tax_rate\` decimal(5,2) DEFAULT '10.00',
        \`tax_amount\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`discount_amount\` decimal(10,2) DEFAULT '0.00',
        \`total_amount\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`paid_amount\` decimal(10,2) DEFAULT '0.00',
        \`balance\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`status\` enum('draft','sent','paid','overdue','cancelled') DEFAULT 'draft',
        \`payment_method\` enum('cash','card','bank_transfer','other') DEFAULT NULL,
        \`payment_date\` timestamp NULL DEFAULT NULL,
        \`notes\` text,
        \`terms\` text,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`invoice_number\` (\`invoice_number\`),
        KEY \`appointment_id\` (\`appointment_id\`),
        KEY \`repair_id\` (\`repair_id\`),
        KEY \`customer_id\` (\`customer_id\`),
        KEY \`vehicle_id\` (\`vehicle_id\`),
        KEY \`created_by\` (\`created_by\`),
        KEY \`status\` (\`status\`),
        KEY \`issue_date\` (\`issue_date\`),
        CONSTRAINT \`invoices_ibfk_1\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`invoices_ibfk_2\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`invoices_ibfk_3\` FOREIGN KEY (\`customer_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`invoices_ibfk_4\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`invoices_ibfk_5\` FOREIGN KEY (\`created_by\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Invoice services table
    await connection.execute(`
      CREATE TABLE \`invoice_services\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_id\` int NOT NULL,
        \`service_id\` int NOT NULL,
        \`description\` varchar(255) DEFAULT NULL,
        \`quantity\` int DEFAULT '1',
        \`unit_price\` decimal(10,2) NOT NULL,
        \`total_price\` decimal(10,2) NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`invoice_id\` (\`invoice_id\`),
        KEY \`service_id\` (\`service_id\`),
        CONSTRAINT \`invoice_services_ibfk_1\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`invoice_services_ibfk_2\` FOREIGN KEY (\`service_id\`) REFERENCES \`services\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Invoice parts table
    await connection.execute(`
      CREATE TABLE \`invoice_parts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_id\` int NOT NULL,
        \`part_id\` int NOT NULL,
        \`description\` varchar(255) DEFAULT NULL,
        \`quantity\` int NOT NULL,
        \`unit_price\` decimal(10,2) NOT NULL,
        \`total_price\` decimal(10,2) NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`invoice_id\` (\`invoice_id\`),
        KEY \`part_id\` (\`part_id\`),
        CONSTRAINT \`invoice_parts_ibfk_1\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`invoice_parts_ibfk_2\` FOREIGN KEY (\`part_id\`) REFERENCES \`parts\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ All tables created successfully');

    // Insert sample data
    console.log('🔄 Inserting sample data...');

    // Insert users
    await connection.execute(`
      INSERT INTO \`users\` (\`id\`, \`name\`, \`email\`, \`phone\`, \`password\`, \`role\`, \`address\`, \`avatar\`, \`email_verified\`, \`phone_verified\`, \`is_active\`, \`last_login\`, \`push_token\`, \`device_type\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'Admin User', 'admin@carrepair.com', '0901234567', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7.i.rG15F2', 'admin', '123 Admin Street, Ho Chi Minh City', NULL, 1, 1, 1, '2024-01-15 10:30:00', NULL, NULL, '2024-01-01 00:00:00', '2024-01-15 10:30:00'),
      (2, 'Staff Member', 'staff@carrepair.com', '0901234568', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7.i.rG15F2', 'staff', '456 Staff Road, Ho Chi Minh City', NULL, 1, 1, 1, '2024-01-15 09:00:00', NULL, NULL, '2024-01-01 00:00:00', '2024-01-15 09:00:00'),
      (3, 'Nguyễn Văn An', 'user1@gmail.com', '0901234569', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7.i.rG15F2', 'customer', '789 Customer Lane, Ho Chi Minh City', NULL, 1, 1, 1, '2024-01-14 15:20:00', NULL, NULL, '2024-01-10 00:00:00', '2024-01-14 15:20:00'),
      (4, 'Trần Thị Bình', 'user2@gmail.com', '0901234570', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7.i.rG15F2', 'customer', '321 User Street, Ho Chi Minh City', NULL, 1, 1, 1, NULL, NULL, NULL, '2024-01-12 00:00:00', '2024-01-12 00:00:00')
    `);

    // Insert services
    await connection.execute(`
      INSERT INTO \`services\` (\`id\`, \`name\`, \`description\`, \`price\`, \`duration\`, \`category\`, \`image\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'Thay dầu động cơ', 'Thay dầu động cơ và lọc dầu cho xe', 300000.00, 60, 'Bảo dưỡng định kỳ', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (2, 'Kiểm tra phanh', 'Kiểm tra và bảo dưỡng hệ thống phanh', 500000.00, 90, 'An toàn', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (3, 'Thay lốp xe', 'Thay thế lốp xe mới', 800000.00, 45, 'Lốp xe', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (4, 'Kiểm tra động cơ', 'Chẩn đoán và kiểm tra động cơ', 400000.00, 120, 'Chẩn đoán', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (5, 'Bảo dưỡng điều hòa', 'Vệ sinh và bảo dưỡng hệ thống điều hòa', 350000.00, 75, 'Điều hòa', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00')
    `);

    // Insert parts
    await connection.execute(`
      INSERT INTO \`parts\` (\`id\`, \`name\`, \`part_number\`, \`description\`, \`price\`, \`cost\`, \`quantity\`, \`min_quantity\`, \`category\`, \`brand\`, \`supplier\`, \`location\`, \`image\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'Dầu động cơ 5W-30', 'OIL-5W30-4L', 'Dầu động cơ tổng hợp 4 lít', 250000.00, 200000.00, 50, 10, 'Dầu nhớt', 'Shell', 'Shell Vietnam', 'A-1-01', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (2, 'Lọc dầu', 'FILTER-OIL-001', 'Lọc dầu động cơ tiêu chuẩn', 80000.00, 60000.00, 100, 20, 'Lọc', 'Bosch', 'Bosch Vietnam', 'B-2-05', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (3, 'Má phanh trước', 'BRAKE-PAD-F01', 'Má phanh trước cho xe sedan', 450000.00, 350000.00, 30, 5, 'Phanh', 'Brembo', 'ABC Auto Parts', 'C-3-02', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (4, 'Lốp xe 185/65R15', 'TIRE-185-65-15', 'Lốp xe cỡ 185/65R15', 1200000.00, 1000000.00, 20, 4, 'Lốp xe', 'Michelin', 'Michelin Vietnam', 'D-4-01', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00'),
      (5, 'Dây curoa', 'BELT-001', 'Dây curoa máy phát điện', 150000.00, 120000.00, 25, 5, 'Dây curoa', 'Gates', 'Gates Vietnam', 'E-5-03', NULL, 1, '2024-01-01 00:00:00', '2024-01-01 00:00:00')
    `);

    // Insert vehicles
    await connection.execute(`
      INSERT INTO \`vehicles\` (\`id\`, \`user_id\`, \`make\`, \`model\`, \`year\`, \`color\`, \`license_plate\`, \`vin\`, \`engine_type\`, \`fuel_type\`, \`transmission\`, \`mileage\`, \`notes\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 3, 'Toyota', 'Vios', 2020, 'Trắng', '51A-12345', 'VIN1234567890', '1.5L DOHC', 'gasoline', 'automatic', 45000, 'Xe sử dụng gia đình', '2024-01-10 00:00:00', '2024-01-10 00:00:00'),
      (2, 4, 'Honda', 'City', 2019, 'Đen', '51B-67890', 'VIN0987654321', '1.5L SOHC', 'gasoline', 'manual', 60000, 'Xe công ty', '2024-01-12 00:00:00', '2024-01-12 00:00:00'),
      (3, 3, 'Mazda', 'CX-5', 2021, 'Đỏ', '51C-11111', 'VIN1111111111', '2.0L SKYACTIV', 'gasoline', 'automatic', 25000, 'SUV gia đình', '2024-01-10 00:00:00', '2024-01-10 00:00:00')
    `);

    // Insert appointments
    await connection.execute(`
      INSERT INTO \`appointments\` (\`id\`, \`user_id\`, \`vehicle_id\`, \`service_ids\`, \`appointment_date\`, \`estimated_duration\`, \`status\`, \`priority\`, \`description\`, \`notes\`, \`assigned_staff\`, \`estimated_cost\`, \`actual_cost\`, \`payment_status\`, \`confirmation_token\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 3, 1, '[1, 2]', '2024-01-20 09:00:00', 150, 'confirmed', 'normal', 'Thay dầu và kiểm tra phanh định kỳ', 'Khách hàng yêu cầu sử dụng dầu Shell', 2, 800000.00, NULL, 'pending', 'token123', '2024-01-15 08:00:00', '2024-01-15 10:00:00'),
      (2, 4, 2, '[3]', '2024-01-25 14:00:00', 45, 'pending', 'high', 'Thay lốp xe bị hỏng', 'Lốp trước bên phải bị thủng', NULL, 800000.00, NULL, 'pending', 'token456', '2024-01-16 15:30:00', '2024-01-16 15:30:00'),
      (3, 3, 3, '[4, 5]', '2024-01-18 10:30:00', 195, 'completed', 'normal', 'Kiểm tra động cơ và bảo dưỡng điều hòa', 'Xe có tiếng ồn bất thường', 2, 750000.00, 780000.00, 'paid', 'token789', '2024-01-14 09:15:00', '2024-01-18 16:00:00')
    `);

    // Insert notifications
    await connection.execute(`
      INSERT INTO \`notifications\` (\`id\`, \`user_id\`, \`type\`, \`title\`, \`message\`, \`data\`, \`is_read\`, \`read_at\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 3, 'appointment_confirmed', 'Lịch hẹn đã được xác nhận', 'Lịch hẹn của bạn vào ngày 20/01/2024 lúc 09:00 đã được xác nhận.', '{"appointment_id": 1, "date": "2024-01-20 09:00:00"}', 1, '2024-01-15 11:00:00', '2024-01-15 10:00:00', '2024-01-15 11:00:00'),
      (2, 4, 'appointment_pending', 'Lịch hẹn mới', 'Cảm ơn bạn đã đặt lịch. Chúng tôi sẽ xác nhận trong thời gian sớm nhất.', '{"appointment_id": 2, "date": "2024-01-25 14:00:00"}', 0, NULL, '2024-01-16 15:30:00', '2024-01-16 15:30:00'),
      (3, 3, 'service_completed', 'Dịch vụ hoàn thành', 'Xe Mazda CX-5 của bạn đã được bảo dưỡng xong. Vui lòng đến nhận xe.', '{"appointment_id": 3, "total_cost": 780000}', 1, '2024-01-18 16:30:00', '2024-01-18 16:00:00', '2024-01-18 16:30:00'),
      (4, 2, 'new_appointment', 'Lịch hẹn mới', 'Có lịch hẹn mới từ khách hàng Trần Thị Bình vào ngày 25/01/2024.', '{"appointment_id": 2, "customer": "Trần Thị Bình"}', 0, NULL, '2024-01-16 15:30:00', '2024-01-16 15:30:00'),
      (5, 1, 'new_appointment', 'Lịch hẹn mới', 'Có lịch hẹn mới từ khách hàng Trần Thị Bình vào ngày 25/01/2024.', '{"appointment_id": 2, "customer": "Trần Thị Bình"}', 0, NULL, '2024-01-16 15:30:00', '2024-01-16 15:30:00')
    `);

    // Insert repairs
    await connection.execute(`
      INSERT INTO \`repairs\` (\`id\`, \`appointment_id\`, \`vehicle_id\`, \`technician_id\`, \`title\`, \`description\`, \`diagnosis\`, \`work_performed\`, \`status\`, \`priority\`, \`started_at\`, \`completed_at\`, \`estimated_hours\`, \`actual_hours\`, \`labor_cost\`, \`parts_cost\`, \`total_cost\`, \`warranty_months\`, \`quality_rating\`, \`customer_notes\`, \`internal_notes\`, \`before_images\`, \`after_images\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 3, 3, 2, 'Bảo dưỡng định kỳ Mazda CX-5', 'Kiểm tra động cơ và bảo dưỡng điều hòa', 'Động cơ hoạt động bình thường, điều hòa cần vệ sinh', 'Đã thay dầu động cơ, vệ sinh hệ thống điều hòa, kiểm tra các bộ phận', 'completed', 'normal', '2024-01-18 10:30:00', '2024-01-18 15:30:00', 4.00, 4.50, 500000.00, 280000.00, 780000.00, 6, 5, 'Rất hài lòng với dịch vụ', 'Khách hàng thân thiết, ưu tiên chất lượng', NULL, NULL, '2024-01-18 10:30:00', '2024-01-18 15:30:00')
    `);

    // Insert repair services
    await connection.execute(`
      INSERT INTO \`repair_services\` (\`id\`, \`repair_id\`, \`service_id\`, \`quantity\`, \`unit_price\`, \`total_price\`, \`notes\`, \`created_at\`) VALUES
      (1, 1, 4, 1, 400000.00, 400000.00, 'Kiểm tra toàn diện động cơ', '2024-01-18 10:30:00'),
      (2, 1, 5, 1, 350000.00, 350000.00, 'Vệ sinh hệ thống điều hòa', '2024-01-18 10:30:00')
    `);

    // Insert repair parts
    await connection.execute(`
      INSERT INTO \`repair_parts\` (\`id\`, \`repair_id\`, \`part_id\`, \`quantity\`, \`unit_price\`, \`total_price\`, \`notes\`, \`created_at\`) VALUES
      (1, 1, 1, 1, 250000.00, 250000.00, 'Dầu động cơ Shell 5W-30', '2024-01-18 10:30:00'),
      (2, 1, 2, 1, 80000.00, 80000.00, 'Lọc dầu mới', '2024-01-18 10:30:00')
    `);

    // Insert invoices
    await connection.execute(`
      INSERT INTO \`invoices\` (\`id\`, \`invoice_number\`, \`appointment_id\`, \`repair_id\`, \`customer_id\`, \`vehicle_id\`, \`issue_date\`, \`due_date\`, \`subtotal\`, \`tax_rate\`, \`tax_amount\`, \`discount_amount\`, \`total_amount\`, \`paid_amount\`, \`balance\`, \`status\`, \`payment_method\`, \`payment_date\`, \`notes\`, \`terms\`, \`created_by\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'INV-2024-001', 3, 1, 3, 3, '2024-01-18', '2024-01-25', 750000.00, 10.00, 75000.00, 0.00, 780000.00, 780000.00, 0.00, 'paid', 'cash', '2024-01-18 16:00:00', 'Thanh toán đầy đủ bằng tiền mặt', 'Thanh toán trong vòng 7 ngày', 2, '2024-01-18 15:30:00', '2024-01-18 16:00:00')
    `);

    // Insert invoice services
    await connection.execute(`
      INSERT INTO \`invoice_services\` (\`id\`, \`invoice_id\`, \`service_id\`, \`description\`, \`quantity\`, \`unit_price\`, \`total_price\`, \`created_at\`) VALUES
      (1, 1, 4, 'Kiểm tra động cơ toàn diện', 1, 400000.00, 400000.00, '2024-01-18 15:30:00'),
      (2, 1, 5, 'Bảo dưỡng hệ thống điều hòa', 1, 350000.00, 350000.00, '2024-01-18 15:30:00')
    `);

    // Insert invoice parts
    await connection.execute(`
      INSERT INTO \`invoice_parts\` (\`id\`, \`invoice_id\`, \`part_id\`, \`description\`, \`quantity\`, \`unit_price\`, \`total_price\`, \`created_at\`) VALUES
      (1, 1, 1, 'Dầu động cơ Shell 5W-30 4L', 1, 250000.00, 250000.00, '2024-01-18 15:30:00'),
      (2, 1, 2, 'Lọc dầu động cơ', 1, 80000.00, 80000.00, '2024-01-18 15:30:00')
    `);

    console.log('✅ Sample data inserted successfully');
    console.log('🎉 Database initialization completed!');

    console.log(`
🚀 Database Summary:
- Database: ${DB_CONFIG.database}
- Tables: 12 tables created
- Sample Data: Inserted successfully
- Users: 4 users (1 admin, 1 staff, 2 customers)
- Services: 5 services
- Parts: 5 parts
- Vehicles: 3 vehicles
- Appointments: 3 appointments
- Notifications: 5 notifications
- And more...

✅ You can now start your backend server and connect to the database!
    `);

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
};

if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { initDatabase };
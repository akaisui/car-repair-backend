const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'car_repair_shop',
  multipleStatements: true,
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
      multipleStatements: true,
    });

    // Create database if it doesn't exist
    console.log(`🔄 Creating database '${DB_CONFIG.database}' if not exists...`);
    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await tempConnection.end();

    // Connect to the specific database
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database successfully');

    // Drop existing tables in correct order (respecting foreign key constraints)
    console.log('🔄 Dropping existing tables...');
    const dropTables = [
      // Drop dependent tables first
      'DROP TABLE IF EXISTS `invoice_parts`',
      'DROP TABLE IF EXISTS `invoice_services`',
      'DROP TABLE IF EXISTS `repair_parts`',
      'DROP TABLE IF EXISTS `repair_services`',
      'DROP TABLE IF EXISTS `reviews`',
      'DROP TABLE IF EXISTS `loyalty_transactions`',
      'DROP TABLE IF EXISTS `login_attempts`',
      'DROP TABLE IF EXISTS `password_reset_tokens`',
      'DROP TABLE IF EXISTS `refresh_tokens`',
      // Then drop main tables
      'DROP TABLE IF EXISTS `invoices`',
      'DROP TABLE IF EXISTS `repairs`',
      'DROP TABLE IF EXISTS `notifications`',
      'DROP TABLE IF EXISTS `appointments`',
      'DROP TABLE IF EXISTS `vehicles`',
      'DROP TABLE IF EXISTS `promotions`',
      'DROP TABLE IF EXISTS `parts`',
      'DROP TABLE IF EXISTS `services`',
      'DROP TABLE IF EXISTS `service_categories`',
      'DROP TABLE IF EXISTS `users`',
      'DROP TABLE IF EXISTS `migrations`',
      'DROP TABLE IF EXISTS `settings`',
    ];

    for (const dropQuery of dropTables) {
      await connection.execute(dropQuery);
    }

    console.log('✅ All old tables dropped successfully');

    // Create all tables based on SQL dump structure
    console.log('🔄 Creating all tables...');

    // 1. Users table
    await connection.execute(`
      CREATE TABLE \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`password\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`full_name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`phone\` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`customer_code\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`address\` text COLLATE utf8mb4_unicode_ci,
        \`date_of_birth\` date DEFAULT NULL,
        \`gender\` enum('male','female','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`loyalty_points\` int DEFAULT '0',
        \`total_spent\` decimal(15,2) DEFAULT '0.00',
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`role\` enum('admin','staff','customer') COLLATE utf8mb4_unicode_ci DEFAULT 'customer',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        \`push_token\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`device_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`email\` (\`email\`),
        UNIQUE KEY \`customer_code\` (\`customer_code\`),
        KEY \`idx_email\` (\`email\`),
        KEY \`idx_role\` (\`role\`),
        KEY \`idx_users_push_token\` (\`push_token\`),
        KEY \`idx_users_role_push_token\` (\`role\`,\`push_token\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 2. Service Categories table
    await connection.execute(`
      CREATE TABLE \`service_categories\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`slug\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`icon\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`sort_order\` int DEFAULT '0',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`slug\` (\`slug\`),
        KEY \`idx_slug\` (\`slug\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 3. Services table
    await connection.execute(`
      CREATE TABLE \`services\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`category_id\` int DEFAULT NULL,
        \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`slug\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`short_description\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`price\` decimal(10,2) DEFAULT NULL,
        \`min_price\` decimal(10,2) DEFAULT NULL,
        \`max_price\` decimal(10,2) DEFAULT NULL,
        \`duration_minutes\` int DEFAULT NULL,
        \`image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`is_featured\` tinyint(1) DEFAULT '0',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`slug\` (\`slug\`),
        KEY \`idx_category\` (\`category_id\`),
        KEY \`idx_slug\` (\`slug\`),
        KEY \`idx_featured\` (\`is_featured\`),
        CONSTRAINT \`services_ibfk_1\` FOREIGN KEY (\`category_id\`) REFERENCES \`service_categories\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 4. Parts table
    await connection.execute(`
      CREATE TABLE \`parts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`part_code\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`brand\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`unit\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`purchase_price\` decimal(10,2) DEFAULT NULL,
        \`selling_price\` decimal(10,2) DEFAULT NULL,
        \`quantity_in_stock\` int DEFAULT '0',
        \`min_stock_level\` int DEFAULT '5',
        \`max_stock_level\` int DEFAULT '100',
        \`location\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`image_url\` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`part_code\` (\`part_code\`),
        KEY \`idx_part_code\` (\`part_code\`),
        KEY \`idx_quantity\` (\`quantity_in_stock\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 5. Vehicles table
    await connection.execute(`
      CREATE TABLE \`vehicles\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int DEFAULT NULL,
        \`license_plate\` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`brand\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`model\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`year\` int DEFAULT NULL,
        \`color\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`engine_number\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`chassis_number\` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`mileage\` int DEFAULT NULL,
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`license_plate\` (\`license_plate\`),
        KEY \`idx_license_plate\` (\`license_plate\`),
        KEY \`idx_user\` (\`user_id\`),
        CONSTRAINT \`vehicles_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 6. Appointments table
    await connection.execute(`
      CREATE TABLE \`appointments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`appointment_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`user_id\` int DEFAULT NULL,
        \`vehicle_id\` int DEFAULT NULL,
        \`service_id\` int DEFAULT NULL,
        \`appointment_date\` date NOT NULL,
        \`appointment_time\` time NOT NULL,
        \`status\` enum('pending','confirmed','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`reminder_sent\` tinyint(1) DEFAULT '0',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`appointment_code\` (\`appointment_code\`),
        KEY \`vehicle_id\` (\`vehicle_id\`),
        KEY \`service_id\` (\`service_id\`),
        KEY \`idx_date\` (\`appointment_date\`),
        KEY \`idx_status\` (\`status\`),
        KEY \`idx_user\` (\`user_id\`),
        CONSTRAINT \`appointments_ibfk_2\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`appointments_ibfk_3\` FOREIGN KEY (\`service_id\`) REFERENCES \`services\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`appointments_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 7. Notifications table
    await connection.execute(`
      CREATE TABLE \`notifications\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int DEFAULT NULL,
        \`type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`title\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`message\` text COLLATE utf8mb4_unicode_ci,
        \`data\` json DEFAULT NULL,
        \`is_read\` tinyint(1) DEFAULT '0',
        \`read_at\` datetime DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_user\` (\`user_id\`),
        KEY \`idx_read\` (\`is_read\`),
        CONSTRAINT \`notifications_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 8. Repairs table
    await connection.execute(`
      CREATE TABLE \`repairs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`repair_code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`appointment_id\` int DEFAULT NULL,
        \`user_id\` int DEFAULT NULL,
        \`vehicle_id\` int DEFAULT NULL,
        \`mechanic_id\` int DEFAULT NULL,
        \`status\` enum('pending','diagnosing','waiting_parts','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
        \`diagnosis\` text COLLATE utf8mb4_unicode_ci,
        \`work_description\` text COLLATE utf8mb4_unicode_ci,
        \`start_date\` datetime DEFAULT NULL,
        \`completion_date\` datetime DEFAULT NULL,
        \`total_amount\` decimal(10,2) DEFAULT '0.00',
        \`parts_cost\` decimal(10,2) DEFAULT '0.00',
        \`labor_cost\` decimal(10,2) DEFAULT '0.00',
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`repair_code\` (\`repair_code\`),
        KEY \`appointment_id\` (\`appointment_id\`),
        KEY \`vehicle_id\` (\`vehicle_id\`),
        KEY \`mechanic_id\` (\`mechanic_id\`),
        KEY \`idx_repair_code\` (\`repair_code\`),
        KEY \`idx_status\` (\`status\`),
        KEY \`repairs_user_fk\` (\`user_id\`),
        CONSTRAINT \`repairs_ibfk_1\` FOREIGN KEY (\`appointment_id\`) REFERENCES \`appointments\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`repairs_ibfk_3\` FOREIGN KEY (\`vehicle_id\`) REFERENCES \`vehicles\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`repairs_ibfk_4\` FOREIGN KEY (\`mechanic_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`repairs_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 9. Repair Services table
    await connection.execute(`
      CREATE TABLE \`repair_services\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`repair_id\` int DEFAULT NULL,
        \`service_id\` int DEFAULT NULL,
        \`quantity\` int DEFAULT '1',
        \`unit_price\` decimal(10,2) DEFAULT NULL,
        \`total_price\` decimal(10,2) DEFAULT NULL,
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`service_id\` (\`service_id\`),
        KEY \`idx_repair\` (\`repair_id\`),
        CONSTRAINT \`repair_services_ibfk_1\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repair_services_ibfk_2\` FOREIGN KEY (\`service_id\`) REFERENCES \`services\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 10. Repair Parts table
    await connection.execute(`
      CREATE TABLE \`repair_parts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`repair_id\` int DEFAULT NULL,
        \`part_id\` int DEFAULT NULL,
        \`quantity\` int DEFAULT '1',
        \`unit_price\` decimal(10,2) DEFAULT NULL,
        \`total_price\` decimal(10,2) DEFAULT NULL,
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`part_id\` (\`part_id\`),
        KEY \`idx_repair\` (\`repair_id\`),
        CONSTRAINT \`repair_parts_ibfk_1\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`repair_parts_ibfk_2\` FOREIGN KEY (\`part_id\`) REFERENCES \`parts\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 11. Invoices table
    await connection.execute(`
      CREATE TABLE \`invoices\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_number\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`repair_id\` int DEFAULT NULL,
        \`user_id\` int DEFAULT NULL,
        \`subtotal\` decimal(10,2) DEFAULT '0.00',
        \`tax_rate\` decimal(5,2) DEFAULT '0.00',
        \`tax_amount\` decimal(10,2) DEFAULT '0.00',
        \`discount_amount\` decimal(10,2) DEFAULT '0.00',
        \`total_amount\` decimal(10,2) DEFAULT '0.00',
        \`payment_status\` enum('pending','partial','paid','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
        \`payment_method\` enum('cash','card','transfer','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`payment_date\` datetime DEFAULT NULL,
        \`due_date\` date DEFAULT NULL,
        \`notes\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`invoice_number\` (\`invoice_number\`),
        KEY \`repair_id\` (\`repair_id\`),
        KEY \`idx_invoice_number\` (\`invoice_number\`),
        KEY \`idx_payment_status\` (\`payment_status\`),
        KEY \`idx_user\` (\`user_id\`),
        CONSTRAINT \`invoices_ibfk_1\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`invoices_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 12. Reviews table
    await connection.execute(`
      CREATE TABLE \`reviews\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int DEFAULT NULL,
        \`repair_id\` int DEFAULT NULL,
        \`rating\` int DEFAULT NULL,
        \`title\` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`comment\` text COLLATE utf8mb4_unicode_ci,
        \`images\` json DEFAULT NULL,
        \`is_verified\` tinyint(1) DEFAULT '0',
        \`is_visible\` tinyint(1) DEFAULT '1',
        \`admin_response\` text COLLATE utf8mb4_unicode_ci,
        \`admin_response_date\` datetime DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`repair_id\` (\`repair_id\`),
        KEY \`idx_rating\` (\`rating\`),
        KEY \`reviews_user_fk\` (\`user_id\`),
        CONSTRAINT \`reviews_ibfk_2\` FOREIGN KEY (\`repair_id\`) REFERENCES \`repairs\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`reviews_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`reviews_chk_1\` CHECK (((\`rating\` >= 1) and (\`rating\` <= 5)))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 13. Promotions table
    await connection.execute(`
      CREATE TABLE \`promotions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`code\` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`discount_type\` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci DEFAULT 'percentage',
        \`discount_value\` decimal(10,2) DEFAULT NULL,
        \`min_purchase_amount\` decimal(10,2) DEFAULT '0.00',
        \`max_discount_amount\` decimal(10,2) DEFAULT NULL,
        \`usage_limit\` int DEFAULT NULL,
        \`used_count\` int DEFAULT '0',
        \`start_date\` date DEFAULT NULL,
        \`end_date\` date DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`code\` (\`code\`),
        KEY \`idx_code\` (\`code\`),
        KEY \`idx_dates\` (\`start_date\`,\`end_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 14. Loyalty Transactions table
    await connection.execute(`
      CREATE TABLE \`loyalty_transactions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int DEFAULT NULL,
        \`transaction_type\` enum('earned','redeemed','expired','adjusted') COLLATE utf8mb4_unicode_ci NOT NULL,
        \`points\` int NOT NULL,
        \`balance_after\` int NOT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`reference_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`reference_id\` int DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_type\` (\`transaction_type\`),
        KEY \`loyalty_transactions_user_fk\` (\`user_id\`),
        CONSTRAINT \`loyalty_transactions_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 15. Login Attempts table
    await connection.execute(`
      CREATE TABLE \`login_attempts\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`ip_address\` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`user_agent\` text COLLATE utf8mb4_unicode_ci,
        \`success\` tinyint(1) DEFAULT '0',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_email\` (\`email\`),
        KEY \`idx_ip_address\` (\`ip_address\`),
        KEY \`idx_created_at\` (\`created_at\`),
        KEY \`idx_success\` (\`success\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 16. Password Reset Tokens table
    await connection.execute(`
      CREATE TABLE \`password_reset_tokens\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`token\` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`expires_at\` datetime NOT NULL,
        \`is_used\` tinyint(1) DEFAULT '0',
        \`used_at\` datetime DEFAULT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_token\` (\`token\`(255)),
        KEY \`idx_user_id\` (\`user_id\`),
        KEY \`idx_expires\` (\`expires_at\`),
        CONSTRAINT \`password_reset_tokens_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 17. Refresh Tokens table
    await connection.execute(`
      CREATE TABLE \`refresh_tokens\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`token\` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`expires_at\` datetime NOT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_token\` (\`token\`(255)),
        KEY \`idx_user_id\` (\`user_id\`),
        KEY \`idx_expires\` (\`expires_at\`),
        KEY \`idx_active\` (\`is_active\`),
        CONSTRAINT \`refresh_tokens_ibfk_1\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 18. Migrations table
    await connection.execute(`
      CREATE TABLE \`migrations\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`executed_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`name\` (\`name\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 19. Settings table
    await connection.execute(`
      CREATE TABLE \`settings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`setting_key\` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
        \`setting_value\` text COLLATE utf8mb4_unicode_ci,
        \`setting_type\` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
        \`description\` text COLLATE utf8mb4_unicode_ci,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`setting_key\` (\`setting_key\`),
        KEY \`idx_key\` (\`setting_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ All 19 tables created successfully');

    // Insert sample data matching the SQL dump
    console.log('🔄 Inserting sample data...');

    // Insert users (with hashed passwords from dump)
    await connection.execute(`
      INSERT INTO \`users\` (\`id\`, \`email\`, \`password\`, \`full_name\`, \`phone\`, \`customer_code\`, \`address\`, \`date_of_birth\`, \`gender\`, \`loyalty_points\`, \`total_spent\`, \`notes\`, \`role\`, \`is_active\`, \`created_at\`, \`updated_at\`, \`push_token\`, \`device_type\`) VALUES
      (2, 'staff1@carrepair.com', '$2b$10$ok.qpI4qj8jmbllRtJSRY.QJP1aQ8D2g84hoxpoMJyP5vx7x.v1BS', 'Nguyễn Văn Thợ', '0901234568', NULL, NULL, NULL, NULL, 0, 0.00, NULL, 'staff', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58', NULL, NULL),
      (3, 'staff2@carrepair.com', '$2b$10$ok.qpI4qj8jmbllRtJSRY.QJP1aQ8D2g84hoxpoMJyP5vx7x.v1BS', 'Trần Văn Sửa', '0901234569', NULL, NULL, NULL, NULL, 0, 0.00, NULL, 'staff', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58', NULL, NULL),
      (9, 'momota19102003@gmail.com', '$2b$10$FI2xhZAjaT9PkEJCI73AuOmqWxmNXeSfArLsQHDiqz8zLkShA5eu.', 'Nguyen Hoang Kha', '0365907475', 'KH864138701', NULL, NULL, NULL, 0, 0.00, NULL, 'customer', 1, '2025-09-16 00:46:56', '2025-09-16 00:47:44', NULL, NULL),
      (10, 'admin@suaxehonghau.com', '$2b$10$LxbSk4VJkATmwXofbhMHCupwc5OZIPVC1NFz80HOMUk0Oe.AIgsWm', 'Quan Ly Sua Xe Hong Hau', '0338037868', 'ADMIN001', NULL, NULL, NULL, 0, 0.00, NULL, 'admin', 1, '2025-09-16 08:40:53', '2025-09-16 08:44:42', NULL, NULL)
    `);

    // Insert service categories
    await connection.execute(`
      INSERT INTO \`service_categories\` (\`id\`, \`name\`, \`slug\`, \`description\`, \`icon\`, \`sort_order\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'Sửa chữa cơ bản', 'sua-chua-co-ban', 'Các dịch vụ sửa chữa và bảo dưỡng cơ bản', NULL, 1, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'Dịch vụ chuyên sâu', 'dich-vu-chuyen-sau', 'Sửa chữa chuyên sâu và đại tu', NULL, 2, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'Dịch vụ đặc biệt', 'dich-vu-dac-biet', 'Cứu hộ và dịch vụ đặc biệt', NULL, 3, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'Bảo dưỡng định kỳ', 'bao-duong-dinh-ky', 'Các gói bảo dưỡng định kỳ', NULL, 4, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // Insert services (sample from dump)
    await connection.execute(`
      INSERT INTO \`services\` (\`id\`, \`category_id\`, \`name\`, \`slug\`, \`description\`, \`short_description\`, \`price\`, \`min_price\`, \`max_price\`, \`duration_minutes\`, \`image_url\`, \`is_featured\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (2, 4, 'Kiểm tra thắng trước/sau', 'kiem-tra-thang-truoc-sau', 'Kiểm tra thắng trước/sau - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra thắng trước/sau', 50000.00, NULL, NULL, 30, 'kiem-tra-thang-truoc-sau.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:06:15'),
      (3, 4, 'Thay nhớt máy', 'thay-nhot-may', 'Thay nhớt máy - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Thay nhớt máy', 120000.00, NULL, NULL, 30, 'thay-nhot-may.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:07:46'),
      (4, 4, 'Thay nhớt số', 'thay-nhot-so', 'Thay nhớt số - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Thay nhớt số', 80000.00, NULL, NULL, 30, 'thay-nhot-so.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:08:42'),
      (8, 4, 'Thay bộ ly hợp', 'thay-bo-ly-hop', 'Thay bộ ly hợp - dịch vụ chất lượng', 'Thay bộ ly hợp', 1500000.00, NULL, NULL, 180, NULL, 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:08:42')
    `);

    // Insert parts (sample from dump)
    await connection.execute(`
      INSERT INTO \`parts\` (\`id\`, \`part_code\`, \`name\`, \`description\`, \`brand\`, \`unit\`, \`purchase_price\`, \`selling_price\`, \`quantity_in_stock\`, \`min_stock_level\`, \`max_stock_level\`, \`location\`, \`image_url\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'PT001', 'Nhớt Castrol Power 1 10W-40', 'Nhớt động cơ cao cấp cho xe máy', 'Castrol', 'Lít', 120000.00, 180000.00, 50, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'PT002', 'Lốp Michelin City Grip', 'Lốp xe máy chống trượt', 'Michelin', 'Cái', 800000.00, 1200000.00, 20, 5, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'PT003', 'Ắc quy GS 12V-5Ah', 'Ắc quy khô cho xe máy', 'GS', 'Cái', 350000.00, 500000.00, 15, 3, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'PT004', 'Má phanh trước', 'Má phanh chính hãng', 'Honda', 'Bộ', 80000.00, 150000.00, 30, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (5, 'PT005', 'Má phanh sau', 'Má phanh chính hãng', 'Honda', 'Bộ', 60000.00, 120000.00, 30, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // Insert vehicles
    await connection.execute(`
      INSERT INTO \`vehicles\` (\`id\`, \`user_id\`, \`license_plate\`, \`brand\`, \`model\`, \`year\`, \`color\`, \`engine_number\`, \`chassis_number\`, \`mileage\`, \`notes\`, \`created_at\`, \`updated_at\`) VALUES
      (11, 9, 'TEST', 'Test', 'Test', 2222, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-18 03:08:07', '2025-09-18 03:08:07'),
      (6, 9, '59A-12345', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-15 21:50:38', '2025-09-18 02:56:57'),
      (7, 9, '59A-12344', 'Honda', 'Wave', 2020, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-16 00:00:43', '2025-09-16 00:59:03')
    `);

    // Insert appointments
    await connection.execute(`
      INSERT INTO \`appointments\` (\`id\`, \`appointment_code\`, \`user_id\`, \`vehicle_id\`, \`service_id\`, \`appointment_date\`, \`appointment_time\`, \`status\`, \`notes\`, \`reminder_sent\`, \`created_at\`, \`updated_at\`) VALUES
      (15, 'LH250918208', 9, 11, 8, '2025-09-20', '10:00:00', 'confirmed', 'Test', 0, '2025-09-18 03:43:56', '2025-09-18 03:44:29')
    `);

    // Insert repairs
    await connection.execute(`
      INSERT INTO \`repairs\` (\`id\`, \`repair_code\`, \`appointment_id\`, \`user_id\`, \`vehicle_id\`, \`mechanic_id\`, \`status\`, \`diagnosis\`, \`work_description\`, \`start_date\`, \`completion_date\`, \`total_amount\`, \`parts_cost\`, \`labor_cost\`, \`notes\`, \`created_at\`, \`updated_at\`) VALUES
      (8, 'R25090001', 15, 9, 11, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Auto-created from confirmed appointment #LH250918208', '2025-09-18 10:44:29', '2025-09-18 10:44:29')
    `);

    // Insert notifications
    await connection.execute(`
      INSERT INTO \`notifications\` (\`id\`, \`user_id\`, \`type\`, \`title\`, \`message\`, \`data\`, \`is_read\`, \`read_at\`, \`created_at\`) VALUES
      (17, 10, 'new_appointment', '📅 Lịch hẹn mới', 'Khách hàng Nguyen Hoang Kha đã đặt lịch hẹn mới cho dịch vụ Thay bộ ly hợp', '{"appointment_id":15,"appointment_code":"LH250918208","customer_name":"Nguyen Hoang Kha","customer_phone":"0365907475","service_name":"Thay bộ ly hợp","appointment_date":"2025-09-20","appointment_time":"10:00","vehicle_plate":"Test"}', 1, '2025-09-18 17:44:22', '2025-09-18 10:43:56'),
      (20, 9, 'appointment_confirmed', '✅ Lịch hẹn đã được xác nhận', 'Lịch hẹn #LH250918208 của bạn đã được xác nhận. Phiếu sửa chữa #R25090001 đã được tạo.', '{"action_url": "/dashboard/repairs", "repair_code": "R25090001", "appointment_code": "LH250918208"}', 1, '2025-09-18 17:49:08', '2025-09-18 10:44:29')
    `);

    // Insert promotions
    await connection.execute(`
      INSERT INTO \`promotions\` (\`id\`, \`code\`, \`name\`, \`description\`, \`discount_type\`, \`discount_value\`, \`min_purchase_amount\`, \`max_discount_amount\`, \`usage_limit\`, \`used_count\`, \`start_date\`, \`end_date\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'WELCOME10', 'Giảm 10% cho khách mới', 'Áp dụng cho khách hàng lần đầu sử dụng dịch vụ', 'percentage', 10.00, 200000.00, NULL, 100, 0, '2025-09-14', '2025-10-14', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'SUMMER2024', 'Khuyến mãi mùa hè', 'Giảm 15% cho tất cả dịch vụ bảo dưỡng', 'percentage', 15.00, 500000.00, NULL, 50, 0, '2025-09-14', '2025-11-13', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'LOYALTY100K', 'Ưu đãi khách thân thiết', 'Giảm 100.000đ cho hóa đơn từ 1 triệu', 'fixed', 100000.00, 1000000.00, NULL, 200, 0, '2025-09-14', '2025-12-13', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // Insert settings
    await connection.execute(`
      INSERT INTO \`settings\` (\`id\`, \`setting_key\`, \`setting_value\`, \`setting_type\`, \`description\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'shop_name', 'Tiệm Sửa Xe Máy Pro', 'text', 'Tên tiệm', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'shop_address', '123 Đường Nguyễn Văn Linh, Quận 7, TP.HCM', 'text', 'Địa chỉ tiệm', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'shop_phone', '0901234567', 'text', 'Số điện thoại', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'shop_email', 'contact@carrepair.com', 'email', 'Email liên hệ', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (5, 'working_hours', '{"mon-fri": "8:00-18:00", "sat": "8:00-17:00", "sun": "closed"}', 'json', 'Giờ làm việc', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (6, 'loyalty_points_rate', '0.01', 'number', 'Tỷ lệ tích điểm (1% của hóa đơn)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (7, 'tax_rate', '10', 'number', 'Thuế VAT (%)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (8, 'booking_time_slot', '30', 'number', 'Khoảng thời gian mỗi slot booking (phút)', '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // Insert migrations record
    await connection.execute(`
      INSERT INTO \`migrations\` (\`id\`, \`name\`, \`executed_at\`) VALUES
      (2, '001_create_tables', '2025-09-14 14:47:58')
    `);

    console.log('✅ Sample data inserted successfully');

    console.log(`
🎉 Database initialization completed successfully!

📊 Database Summary:
- Database: ${DB_CONFIG.database}
- Total Tables: 19 tables created
- Sample Data: Inserted successfully (matching SQL dump structure)

📋 Tables Created:
1. users (4 users: 1 admin, 2 staff, 1 customer)
2. service_categories (4 categories)
3. services (4 services)
4. parts (5 parts)
5. vehicles (3 vehicles)
6. appointments (1 appointment)
7. notifications (2 notifications)
8. repairs (1 repair)
9. repair_services
10. repair_parts
11. invoices
12. reviews
13. promotions (3 promotions)
14. loyalty_transactions
15. login_attempts
16. password_reset_tokens
17. refresh_tokens
18. migrations (1 record)
19. settings (8 system settings)

👤 Default Users:
- admin@suaxehonghau.com (Admin) - Quan Ly Sua Xe Hong Hau
- staff1@carrepair.com (Staff) - Nguyen Van Tho
- staff2@carrepair.com (Staff) - Tran Van Sua  
- momota19102003@gmail.com (Customer) - Nguyen Hoang Kha

✅ Database structure now matches the SQL dump exactly!
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

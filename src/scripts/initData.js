const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'car_repair_shop_test',
  multipleStatements: true,
};

const initDatabase = async () => {
  let connection;

  try {
    console.log('📄 Connecting to MySQL server...');

    // Connect without database first to create it if needed
    const tempConnection = await mysql.createConnection({
      host: DB_CONFIG.host,
      user: DB_CONFIG.user,
      password: DB_CONFIG.password,
      multipleStatements: true,
    });

    // Create database if it doesn't exist
    console.log(`📄 Creating database '${DB_CONFIG.database}' if not exists...`);
    await tempConnection.execute(
      `CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await tempConnection.end();

    // Connect to the specific database
    connection = await mysql.createConnection(DB_CONFIG);
    console.log('✅ Connected to database successfully');

    // Clear existing data in correct order (respecting foreign key constraints)
    console.log('📄 Clearing existing data from ALL tables...');
    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

    // Clear all 19 tables from the SQL dump
    const clearTables = [
      // Dependent tables first (to avoid FK constraint issues)
      'DELETE FROM `repair_parts`',
      'DELETE FROM `repair_services`',
      'DELETE FROM `reviews`',
      'DELETE FROM `loyalty_transactions`',
      'DELETE FROM `login_attempts`',
      'DELETE FROM `password_reset_tokens`',
      'DELETE FROM `refresh_tokens`',
      // Main tables
      'DELETE FROM `invoices`',
      'DELETE FROM `repairs`',
      'DELETE FROM `notifications`',
      'DELETE FROM `appointments`',
      'DELETE FROM `vehicles`',
      'DELETE FROM `promotions`',
      'DELETE FROM `parts`',
      'DELETE FROM `services`',
      'DELETE FROM `service_categories`',
      'DELETE FROM `users`',
      'DELETE FROM `migrations`',
      'DELETE FROM `settings`',
    ];

    for (const clearQuery of clearTables) {
      try {
        await connection.execute(clearQuery);
        console.log(`✅ Cleared: ${clearQuery.split(' ')[2]}`);
      } catch (error) {
        console.log(
          `⚠️  Table ${clearQuery.split(' ')[2]} might not exist or already empty: ${error.message}`
        );
      }
    }

    await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log('✅ All existing data cleared from all 19 tables successfully');

    // Create all tables based on SQL dump structure
    console.log('Tables already exist, proceeding with data insertion...');

    // Insert sample data matching the SQL dump
    console.log('📄 Inserting complete data from SQL dump...');

    // 1. Insert users (with hashed passwords from dump)
    await connection.execute(`
      INSERT INTO \`users\` (\`id\`, \`email\`, \`password\`, \`full_name\`, \`phone\`, \`customer_code\`, \`address\`, \`date_of_birth\`, \`gender\`, \`loyalty_points\`, \`total_spent\`, \`notes\`, \`role\`, \`is_active\`, \`created_at\`, \`updated_at\`, \`push_token\`, \`device_type\`) VALUES
      (2, 'staff1@carrepair.com', '$2b$10$ok.qpI4qj8jmbllRtJSRY.QJP1aQ8D2g84hoxpoMJyP5vx7x.v1BS', 'Nguyễn Văn Thợ', '0901234568', NULL, NULL, NULL, NULL, 0, 0.00, NULL, 'staff', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58', NULL, NULL),
      (3, 'staff2@carrepair.com', '$2b$10$ok.qpI4qj8jmbllRtJSRY.QJP1aQ8D2g84hoxpoMJyP5vx7x.v1BS', 'Trần Văn Sửa', '0901234569', NULL, NULL, NULL, NULL, 0, 0.00, NULL, 'staff', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58', NULL, NULL),
      (9, 'momota19102003@gmail.com', '$2b$10$FI2xhZAjaT9PkEJCI73AuOmqWxmNXeSfArLsQHDiqz8zLkShA5eu.', 'Nguyen Hoang Kha', '0365907475', 'KH864138701', NULL, NULL, NULL, 0, 0.00, NULL, 'customer', 1, '2025-09-16 00:46:56', '2025-09-16 00:47:44', NULL, NULL),
      (10, 'admin@suaxehonghau.com', '$2b$10$LxbSk4VJkATmwXofbhMHCupwc5OZIPVC1NFz80HOMUk0Oe.AIgsWm', 'Quan Ly Sua Xe Hong Hau', '0338037868', 'ADMIN001', NULL, NULL, NULL, 0, 0.00, NULL, 'admin', 1, '2025-09-16 08:40:53', '2025-09-16 08:44:42', NULL, NULL)
    `);

    // 2. Insert service categories
    await connection.execute(`
      INSERT INTO \`service_categories\` (\`id\`, \`name\`, \`slug\`, \`description\`, \`icon\`, \`sort_order\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'Sửa chữa cơ bản', 'sua-chua-co-ban', 'Các dịch vụ sửa chữa và bảo dưỡng cơ bản', NULL, 1, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'Dịch vụ chuyên sâu', 'dich-vu-chuyen-sau', 'Sửa chữa chuyên sâu và đại tu', NULL, 2, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'Dịch vụ đặc biệt', 'dich-vu-dac-biet', 'Cứu hộ và dịch vụ đặc biệt', NULL, 3, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'Bảo dưỡng định kỳ', 'bao-duong-dinh-ky', 'Các gói bảo dưỡng định kỳ', NULL, 4, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // 3. Insert ALL services from dump
    await connection.execute(`
      INSERT INTO \`services\` (\`id\`, \`category_id\`, \`name\`, \`slug\`, \`description\`, \`short_description\`, \`price\`, \`min_price\`, \`max_price\`, \`duration_minutes\`, \`image_url\`, \`is_featured\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (2, 4, 'Kiểm tra thắng trước/sau', 'kiem-tra-thang-truoc-sau', 'Kiểm tra thắng trước/sau - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra thắng trước/sau', 50000.00, NULL, NULL, 30, 'kiem-tra-thang-truoc-sau.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:06:15'),
      (3, 4, 'Thay nhớt máy', 'thay-nhot-may', 'Thay nhớt máy - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Thay nhớt máy', 120000.00, NULL, NULL, 30, 'thay-nhot-may.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:07:46'),
      (4, 4, 'Thay nhớt số', 'thay-nhot-so', 'Thay nhớt số - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Thay nhớt số', 80000.00, NULL, NULL, 30, 'thay-nhot-so.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:08:42'),
      (5, 4, 'Kiểm tra nước làm mát', 'kiem-tra-nuoc-lam-mat', 'Kiểm tra nước làm mát - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra nước làm mát', 40000.00, NULL, NULL, 30, 'kiem-tra-nuoc-lam-mat.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:09:50'),
      (6, 4, 'Vệ sinh hộp ga', 've-sinh-hong-ga', 'Vệ sinh hộp ga - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vệ sinh hộp ga', 70000.00, NULL, NULL, 30, 've-sinh-hong-ga.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:13:47'),
      (7, 4, 'Vệ sinh kim phun', 've-sinh-kim-phun', 'Vệ sinh kim phun - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vệ sinh kim phun', 150000.00, NULL, NULL, 30, 've-sinh-kim-phun.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:15:04'),
      (8, 4, 'Thay bộ ly hợp', 'thay-bo-ly-hop', 'Thay bộ ly hợp - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Thay bộ ly hợp', 1500000.00, NULL, NULL, 180, 'thay-bo-ly-hop.png', 1, 1, '2025-09-14 14:47:58', '2025-09-18 11:15:04'),
      (9, 4, 'Vệ sinh nồi', 've-sinh-noi', 'Vệ sinh nồi - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vệ sinh nồi', 200000.00, NULL, NULL, 30, 've-sinh-noi.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:16:48'),
      (10, 4, 'Vô dầu dây ga', 'vo-dau-day-ga', 'Vô dầu dây ga - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vô dầu dây ga', 25000.00, NULL, NULL, 30, 'vo-dau-day-ga.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:17:44'),
      (11, 4, 'Vô dầu dây thắng', 'vo-dau-day-thang', 'Vô dầu dây thắng - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vô dầu dây thắng', 25000.00, NULL, NULL, 30, 'vo-dau-day-thang.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:18:33'),
      (12, 4, 'Vô mỡ bò chén cổ', 'vo-mo-bo-chen-co', 'Vô mỡ bò chén cổ - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Vô mỡ bò chén cổ', 40000.00, NULL, NULL, 30, 'vo-mo-bo-chen-co.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:19:55'),
      (13, 4, 'Kiểm tra bạc đạn', 'kiem-tra-bac-dan', 'Kiểm tra bạc đạn - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra bạc đạn', 60000.00, NULL, NULL, 30, 'kiem-tra-bac-dan.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:20:47'),
      (14, 4, 'Kiểm tra phuộc', 'kiem-tra-phuoc', 'Kiểm tra phuộc - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra phuộc', 80000.00, NULL, NULL, 30, 'kiem-tra-phuoc.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:21:40'),
      (15, 4, 'Kiểm tra báo xăng', 'kiem-tra-bao-xang', 'Kiểm tra báo xăng - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra báo xăng', 45000.00, NULL, NULL, 30, 'kiem-tra-bao-xang.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:22:28'),
      (16, 4, 'Kiểm tra dây công-tơ-mét', 'kiem-tra-day-cong-to-met', 'Kiểm tra dây công-tơ-mét - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra dây công-tơ-mét', 50000.00, NULL, NULL, 30, 'kiem-tra-day-cong-to-met.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:23:08'),
      (17, 4, 'Rửa xe toàn bộ', 'rua-xe-toan-bo', 'Rửa xe toàn bộ - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Rửa xe toàn bộ', 35000.00, NULL, NULL, 30, 'rua-xe-toan-bo.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:23:51'),
      (18, 4, 'Kiểm tra hệ thống điện', 'kiem-tra-he-thong-dien', 'Kiểm tra hệ thống điện - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra hệ thống điện', 90000.00, NULL, NULL, 30, 'kiem-tra-he-thong-dien.png', 0, 1, '2025-09-14 14:47:58', '2025-09-18 11:24:35'),
      (19, 4, 'Kiểm tra sườn xe', 'kiem-tra-suon-xe', 'Kiểm tra sườn xe - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra sườn xe', 70000.00, NULL, NULL, 30, 'kiem-tra-suon-xe.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:25:27'),
      (20, 4, 'Kiểm tra bánh xe', 'kiem-tra-banh-xe', 'Kiểm tra bánh xe - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra bánh xe', 55000.00, NULL, NULL, 30, 'kiem-tra-banh-xe.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:26:01'),
      (21, 4, 'Kiểm tra lốp', 'kiem-tra-lop', 'Kiểm tra lốp - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra lốp', 40000.00, NULL, NULL, 30, 'kiem-tra-lop.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:27:06'),
      (22, 4, 'Kiểm tra căm, niệng', 'kiem-tra-cam-nieng', 'Kiểm tra căm, niệng - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra căm, niệng', 65000.00, NULL, NULL, 30, 'kiem-tra-cam-nieng.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:27:43'),
      (23, 4, 'Kiểm tra nhông — sên — đĩa', 'kiem-tra-nhong-sen-dia', 'Kiểm tra nhông — sên — đĩa - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra nhông — sên — đĩa', 85000.00, NULL, NULL, 30, 'kiem-tra-nhong-sen-dia.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:28:25'),
      (24, 2, 'Kiểm tra tổng quát bảo dưỡng toàn diện', 'kiem-tra-tong-quat-bao-duong-toan-dien', 'Kiểm tra tổng quát bảo dưỡng toàn diện - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Kiểm tra tổng quát bảo dưỡng toàn diện', 250000.00, NULL, NULL, 120, 'kiem-tra-tong-quat-bao-duong-toan-dien.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:29:36'),
      (25, 2, 'Bảo dưỡng toàn diện trong 1—2 ngày', 'bao-duong-toan-dien-1-2', 'Bảo dưỡng toàn diện trong 1—2 ngày - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Bảo dưỡng toàn diện trong 1—2 ngày', 1500000.00, 800000.00, 1500000.00, 1440, 'bao-duong-toan-dien-1-2.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:30:27'),
      (26, 2, 'Đại tu theo yêu cầu', 'dai-tu-theo-yeu-cau', 'Đại tu theo yêu cầu - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Đại tu theo yêu cầu', 5000000.00, 1500000.00, 5000000.00, 2880, 'dai-tu-theo-yeu-cau.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:38:35'),
      (27, 3, 'Nhận xe tại nhà — sửa xe tại nhà', 'nhan-xe-tai-nha', 'Nhận xe tại nhà — sửa xe tại nhà - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Nhận xe tại nhà — sửa xe tại nhà', 500000.00, 100000.00, 500000.00, 180, 'nhan-xe-tai-nha.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:39:23'),
      (28, 3, 'Hỗ trợ khách hàng lỡ đường', 'ho-tro-khach-hang-lo-duong', 'Hỗ trợ khách hàng lỡ đường - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Hỗ trợ khách hàng lỡ đường', 150000.00, NULL, NULL, 60, 'ho-tro-khach-hang-lo-duong.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:40:14'),
      (29, 3, 'Giao — nhận xe tận nơi', 'giao-nhan-xe-tan-noi', 'Giao — nhận xe tận nơi - dịch vụ chất lượng, kiểm tra và bảo dưỡng đúng chuẩn', 'Giao — nhận xe tận nơi', 80000.00, NULL, NULL, 90, 'giao-nhan-xe-tan-noi.png', 0, 1, '2025-09-16 06:00:00', '2025-09-18 11:40:55')
    `);

    // 4. Insert ALL parts from dump
    await connection.execute(`
      INSERT INTO \`parts\` (\`id\`, \`part_code\`, \`name\`, \`description\`, \`brand\`, \`unit\`, \`purchase_price\`, \`selling_price\`, \`quantity_in_stock\`, \`min_stock_level\`, \`max_stock_level\`, \`location\`, \`image_url\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'PT001', 'Nhớt Castrol Power 1 10W-40', 'Nhớt động cơ cao cấp cho xe máy', 'Castrol', 'Lít', 120000.00, 180000.00, 50, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'PT002', 'Lốp Michelin City Grip', 'Lốp xe máy chống trượt', 'Michelin', 'Cái', 800000.00, 1200000.00, 20, 5, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'PT003', 'Ắc quy GS 12V-5Ah', 'Ắc quy khô cho xe máy', 'GS', 'Cái', 350000.00, 500000.00, 15, 3, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'PT004', 'Má phanh trước', 'Má phanh chính hãng', 'Honda', 'Bộ', 80000.00, 150000.00, 30, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (5, 'PT005', 'Má phanh sau', 'Má phanh chính hãng', 'Honda', 'Bộ', 60000.00, 120000.00, 30, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (6, 'PT006', 'Lọc gió', 'Lọc gió động cơ', 'K&N', 'Cái', 50000.00, 100000.00, 40, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (7, 'PT007', 'Bugi NGK', 'Bugi cao cấp', 'NGK', 'Cái', 30000.00, 60000.00, 100, 20, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (8, 'PT008', 'Dây curoa', 'Dây curoa truyền động', 'Gates', 'Cái', 150000.00, 250000.00, 25, 5, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (9, 'PT009', 'Nhông xích dĩa', 'Bộ nhông xích dĩa', 'DID', 'Bộ', 250000.00, 400000.00, 20, 5, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (10, 'PT010', 'Bóng đèn pha LED', 'Bóng đèn pha LED siêu sáng', 'Philips', 'Cái', 180000.00, 300000.00, 30, 10, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (11, 'PT011', 'Phuộc trước', 'Phuộc trước chính hãng', 'Yamaha', 'Cái', 800000.00, 1200000.00, 10, 3, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (12, 'PT012', 'Phuộc sau', 'Phuộc sau chính hãng', 'Yamaha', 'Cái', 600000.00, 900000.00, 10, 3, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (13, 'PT013', 'Gương chiếu hậu', 'Gương chiếu hậu chính hãng', 'Honda', 'Cái', 120000.00, 200000.00, 20, 5, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (14, 'PT014', 'Tay thắng', 'Tay thắng nhôm CNC', 'Rizoma', 'Bộ', 300000.00, 500000.00, 15, 3, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (15, 'PT015', 'Ốc titan', 'Bộ ốc titan siêu nhẹ', 'ProBolt', 'Bộ', 500000.00, 800000.00, 10, 2, 100, NULL, NULL, 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // 5. Insert ALL vehicles from dump
    await connection.execute(`
      INSERT INTO \`vehicles\` (\`id\`, \`user_id\`, \`license_plate\`, \`brand\`, \`model\`, \`year\`, \`color\`, \`engine_number\`, \`chassis_number\`, \`mileage\`, \`notes\`, \`created_at\`, \`updated_at\`) VALUES
      (4, NULL, '59A-13132', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-15 20:49:26', '2025-09-15 20:49:26'),
      (5, NULL, '59A-123', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-15 21:22:07', '2025-09-15 21:22:21'),
      (6, 9, '59A-12345', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-15 21:50:38', '2025-09-18 02:56:57'),
      (7, 9, '59A-12344', 'Honda', 'Wave', 2020, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-16 00:00:43', '2025-09-16 00:59:03'),
      (8, NULL, '59A-11111', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-16 00:45:57', '2025-09-16 00:45:57'),
      (9, 9, '59A-1111', 'Honda', 'Wave', 2025, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-16 00:47:44', '2025-09-16 00:47:44'),
      (10, 9, '59A-1234', 'Honda', 'Wave', 2022, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-16 00:53:58', '2025-09-16 00:53:58'),
      (11, 9, 'TEST', 'Test', 'Test', 2222, NULL, NULL, NULL, NULL, 'Created from booking form', '2025-09-18 03:08:07', '2025-09-18 03:08:07')
    `);

    // 6. Insert appointments
    await connection.execute(`
      INSERT INTO \`appointments\` (\`id\`, \`appointment_code\`, \`user_id\`, \`vehicle_id\`, \`service_id\`, \`appointment_date\`, \`appointment_time\`, \`status\`, \`notes\`, \`reminder_sent\`, \`created_at\`, \`updated_at\`) VALUES
      (15, 'LH250918208', 9, 11, 8, '2025-09-20', '10:00:00', 'confirmed', 'Test', 0, '2025-09-18 03:43:56', '2025-09-18 03:44:29')
    `);

    // 7. Insert repairs
    await connection.execute(`
      INSERT INTO \`repairs\` (\`id\`, \`repair_code\`, \`appointment_id\`, \`user_id\`, \`vehicle_id\`, \`mechanic_id\`, \`status\`, \`diagnosis\`, \`work_description\`, \`start_date\`, \`completion_date\`, \`total_amount\`, \`parts_cost\`, \`labor_cost\`, \`notes\`, \`created_at\`, \`updated_at\`) VALUES
      (8, 'R25090001', 15, 9, 11, NULL, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Auto-created from confirmed appointment #LH250918208', '2025-09-18 10:44:29', '2025-09-18 10:44:29')
    `);

    // 8. Insert ALL notifications from dump
    await connection.execute(`
      INSERT INTO \`notifications\` (\`id\`, \`user_id\`, \`type\`, \`title\`, \`message\`, \`data\`, \`is_read\`, \`read_at\`, \`created_at\`) VALUES
      (17, 10, 'new_appointment', '📅 Lịch hẹn mới', 'Khách hàng Nguyen Hoang Kha đã đặt lịch hẹn mới cho dịch vụ Thay bộ ly hợp', '{"appointment_id":15,"appointment_code":"LH250918208","customer_name":"Nguyen Hoang Kha","customer_phone":"0365907475","service_name":"Thay bộ ly hợp","appointment_date":"2025-09-20","appointment_time":"10:00","vehicle_plate":"Test"}', 1, '2025-09-18 17:44:22', '2025-09-18 10:43:56'),
      (18, 2, 'new_appointment', '📅 Lịch hẹn mới', 'Khách hàng Nguyen Hoang Kha đã đặt lịch hẹn mới cho dịch vụ Thay bộ ly hợp', '{"appointment_id":15,"appointment_code":"LH250918208","customer_name":"Nguyen Hoang Kha","customer_phone":"0365907475","service_name":"Thay bộ ly hợp","appointment_date":"2025-09-20","appointment_time":"10:00","vehicle_plate":"Test"}', 0, NULL, '2025-09-18 10:43:56'),
      (19, 3, 'new_appointment', '📅 Lịch hẹn mới', 'Khách hàng Nguyen Hoang Kha đã đặt lịch hẹn mới cho dịch vụ Thay bộ ly hợp', '{"appointment_id":15,"appointment_code":"LH250918208","customer_name":"Nguyen Hoang Kha","customer_phone":"0365907475","service_name":"Thay bộ ly hợp","appointment_date":"2025-09-20","appointment_time":"10:00","vehicle_plate":"Test"}', 0, NULL, '2025-09-18 10:43:56'),
      (20, 9, 'appointment_confirmed', '✅ Lịch hẹn đã được xác nhận', 'Lịch hẹn #LH250918208 của bạn đã được xác nhận. Phiếu sửa chữa #R25090001 đã được tạo.', '{"action_url": "/dashboard/repairs", "repair_code": "R25090001", "appointment_code": "LH250918208"}', 1, '2025-09-18 17:49:08', '2025-09-18 10:44:29')
    `);

    // 9. Insert ALL promotions from dump
    await connection.execute(`
      INSERT INTO \`promotions\` (\`id\`, \`code\`, \`name\`, \`description\`, \`discount_type\`, \`discount_value\`, \`min_purchase_amount\`, \`max_discount_amount\`, \`usage_limit\`, \`used_count\`, \`start_date\`, \`end_date\`, \`is_active\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'WELCOME10', 'Giảm 10% cho khách mới', 'Áp dụng cho khách hàng lần đầu sử dụng dịch vụ', 'percentage', 10.00, 200000.00, NULL, 100, 0, '2025-09-14', '2025-10-14', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'SUMMER2024', 'Khuyến mãi mùa hè', 'Giảm 15% cho tất cả dịch vụ bảo dưỡng', 'percentage', 15.00, 500000.00, NULL, 50, 0, '2025-09-14', '2025-11-13', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'LOYALTY100K', 'Ưu đãi khách thân thiết', 'Giảm 100.000đ cho hóa đơn từ 1 triệu', 'fixed', 100000.00, 1000000.00, NULL, 200, 0, '2025-09-14', '2025-12-13', 1, '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // 10. Insert ALL settings from dump
    await connection.execute(`
      INSERT INTO \`settings\` (\`id\`, \`setting_key\`, \`setting_value\`, \`setting_type\`, \`description\`, \`created_at\`, \`updated_at\`) VALUES
      (1, 'shop_name', 'Tiệm Sửa Xe Máy Pro', 'text', 'Tên tiệm', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (2, 'shop_address', '123 Đường Nguyễn Văn Linh, Quận 7, TP.HCM', 'text', 'Địa chỉ tiệm', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (3, 'shop_phone', '0901234567', 'text', 'Số điện thoại', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (4, 'shop_email', 'contact@carrepair.com', 'email', 'Email liên hệ', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (5, 'working_hours', '{"mon-fri": "8:00-18:00", "sat": "8:00-17:00", "sun": "closed"}', 'json', 'Giờ làm việc', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (6, 'loyalty_points_rate', '0.01', 'number', 'Tỷ lệ tích điểm (1% của hóa đơn)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (7, 'tax_rate', '10', 'number', 'Thuế VAT (%)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (8, 'booking_time_slot', '30', 'number', 'Khoảng thời gian mỗi slot booking (phút)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (9, 'max_bookings_per_slot', '3', 'number', 'Số lượng booking tối đa mỗi slot', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (10, 'reminder_hours_before', '24', 'number', 'Nhắc nhở trước giờ hẹn (giờ)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (11, 'cancellation_hours', '6', 'number', 'Thời gian tối thiểu để hủy lịch (giờ)', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (12, 'facebook_url', 'https://facebook.com/carrepairshop', 'url', 'Link Facebook', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (13, 'google_maps_api_key', 'YOUR_GOOGLE_MAPS_API_KEY', 'text', 'Google Maps API Key', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (14, 'sms_provider', 'twilio', 'text', 'SMS Provider', '2025-09-14 14:47:58', '2025-09-14 14:47:58'),
      (15, 'email_provider', 'smtp', 'text', 'Email Provider', '2025-09-14 14:47:58', '2025-09-14 14:47:58')
    `);

    // 11. Insert migrations record
    await connection.execute(`
      INSERT INTO \`migrations\` (\`id\`, \`name\`, \`executed_at\`) VALUES
      (2, '001_create_tables', '2025-09-14 14:47:58')
    `);

    // 12. Insert ALL refresh tokens from dump (sample - in production these would be generated)
    await connection.execute(`
      INSERT INTO \`refresh_tokens\` (\`id\`, \`user_id\`, \`token\`, \`expires_at\`, \`is_active\`, \`created_at\`) VALUES
      (30, 10, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEwLCJlbWFpbCI6ImFkbWluQHN1YXhlaG9uZ2hhdS5jb20iLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTc1ODE5MjIwOCwiZXhwIjoxNzYwNzg0MjA4LCJhdWQiOiJjYXItcmVwYWlyLWFwcCIsImlzcyI6ImNhci1yZXBhaXItYXBpIn0.umoaCl0QnOXzaRme6YU_ItQZDUUWVIY1OcBdUSvj_gs', '2025-10-18 10:43:28', 1, '2025-09-18 10:43:28'),
      (31, 9, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjksImVtYWlsIjoibW9tb3RhMTkxMDIwMDNAZ21haWwuY29tIiwidHlwZSI6InJlZnJlc2giLCJpYXQiOjE3NTgxOTIyMTksImV4cCI6MTc2MDc4NDIxOSwiYXVkIjoiY2FyLXJlcGFpci1hcHAiLCJpc3MiOiJjYXItcmVwYWlyLWFwaSJ9.9Ui_myP5IRBZQ1TwPWDgtHMTNYDbYoJ2-1-974cN4v0', '2025-10-18 10:43:39', 1, '2025-09-18 10:43:39')
    `);

    console.log('✅ All data inserted successfully from SQL dump');

    console.log(`
🎉 Database initialization completed successfully!

📊 Database Summary:
- Database: ${DB_CONFIG.database}
- Operation: Data refresh (DELETE + INSERT)
- Total Tables: 19 tables (structure preserved)
- Complete Data: Inserted all data matching SQL dump exactly

📋 Data Refreshed:
1. users (4 users: 1 admin, 2 staff, 1 customer)
   - admin@suaxehonghau.com (Admin) - Quan Ly Sua Xe Hong Hau
   - staff1@carrepair.com (Staff) - Nguyễn Văn Thợ
   - staff2@carrepair.com (Staff) - Trần Văn Sửa  
   - momota19102003@gmail.com (Customer) - Nguyen Hoang Kha

2. service_categories (4 categories)
   - Sửa chữa cơ bản
   - Dịch vụ chuyên sâu
   - Dịch vụ đặc biệt
   - Bảo dưỡng định kỳ

3. services (28 services)
   - Featured services: Kiểm tra thắng, Thay nhớt máy/số, Kiểm tra nước làm mát, Vệ sinh hộp ga, Vệ sinh kim phun
   - All maintenance and repair services from basic to advanced
   - Price range: 25,000 VND to 5,000,000 VND

4. parts (15 parts inventory)
   - Engine oils, tires, batteries, brake pads, filters, spark plugs
   - Brand names: Castrol, Michelin, GS, Honda, K&N, NGK, Gates, DID, Philips, Yamaha, Rizoma, ProBolt
   - Complete stock management data

5. vehicles (8 vehicles)
   - Various Honda Wave models and test vehicles
   - License plates: 59A-13132, 59A-123, 59A-12345, 59A-12344, 59A-11111, 59A-1111, 59A-1234, TEST

6. appointments (1 active appointment)
   - Appointment #LH250918208 for clutch replacement service
   - Customer: Nguyen Hoang Kha
   - Status: confirmed

7. repairs (1 repair order)
   - Repair #R25090001 linked to appointment
   - Status: pending

8. notifications (4 notifications)
   - New appointment notifications for staff
   - Appointment confirmation for customer

9. promotions (3 active promotions)
   - WELCOME10: 10% discount for new customers
   - SUMMER2024: 15% summer maintenance discount
   - LOYALTY100K: 100,000 VND off for loyal customers

10. settings (15 system settings)
    - Shop information and contact details
    - Business hours and operational parameters
    - Loyalty points and tax configuration

11. migrations (1 record)
    - Database structure creation record

12. refresh_tokens (2 active tokens)
    - JWT refresh tokens for admin and customer sessions

✅ Database data refreshed with complete SQL dump content!
⚠️  Note: This script preserves table structure and only refreshes data (DELETE + INSERT).
🔧 To run: node initDatabaseComplete.js
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

// Run the initialization
initDatabase().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

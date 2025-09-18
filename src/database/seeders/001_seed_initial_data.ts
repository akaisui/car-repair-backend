import { Pool } from 'mysql2/promise';
import bcrypt from 'bcryptjs';

export const seed = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    console.log('🌱 Starting database seeding...');

    // 1. Seed admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await connection.execute(`
      INSERT INTO users (email, password, full_name, phone, role) VALUES
      ('admin@carrepair.com', ?, 'Administrator', '0901234567', 'admin'),
      ('staff1@carrepair.com', ?, 'Nguyễn Văn Thợ', '0901234568', 'staff'),
      ('staff2@carrepair.com', ?, 'Trần Văn Sửa', '0901234569', 'staff'),
      ('customer1@gmail.com', ?, 'Lê Văn Khách', '0912345678', 'customer'),
      ('customer2@gmail.com', ?, 'Phạm Thị Hằng', '0923456789', 'customer')
      ON DUPLICATE KEY UPDATE id=id
    `, [hashedPassword, hashedPassword, hashedPassword, hashedPassword, hashedPassword]);

    // 2. Seed service categories
    await connection.execute(`
      INSERT INTO service_categories (name, slug, description, sort_order) VALUES
      ('Sửa chữa cơ bản', 'sua-chua-co-ban', 'Các dịch vụ sửa chữa và bảo dưỡng cơ bản', 1),
      ('Dịch vụ chuyên sâu', 'dich-vu-chuyen-sau', 'Sửa chữa chuyên sâu và đại tu', 2),
      ('Dịch vụ đặc biệt', 'dich-vu-dac-biet', 'Cứu hộ và dịch vụ đặc biệt', 3),
      ('Bảo dưỡng định kỳ', 'bao-duong-dinh-ky', 'Các gói bảo dưỡng định kỳ', 4)
      ON DUPLICATE KEY UPDATE id=id
    `);

    // 3. Seed services
    await connection.execute(`
      INSERT INTO services (category_id, name, slug, description, short_description, price, duration_minutes, is_featured) VALUES
      -- Sửa chữa cơ bản
      (1, 'Thay nhớt động cơ', 'thay-nhot-dong-co', 'Thay nhớt động cơ chính hãng, kiểm tra và vệ sinh lọc gió', 'Thay nhớt chất lượng cao', 120000, 30, true),
      (1, 'Thay lốp xe', 'thay-lop-xe', 'Thay lốp xe các loại, cân bằng động', 'Lốp chính hãng, đa dạng size', 250000, 45, true),
      (1, 'Sửa phanh', 'sua-phanh', 'Kiểm tra và sửa chữa hệ thống phanh', 'Đảm bảo an toàn khi vận hành', 180000, 60, false),
      (1, 'Vá lốp', 'va-lop', 'Vá lốp bị thủng, kiểm tra áp suất', 'Vá nhanh, bền chắc', 30000, 20, false),
      (1, 'Sạc ắc quy', 'sac-ac-quy', 'Sạc và kiểm tra ắc quy', 'Khôi phục ắc quy nhanh chóng', 50000, 30, false),

      -- Dịch vụ chuyên sâu
      (2, 'Đại tu động cơ', 'dai-tu-dong-co', 'Đại tu toàn bộ động cơ, thay thế linh kiện', 'Phục hồi động cơ như mới', 3500000, 480, true),
      (2, 'Sửa hộp số', 'sua-hop-so', 'Sửa chữa và thay thế hộp số', 'Khắc phục các lỗi hộp số', 2000000, 360, false),
      (2, 'Thay bộ ly hợp', 'thay-bo-ly-hop', 'Thay thế toàn bộ bộ ly hợp', 'Ly hợp mới, êm ái', 1500000, 240, false),
      (2, 'Sơn xe', 'son-xe', 'Sơn lại toàn bộ xe hoặc từng phần', 'Sơn đẹp như mới', 2500000, 720, false),
      (2, 'Độ xe', 'do-xe', 'Độ xe theo yêu cầu khách hàng', 'Nâng cấp hiệu suất', NULL, 480, false),

      -- Dịch vụ đặc biệt
      (3, 'Cứu hộ 24/7', 'cuu-ho-24-7', 'Dịch vụ cứu hộ xe máy khẩn cấp 24/7', 'Có mặt nhanh chóng', 200000, 60, true),
      (3, 'Sửa xe tại nhà', 'sua-xe-tai-nha', 'Đến tận nhà khách hàng để sửa xe', 'Tiện lợi, nhanh chóng', 150000, 90, false),
      (3, 'Rửa xe', 'rua-xe', 'Rửa xe sạch sẽ, đánh bóng', 'Xe sạch như mới', 50000, 30, false),
      (3, 'Kiểm tra xe trước khi mua', 'kiem-tra-xe', 'Kiểm tra toàn diện xe cũ trước khi mua', 'Đánh giá chính xác', 300000, 120, false),

      -- Bảo dưỡng định kỳ
      (4, 'Bảo dưỡng 1000km', 'bao-duong-1000km', 'Gói bảo dưỡng cho xe mới chạy 1000km', 'Bảo dưỡng cơ bản', 250000, 60, false),
      (4, 'Bảo dưỡng 5000km', 'bao-duong-5000km', 'Gói bảo dưỡng định kỳ 5000km', 'Bảo dưỡng toàn diện', 450000, 90, true),
      (4, 'Bảo dưỡng 10000km', 'bao-duong-10000km', 'Gói bảo dưỡng định kỳ 10000km', 'Kiểm tra chi tiết', 650000, 120, false),
      (4, 'Bảo dưỡng trước mùa mưa', 'bao-duong-mua-mua', 'Kiểm tra và bảo dưỡng xe trước mùa mưa', 'An toàn mùa mưa', 350000, 90, false)
      ON DUPLICATE KEY UPDATE id=id
    `);

    // 4. Seed parts (phụ tùng)
    await connection.execute(`
      INSERT INTO parts (part_code, name, description, brand, unit, purchase_price, selling_price, quantity_in_stock, min_stock_level) VALUES
      ('PT001', 'Nhớt Castrol Power 1 10W-40', 'Nhớt động cơ cao cấp cho xe máy', 'Castrol', 'Lít', 120000, 180000, 50, 10),
      ('PT002', 'Lốp Michelin City Grip', 'Lốp xe máy chống trượt', 'Michelin', 'Cái', 800000, 1200000, 20, 5),
      ('PT003', 'Ắc quy GS 12V-5Ah', 'Ắc quy khô cho xe máy', 'GS', 'Cái', 350000, 500000, 15, 3),
      ('PT004', 'Má phanh trước', 'Má phanh chính hãng', 'Honda', 'Bộ', 80000, 150000, 30, 10),
      ('PT005', 'Má phanh sau', 'Má phanh chính hãng', 'Honda', 'Bộ', 60000, 120000, 30, 10),
      ('PT006', 'Lọc gió', 'Lọc gió động cơ', 'K&N', 'Cái', 50000, 100000, 40, 10),
      ('PT007', 'Bugi NGK', 'Bugi cao cấp', 'NGK', 'Cái', 30000, 60000, 100, 20),
      ('PT008', 'Dây curoa', 'Dây curoa truyền động', 'Gates', 'Cái', 150000, 250000, 25, 5),
      ('PT009', 'Nhông xích dĩa', 'Bộ nhông xích dĩa', 'DID', 'Bộ', 250000, 400000, 20, 5),
      ('PT010', 'Bóng đèn pha LED', 'Bóng đèn pha LED siêu sáng', 'Philips', 'Cái', 180000, 300000, 30, 10),
      ('PT011', 'Phuộc trước', 'Phuộc trước chính hãng', 'Yamaha', 'Cái', 800000, 1200000, 10, 3),
      ('PT012', 'Phuộc sau', 'Phuộc sau chính hãng', 'Yamaha', 'Cái', 600000, 900000, 10, 3),
      ('PT013', 'Gương chiếu hậu', 'Gương chiếu hậu chính hãng', 'Honda', 'Cái', 120000, 200000, 20, 5),
      ('PT014', 'Tay thắng', 'Tay thắng nhôm CNC', 'Rizoma', 'Bộ', 300000, 500000, 15, 3),
      ('PT015', 'Ốc titan', 'Bộ ốc titan siêu nhẹ', 'ProBolt', 'Bộ', 500000, 800000, 10, 2)
      ON DUPLICATE KEY UPDATE id=id
    `);

    // 5. Seed customers
    const [userRows]: any = await connection.execute(
      `SELECT id FROM users WHERE email IN ('customer1@gmail.com', 'customer2@gmail.com')`
    );

    if (userRows.length >= 2) {
      await connection.execute(`
        INSERT INTO customers (user_id, customer_code, address, date_of_birth, gender, loyalty_points) VALUES
        (?, 'KH001', '123 Nguyễn Văn Linh, Q7, TP.HCM', '1990-05-15', 'male', 150),
        (?, 'KH002', '456 Lê Văn Việt, Q9, TP.HCM', '1985-10-20', 'female', 200)
        ON DUPLICATE KEY UPDATE id=id
      `, [userRows[0].id, userRows[1].id]);

      // 6. Seed vehicles
      const [customerRows]: any = await connection.execute(
        `SELECT id FROM customers WHERE customer_code IN ('KH001', 'KH002')`
      );

      if (customerRows.length >= 2) {
        await connection.execute(`
          INSERT INTO vehicles (customer_id, license_plate, brand, model, year, color, mileage) VALUES
          (?, '59A-12345', 'Honda', 'Air Blade 150', 2022, 'Đen', 5000),
          (?, '59B-67890', 'Yamaha', 'Exciter 155', 2021, 'Xanh dương', 8000),
          (?, '59C-11111', 'Honda', 'Wave Alpha 110', 2020, 'Trắng', 12000)
          ON DUPLICATE KEY UPDATE id=id
        `, [customerRows[0].id, customerRows[1].id, customerRows[0].id]);
      }
    }

    // 7. Seed promotions
    await connection.execute(`
      INSERT INTO promotions (code, name, description, discount_type, discount_value, min_purchase_amount, start_date, end_date, usage_limit) VALUES
      ('WELCOME10', 'Giảm 10% cho khách mới', 'Áp dụng cho khách hàng lần đầu sử dụng dịch vụ', 'percentage', 10, 200000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 100),
      ('SUMMER2024', 'Khuyến mãi mùa hè', 'Giảm 15% cho tất cả dịch vụ bảo dưỡng', 'percentage', 15, 500000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 60 DAY), 50),
      ('LOYALTY100K', 'Ưu đãi khách thân thiết', 'Giảm 100.000đ cho hóa đơn từ 1 triệu', 'fixed', 100000, 1000000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 90 DAY), 200)
      ON DUPLICATE KEY UPDATE id=id
    `);

    // 8. Seed settings
    await connection.execute(`
      INSERT INTO settings (setting_key, setting_value, setting_type, description) VALUES
      ('shop_name', 'Tiệm Sửa Xe Máy Pro', 'text', 'Tên tiệm'),
      ('shop_address', '123 Đường Nguyễn Văn Linh, Quận 7, TP.HCM', 'text', 'Địa chỉ tiệm'),
      ('shop_phone', '0901234567', 'text', 'Số điện thoại'),
      ('shop_email', 'contact@carrepair.com', 'email', 'Email liên hệ'),
      ('working_hours', '{"mon-fri": "8:00-18:00", "sat": "8:00-17:00", "sun": "closed"}', 'json', 'Giờ làm việc'),
      ('loyalty_points_rate', '0.01', 'number', 'Tỷ lệ tích điểm (1% của hóa đơn)'),
      ('tax_rate', '10', 'number', 'Thuế VAT (%)'),
      ('booking_time_slot', '30', 'number', 'Khoảng thời gian mỗi slot booking (phút)'),
      ('max_bookings_per_slot', '3', 'number', 'Số lượng booking tối đa mỗi slot'),
      ('reminder_hours_before', '24', 'number', 'Nhắc nhở trước giờ hẹn (giờ)'),
      ('cancellation_hours', '6', 'number', 'Thời gian tối thiểu để hủy lịch (giờ)'),
      ('facebook_url', 'https://facebook.com/carrepairshop', 'url', 'Link Facebook'),
      ('google_maps_api_key', 'YOUR_GOOGLE_MAPS_API_KEY', 'text', 'Google Maps API Key'),
      ('sms_provider', 'twilio', 'text', 'SMS Provider'),
      ('email_provider', 'smtp', 'text', 'Email Provider')
      ON DUPLICATE KEY UPDATE id=id
    `);

    console.log('✅ Database seeded successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    connection.release();
  }
};

export const unseed = async (pool: Pool): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    // Clear data in reverse order of foreign key dependencies
    await connection.execute('DELETE FROM settings');
    await connection.execute('DELETE FROM notifications');
    await connection.execute('DELETE FROM loyalty_transactions');
    await connection.execute('DELETE FROM promotions');
    await connection.execute('DELETE FROM reviews');
    await connection.execute('DELETE FROM invoices');
    await connection.execute('DELETE FROM repair_parts');
    await connection.execute('DELETE FROM repair_services');
    await connection.execute('DELETE FROM repairs');
    await connection.execute('DELETE FROM appointments');
    await connection.execute('DELETE FROM vehicles');
    await connection.execute('DELETE FROM parts');
    await connection.execute('DELETE FROM services');
    await connection.execute('DELETE FROM service_categories');
    await connection.execute('DELETE FROM customers');
    await connection.execute('DELETE FROM users');

    console.log('✅ Database unseeded successfully');
  } finally {
    connection.release();
  }
};
-- Migration: Merge customers table into users table
-- Date: 2025-09-16

-- Disable safe update mode temporarily
SET SQL_SAFE_UPDATES = 0;

-- Step 1: Add customer fields to users table
ALTER TABLE `users` ADD COLUMN `customer_code` varchar(50) DEFAULT NULL AFTER `phone`;
ALTER TABLE `users` ADD COLUMN `address` text DEFAULT NULL AFTER `customer_code`;
ALTER TABLE `users` ADD COLUMN `date_of_birth` date DEFAULT NULL AFTER `address`;
ALTER TABLE `users` ADD COLUMN `gender` enum('male','female','other') DEFAULT NULL AFTER `date_of_birth`;
ALTER TABLE `users` ADD COLUMN `loyalty_points` int DEFAULT '0' AFTER `gender`;
ALTER TABLE `users` ADD COLUMN `total_spent` decimal(15,2) DEFAULT '0.00' AFTER `loyalty_points`;
ALTER TABLE `users` ADD COLUMN `notes` text DEFAULT NULL AFTER `total_spent`;

-- Step 2: Add unique index for customer_code
ALTER TABLE `users` ADD UNIQUE KEY `customer_code` (`customer_code`);

-- Step 3: Migrate existing customer data to users table
-- (Note: This assumes customers table exists and has data)
UPDATE `users` u
JOIN `customers` c ON u.id = c.user_id
SET
    u.customer_code = c.customer_code,
    u.address = c.address,
    u.date_of_birth = c.date_of_birth,
    u.gender = c.gender,
    u.loyalty_points = c.loyalty_points,
    u.total_spent = c.total_spent,
    u.notes = c.notes
WHERE c.user_id IS NOT NULL;

-- Step 4: Update appointments table to use user_id instead of customer_id
-- First, drop the foreign key constraint
ALTER TABLE `appointments` DROP FOREIGN KEY `appointments_ibfk_1`;

-- Add new user_id column
ALTER TABLE `appointments` ADD COLUMN `user_id` int DEFAULT NULL AFTER `appointment_code`;

-- Migrate customer_id to user_id for existing appointments
UPDATE `appointments` a
JOIN `customers` c ON a.customer_id = c.id
SET a.user_id = c.user_id
WHERE c.user_id IS NOT NULL;

-- For guest customers (customer_id exists but user_id is null), keep customer_id for now
-- We'll handle these separately

-- Step 5: Add foreign key constraint for user_id
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Step 6: Add index for user_id
ALTER TABLE `appointments` ADD KEY `idx_user` (`user_id`);

-- Step 7: Update vehicles table to use user_id instead of customer_id
-- Drop foreign key constraint
ALTER TABLE `vehicles` DROP FOREIGN KEY `vehicles_ibfk_1`;

-- Add new user_id column
ALTER TABLE `vehicles` ADD COLUMN `user_id` int DEFAULT NULL AFTER `id`;

-- Migrate customer_id to user_id
UPDATE `vehicles` v
JOIN `customers` c ON v.customer_id = c.id
SET v.user_id = c.user_id
WHERE c.user_id IS NOT NULL;

-- Add foreign key constraint for user_id
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Add index for user_id
ALTER TABLE `vehicles` ADD KEY `idx_user` (`user_id`);

-- Step 8: Update invoices table to use user_id instead of customer_id
-- Drop foreign key constraint
ALTER TABLE `invoices` DROP FOREIGN KEY `invoices_ibfk_2`;

-- Add new user_id column
ALTER TABLE `invoices` ADD COLUMN `user_id` int DEFAULT NULL AFTER `repair_id`;

-- Migrate customer_id to user_id
UPDATE `invoices` i
JOIN `customers` c ON i.customer_id = c.id
SET i.user_id = c.user_id
WHERE c.user_id IS NOT NULL;

-- Add foreign key constraint for user_id
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- Add index for user_id
ALTER TABLE `invoices` ADD KEY `idx_user` (`user_id`);

-- Re-enable safe update mode
SET SQL_SAFE_UPDATES = 1;

-- Note: We're keeping the old customer_id columns for now in case we need to rollback
-- After confirming everything works, we can drop them with:
-- ALTER TABLE `appointments` DROP COLUMN `customer_id`;
-- ALTER TABLE `vehicles` DROP COLUMN `customer_id`;
-- ALTER TABLE `invoices` DROP COLUMN `customer_id`;
-- DROP TABLE `customers`;
-- Migration: Add push notification fields to users table
-- Date: 2024-09-18

ALTER TABLE users
ADD COLUMN push_token VARCHAR(255) NULL,
ADD COLUMN device_type VARCHAR(50) NULL,
ADD INDEX idx_users_push_token (push_token),
ADD INDEX idx_users_role_push_token (role, push_token);
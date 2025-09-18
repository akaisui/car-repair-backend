import dotenv from 'dotenv';
import { User } from '../models';
import pool from '../config/database';

// Load environment variables
dotenv.config();

interface CreateAdminOptions {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

/**
 * Create admin user
 */
async function createAdminUser(options: CreateAdminOptions): Promise<void> {
  try {
    console.log('🚀 Creating admin user...');

    // Check if admin user already exists
    const existingAdmin = await User.findByEmail(options.email);
    if (existingAdmin) {
      console.log('❌ Admin user with this email already exists');
      return;
    }

    // Create admin user
    const adminUser = await User.createUser({
      email: options.email,
      password: options.password,
      full_name: options.fullName,
      phone: options.phone,
      role: 'admin',
    });

    console.log('✅ Admin user created successfully:');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.full_name}`);
    console.log(`   Role: ${adminUser.role}`);
    console.log(`   ID: ${adminUser.id}`);
  } catch (error) {
    console.error('❌ Failed to create admin user:', error);
    throw error;
  }
}

/**
 * Interactive admin creation
 */
async function interactiveAdminCreation(): Promise<void> {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    console.log('🔧 Admin User Creation Setup');
    console.log('===============================\n');

    const email = await question('Enter admin email: ');
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email format');
    }

    const fullName = await question('Enter admin full name: ');
    if (!fullName || fullName.length < 2) {
      throw new Error('Full name is required (minimum 2 characters)');
    }

    const phone = await question('Enter admin phone (optional): ');

    // Hidden password input
    const password = await question('Enter admin password (minimum 6 characters): ');
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const confirmPassword = await question('Confirm admin password: ');
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    await createAdminUser({
      email,
      password,
      fullName,
      phone: phone || undefined,
    });
  } finally {
    rl.close();
  }
}

/**
 * Command line admin creation
 */
async function commandLineAdminCreation(): Promise<void> {
  const args = process.argv.slice(2);
  const options: any = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    options[key] = value;
  }

  if (!options.email || !options.password || !options.name) {
    console.log('Usage: npm run create-admin -- --email admin@example.com --password yourpassword --name "Admin Name" [--phone "123456789"]');
    console.log('\nOr run without arguments for interactive mode:');
    console.log('npm run create-admin');
    return;
  }

  await createAdminUser({
    email: options.email,
    password: options.password,
    fullName: options.name,
    phone: options.phone,
  });
}

/**
 * Create default admin if none exists
 */
async function createDefaultAdminIfNeeded(): Promise<void> {
  try {
    // Check if any admin user exists
    const admins = await User.findByRole('admin');
    if (admins.length > 0) {
      console.log('✅ Admin user already exists');
      return;
    }

    console.log('📝 No admin user found, creating default admin...');

    // Create default admin with environment variables
    const defaultEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@carrepair.com';
    const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123456';
    const defaultName = process.env.DEFAULT_ADMIN_NAME || 'System Administrator';

    await createAdminUser({
      email: defaultEmail,
      password: defaultPassword,
      fullName: defaultName,
    });

    console.log('\n⚠️  IMPORTANT SECURITY NOTICE:');
    console.log('   Default admin credentials have been created.');
    console.log('   Please change the password immediately after first login!');
  } catch (error) {
    console.error('❌ Failed to create default admin:', error);
  }
}

// Main execution
async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);

    if (args.length === 0) {
      // Interactive mode
      await interactiveAdminCreation();
    } else if (args[0] === '--default') {
      // Create default admin if none exists
      await createDefaultAdminIfNeeded();
    } else {
      // Command line mode
      await commandLineAdminCreation();
    }

    console.log('\n🎉 Admin creation process completed!');
  } catch (error) {
    console.error('\n💥 Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { createAdminUser, createDefaultAdminIfNeeded };
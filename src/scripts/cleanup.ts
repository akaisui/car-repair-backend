import dotenv from 'dotenv';
import pool from '../config/database';
import AuthService from '../services/AuthService';

// Load environment variables
dotenv.config();

/**
 * Authentication system cleanup tasks
 */
async function runCleanupTasks(): Promise<void> {
  try {
    console.log('🧹 Starting authentication system cleanup...');

    // Run auth service cleanup
    const cleanupResult = await AuthService.cleanup();

    console.log('📊 Cleanup Results:');
    console.log(`   - Expired tokens deleted: ${cleanupResult.tokensDeleted}`);
    console.log(`   - Old login attempts deleted: ${cleanupResult.attemptsDeleted}`);

    // Get auth statistics for reporting
    const stats = await AuthService.getAuthStats();
    console.log('\n📈 Current Authentication Statistics:');
    console.log(`   - Active sessions: ${stats.active_sessions || 0}`);
    console.log(`   - Valid tokens: ${stats.valid_tokens || 0}`);
    console.log(`   - Successful logins today: ${stats.successful_logins_today || 0}`);
    console.log(`   - Failed attempts (last hour): ${stats.failed_attempts_last_hour || 0}`);
    console.log(`   - Active reset tokens: ${stats.active_reset_tokens || 0}`);

    console.log('\n✅ Authentication cleanup completed successfully!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

/**
 * Additional database maintenance tasks
 */
async function runDatabaseMaintenance(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    console.log('\n🔧 Running database maintenance...');

    // Clean up orphaned records
    const [orphanedCustomers] = await connection.execute(`
      DELETE c FROM customers c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE u.id IS NULL AND c.user_id IS NOT NULL
    `);

    const [orphanedVehicles] = await connection.execute(`
      DELETE v FROM vehicles v
      LEFT JOIN customers c ON v.customer_id = c.id
      WHERE c.id IS NULL
    `);

    const [orphanedAppointments] = await connection.execute(`
      DELETE a FROM appointments a
      LEFT JOIN customers c ON a.customer_id = c.id
      WHERE c.id IS NULL AND a.customer_id IS NOT NULL
    `);

    console.log('🗑️ Orphaned records cleaned:');
    console.log(`   - Customers: ${(orphanedCustomers as any).affectedRows || 0}`);
    console.log(`   - Vehicles: ${(orphanedVehicles as any).affectedRows || 0}`);
    console.log(`   - Appointments: ${(orphanedAppointments as any).affectedRows || 0}`);

    // Update table statistics (MySQL specific)
    await connection.execute('ANALYZE TABLE users, customers, vehicles, appointments, refresh_tokens, password_reset_tokens, login_attempts');

    console.log('📊 Table statistics updated');

    console.log('✅ Database maintenance completed!');
  } finally {
    connection.release();
  }
}

/**
 * Security audit check
 */
async function runSecurityAudit(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    console.log('\n🔒 Running security audit...');

    // Check for inactive admin users
    const [inactiveAdmins] = await connection.execute(`
      SELECT COUNT(*) as count FROM users
      WHERE role = 'admin' AND is_active = false
    `);
    const inactiveAdminCount = (inactiveAdmins as any[])[0]?.count || 0;

    // Check for users with excessive failed login attempts
    const [suspiciousUsers] = await connection.execute(`
      SELECT email, COUNT(*) as failed_attempts
      FROM login_attempts
      WHERE success = false AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY email
      HAVING failed_attempts > 10
      ORDER BY failed_attempts DESC
      LIMIT 10
    `);

    // Check for long-lived active sessions (older than 30 days)
    const [oldSessions] = await connection.execute(`
      SELECT COUNT(*) as count FROM refresh_tokens
      WHERE is_active = true AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `);
    const oldSessionCount = (oldSessions as any[])[0]?.count || 0;

    // Check for unused password reset tokens older than 24 hours
    const [oldResetTokens] = await connection.execute(`
      SELECT COUNT(*) as count FROM password_reset_tokens
      WHERE is_used = false AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    const oldResetTokenCount = (oldResetTokens as any[])[0]?.count || 0;

    console.log('🔍 Security Audit Results:');
    console.log(`   - Inactive admin accounts: ${inactiveAdminCount}`);
    console.log(`   - Suspicious login patterns: ${(suspiciousUsers as any[]).length} users`);
    console.log(`   - Long-lived sessions (30+ days): ${oldSessionCount}`);
    console.log(`   - Old reset tokens (24+ hours): ${oldResetTokenCount}`);

    // Log suspicious users
    if ((suspiciousUsers as any[]).length > 0) {
      console.log('\n⚠️  Users with high failed login attempts:');
      (suspiciousUsers as any[]).forEach((user: any) => {
        console.log(`   - ${user.email}: ${user.failed_attempts} failed attempts`);
      });
    }

    // Warnings
    if (inactiveAdminCount > 0) {
      console.log('\n⚠️  Warning: Inactive admin accounts detected');
    }
    if (oldSessionCount > 10) {
      console.log('\n⚠️  Warning: Many long-lived sessions detected');
    }
    if ((suspiciousUsers as any[]).length > 5) {
      console.log('\n⚠️  Warning: Multiple suspicious login patterns detected');
    }

    console.log('\n✅ Security audit completed!');
  } finally {
    connection.release();
  }
}

/**
 * Main cleanup function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const tasks = new Set(args);

  try {
    if (tasks.size === 0 || tasks.has('all')) {
      // Run all tasks
      await runCleanupTasks();
      await runDatabaseMaintenance();
      await runSecurityAudit();
    } else {
      // Run specific tasks
      if (tasks.has('auth')) {
        await runCleanupTasks();
      }
      if (tasks.has('db')) {
        await runDatabaseMaintenance();
      }
      if (tasks.has('security')) {
        await runSecurityAudit();
      }
    }

    console.log('\n🎉 All cleanup tasks completed successfully!');
  } catch (error) {
    console.error('\n💥 Cleanup failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Show usage information
function showUsage(): void {
  console.log(`
Usage: npm run cleanup [tasks...]

Available tasks:
  all      - Run all cleanup tasks (default)
  auth     - Clean authentication tokens and attempts
  db       - Database maintenance (orphaned records, statistics)
  security - Security audit and reporting

Examples:
  npm run cleanup           # Run all tasks
  npm run cleanup auth      # Clean only auth data
  npm run cleanup db        # Database maintenance only
  npm run cleanup auth db   # Run auth and db tasks
`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  main();
}

export { runCleanupTasks, runDatabaseMaintenance, runSecurityAudit };
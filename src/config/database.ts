import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'car_repair_shop',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: '+00:00',
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: false,
  debug: process.env.DB_DEBUG === 'true'
};

const pool = mysql.createPool(dbConfig);

export async function testConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
}

export async function initializeDatabase(): Promise<void> {
  try {
    const connection = await pool.getConnection();

    // Create database if not exists
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'car_repair_shop'}
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );

    await connection.query(`USE ${process.env.DB_NAME || 'car_repair_shop'}`);

    console.log('✅ Database initialized');
    connection.release();
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export async function getPoolStats(): Promise<any> {
  try {
    return {
      connectionLimit: dbConfig.connectionLimit,
      acquiredConnections: (pool as any)._acquiredConnections?.length || 0,
      freeConnections: (pool as any)._freeConnections?.length || 0,
      pendingEnqueues: (pool as any)._connectionQueue?.length || 0,
      config: {
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        connectionLimit: dbConfig.connectionLimit
      }
    };
  } catch (error) {
    console.error('❌ Failed to get pool stats:', error);
    return null;
  }
}

export async function testConnectionPooling(): Promise<boolean> {
  try {
    console.log('🔍 Testing connection pooling...');

    const startTime = Date.now();
    const connections: any[] = [];
    const testQueries = [];

    // Test acquiring multiple connections
    for (let i = 0; i < 5; i++) {
      const connection = await pool.getConnection();
      connections.push(connection);

      // Run parallel queries to test pooling
      testQueries.push(connection.execute('SELECT 1 as test'));
    }

    // Wait for all queries to complete
    await Promise.all(testQueries);

    // Release all connections
    connections.forEach(conn => conn.release());

    const endTime = Date.now();
    console.log(`✅ Connection pooling test completed in ${endTime - startTime}ms`);

    // Get pool statistics
    const stats = await getPoolStats();
    if (stats) {
      console.log('📊 Pool Statistics:', stats);
    }

    return true;
  } catch (error) {
    console.error('❌ Connection pooling test failed:', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  try {
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (error) {
    console.error('❌ Error closing database pool:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️  Received SIGINT, closing database pool...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⚠️  Received SIGTERM, closing database pool...');
  await closePool();
  process.exit(0);
});

export default pool;
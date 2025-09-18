import pool from '../config/database';
import * as createTables from './migrations/001_create_tables';
import * as seedData from './seeders/001_seed_initial_data';

interface MigrationRecord {
  name: string;
  executed_at: Date;
}

class MigrationRunner {
  private pool = pool;

  async init(): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      // Create migrations tracking table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(255) UNIQUE NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } finally {
      connection.release();
    }
  }

  async getMigrations(): Promise<MigrationRecord[]> {
    const connection = await this.pool.getConnection();
    try {
      const [rows] = await connection.execute<any[]>(
        'SELECT name, executed_at FROM migrations ORDER BY id'
      );
      return rows;
    } finally {
      connection.release();
    }
  }

  async runMigration(name: string, upFunction: Function): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      // Check if migration already executed
      const [existing] = await connection.execute<any[]>(
        'SELECT id FROM migrations WHERE name = ?',
        [name]
      );

      if (existing.length > 0) {
        console.log(`⏭️  Migration '${name}' already executed, skipping...`);
        return;
      }

      console.log(`▶️  Running migration: ${name}`);
      await upFunction(this.pool);

      // Record migration
      await connection.execute('INSERT INTO migrations (name) VALUES (?)', [name]);

      console.log(`✅ Migration '${name}' completed`);
    } catch (error) {
      console.error(`❌ Migration '${name}' failed:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async rollbackMigration(name: string, downFunction: Function): Promise<void> {
    const connection = await this.pool.getConnection();
    try {
      console.log(`⏪ Rolling back migration: ${name}`);
      await downFunction(this.pool);

      // Remove migration record
      await connection.execute('DELETE FROM migrations WHERE name = ?', [name]);

      console.log(`✅ Rollback '${name}' completed`);
    } catch (error) {
      console.error(`❌ Rollback '${name}' failed:`, error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async runAllMigrations(): Promise<void> {
    await this.init();

    // Define migrations in order
    const migrations = [{ name: '001_create_tables', module: createTables }];

    for (const migration of migrations) {
      await this.runMigration(migration.name, migration.module.up);
    }
  }

  async rollbackAll(): Promise<void> {
    const migrations = await this.getMigrations();

    // Rollback in reverse order
    for (let i = migrations.length - 1; i >= 0; i--) {
      const migration = migrations[i];

      if (migration.name === '001_create_tables') {
        await this.rollbackMigration(migration.name, createTables.down);
      }
    }
  }

  async seed(): Promise<void> {
    console.log('🌱 Running seeders...');
    await seedData.seed(this.pool);
  }

  async unseed(): Promise<void> {
    console.log('🔥 Removing seed data...');
    await seedData.unseed(this.pool);
  }

  async reset(): Promise<void> {
    console.log('🔄 Resetting database...');
    await this.rollbackAll();
    await this.runAllMigrations();
    await this.seed();
  }
}

export default new MigrationRunner();

#!/usr/bin/env node
import dotenv from 'dotenv';
import migrationRunner from '../database/migrationRunner';

dotenv.config();

const command = process.argv[2];

async function main() {
  try {
    console.log('🚀 Database Migration Tool');
    console.log('========================\n');

    switch (command) {
      case 'up':
        console.log('📦 Running migrations...');
        await migrationRunner.runAllMigrations();
        console.log('\n✅ All migrations completed!');
        break;

      case 'down':
        console.log('⏪ Rolling back migrations...');
        await migrationRunner.rollbackAll();
        console.log('\n✅ Rollback completed!');
        break;

      case 'seed':
        console.log('🌱 Seeding database...');
        await migrationRunner.seed();
        console.log('\n✅ Seeding completed!');
        break;

      case 'unseed':
        console.log('🔥 Removing seed data...');
        await migrationRunner.unseed();
        console.log('\n✅ Data removed!');
        break;

      case 'reset':
        console.log('🔄 Resetting database...');
        await migrationRunner.reset();
        console.log('\n✅ Database reset completed!');
        break;

      case 'status':
        console.log('📊 Migration status:');
        const migrations = await migrationRunner.getMigrations();
        if (migrations.length === 0) {
          console.log('No migrations have been executed yet.');
        } else {
          migrations.forEach(m => {
            console.log(`  ✓ ${m.name} (executed at: ${m.executed_at})`);
          });
        }
        break;

      default:
        console.log('Available commands:');
        console.log('  npm run migrate:up     - Run all pending migrations');
        console.log('  npm run migrate:down   - Rollback all migrations');
        console.log('  npm run migrate:seed   - Seed the database');
        console.log('  npm run migrate:unseed - Remove seed data');
        console.log('  npm run migrate:reset  - Reset and reseed database');
        console.log('  npm run migrate:status - Show migration status');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
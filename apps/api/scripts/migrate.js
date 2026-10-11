import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getPool } from '../src/db/pool.js';

dotenv.config();

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../../../db/migrations');
const pool = getPool();
const connection = await pool.getConnection();

try {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();

  for (const fileName of migrationFiles) {
    const migration = await readFile(join(migrationsDirectory, fileName), 'utf8');
    const statements = migration.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log(`Applied ${fileName}`);
  }
} catch (error) {
  console.error('Database migration failed.', error);
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}

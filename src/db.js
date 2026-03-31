import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { config } from './config.js';

export const pool = new Pool({ connectionString: config.databaseUrl });

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function applySchema() {
  const schemaPath = path.join(config.rootDir, 'sql', 'schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);
}

export async function ensureDatabase() {
  await pool.query('SELECT 1');
  if (config.autoApplySchema) {
    await applySchema();
  }
}

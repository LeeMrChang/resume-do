import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import mysql from 'mysql2/promise';

// Process liveness comes from Docker; this checks browser installation and DB connectivity.
// A healthy container does not replace an actual PDF export acceptance test.
let connection;
try {
  if (!existsSync(chromium.executablePath())) throw new Error('Browser missing');
  connection = await mysql.createConnection({
    host: process.env.RESUME_DO_DB_HOST || 'resume-db',
    user: process.env.RESUME_DO_DB_USER || 'resume_do',
    password: process.env.RESUME_DO_DB_PASSWORD,
    database: process.env.RESUME_DO_DB_NAME || 'resume_do',
    connectTimeout: 3000,
  });
  await connection.query('SELECT 1');
} catch {
  console.error('PDF worker dependency check failed');
  process.exitCode = 1;
} finally {
  await connection?.end();
}

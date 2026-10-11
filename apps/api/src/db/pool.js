import mysql from 'mysql2/promise';

let pool;

export function getPool() {
  if (pool) {
    return pool;
  }

  if (!process.env.DB_USER || !process.env.DB_NAME) {
    throw new Error('Database is not configured. Set DB_USER and DB_NAME in the API environment.');
  }

  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  return pool;
}

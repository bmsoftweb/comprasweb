import mysql from 'mysql2/promise';

const dbConfig: mysql.PoolOptions = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'compras_pull',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  dateStrings: true,
  decimalNumbers: true,
};

export const pool = mysql.createPool(dbConfig);

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

export async function exec(sql: string, params: any[] = []): Promise<mysql.ResultSetHeader> {
  const [res] = await pool.query(sql, params);
  return res as mysql.ResultSetHeader;
}

/** Executa fn numa transação; desfaz tudo se lançar exceção */
export async function transacao<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function checkDbHealth() {
  const inicio = Date.now();
  try {
    const [rows] = await pool.query<any[]>('SELECT VERSION() AS version, DATABASE() AS db');
    return {
      connected: true,
      latencyMs: Date.now() - inicio,
      version: rows[0]?.version,
      database: rows[0]?.db,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - inicio,
      error: err.message || 'Falha de conexão com MySQL',
      database: dbConfig.database,
    };
  }
}

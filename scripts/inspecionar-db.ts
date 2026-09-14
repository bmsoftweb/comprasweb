import 'dotenv/config';
import mysql from 'mysql2/promise';

/** Lista tabelas, colunas, índices/FKs e contagem de registros do banco configurado no .env */
async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });
  const [tabelas] = await conn.query<any[]>(
    `SELECT TABLE_NAME, AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME`,
  );
  for (const t of tabelas) {
    const [[{ c }]] = await conn.query<any[]>(`SELECT COUNT(*) AS c FROM \`${t.TABLE_NAME}\``);
    const [cols] = await conn.query<any[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
      [t.TABLE_NAME],
    );
    const [keys] = await conn.query<any[]>(
      `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [t.TABLE_NAME],
    );
    const [fks] = await conn.query<any[]>(
      `SELECT CONSTRAINT_NAME, DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [t.TABLE_NAME],
    );
    console.log(`\n## ${t.TABLE_NAME} (${c} registros, AUTO_INCREMENT=${t.AUTO_INCREMENT})`);
    console.log('  ' + cols.map((x) => `${x.COLUMN_NAME}:${x.COLUMN_TYPE}`).join(', '));
    console.log('  keys: ' + keys.map((k) => `${k.CONSTRAINT_NAME}(${k.CONSTRAINT_TYPE})`).join(', '));
    if (fks.length) console.log('  fk rules: ' + fks.map((f) => `${f.CONSTRAINT_NAME}=${f.DELETE_RULE}`).join(', '));
  }
  const [v] = await conn.query<any[]>('SELECT VERSION() AS v, @@time_zone AS tz, @@system_time_zone AS stz, NOW() AS agora');
  console.log('\n', v[0], 'local:', new Date().toString());
  await conn.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

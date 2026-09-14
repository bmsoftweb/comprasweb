import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';

const PORT = Number(process.env.PORT) || 3002;

/** Entrada para execução local. Na Vercel quem serve as rotas é api/index.ts. */
async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Compras PULL rodando em http://localhost:${PORT}`);
    console.log(`MySQL: ${process.env.MYSQL_HOST || '127.0.0.1'} / ${process.env.MYSQL_DATABASE || 'compras_pull'}`);
    if (!process.env.SMTP_HOST) console.log('SMTP não configurado: os e-mails serão registrados como "simulado".');
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
  process.exit(1);
});

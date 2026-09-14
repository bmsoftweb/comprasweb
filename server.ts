import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { checkDbHealth } from './server/db';
import { createAuthRouter } from './server/auth';
import { createPedidosRouter } from './server/pedidos';
import { createLojaRouter, createArquivosRouter } from './server/loja';
import { createCadastrosRouter } from './server/cadastros';

const PORT = Number(process.env.PORT) || 3002;

async function startServer() {
  const app = express();
  // Anexos do pedido chegam em base64 no corpo JSON
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/db/status', async (_req: Request, res: Response) => {
    res.json(await checkDbHealth());
  });

  app.use('/api', createAuthRouter());
  app.use('/api', createPedidosRouter());
  app.use('/api', createLojaRouter());
  app.use('/api', createArquivosRouter());
  app.use('/api', createCadastrosRouter());
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

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

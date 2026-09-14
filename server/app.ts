import 'dotenv/config';
import express, { Request, Response } from 'express';
import { checkDbHealth } from './db.js';
import { createAuthRouter } from './auth.js';
import { createPedidosRouter } from './pedidos.js';
import { createLojaRouter, createArquivosRouter } from './loja.js';
import { createCadastrosRouter } from './cadastros.js';

/**
 * Monta o app Express com todas as rotas /api, sem listen e sem Vite:
 *   local     -> server.ts adiciona o Vite e dá listen numa porta
 *   produção  -> api/index.ts exporta este app como função serverless da Vercel
 */
export function createApp() {
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

  return app;
}

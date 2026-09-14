import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './db';

/**
 * Sessão por token assinado (HMAC-SHA256): payload.assinatura em base64url.
 * O usuário é recarregado do banco a cada requisição, então desativar um usuário
 * ou trocar seu tipo tem efeito imediato.
 */

const SEGREDO = process.env.SESSION_SECRET || 'compras-pull-dev-secret';
const VALIDADE_MS = 12 * 60 * 60 * 1000;

export interface UsuarioSessao {
  id: number;
  nome_completo: string;
  email: string;
  cpf: string;
  tipo: 'administrador' | 'loja';
  associado_id: number | null;
  associado_nome: string | null;
  classificacao_id: number | null;
  classificacao_nome: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioSessao;
    }
  }
}

function assinar(payload: object): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto.createHmac('sha256', SEGREDO).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

function verificar(token: string): { uid: number; exp: number } | null {
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac('sha256', SEGREDO).update(corpo).digest('base64url');
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    if (typeof dados.uid !== 'number' || Date.now() > dados.exp) return null;
    return dados;
  } catch {
    return null;
  }
}

async function carregarUsuario(id: number): Promise<UsuarioSessao | null> {
  const rows = await query<any>(
    `SELECT u.id, u.nome_completo, u.email, u.cpf, u.tipo, u.associado_id,
            a.nome AS associado_nome, a.classificacao_id, c.nome AS classificacao_nome
       FROM usuarios u
       LEFT JOIN associados a ON a.id = u.associado_id
       LEFT JOIN classificacoes c ON c.id = a.classificacao_id
      WHERE u.id = ? AND u.ativo = 1`,
    [id],
  );
  const u = rows[0];
  if (!u) return null;
  // Usuário de loja sem associado (ou com associado inativo) não tem o que acessar
  if (u.tipo === 'loja' && !u.associado_id) return null;
  return u;
}

export function tokenDoRequest(req: Request): string {
  const h = req.header('authorization') || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return String(req.query.token || '');
}

export async function autenticar(req: Request, res: Response, next: NextFunction) {
  try {
    const dados = verificar(tokenDoRequest(req));
    if (!dados) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    const usuario = await carregarUsuario(dados.uid);
    if (!usuario) return res.status(401).json({ error: 'Usuário inativo ou sem acesso. Entre novamente.' });
    req.usuario = usuario;
    next();
  } catch (err: any) {
    res.status(503).json({ error: err.message });
  }
}

export function somenteAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.usuario?.tipo !== 'administrador') {
    return res.status(403).json({ error: 'Acesso restrito ao administrador da Central.' });
  }
  next();
}

export function somenteLoja(req: Request, res: Response, next: NextFunction) {
  if (req.usuario?.tipo !== 'loja') {
    return res.status(403).json({ error: 'Acesso restrito aos usuários de loja.' });
  }
  next();
}

export function createAuthRouter() {
  const router = Router();

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
      if (!email || !senha) return res.status(400).json({ error: 'Informe e-mail e senha.' });

      const rows = await query<any>('SELECT id, senha_hash, ativo FROM usuarios WHERE LOWER(email) = ? LIMIT 1', [email]);
      const u = rows[0];
      if (!u || !u.senha_hash || !bcrypt.compareSync(senha, u.senha_hash)) {
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      if (!u.ativo) return res.status(401).json({ error: 'Este usuário está inativo.' });

      const usuario = await carregarUsuario(u.id);
      if (!usuario) {
        return res.status(401).json({ error: 'Usuário de loja sem associado vinculado. Procure a Central.' });
      }
      const token = assinar({ uid: u.id, exp: Date.now() + VALIDADE_MS });
      res.json({ token, usuario });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/auth/me', autenticar, (req: Request, res: Response) => {
    res.json({ usuario: req.usuario });
  });

  return router;
}

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from './db.js';
import { enviarEmail, emailValido } from './email.js';

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

// Chaves distintas por finalidade: um link de redefinição de senha nunca serve como sessão
const CHAVE_SESSAO = SEGREDO;
const CHAVE_REDEFINICAO = `${SEGREDO}:redefinicao-senha`;
const VALIDADE_REDEFINICAO_MS = 60 * 60 * 1000;

function assinar(payload: object, chave = CHAVE_SESSAO): string {
  const corpo = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = crypto.createHmac('sha256', chave).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

function verificar(token: string, chave = CHAVE_SESSAO): { uid: number; exp: number; [k: string]: any } | null {
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;
  const esperada = crypto.createHmac('sha256', chave).update(corpo).digest('base64url');
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

const LINK_INVALIDO = 'Este link de redefinição é inválido, expirou ou já foi usado. Peça um novo em "Esqueci a senha".';

/** Trecho do SHA-256 do hash atual: muda quando a senha muda, invalidando links antigos */
function impressaoSenha(senhaHash: string | null): string {
  return crypto.createHash('sha256').update(String(senhaHash || '')).digest('hex').slice(0, 16);
}

async function usuarioDoLinkRedefinicao(token: string) {
  const dados = verificar(token, CHAVE_REDEFINICAO);
  if (!dados || typeof dados.h !== 'string') return null;
  const rows = await query<any>('SELECT id, nome_completo, email, senha_hash FROM usuarios WHERE id = ? AND ativo = 1', [dados.uid]);
  const u = rows[0];
  if (!u) return null;
  const a = Buffer.from(dados.h);
  const b = Buffer.from(impressaoSenha(u.senha_hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? u : null;
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

  /**
   * Esqueci a senha: envia por e-mail um link de redefinição válido por 1 hora.
   * A resposta é sempre a mesma, exista o e-mail ou não, para não revelar quem é cadastrado.
   * O link carrega uma impressão do hash da senha atual, então deixa de valer assim que
   * a senha é trocada (uso único) — sem precisar de tabela de tokens.
   */
  router.post('/auth/esqueci-senha', async (req: Request, res: Response) => {
    const resposta = {
      message: 'Se o e-mail estiver cadastrado, você receberá em instantes um link para redefinir a senha.',
    };
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!emailValido(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });

      const rows = await query<any>(
        'SELECT id, nome_completo, email, senha_hash FROM usuarios WHERE LOWER(email) = ? AND ativo = 1 LIMIT 1',
        [email],
      );
      const u = rows[0];
      if (!u) return res.json(resposta);

      const token = assinar(
        { uid: u.id, exp: Date.now() + VALIDADE_REDEFINICAO_MS, h: impressaoSenha(u.senha_hash) },
        CHAVE_REDEFINICAO,
      );
      const base = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
      const link = `${base}/?redefinir=${encodeURIComponent(token)}`;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e7e5e4;border-radius:12px;color:#1c1917">
          <h2 style="margin:0 0 12px;font-size:18px">ComprasWeb — Redefinição de senha</h2>
          <p style="font-size:14px">Olá, ${String(u.nome_completo).replace(/</g, '&lt;')}.</p>
          <p style="font-size:14px">Recebemos um pedido para redefinir a senha do seu acesso (${u.email}).</p>
          <p style="text-align:center;margin:24px 0">
            <a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:bold;font-size:14px">Criar nova senha</a>
          </p>
          <p style="font-size:12px;color:#78716c">O link vale por 1 hora e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail: sua senha atual continua valendo.</p>
        </div>`;
      const envio = await enviarEmail(u.email, 'ComprasWeb — Redefinição de senha', html);
      if (envio.status === 'simulado') {
        // Sem SMTP (desenvolvimento): o link só aparece no console do servidor
        console.log(`[redefinição de senha] ${u.email}: ${link}`);
      } else if (envio.status === 'falha') {
        console.error(`Falha ao enviar redefinição de senha para ${u.email}: ${envio.erro}`);
        return res.status(502).json({ error: 'Não foi possível enviar o e-mail agora. Tente novamente em alguns minutos.' });
      }
      res.json(resposta);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Confere o link antes de exibir o formulário de nova senha */
  router.post('/auth/redefinir-senha/validar', async (req: Request, res: Response) => {
    try {
      const u = await usuarioDoLinkRedefinicao(String(req.body?.token || ''));
      if (!u) return res.status(400).json({ error: LINK_INVALIDO });
      res.json({ email: u.email, nome: u.nome_completo });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/auth/redefinir-senha', async (req: Request, res: Response) => {
    try {
      const senha = typeof req.body?.senha === 'string' ? req.body.senha : '';
      if (senha.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
      const u = await usuarioDoLinkRedefinicao(String(req.body?.token || ''));
      if (!u) return res.status(400).json({ error: LINK_INVALIDO });

      await query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [bcrypt.hashSync(senha, 10), u.id]);
      res.json({ message: 'Senha alterada. Entre com a nova senha.', email: u.email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

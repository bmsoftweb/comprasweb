import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, exec, transacao } from './db';
import { autenticar, somenteAdmin } from './auth';
import { emailValido } from './email';

function erro(res: Response, err: any) {
  const dup = err?.code === 'ER_DUP_ENTRY';
  const emUso = err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED';
  res.status(dup ? 409 : emUso ? 409 : err?.status || 500).json({
    error: dup
      ? 'Já existe um registro com este identificador (ID BMSoft ou e-mail).'
      : emUso
      ? 'Este registro está em uso em pedidos e não pode ser excluído.'
      : err?.message || String(err),
  });
}

const txt = (v: any, max = 255): string | null => {
  const s = typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
};
const num = (v: any): number | null => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const falha = (mensagem: string) => Object.assign(new Error(mensagem), { status: 400 });

export function createCadastrosRouter() {
  const router = Router();

  // Leituras de apoio usadas pelo formulário do pedido: só administrador
  router.use(
    ['/produtos', '/fornecedores', '/associados', '/classificacoes', '/marcadores', '/usuarios'],
    autenticar,
    somenteAdmin,
  );

  // =================================================================
  // PRODUTOS
  // =================================================================
  router.get('/produtos', async (req: Request, res: Response) => {
    try {
      const busca = String(req.query.busca || '').trim();
      const params: any[] = [];
      const where: string[] = [];
      if (busca) {
        where.push('(descricao LIKE ? OR gtin = ? OR bmsoft_id = ? OR marca LIKE ?)');
        params.push(`%${busca}%`, busca, busca, `%${busca}%`);
      }
      if (req.query.classe) {
        where.push('classe = ?');
        params.push(String(req.query.classe));
      }
      if (req.query.marca) {
        where.push('marca = ?');
        params.push(String(req.query.marca));
      }
      if (req.query.origem) {
        where.push('origem = ?');
        params.push(String(req.query.origem));
      }
      const rows = await query<any>(
        `SELECT * FROM produtos ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY descricao LIMIT 1000`,
        params,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  router.get('/produtos/filtros', async (_req, res) => {
    try {
      const classes = await query<any>('SELECT DISTINCT classe FROM produtos WHERE classe IS NOT NULL AND classe <> "" ORDER BY classe');
      const marcas = await query<any>('SELECT DISTINCT marca FROM produtos WHERE marca IS NOT NULL AND marca <> "" ORDER BY marca');
      res.json({ classes: classes.map((c) => c.classe), marcas: marcas.map((m) => m.marca) });
    } catch (err) {
      erro(res, err);
    }
  });

  function dadosProduto(b: any) {
    const descricao = txt(b.descricao, 200);
    const unidade = txt(b.unidade, 10);
    if (!descricao) throw falha('Informe a descrição do produto.');
    if (!unidade) throw falha('Informe a unidade (SC, LT, KG...).');
    return {
      bmsoft_id: txt(b.bmsoft_id, 30),
      gtin: txt(b.gtin, 20),
      descricao,
      unidade: unidade.toUpperCase(),
      marca: txt(b.marca, 80),
      classe: txt(b.classe, 80),
      qtd_embalagem: num(b.qtd_embalagem),
      preco_estimado: num(b.preco_estimado),
      imagem_url: txt(b.imagem_url, 500),
    };
  }

  router.post('/produtos', async (req, res) => {
    try {
      const r = await exec('INSERT INTO produtos SET ?', [{ ...dadosProduto(req.body), origem: 'manual' }]);
      res.status(201).json({ id: r.insertId });
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/produtos/:id', async (req, res) => {
    try {
      await exec('UPDATE produtos SET ? WHERE id = ?', [dadosProduto(req.body), req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/produtos/:id', async (req, res) => {
    try {
      await exec('DELETE FROM produtos WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  /** Carga da base existente (BMSoft): upsert pelo ID BMSoft */
  router.post('/produtos/importar', async (req, res) => {
    try {
      const linhas: any[] = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
      if (!linhas.length) throw falha('Nenhuma linha para importar.');
      const r = await transacao(async (conn) => {
        let inseridos = 0, atualizados = 0;
        for (const l of linhas) {
          const d = dadosProduto(l);
          if (!d.bmsoft_id) throw falha(`Linha sem ID BMSoft: "${d.descricao}".`);
          const [res1] = await conn.query<any>(
            `INSERT INTO produtos SET ? ON DUPLICATE KEY UPDATE gtin = VALUES(gtin), descricao = VALUES(descricao),
               unidade = VALUES(unidade), marca = VALUES(marca), classe = VALUES(classe),
               qtd_embalagem = VALUES(qtd_embalagem), preco_estimado = VALUES(preco_estimado), origem = 'bmsoft'`,
            [{ ...d, origem: 'bmsoft' }],
          );
          if (res1.affectedRows === 1) inseridos++;
          else atualizados++;
        }
        return { inseridos, atualizados };
      });
      res.json(r);
    } catch (err) {
      erro(res, err);
    }
  });

  // =================================================================
  // FORNECEDORES
  // =================================================================
  router.get('/fornecedores', async (req, res) => {
    try {
      const busca = String(req.query.busca || '').trim();
      const rows = await query<any>(
        `SELECT * FROM fornecedores ${busca ? 'WHERE descricao LIKE ? OR bmsoft_id = ? OR email LIKE ?' : ''} ORDER BY descricao`,
        busca ? [`%${busca}%`, busca, `%${busca}%`] : [],
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  function dadosFornecedor(b: any) {
    const descricao = txt(b.descricao, 150);
    if (!descricao) throw falha('Informe a descrição do fornecedor.');
    const email = txt(b.email, 150);
    if (email && !emailValido(email)) throw falha('E-mail do fornecedor inválido.');
    return { bmsoft_id: txt(b.bmsoft_id, 30), descricao, email };
  }

  router.post('/fornecedores', async (req, res) => {
    try {
      const r = await exec('INSERT INTO fornecedores SET ?', [{ ...dadosFornecedor(req.body), origem: 'manual' }]);
      res.status(201).json({ id: r.insertId });
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/fornecedores/:id', async (req, res) => {
    try {
      await exec('UPDATE fornecedores SET ? WHERE id = ?', [dadosFornecedor(req.body), req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/fornecedores/:id', async (req, res) => {
    try {
      await exec('DELETE FROM fornecedores WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  router.post('/fornecedores/importar', async (req, res) => {
    try {
      const linhas: any[] = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
      if (!linhas.length) throw falha('Nenhuma linha para importar.');
      const r = await transacao(async (conn) => {
        let inseridos = 0, atualizados = 0;
        for (const l of linhas) {
          const d = dadosFornecedor(l);
          if (!d.bmsoft_id) throw falha(`Linha sem ID BMSoft: "${d.descricao}".`);
          const [res1] = await conn.query<any>(
            `INSERT INTO fornecedores SET ? ON DUPLICATE KEY UPDATE descricao = VALUES(descricao),
               email = COALESCE(VALUES(email), email), origem = 'bmsoft'`,
            [{ ...d, origem: 'bmsoft' }],
          );
          if (res1.affectedRows === 1) inseridos++;
          else atualizados++;
        }
        return { inseridos, atualizados };
      });
      res.json(r);
    } catch (err) {
      erro(res, err);
    }
  });

  // =================================================================
  // CLASSIFICAÇÕES E ASSOCIADOS (vindos da sincronização BMSoft)
  // =================================================================
  router.get('/classificacoes', async (_req, res) => {
    try {
      const rows = await query<any>(
        `SELECT c.*, (SELECT COUNT(*) FROM associados a WHERE a.classificacao_id = c.id AND a.ativo = 1) AS total_associados
           FROM classificacoes c ORDER BY c.nome`,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  router.get('/associados', async (req, res) => {
    try {
      const busca = String(req.query.busca || '').trim();
      const where: string[] = [];
      const params: any[] = [];
      if (busca) {
        where.push('(a.nome LIKE ? OR a.bmsoft_id = ? OR a.id = ? OR c.nome LIKE ?)');
        params.push(`%${busca}%`, busca, Number(busca) || 0, `%${busca}%`);
      }
      if (req.query.classificacao_id) {
        where.push('a.classificacao_id = ?');
        params.push(Number(req.query.classificacao_id));
      }
      if (req.query.ativos !== 'todos') where.push('a.ativo = 1');
      const rows = await query<any>(
        `SELECT a.*, c.nome AS classificacao_nome,
                (SELECT COUNT(*) FROM usuarios u WHERE u.associado_id = a.id) AS total_usuarios
           FROM associados a LEFT JOIN classificacoes c ON c.id = a.classificacao_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a.nome`,
        params,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/associados/:id', async (req, res) => {
    try {
      await exec('UPDATE associados SET ativo = ? WHERE id = ?', [req.body?.ativo ? 1 : 0, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  /**
   * Sincronização com o BMSoft: recebe as linhas exportadas (bmsoft_id, nome,
   * classificacao) e faz upsert. Classificações novas são criadas pelo nome.
   */
  router.post('/associados/sincronizar', async (req, res) => {
    try {
      const linhas: any[] = Array.isArray(req.body?.linhas) ? req.body.linhas : [];
      if (!linhas.length) throw falha('Nenhuma linha para sincronizar.');
      const r = await transacao(async (conn) => {
        let inseridos = 0, atualizados = 0, classificacoesNovas = 0;
        const [cls] = await conn.query<any[]>('SELECT id, nome FROM classificacoes');
        const mapa = new Map<string, number>(cls.map((c) => [c.nome.toLowerCase(), c.id]));
        for (const l of linhas) {
          const bm = txt(l.bmsoft_id, 30);
          const nome = txt(l.nome, 150);
          if (!bm || !nome) throw falha('Toda linha precisa de ID BMSoft e nome.');
          let clId: number | null = null;
          const clNome = txt(l.classificacao, 100);
          if (clNome) {
            clId = mapa.get(clNome.toLowerCase()) ?? null;
            if (!clId) {
              const [ins] = await conn.query<any>('INSERT INTO classificacoes (nome) VALUES (?)', [clNome]);
              clId = ins.insertId as number;
              mapa.set(clNome.toLowerCase(), clId);
              classificacoesNovas++;
            }
          }
          const [res1] = await conn.query<any>(
            `INSERT INTO associados (bmsoft_id, nome, classificacao_id, ativo, sincronizado_em) VALUES (?, ?, ?, 1, NOW())
             ON DUPLICATE KEY UPDATE nome = VALUES(nome), classificacao_id = VALUES(classificacao_id), sincronizado_em = NOW()`,
            [bm, nome, clId],
          );
          if (res1.affectedRows === 1) inseridos++;
          else atualizados++;
        }
        return { inseridos, atualizados, classificacoesNovas };
      });
      res.json(r);
    } catch (err) {
      erro(res, err);
    }
  });

  // =================================================================
  // MARCADORES
  // =================================================================
  router.get('/marcadores', async (_req, res) => {
    try {
      res.json(await query<any>('SELECT * FROM marcadores ORDER BY nome'));
    } catch (err) {
      erro(res, err);
    }
  });

  router.post('/marcadores', async (req, res) => {
    try {
      const nome = txt(req.body?.nome, 50);
      if (!nome) throw falha('Informe o nome do marcador.');
      const r = await exec('INSERT INTO marcadores (nome, cor) VALUES (?, ?)', [nome.toUpperCase(), txt(req.body?.cor, 20) || '#0EA5E9']);
      res.status(201).json({ id: r.insertId });
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/marcadores/:id', async (req, res) => {
    try {
      const nome = txt(req.body?.nome, 50);
      if (!nome) throw falha('Informe o nome do marcador.');
      await exec('UPDATE marcadores SET nome = ?, cor = ? WHERE id = ?', [nome.toUpperCase(), txt(req.body?.cor, 20), req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/marcadores/:id', async (req, res) => {
    try {
      await exec('DELETE FROM marcadores WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  // =================================================================
  // USUÁRIOS
  // =================================================================
  router.get('/usuarios', async (_req, res) => {
    try {
      const rows = await query<any>(
        `SELECT u.id, u.nome_completo, u.cpf, u.email, u.tipo, u.associado_id, u.ativo, u.criado_em,
                a.nome AS associado_nome, a.bmsoft_id AS associado_bmsoft_id
           FROM usuarios u LEFT JOIN associados a ON a.id = u.associado_id
          ORDER BY u.tipo, u.nome_completo`,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  function dadosUsuario(b: any, novo: boolean) {
    const nome = txt(b.nome_completo, 150);
    const cpf = txt(b.cpf, 14);
    const email = txt(b.email, 150)?.toLowerCase() || null;
    const tipo = b.tipo === 'administrador' ? 'administrador' : 'loja';
    if (!nome) throw falha('Informe o nome completo.');
    if (!cpf || cpf.replace(/\D/g, '').length !== 11) throw falha('Informe um CPF com 11 dígitos.');
    if (!email || !emailValido(email)) throw falha('Informe um e-mail válido (usado como login).');
    const associado_id = tipo === 'loja' ? num(b.associado_id) : null;
    if (tipo === 'loja' && !associado_id) throw falha('Usuário de loja precisa estar vinculado a um associado.');
    const dados: Record<string, any> = { nome_completo: nome, cpf, email, tipo, associado_id, ativo: b.ativo === false || b.ativo === 0 ? 0 : 1 };
    const senha = typeof b.senha === 'string' ? b.senha : '';
    if (novo && senha.length < 6) throw falha('A senha precisa ter pelo menos 6 caracteres.');
    if (senha) {
      if (senha.length < 6) throw falha('A senha precisa ter pelo menos 6 caracteres.');
      dados.senha_hash = bcrypt.hashSync(senha, 10);
    }
    return dados;
  }

  router.post('/usuarios', async (req, res) => {
    try {
      const r = await exec('INSERT INTO usuarios SET ?', [dadosUsuario(req.body, true)]);
      res.status(201).json({ id: r.insertId });
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/usuarios/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const dados = dadosUsuario(req.body, false);
      if (id === req.usuario!.id && (dados.tipo !== 'administrador' || !dados.ativo)) {
        throw falha('Você não pode remover o seu próprio acesso de administrador.');
      }
      await exec('UPDATE usuarios SET ? WHERE id = ?', [dados, id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/usuarios/:id', async (req, res) => {
    try {
      if (Number(req.params.id) === req.usuario!.id) throw falha('Você não pode excluir o seu próprio usuário.');
      await exec('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  return router;
}

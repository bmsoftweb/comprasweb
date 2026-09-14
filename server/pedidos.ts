import { Router, Request, Response } from 'express';
import path from 'path';
import type { PoolConnection } from 'mysql2/promise';
import { query, exec, transacao } from './db';
import { autenticar, somenteAdmin } from './auth';
import {
  SITUACOES_ABERTAS,
  SITUACOES_ENCERRADAS,
  SQL_VOLUME_POR_PA,
  atualizarPedidosVencidos,
  carregarPedidoCompleto,
  registrarLog,
} from './pedidoDados';
import { enviarEmail, emailValido } from './email';
import { salvarAnexo, removerAnexos } from './storage';
const TAMANHO_MAX_ARQUIVO = 15 * 1024 * 1024;

const SITUACOES_VALIDAS = [...SITUACOES_ABERTAS, ...SITUACOES_ENCERRADAS];

const num = (v: any): number | null => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const txt = (v: any, max = 5000): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

function erro(res: Response, err: any, status = 500) {
  res.status(err?.status || status).json({ error: err?.message || String(err) });
}

class ErroValidacao extends Error {
  status = 400;
}

// ------------------------------------------------------------------
// Gravação do pedido (novo ou alteração) com diff dos filhos, para não
// perder as quantidades já preenchidas pelas lojas.
// ------------------------------------------------------------------
async function gravarPedido(conn: PoolConnection, id: number | null, body: any, usuarioId: number): Promise<number> {
  const nome = txt(body.nome, 200);
  if (!nome) throw new ErroValidacao('Informe o nome do pedido.');
  const fechamento = txt(body.data_fechamento, 25);
  if (!fechamento || isNaN(new Date(fechamento).getTime())) {
    throw new ErroValidacao('Informe a data e o horário de fechamento.');
  }
  const situacao = SITUACOES_VALIDAS.includes(body.situacao) ? body.situacao : 'em_elaboracao';
  const itens: any[] = Array.isArray(body.itens) ? body.itens : [];
  const associados: any[] = Array.isArray(body.associados) ? body.associados : [];
  const condicoes: any[] = Array.isArray(body.condicoes) ? body.condicoes : [];

  if (situacao === 'liberado_loja') {
    if (new Date(fechamento).getTime() <= Date.now()) {
      throw new ErroValidacao('Para liberar o pedido às lojas, o fechamento precisa estar no futuro.');
    }
    if (!itens.length) throw new ErroValidacao('Inclua ao menos um produto antes de liberar o pedido às lojas.');
    if (!associados.length) throw new ErroValidacao('Selecione ao menos um associado antes de liberar o pedido.');
  }
  for (const it of itens) {
    if (!txt(it.descricao)) throw new ErroValidacao('Há produto sem descrição no pedido.');
    if (!txt(it.unidade)) throw new ErroValidacao(`Informe a unidade do produto "${it.descricao}".`);
    if (num(it.preco_compra) === null || Number(it.preco_compra) < 0) {
      throw new ErroValidacao(`Informe o preço do produto "${it.descricao}".`);
    }
  }
  for (const c of condicoes) {
    if (!txt(c.condicao_pagamento)) throw new ErroValidacao('Há condição de pagamento sem descrição.');
  }

  const usarMesma = body.usar_mesma_observacao ? 1 : 0;
  const obsAssociado = txt(body.observacao_associado, 60000);
  const campos = {
    nome,
    situacao,
    fornecedor_id: num(body.fornecedor_id),
    fornecedor_manual: num(body.fornecedor_id) ? null : txt(body.fornecedor_manual, 150),
    data_fechamento: fechamento.replace('T', ' ').slice(0, 19),
    tipo_frete: ['CIF', 'FOB'].includes(body.tipo_frete) ? body.tipo_frete : null,
    prazo_entrega: txt(body.prazo_entrega, 100),
    local_entrega: txt(body.local_entrega, 200),
    observacao_associado: obsAssociado,
    observacao_fornecedor: usarMesma ? obsAssociado : txt(body.observacao_fornecedor, 60000),
    observacao_individual: txt(body.observacao_individual, 60000),
    usar_mesma_observacao: usarMesma,
    solicitar_avaliacao_compra: body.solicitar_avaliacao_compra ? 1 : 0,
    mostrar_valor_economizado: body.mostrar_valor_economizado ? 1 : 0,
  };

  let pedidoId: number;
  if (id) {
    const [atual] = await conn.query<any[]>('SELECT situacao FROM pedidos WHERE id = ? FOR UPDATE', [id]);
    if (!atual.length) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 });
    await conn.query('UPDATE pedidos SET ? WHERE id = ?', [campos, id]);
    pedidoId = id;
    if (atual[0].situacao !== situacao) {
      await registrarLog(conn, pedidoId, 'alteracao_situacao', usuarioId, `${atual[0].situacao} → ${situacao}`);
    }
    await registrarLog(conn, pedidoId, 'alteracao', usuarioId, 'Pedido alterado pela Central');
  } else {
    const [r] = await conn.query<any>('INSERT INTO pedidos SET ?', [
      { ...campos, criado_por: usuarioId, duplicado_de_pedido_id: num(body.duplicado_de_pedido_id) },
    ]);
    pedidoId = r.insertId;
    await registrarLog(
      conn,
      pedidoId,
      body.duplicado_de_pedido_id ? 'duplicacao' : 'criacao',
      usuarioId,
      body.duplicado_de_pedido_id ? `Duplicado do pedido ${body.duplicado_de_pedido_id}` : 'Pedido criado',
    );
  }

  // Marcadores e grupos: substituição simples (não há dados pendurados)
  await conn.query('DELETE FROM pedido_marcadores WHERE pedido_id = ?', [pedidoId]);
  const marcadores = [...new Set((body.marcadores || []).map(Number).filter(Boolean))];
  if (marcadores.length) {
    await conn.query('INSERT INTO pedido_marcadores (pedido_id, marcador_id) VALUES ?', [marcadores.map((m) => [pedidoId, m])]);
  }
  await conn.query('DELETE FROM pedido_grupos WHERE pedido_id = ?', [pedidoId]);
  const grupos = [...new Set((body.grupos || []).map(Number).filter(Boolean))];
  if (grupos.length) {
    await conn.query('INSERT INTO pedido_grupos (pedido_id, classificacao_id) VALUES ?', [grupos.map((g) => [pedidoId, g])]);
  }

  // Condições de pagamento (a loja referencia a escolhida por id)
  const [condAtuais] = await conn.query<any[]>('SELECT id FROM pedido_condicoes_pagamento WHERE pedido_id = ?', [pedidoId]);
  const condManter = new Set(condicoes.map((c) => Number(c.id)).filter(Boolean));
  const condRemover = condAtuais.map((c) => c.id).filter((cid) => !condManter.has(cid));
  if (condRemover.length) await conn.query('DELETE FROM pedido_condicoes_pagamento WHERE id IN (?)', [condRemover]);
  let ordem = 0;
  for (const c of condicoes) {
    const dados = {
      condicao_pagamento: txt(c.condicao_pagamento, 100),
      percentual: num(c.percentual) ?? 0,
      valor_minimo: num(c.valor_minimo),
      classificacao_id: num(c.classificacao_id),
      ordem: ordem++,
    };
    if (c.id && condAtuais.some((a) => a.id === Number(c.id))) {
      await conn.query('UPDATE pedido_condicoes_pagamento SET ? WHERE id = ?', [dados, c.id]);
    } else {
      await conn.query('INSERT INTO pedido_condicoes_pagamento SET ?', [{ ...dados, pedido_id: pedidoId }]);
    }
  }

  // Itens: excluir um item apaga (em cascata) as quantidades preenchidas dele
  const [itensAtuais] = await conn.query<any[]>('SELECT id FROM pedido_itens WHERE pedido_id = ?', [pedidoId]);
  const itensManter = new Set(itens.map((i) => Number(i.id)).filter(Boolean));
  const itensRemover = itensAtuais.map((i) => i.id).filter((iid) => !itensManter.has(iid));
  if (itensRemover.length) {
    await conn.query('DELETE FROM pedido_itens WHERE id IN (?)', [itensRemover]);
    if (id) await registrarLog(conn, pedidoId, 'exclusao_itens', usuarioId, `${itensRemover.length} produto(s) excluído(s) do pedido`);
  }
  ordem = 0;
  for (const it of itens) {
    const dados = {
      produto_id: num(it.produto_id),
      gtin: txt(it.gtin, 20),
      descricao: txt(it.descricao, 200),
      unidade: txt(it.unidade, 10),
      qtd_embalagem: num(it.qtd_embalagem),
      preco_compra: num(it.preco_compra) ?? 0,
      limite_maximo: num(it.limite_maximo),
      limite_logistica: num(it.limite_logistica),
      imagem_url: txt(it.imagem_url, 500),
      ordem: ordem++,
    };
    if (it.id && itensAtuais.some((a) => a.id === Number(it.id))) {
      await conn.query('UPDATE pedido_itens SET ? WHERE id = ?', [dados, it.id]);
    } else {
      await conn.query('INSERT INTO pedido_itens SET ?', [{ ...dados, pedido_id: pedidoId }]);
    }
  }

  // Associados: por associado_id, preservando o preenchimento de quem continua
  const [paAtuais] = await conn.query<any[]>('SELECT id, associado_id FROM pedido_associados WHERE pedido_id = ?', [pedidoId]);
  const assocNovos = new Map<number, string>();
  for (const a of associados) {
    const aid = Number(a.associado_id);
    if (aid) assocNovos.set(aid, a.incluido_via === 'grupo' ? 'grupo' : 'individual');
  }
  const paRemover = paAtuais.filter((p) => !assocNovos.has(p.associado_id)).map((p) => p.id);
  if (paRemover.length) await conn.query('DELETE FROM pedido_associados WHERE id IN (?)', [paRemover]);
  for (const [aid, via] of assocNovos) {
    const existente = paAtuais.find((p) => p.associado_id === aid);
    if (existente) {
      await conn.query('UPDATE pedido_associados SET incluido_via = ? WHERE id = ?', [via, existente.id]);
    } else {
      await conn.query('INSERT INTO pedido_associados (pedido_id, associado_id, incluido_via) VALUES (?, ?, ?)', [pedidoId, aid, via]);
    }
  }

  return pedidoId;
}

export function createPedidosRouter() {
  const router = Router();
  router.use(['/pedidos', '/recebimentos', '/emails', '/log'], autenticar, somenteAdmin);

  // ---------------------------------------------------------------
  // Listagens (Abertos / Encerrados)
  // ---------------------------------------------------------------
  router.get('/pedidos', async (req: Request, res: Response) => {
    try {
      await atualizarPedidosVencidos();
      const grupo = req.query.grupo === 'encerrados' ? 'encerrados' : 'abertos';
      const busca = String(req.query.busca || '').trim();
      const situacoes = grupo === 'abertos' ? SITUACOES_ABERTAS : SITUACOES_ENCERRADAS;
      const params: any[] = [situacoes];
      let filtro = '';
      if (busca) {
        filtro = ' AND (p.nome LIKE ? OR f.descricao LIKE ? OR p.fornecedor_manual LIKE ? OR p.id = ?)';
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, Number(busca) || 0);
      }
      const rows = await query<any>(
        `SELECT p.id, p.nome, p.situacao, p.data_fechamento, p.compra_efetuada, p.data_compra_efetuada,
                COALESCE(f.descricao, p.fornecedor_manual) AS fornecedor_nome,
                u.nome_completo AS comprador_nome,
                (SELECT COUNT(*) FROM pedido_associados pa WHERE pa.pedido_id = p.id) AS total_associados,
                (SELECT COUNT(*) FROM pedido_associados pa WHERE pa.pedido_id = p.id AND pa.situacao = 'preenchido') AS total_preenchidos,
                (SELECT COUNT(*) FROM pedido_associados pa WHERE pa.pedido_id = p.id AND pa.situacao = 'rejeitado') AS total_rejeitados,
                (SELECT COUNT(*) FROM pedido_itens pi WHERE pi.pedido_id = p.id) AS total_itens,
                COALESCE((SELECT SUM(v.volume) FROM (${SQL_VOLUME_POR_PA}) v WHERE v.pedido_id = p.id), 0) AS volume
           FROM pedidos p
           LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
           LEFT JOIN usuarios u ON u.id = p.criado_por
          WHERE p.situacao IN (?) ${filtro}
          ORDER BY ${grupo === 'abertos' ? 'p.data_fechamento ASC' : 'p.data_fechamento DESC'}`,
        params,
      );
      const marcadores = rows.length
        ? await query<any>(
            `SELECT pm.pedido_id, m.id, m.nome, m.cor FROM pedido_marcadores pm JOIN marcadores m ON m.id = pm.marcador_id
              WHERE pm.pedido_id IN (?)`,
            [rows.map((r) => r.id)],
          )
        : [];
      res.json(
        rows.map((r) => ({
          ...r,
          marcadores: marcadores.filter((m) => m.pedido_id === r.id).map(({ pedido_id, ...m }) => m),
        })),
      );
    } catch (err) {
      erro(res, err);
    }
  });

  router.get('/pedidos/proximo-numero', async (_req, res) => {
    try {
      const rows = await query<any>(
        `SELECT AUTO_INCREMENT AS proximo FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pedidos'`,
      );
      // information_schema pode estar em cache; garante que não fica atrás do maior id
      const max = await query<any>('SELECT COALESCE(MAX(id), 0) + 1 AS proximo FROM pedidos');
      res.json({ proximo: Math.max(Number(rows[0]?.proximo || 0), Number(max[0].proximo)) });
    } catch (err) {
      erro(res, err);
    }
  });

  router.get('/pedidos/:id', async (req, res) => {
    try {
      await atualizarPedidosVencidos();
      const pedido = await carregarPedidoCompleto(Number(req.params.id));
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
      res.json(pedido);
    } catch (err) {
      erro(res, err);
    }
  });

  router.post('/pedidos', async (req, res) => {
    try {
      const id = await transacao((conn) => gravarPedido(conn, null, req.body, req.usuario!.id));
      res.status(201).json({ id });
    } catch (err) {
      erro(res, err);
    }
  });

  router.put('/pedidos/:id', async (req, res) => {
    try {
      const id = await transacao((conn) => gravarPedido(conn, Number(req.params.id), req.body, req.usuario!.id));
      res.json({ id });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/pedidos/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const anexos = await query<any>('SELECT caminho_arquivo FROM pedido_arquivos WHERE pedido_id = ?', [id]);
      await transacao(async (conn) => {
        // Pedidos duplicados a partir deste perdem só a referência de origem
        await conn.query('UPDATE pedidos SET duplicado_de_pedido_id = NULL WHERE duplicado_de_pedido_id = ?', [id]);
        const [r] = await conn.query<any>('DELETE FROM pedidos WHERE id = ?', [id]);
        if (!r.affectedRows) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 });
      });
      await removerAnexos(anexos.map((a) => a.caminho_arquivo));
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Situação: Tornar Indisponível / Liberar / Encerrar
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/situacao', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const nova = String(req.body?.situacao || '');
      const pedido = (await query<any>('SELECT id, situacao, data_fechamento FROM pedidos WHERE id = ?', [id]))[0];
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

      let situacao = nova;
      if (nova === 'encerrar') {
        const vol = await query<any>(
          `SELECT COUNT(*) AS c FROM pedido_item_quantidades piq JOIN pedido_associados pa ON pa.id = piq.pedido_associado_id
            WHERE pa.pedido_id = ? AND pa.situacao = 'preenchido' AND piq.quantidade > 0`,
          [id],
        );
        situacao = Number(vol[0].c) > 0 ? 'encerrado_com_volume' : 'encerrado_sem_volume';
      }
      if (!SITUACOES_VALIDAS.includes(situacao)) return res.status(400).json({ error: 'Situação inválida.' });
      if (situacao === 'liberado_loja') {
        if (new Date(String(pedido.data_fechamento).replace(' ', 'T')).getTime() <= Date.now()) {
          return res.status(400).json({ error: 'O fechamento já passou. Altere a data de fechamento antes de liberar.' });
        }
        const itens = await query<any>('SELECT COUNT(*) AS c FROM pedido_itens WHERE pedido_id = ?', [id]);
        const assoc = await query<any>('SELECT COUNT(*) AS c FROM pedido_associados WHERE pedido_id = ?', [id]);
        if (!Number(itens[0].c) || !Number(assoc[0].c)) {
          return res.status(400).json({ error: 'O pedido precisa de produtos e associados para ser liberado.' });
        }
      }
      await exec('UPDATE pedidos SET situacao = ? WHERE id = ?', [situacao, id]);
      await registrarLog(null, id, 'alteracao_situacao', req.usuario!.id, `${pedido.situacao} → ${situacao}`);
      res.json({ situacao });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Notificar associados (e-mail aos usuários das lojas do pedido)
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/notificar', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pedido = await carregarPedidoCompleto(id);
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });
      const somentePendentes = req.body?.somentePendentes !== false;
      const alvo = pedido.associados.filter((a: any) => !somentePendentes || a.situacao === 'pendente');
      if (!alvo.length) return res.status(400).json({ error: 'Nenhum associado a notificar.' });

      const usuarios = await query<any>(
        `SELECT email FROM usuarios WHERE ativo = 1 AND tipo = 'loja' AND associado_id IN (?)`,
        [alvo.map((a: any) => a.associado_id)],
      );
      const emails = usuarios.map((u) => u.email);
      if (!emails.length) return res.status(400).json({ error: 'Os associados selecionados não têm usuários com e-mail cadastrado.' });

      const mensagem = txt(req.body?.mensagem, 2000) || '';
      const html = `
        <p>Olá,</p>
        <p>O pedido de compra <b>nº ${pedido.id} — ${pedido.nome}</b> está disponível para preenchimento.</p>
        <p>Fornecedor: ${pedido.fornecedor_nome || '—'}<br/>Fechamento: <b>${pedido.data_fechamento}</b></p>
        ${mensagem ? `<p>${mensagem.replace(/</g, '&lt;')}</p>` : ''}
        <p>Acesse o sistema de compras para informar as quantidades da sua loja.</p>`;
      const r = await enviarEmail(emails, `Pedido de compra nº ${pedido.id} disponível — ${pedido.nome}`, html);
      await registrarLog(
        null,
        id,
        'notificacao_associados',
        req.usuario!.id,
        `${emails.length} e-mail(s) de ${alvo.length} associado(s) — ${r.status}${r.erro ? `: ${r.erro}` : ''}`,
      );
      if (r.status === 'falha') return res.status(502).json({ error: `Falha no envio: ${r.erro}` });
      res.json({ enviados: emails.length, associados: alvo.length, status: r.status });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Buscar imagens dos produtos (Google Imagens via Serper)
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/buscar-imagens', async (req, res) => {
    try {
      const chave = process.env.SERPER_API_KEY;
      if (!chave) {
        return res.status(503).json({ error: 'Busca indisponível: configure SERPER_API_KEY no .env do servidor (chave em serper.dev).' });
      }
      const id = Number(req.params.id);
      const substituir = Boolean(req.body?.substituir);
      const itens = await query<any>(
        `SELECT id, produto_id, descricao, gtin FROM pedido_itens WHERE pedido_id = ? ${substituir ? '' : 'AND (imagem_url IS NULL OR imagem_url = "")'} ORDER BY ordem LIMIT 60`,
        [id],
      );
      let encontradas = 0;
      const falhas: string[] = [];
      for (const it of itens) {
        try {
          const resp = await fetch('https://google.serper.dev/images', {
            method: 'POST',
            headers: { 'X-API-KEY': chave, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: it.gtin ? `${it.descricao} ${it.gtin}` : it.descricao, gl: 'br', hl: 'pt-br', num: 10 }),
          });
          if (!resp.ok) throw new Error(`Serper HTTP ${resp.status}`);
          const corpo: any = await resp.json();
          const url = (corpo.images || []).map((i: any) => i.imageUrl).find((u: string) => /^https:\/\//.test(u || ''));
          if (!url) continue;
          await exec('UPDATE pedido_itens SET imagem_url = ? WHERE id = ?', [url.slice(0, 500), it.id]);
          if (it.produto_id) {
            await exec('UPDATE produtos SET imagem_url = ? WHERE id = ? AND (imagem_url IS NULL OR imagem_url = "" OR ?)', [
              url.slice(0, 500),
              it.produto_id,
              substituir ? 1 : 0,
            ]);
          }
          encontradas++;
        } catch (e: any) {
          falhas.push(`${it.descricao}: ${e.message}`);
          if (falhas.length >= 3 && encontradas === 0) break; // chave inválida/sem crédito
        }
      }
      await registrarLog(null, id, 'busca_imagens', req.usuario!.id, `${encontradas} de ${itens.length} imagem(ns) encontrada(s)`);
      res.json({ pesquisados: itens.length, encontradas, falhas });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Impressão/Envio: envia por e-mail o layout já montado no navegador
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/enviar-impressao', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const emails = String(req.body?.email || '')
        .split(/[;,\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      if (!emails.length || emails.some((e) => !emailValido(e))) {
        return res.status(400).json({ error: 'Informe e-mail(s) válido(s), separados por vírgula.' });
      }
      const html = String(req.body?.html || '');
      const assunto = txt(req.body?.assunto, 200) || `Pedido nº ${id}`;
      const r = await enviarEmail(emails, assunto, html);
      await registrarLog(null, id, 'envio_impressao', req.usuario!.id, `${req.body?.layout || ''} para ${emails.join(', ')} — ${r.status}`);
      if (r.status === 'falha') return res.status(502).json({ error: `Falha no envio: ${r.erro}` });
      res.json({ status: r.status });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Efetuar Compra Fornecedor
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/compra', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const pedido = (await query<any>(
        `SELECT p.*, f.email AS fornecedor_email FROM pedidos p LEFT JOIN fornecedores f ON f.id = p.fornecedor_id WHERE p.id = ?`,
        [id],
      ))[0];
      if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado.' });

      const tipo = req.body?.tipo_envio === 'digitacao_livre' ? 'digitacao_livre' : 'email_cadastrado';
      const email = tipo === 'email_cadastrado' ? pedido.fornecedor_email : String(req.body?.email || '').trim();
      if (!email) {
        return res.status(400).json({
          error: tipo === 'email_cadastrado'
            ? 'O fornecedor do pedido não tem e-mail cadastrado. Use a digitação livre.'
            : 'Informe o e-mail de envio.',
        });
      }
      if (!emailValido(email)) return res.status(400).json({ error: 'E-mail de envio inválido.' });
      const apenasCotacao = req.body?.apenas_cotacao ? 1 : 0;

      const [liberadoAinda] = await query<any>(`SELECT (situacao = 'liberado_loja' AND data_fechamento > NOW()) AS aberto FROM pedidos WHERE id = ?`, [id]);
      if (!apenasCotacao && Number(liberadoAinda.aberto)) {
        return res.status(400).json({
          error: 'O pedido ainda está liberado para as lojas. Torne-o indisponível ou aguarde o fechamento antes de efetuar a compra.',
        });
      }

      const assunto = txt(req.body?.assunto, 200) || `${apenasCotacao ? 'Cotação' : 'Pedido de compra'} nº ${id} — ${pedido.nome}`;
      const r = await enviarEmail(email, assunto, String(req.body?.html || ''));

      const resultado = await transacao(async (conn) => {
        const [ins] = await conn.query<any>('INSERT INTO compras_fornecedor SET ?', [
          {
            pedido_id: id,
            fornecedor_id: pedido.fornecedor_id,
            email_envio: email,
            tipo_envio: tipo,
            apenas_cotacao: apenasCotacao,
            assunto,
            status_envio: r.status,
            mensagem_erro: r.erro || null,
            usuario_id: req.usuario!.id,
          },
        ]);
        if (r.status === 'falha') return { compraId: ins.insertId, recebimentos: 0 };

        if (apenasCotacao) {
          await registrarLog(conn, id, 'cotacao_enviada', req.usuario!.id, `Cotação enviada para ${email} (${r.status})`);
          return { compraId: ins.insertId, recebimentos: 0 };
        }

        const [vol] = await conn.query<any[]>(
          `SELECT COUNT(*) AS c FROM pedido_item_quantidades piq JOIN pedido_associados pa ON pa.id = piq.pedido_associado_id
            WHERE pa.pedido_id = ? AND pa.situacao = 'preenchido' AND piq.quantidade > 0`,
          [id],
        );
        const situacao = Number(vol[0].c) > 0 ? 'encerrado_com_volume' : 'encerrado_sem_volume';
        await conn.query(
          `UPDATE pedidos SET compra_efetuada = 1, data_compra_efetuada = NOW(), situacao = ? WHERE id = ?`,
          [situacao, id],
        );
        // Um recebimento pendente por associado que preencheu
        const [rec] = await conn.query<any>(
          `INSERT IGNORE INTO recebimentos (pedido_id, pedido_associado_id, data_compra, situacao_entrega)
           SELECT pa.pedido_id, pa.id, CURDATE(), 'pendente'
             FROM pedido_associados pa
            WHERE pa.pedido_id = ? AND pa.situacao = 'preenchido'
              AND EXISTS (SELECT 1 FROM pedido_item_quantidades piq WHERE piq.pedido_associado_id = pa.id AND piq.quantidade > 0)`,
          [id],
        );
        await registrarLog(conn, id, 'compra_efetuada', req.usuario!.id, `Enviado para ${email} (${r.status})`);
        return { compraId: ins.insertId, recebimentos: rec.affectedRows };
      });

      if (r.status === 'falha') return res.status(502).json({ error: `Falha no envio do e-mail: ${r.erro}` });
      res.json({ ...resultado, status: r.status });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Arquivos anexos
  // ---------------------------------------------------------------
  router.post('/pedidos/:id/arquivos', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const nome = path.basename(String(req.body?.nome || '')).replace(/[^\w.\- ()]/g, '_').slice(0, 200);
      const base64 = String(req.body?.conteudo || '').replace(/^data:[^,]*,/, '');
      if (!nome || !base64) return res.status(400).json({ error: 'Arquivo inválido.' });
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length > TAMANHO_MAX_ARQUIVO) return res.status(400).json({ error: 'O arquivo passa de 15 MB.' });
      const existe = await query<any>('SELECT id FROM pedidos WHERE id = ?', [id]);
      if (!existe.length) return res.status(404).json({ error: 'Pedido não encontrado.' });

      const caminho = await salvarAnexo(id, nome, bytes);
      const r = await exec(
        'INSERT INTO pedido_arquivos (pedido_id, nome_arquivo, caminho_arquivo, enviado_por) VALUES (?, ?, ?, ?)',
        [id, nome, caminho, req.usuario!.id],
      );
      res.status(201).json({ id: r.insertId, nome_arquivo: nome });
    } catch (err) {
      erro(res, err);
    }
  });

  router.delete('/pedidos/:id/arquivos/:arquivoId', async (req, res) => {
    try {
      const rows = await query<any>('SELECT * FROM pedido_arquivos WHERE id = ? AND pedido_id = ?', [req.params.arquivoId, req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      await exec('DELETE FROM pedido_arquivos WHERE id = ?', [rows[0].id]);
      await removerAnexos([rows[0].caminho_arquivo]);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Confirmar Recebimento
  // ---------------------------------------------------------------
  router.get('/recebimentos', async (req, res) => {
    try {
      const filtro = req.query.situacao === 'todos' ? '' : `WHERE r.situacao_entrega = 'pendente'`;
      const rows = await query<any>(
        `SELECT r.*, p.nome AS pedido_nome, COALESCE(f.descricao, p.fornecedor_manual) AS fornecedor_nome,
                a.nome AS associado_nome, a.bmsoft_id AS associado_bmsoft_id,
                u.nome_completo AS confirmado_por_nome, COALESCE(v.volume, 0) AS volume
           FROM recebimentos r
           JOIN pedidos p ON p.id = r.pedido_id
           LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
           JOIN pedido_associados pa ON pa.id = r.pedido_associado_id
           JOIN associados a ON a.id = pa.associado_id
           LEFT JOIN usuarios u ON u.id = r.confirmado_por
           LEFT JOIN (${SQL_VOLUME_POR_PA}) v ON v.pedido_associado_id = pa.id
           ${filtro}
          ORDER BY r.situacao_entrega = 'pendente' DESC, r.data_compra DESC, p.id DESC, a.nome`,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  router.post('/recebimentos/:id/confirmar', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = txt(req.body?.data, 10);
      if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Informe a data do recebimento.' });
      const situacao = req.body?.situacao_entrega === 'divergencia' ? 'divergencia' : 'confirmado';
      const observacao = txt(req.body?.observacao, 2000);
      if (situacao === 'divergencia' && !observacao) {
        return res.status(400).json({ error: 'Descreva a divergência na observação (ex: entrega parcial, produto avariado).' });
      }
      const rows = await query<any>('SELECT pedido_id, pedido_associado_id FROM recebimentos WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Recebimento não encontrado.' });
      await exec(
        `UPDATE recebimentos SET situacao_entrega = ?, observacao = ?, confirmado_por = ?, confirmado_em = ? WHERE id = ?`,
        [situacao, observacao, req.usuario!.id, `${data} ${new Date().toTimeString().slice(0, 8)}`, id],
      );
      await registrarLog(
        null,
        rows[0].pedido_id,
        situacao === 'confirmado' ? 'recebimento_confirmado' : 'recebimento_divergencia',
        req.usuario!.id,
        `Recebido em ${data}${observacao ? ` — ${observacao}` : ''}`,
        rows[0].pedido_associado_id,
      );
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Confirmação de E-mail (envios ao fornecedor)
  // ---------------------------------------------------------------
  router.get('/emails', async (_req, res) => {
    try {
      const rows = await query<any>(
        `SELECT cf.*, p.nome AS pedido_nome, COALESCE(f.descricao, p.fornecedor_manual) AS fornecedor_nome,
                u.nome_completo AS usuario_nome, uc.nome_completo AS confirmado_por_nome
           FROM compras_fornecedor cf
           JOIN pedidos p ON p.id = cf.pedido_id
           LEFT JOIN fornecedores f ON f.id = cf.fornecedor_id
           LEFT JOIN usuarios u ON u.id = cf.usuario_id
           LEFT JOIN usuarios uc ON uc.id = cf.confirmado_por
          ORDER BY cf.confirmado_fornecedor_em IS NULL DESC, cf.data_envio DESC`,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  router.post('/emails/:id/confirmar', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const rows = await query<any>('SELECT pedido_id FROM compras_fornecedor WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Envio não encontrado.' });
      const desfazer = Boolean(req.body?.desfazer);
      await exec(
        `UPDATE compras_fornecedor SET confirmado_fornecedor_em = ?, confirmado_por = ?, observacao_confirmacao = ? WHERE id = ?`,
        desfazer ? [null, null, null, id] : [new Date(), req.usuario!.id, txt(req.body?.observacao, 500), id],
      );
      await registrarLog(
        null,
        rows[0].pedido_id,
        desfazer ? 'confirmacao_email_desfeita' : 'confirmacao_email',
        req.usuario!.id,
        desfazer ? null : txt(req.body?.observacao, 500) || 'Fornecedor confirmou o recebimento do pedido',
      );
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  // ---------------------------------------------------------------
  // Histórico geral de ações
  // ---------------------------------------------------------------
  router.get('/log', async (_req, res) => {
    try {
      const rows = await query<any>(
        `SELECT l.id, l.pedido_id, p.nome AS pedido_nome, l.acao, l.data_acao, l.observacao,
                u.nome_completo AS usuario_nome, a.nome AS associado_nome
           FROM pedido_log l
           JOIN pedidos p ON p.id = l.pedido_id
           LEFT JOIN usuarios u ON u.id = l.usuario_id
           LEFT JOIN pedido_associados pa ON pa.id = l.pedido_associado_id
           LEFT JOIN associados a ON a.id = pa.associado_id
          ORDER BY l.data_acao DESC, l.id DESC LIMIT 500`,
      );
      res.json(rows);
    } catch (err) {
      erro(res, err);
    }
  });

  return router;
}

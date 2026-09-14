import { Router, Request, Response } from 'express';
import { query, transacao } from './db.js';
import { caminhoLocal, ehBlob } from './storage.js';
import { autenticar, somenteLoja } from './auth.js';
import {
  SQL_VOLUME_POR_PA,
  atualizarPedidosVencidos,
  carregarPedidoCompleto,
  pedidoAceitaPreenchimento,
  registrarLog,
} from './pedidoDados.js';

function erro(res: Response, err: any, status = 500) {
  res.status(err?.status || status).json({ error: err?.message || String(err) });
}

const falha = (mensagem: string, status = 400) => Object.assign(new Error(mensagem), { status });

/**
 * Visão da loja sobre um pedido: só os dados que ela pode ver, as condições de
 * pagamento válidas para a sua classificação e as quantidades que ela preencheu.
 */
async function pedidoDaLoja(pedidoId: number, associadoId: number, classificacaoId: number | null) {
  const pa = (await query<any>(
    `SELECT pa.*, u.nome_completo AS usuario_acao_nome
       FROM pedido_associados pa LEFT JOIN usuarios u ON u.id = pa.usuario_acao_id
      WHERE pa.pedido_id = ? AND pa.associado_id = ?`,
    [pedidoId, associadoId],
  ))[0];
  if (!pa) return null;
  const completo = await carregarPedidoCompleto(pedidoId);
  if (!completo || completo.situacao === 'em_elaboracao') return null;

  const minhas = await query<any>('SELECT pedido_item_id, quantidade FROM pedido_item_quantidades WHERE pedido_associado_id = ?', [pa.id]);
  // Total já pedido pelas outras lojas, para respeitar o limite de logística
  const outras = await query<any>(
    `SELECT piq.pedido_item_id, SUM(piq.quantidade) AS total
       FROM pedido_item_quantidades piq JOIN pedido_associados pa ON pa.id = piq.pedido_associado_id
      WHERE pa.pedido_id = ? AND pa.id <> ? AND pa.situacao = 'preenchido'
      GROUP BY piq.pedido_item_id`,
    [pedidoId, pa.id],
  );

  return {
    id: completo.id,
    nome: completo.nome,
    situacao: completo.situacao,
    data_fechamento: completo.data_fechamento,
    fornecedor_nome: completo.fornecedor_nome,
    tipo_frete: completo.tipo_frete,
    prazo_entrega: completo.prazo_entrega,
    local_entrega: completo.local_entrega,
    observacao_associado: completo.observacao_associado,
    solicitar_avaliacao_compra: completo.solicitar_avaliacao_compra,
    mostrar_valor_economizado: completo.mostrar_valor_economizado,
    compra_efetuada: completo.compra_efetuada,
    marcadores: completo.marcadores,
    arquivos: completo.arquivos,
    condicoes: completo.condicoes.filter((c: any) => c.classificacao_id === null || c.classificacao_id === classificacaoId),
    itens: completo.itens.map((it: any) => ({
      id: it.id,
      produto_id: it.produto_id,
      codigo: it.produto_bmsoft_id,
      gtin: it.gtin,
      descricao: it.descricao,
      unidade: it.unidade,
      qtd_embalagem: it.qtd_embalagem,
      preco_compra: it.preco_compra,
      preco_estimado: it.preco_estimado,
      limite_maximo: it.limite_maximo,
      limite_logistica: it.limite_logistica,
      imagem_url: it.imagem_url,
      quantidade: Number(minhas.find((m) => m.pedido_item_id === it.id)?.quantidade || 0),
      quantidade_outras_lojas: Number(outras.find((o) => o.pedido_item_id === it.id)?.total || 0),
    })),
    participacao: {
      id: pa.id,
      situacao: pa.situacao,
      data_acao: pa.data_acao,
      usuario_acao_nome: pa.usuario_acao_nome,
      condicao_pagamento_id: pa.condicao_pagamento_id,
      avaliacao_nota: pa.avaliacao_nota,
      avaliacao_comentario: pa.avaliacao_comentario,
    },
    pode_preencher: pedidoAceitaPreenchimento(completo),
  };
}

export function createLojaRouter() {
  const router = Router();
  router.use('/loja', autenticar, somenteLoja);

  router.get('/loja/pedidos', async (req: Request, res: Response) => {
    try {
      await atualizarPedidosVencidos();
      const u = req.usuario!;
      const historico = req.query.grupo === 'historico';
      const rows = await query<any>(
        `SELECT p.id, p.nome, p.situacao, p.data_fechamento, p.compra_efetuada,
                COALESCE(f.descricao, p.fornecedor_manual) AS fornecedor_nome,
                pa.situacao AS minha_situacao, pa.data_acao, COALESCE(v.volume, 0) AS meu_volume,
                (SELECT COUNT(*) FROM pedido_itens pi WHERE pi.pedido_id = p.id) AS total_itens,
                r.situacao_entrega
           FROM pedido_associados pa
           JOIN pedidos p ON p.id = pa.pedido_id
           LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
           LEFT JOIN (${SQL_VOLUME_POR_PA}) v ON v.pedido_associado_id = pa.id
           LEFT JOIN recebimentos r ON r.pedido_associado_id = pa.id
          WHERE pa.associado_id = ?
            AND ${historico
              ? `p.situacao IN ('aguardando_fechamento','encerrado_com_volume','encerrado_sem_volume')`
              : `p.situacao IN ('liberado_loja','indisponivel')`}
          ORDER BY ${historico ? 'p.data_fechamento DESC' : 'p.data_fechamento ASC'}`,
        [u.associado_id],
      );
      const marcadores = rows.length
        ? await query<any>(
            `SELECT pm.pedido_id, m.id, m.nome, m.cor FROM pedido_marcadores pm JOIN marcadores m ON m.id = pm.marcador_id WHERE pm.pedido_id IN (?)`,
            [rows.map((r) => r.id)],
          )
        : [];
      res.json(rows.map((r) => ({ ...r, marcadores: marcadores.filter((m) => m.pedido_id === r.id) })));
    } catch (err) {
      erro(res, err);
    }
  });

  router.get('/loja/pedidos/:id', async (req, res) => {
    try {
      await atualizarPedidosVencidos();
      const u = req.usuario!;
      const dados = await pedidoDaLoja(Number(req.params.id), u.associado_id!, u.classificacao_id);
      if (!dados) return res.status(404).json({ error: 'Pedido não encontrado para a sua loja.' });
      res.json(dados);
    } catch (err) {
      erro(res, err);
    }
  });

  /** Gravar o preenchimento da loja */
  router.put('/loja/pedidos/:id', async (req, res) => {
    try {
      await atualizarPedidosVencidos();
      const u = req.usuario!;
      const pedidoId = Number(req.params.id);
      const dados = await pedidoDaLoja(pedidoId, u.associado_id!, u.classificacao_id);
      if (!dados) return res.status(404).json({ error: 'Pedido não encontrado para a sua loja.' });
      if (!dados.pode_preencher) {
        return res.status(409).json({ error: 'Este pedido não está mais disponível para preenchimento.' });
      }

      const entrada: Record<string, any> = req.body?.quantidades || {};
      const quantidades = new Map<number, number>();
      for (const it of dados.itens) {
        const bruto = entrada[it.id];
        const qtd = bruto === undefined || bruto === '' || bruto === null ? 0 : Number(bruto);
        if (!Number.isFinite(qtd) || qtd < 0) throw falha(`Quantidade inválida para "${it.descricao}".`);
        if (it.limite_maximo !== null && qtd > Number(it.limite_maximo)) {
          throw falha(`"${it.descricao}": a quantidade máxima por loja é ${Number(it.limite_maximo)}.`);
        }
        if (it.limite_logistica !== null && qtd > 0 && qtd + it.quantidade_outras_lojas > Number(it.limite_logistica)) {
          const disponivel = Math.max(0, Number(it.limite_logistica) - it.quantidade_outras_lojas);
          throw falha(`"${it.descricao}": limite de logística atingido — restam ${disponivel} para todas as lojas.`);
        }
        quantidades.set(it.id, qtd);
      }

      const totalItens = [...quantidades.values()].filter((q) => q > 0).length;
      if (!totalItens) throw falha('Informe a quantidade de ao menos um item, ou use "Rejeitar pedido".');

      let condicaoId: number | null = Number(req.body?.condicao_pagamento_id) || null;
      if (dados.condicoes.length) {
        const cond = dados.condicoes.find((c: any) => c.id === condicaoId);
        if (!cond) throw falha('Escolha a condição de pagamento.');
        const total = dados.itens.reduce(
          (s: number, it: any) => s + (quantidades.get(it.id) || 0) * Number(it.preco_compra) * (1 + Number(cond.percentual || 0) / 100),
          0,
        );
        if (cond.valor_minimo !== null && total < Number(cond.valor_minimo)) {
          throw falha(
            `O valor mínimo para a condição "${cond.condicao_pagamento}" é R$ ${Number(cond.valor_minimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`,
          );
        }
      } else {
        condicaoId = null;
      }

      await transacao(async (conn) => {
        const paId = dados.participacao.id;
        await conn.query('DELETE FROM pedido_item_quantidades WHERE pedido_associado_id = ?', [paId]);
        const linhas = [...quantidades.entries()].filter(([, q]) => q > 0).map(([itemId, q]) => [itemId, paId, q]);
        if (linhas.length) {
          await conn.query('INSERT INTO pedido_item_quantidades (pedido_item_id, pedido_associado_id, quantidade) VALUES ?', [linhas]);
        }
        await conn.query(
          `UPDATE pedido_associados SET situacao = 'preenchido', data_acao = NOW(), usuario_acao_id = ?, condicao_pagamento_id = ? WHERE id = ?`,
          [u.id, condicaoId, paId],
        );
        await registrarLog(conn, pedidoId, 'preenchimento', u.id, `${linhas.length} item(ns) preenchido(s)`, paId);
      });

      res.json(await pedidoDaLoja(pedidoId, u.associado_id!, u.classificacao_id));
    } catch (err) {
      erro(res, err);
    }
  });

  /** Rejeitar o pedido (preenchido ou não): grava data, hora e usuário */
  router.post('/loja/pedidos/:id/rejeitar', async (req, res) => {
    try {
      await atualizarPedidosVencidos();
      const u = req.usuario!;
      const pedidoId = Number(req.params.id);
      const dados = await pedidoDaLoja(pedidoId, u.associado_id!, u.classificacao_id);
      if (!dados) return res.status(404).json({ error: 'Pedido não encontrado para a sua loja.' });
      if (!dados.pode_preencher) return res.status(409).json({ error: 'Este pedido não está mais disponível.' });
      const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim().slice(0, 500) : '';

      await transacao(async (conn) => {
        const paId = dados.participacao.id;
        await conn.query('DELETE FROM pedido_item_quantidades WHERE pedido_associado_id = ?', [paId]);
        await conn.query(
          `UPDATE pedido_associados SET situacao = 'rejeitado', data_acao = NOW(), usuario_acao_id = ?, condicao_pagamento_id = NULL WHERE id = ?`,
          [u.id, paId],
        );
        await registrarLog(conn, pedidoId, 'rejeicao', u.id, motivo || 'Loja rejeitou o pedido', paId);
      });
      res.json(await pedidoDaLoja(pedidoId, u.associado_id!, u.classificacao_id));
    } catch (err) {
      erro(res, err);
    }
  });

  /** Avaliação do processo de compra (quando solicitada no pedido) */
  router.post('/loja/pedidos/:id/avaliacao', async (req, res) => {
    try {
      const u = req.usuario!;
      const pedidoId = Number(req.params.id);
      const dados = await pedidoDaLoja(pedidoId, u.associado_id!, u.classificacao_id);
      if (!dados) return res.status(404).json({ error: 'Pedido não encontrado para a sua loja.' });
      if (!dados.solicitar_avaliacao_compra) return res.status(400).json({ error: 'Este pedido não solicita avaliação.' });
      const nota = Number(req.body?.nota);
      if (!Number.isInteger(nota) || nota < 1 || nota > 5) return res.status(400).json({ error: 'Dê uma nota de 1 a 5.' });
      const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim().slice(0, 500) : null;
      await query('UPDATE pedido_associados SET avaliacao_nota = ?, avaliacao_comentario = ? WHERE id = ?', [
        nota,
        comentario || null,
        dados.participacao.id,
      ]);
      await registrarLog(null, pedidoId, 'avaliacao', u.id, `Nota ${nota}${comentario ? ` — ${comentario}` : ''}`, dados.participacao.id);
      res.json({ ok: true });
    } catch (err) {
      erro(res, err);
    }
  });

  return router;
}

/** Download de anexo: administrador ou loja participante do pedido */
export function createArquivosRouter() {
  const router = Router();
  router.get('/arquivos/:pedidoId/:arquivoId', autenticar, async (req, res) => {
    try {
      const u = req.usuario!;
      const rows = await query<any>('SELECT * FROM pedido_arquivos WHERE id = ? AND pedido_id = ?', [req.params.arquivoId, req.params.pedidoId]);
      const arq = rows[0];
      if (!arq) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      if (u.tipo === 'loja') {
        const participa = await query<any>(
          `SELECT 1 FROM pedido_associados pa JOIN pedidos p ON p.id = pa.pedido_id
            WHERE pa.pedido_id = ? AND pa.associado_id = ? AND p.situacao <> 'em_elaboracao'`,
          [arq.pedido_id, u.associado_id],
        );
        if (!participa.length) return res.status(403).json({ error: 'Sem acesso a este arquivo.' });
      }
      if (ehBlob(arq.caminho_arquivo)) {
        // Repassa o blob com o nome original, sem expor a URL do store ao navegador
        const r = await fetch(arq.caminho_arquivo);
        if (!r.ok || !r.body) return res.status(404).json({ error: 'Arquivo não encontrado no Vercel Blob.' });
        res.setHeader('Content-Type', r.headers.get('content-type') || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(arq.nome_arquivo)}`);
        res.send(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const caminho = caminhoLocal(arq.caminho_arquivo);
      if (!caminho) return res.status(404).json({ error: 'Arquivo não encontrado no disco.' });
      res.download(caminho, arq.nome_arquivo);
    } catch (err) {
      erro(res, err);
    }
  });
  return router;
}

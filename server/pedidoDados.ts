import type { PoolConnection } from 'mysql2/promise';
import { pool, query, exec } from './db';

/** Situações que aparecem na tela "Pedidos Abertos" */
export const SITUACOES_ABERTAS = ['em_elaboracao', 'liberado_loja', 'indisponivel', 'aguardando_fechamento'];
export const SITUACOES_ENCERRADAS = ['encerrado_com_volume', 'encerrado_sem_volume'];

/**
 * Valor de cada associado: quantidade × preço do item × (1 + percentual da condição
 * de pagamento escolhida pela loja). Só conta quem gravou o preenchimento.
 */
export const SQL_VOLUME_POR_PA = `
  SELECT pa.id AS pedido_associado_id, pa.pedido_id,
         COALESCE(SUM(piq.quantidade * pi.preco_compra * (1 + COALESCE(cp.percentual, 0) / 100)), 0) AS volume
    FROM pedido_associados pa
    JOIN pedido_item_quantidades piq ON piq.pedido_associado_id = pa.id
    JOIN pedido_itens pi ON pi.id = piq.pedido_item_id
    LEFT JOIN pedido_condicoes_pagamento cp ON cp.id = pa.condicao_pagamento_id
   WHERE pa.situacao = 'preenchido'
   GROUP BY pa.id, pa.pedido_id`;

/**
 * Pedido liberado (ou indisponível) cujo horário de fechamento já passou deixa de
 * aceitar preenchimento e fica aguardando o fechamento pela Central.
 * Executado de forma preguiçosa antes de cada listagem/abertura.
 */
export async function atualizarPedidosVencidos() {
  const vencidos = await query<any>(
    `SELECT id FROM pedidos
      WHERE situacao IN ('liberado_loja','indisponivel') AND data_fechamento <= NOW()`,
  );
  if (!vencidos.length) return;
  const ids = vencidos.map((v) => v.id);
  await exec(`UPDATE pedidos SET situacao = 'aguardando_fechamento' WHERE id IN (?)`, [ids]);
  for (const id of ids) {
    await registrarLog(null, id, 'fechamento_programado', null, 'Horário de fechamento atingido; preenchimento encerrado.');
  }
}

export async function registrarLog(
  conn: PoolConnection | null,
  pedidoId: number,
  acao: string,
  usuarioId: number | null,
  observacao: string | null = null,
  pedidoAssociadoId: number | null = null,
) {
  const alvo = conn || pool;
  await alvo.query(
    `INSERT INTO pedido_log (pedido_id, pedido_associado_id, acao, usuario_id, observacao) VALUES (?, ?, ?, ?, ?)`,
    [pedidoId, pedidoAssociadoId, acao, usuarioId, observacao],
  );
}

/** Pedido com todos os filhos, usado pelo formulário, impressão e compra */
export async function carregarPedidoCompleto(id: number) {
  const pedidos = await query<any>(
    `SELECT p.*, f.descricao AS fornecedor_descricao, f.email AS fornecedor_email,
            u.nome_completo AS criado_por_nome
       FROM pedidos p
       LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
       LEFT JOIN usuarios u ON u.id = p.criado_por
      WHERE p.id = ?`,
    [id],
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const [marcadores, grupos, condicoes, itens, associados, arquivos, quantidades] = await Promise.all([
    query<any>(
      `SELECT m.* FROM pedido_marcadores pm JOIN marcadores m ON m.id = pm.marcador_id WHERE pm.pedido_id = ? ORDER BY m.nome`,
      [id],
    ),
    query<any>('SELECT classificacao_id FROM pedido_grupos WHERE pedido_id = ?', [id]),
    query<any>(
      `SELECT cp.*, c.nome AS classificacao_nome
         FROM pedido_condicoes_pagamento cp
         LEFT JOIN classificacoes c ON c.id = cp.classificacao_id
        WHERE cp.pedido_id = ? ORDER BY cp.ordem, cp.id`,
      [id],
    ),
    query<any>(
      `SELECT pi.*, pr.bmsoft_id AS produto_bmsoft_id, pr.preco_estimado,
              COALESCE((SELECT SUM(piq.quantidade) FROM pedido_item_quantidades piq
                         JOIN pedido_associados pa ON pa.id = piq.pedido_associado_id
                        WHERE piq.pedido_item_id = pi.id AND pa.situacao = 'preenchido'), 0) AS quantidade_total
         FROM pedido_itens pi
         LEFT JOIN produtos pr ON pr.id = pi.produto_id
        WHERE pi.pedido_id = ? ORDER BY pi.ordem, pi.id`,
      [id],
    ),
    query<any>(
      `SELECT pa.*, a.nome AS associado_nome, a.bmsoft_id AS associado_bmsoft_id, a.classificacao_id,
              c.nome AS classificacao_nome, u.nome_completo AS usuario_acao_nome,
              cp.condicao_pagamento AS condicao_nome, cp.percentual AS condicao_percentual,
              COALESCE(v.volume, 0) AS volume,
              r.id AS recebimento_id, r.situacao_entrega
         FROM pedido_associados pa
         JOIN associados a ON a.id = pa.associado_id
         LEFT JOIN classificacoes c ON c.id = a.classificacao_id
         LEFT JOIN usuarios u ON u.id = pa.usuario_acao_id
         LEFT JOIN pedido_condicoes_pagamento cp ON cp.id = pa.condicao_pagamento_id
         LEFT JOIN (${SQL_VOLUME_POR_PA}) v ON v.pedido_associado_id = pa.id
         LEFT JOIN recebimentos r ON r.pedido_associado_id = pa.id
        WHERE pa.pedido_id = ? ORDER BY a.nome`,
      [id],
    ),
    query<any>(
      `SELECT pa2.id, pa2.nome_arquivo, pa2.criado_em, u.nome_completo AS enviado_por_nome
         FROM pedido_arquivos pa2 LEFT JOIN usuarios u ON u.id = pa2.enviado_por
        WHERE pa2.pedido_id = ? ORDER BY pa2.criado_em DESC`,
      [id],
    ),
    query<any>(
      `SELECT piq.pedido_item_id, piq.pedido_associado_id, piq.quantidade
         FROM pedido_item_quantidades piq
         JOIN pedido_itens pi ON pi.id = piq.pedido_item_id
        WHERE pi.pedido_id = ? AND piq.quantidade > 0`,
      [id],
    ),
  ]);

  const log = await query<any>(
    `SELECT l.id, l.acao, l.data_acao, l.observacao, u.nome_completo AS usuario_nome, a.nome AS associado_nome
       FROM pedido_log l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       LEFT JOIN pedido_associados pa ON pa.id = l.pedido_associado_id
       LEFT JOIN associados a ON a.id = pa.associado_id
      WHERE l.pedido_id = ? ORDER BY l.data_acao DESC, l.id DESC LIMIT 200`,
    [id],
  );

  const volume = associados.reduce((s, a) => s + Number(a.volume || 0), 0);
  return {
    ...pedido,
    fornecedor_nome: pedido.fornecedor_descricao || pedido.fornecedor_manual || null,
    marcadores,
    grupos: grupos.map((g) => g.classificacao_id),
    condicoes,
    itens,
    associados,
    arquivos,
    quantidades,
    log,
    volume,
    total_associados: associados.length,
    total_preenchidos: associados.filter((a) => a.situacao === 'preenchido').length,
  };
}

/** Pedido está aberto para a loja gravar/rejeitar? */
export function pedidoAceitaPreenchimento(p: { situacao: string; data_fechamento: string }) {
  return p.situacao === 'liberado_loja' && new Date(p.data_fechamento.replace(' ', 'T')).getTime() > Date.now();
}

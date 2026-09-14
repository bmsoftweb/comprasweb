import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

/**
 * Prepara o banco: migration base + complemento + dados de exemplo.
 *
 *   npm run db:setup            -> aplica só o que falta: a migration base se o banco estiver
 *                                  vazio, o complemento se ainda não foi aplicado e os dados de
 *                                  exemplo se ainda não houver usuários
 *   npm run db:setup -- --reset -> APAGA o banco MYSQL_DATABASE e recria tudo
 *
 * As datas dos pedidos de exemplo são relativas a "agora", para que a contagem
 * "Faltam X dias" e as situações façam sentido em qualquer dia do teste.
 */

const DATABASE = process.env.MYSQL_DATABASE || 'compras_pull';
const reset = process.argv.includes('--reset');

function sqlFile(nome: string) {
  return fs.readFileSync(path.join(process.cwd(), 'database', nome), 'utf8');
}

/** Data/hora local no formato do MySQL, deslocada em dias (e hora fixa opcional) */
function dia(offsetDias: number, hora = '18:00:00') {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${hora}`;
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    multipleStatements: true,
  });

  if (reset) {
    console.log(`Apagando o banco ${DATABASE}...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${DATABASE}\``);
  }
  const [bancos] = await conn.query<any[]>('SHOW DATABASES LIKE ?', [DATABASE]);
  if (!bancos.length) {
    await conn.query(`CREATE DATABASE \`${DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  await conn.query(`USE \`${DATABASE}\``);

  const [tabelas] = await conn.query<any[]>('SHOW TABLES');
  if (!tabelas.length) {
    console.log('Aplicando 001_migration_pedidos_pull.sql...');
    await conn.query(sqlFile('001_migration_pedidos_pull.sql'));
  } else {
    console.log('Migration base já aplicada.');
  }

  const [colGtin] = await conn.query<any[]>(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'produtos' AND COLUMN_NAME = 'gtin'`,
  );
  if (!colGtin.length) {
    console.log('Aplicando 002_complemento.sql...');
    await conn.query(sqlFile('002_complemento.sql'));
  } else {
    console.log('Complemento já aplicado.');
  }

  const [[{ usuarios }]] = await conn.query<any[]>('SELECT COUNT(*) AS usuarios FROM usuarios');
  const [[{ pedidos }]] = await conn.query<any[]>('SELECT COUNT(*) AS pedidos FROM pedidos');
  if (Number(usuarios) || Number(pedidos)) {
    console.log('O banco já tem usuários/pedidos: dados de exemplo não inseridos.');
    await conn.end();
    return;
  }
  const [cls] = await conn.query<any[]>('SELECT id, nome FROM classificacoes ORDER BY id');
  const [mks] = await conn.query<any[]>('SELECT id, nome FROM marcadores ORDER BY id');
  if (cls[0]?.nome !== 'Socio' || cls[1]?.nome !== 'Franqueado' || cls.length !== 2 || mks.length !== 1 || mks[0].nome !== 'PARCEIRO') {
    console.error('Classificações/marcadores diferentes dos seeds da migration: ajuste os dados de exemplo antes de inserir.');
    process.exit(1);
  }

  console.log('Inserindo dados de exemplo...');
  const q = async (sql: string, params: any[] = []) => {
    const [r] = await conn.query<any>(sql, params);
    return r;
  };

  // ------------------------------------------------------------------
  // Classificações (Socio e Franqueado já vêm da migration) e marcadores
  // ------------------------------------------------------------------
  await q(`UPDATE classificacoes SET bmsoft_id = CASE nome WHEN 'Socio' THEN 'CL01' ELSE 'CL02' END`);
  await q(`INSERT INTO classificacoes (bmsoft_id, nome) VALUES ('CL03', 'Conveniado')`);
  await q(`INSERT INTO marcadores (nome, cor) VALUES ('PROMOÇÃO', '#F59E0B'), ('URGENTE', '#E11D48'), ('COTAÇÃO', '#8B5CF6')`);
  const SOCIO = 1, FRANQ = 2, CONV = 3;
  const PARCEIRO = 1, PROMOCAO = 2, URGENTE = 3;

  // ------------------------------------------------------------------
  // Associados (carga simulada do BMSoft)
  // ------------------------------------------------------------------
  const associados: [string, string, number][] = [
    ['1001', 'Agropecuária Boa Safra - Matriz', SOCIO],
    ['1002', 'Agropecuária Boa Safra - Filial Centro', SOCIO],
    ['1003', 'Casa do Produtor Rural', SOCIO],
    ['1004', 'Armazém Campo Verde', SOCIO],
    ['1005', 'Rações & Cia Sul de Minas', SOCIO],
    ['2001', 'Franquia AgroMais Varginha', FRANQ],
    ['2002', 'Franquia AgroMais Lavras', FRANQ],
    ['2003', 'Franquia AgroMais Pouso Alegre', FRANQ],
    ['2004', 'Franquia AgroMais Três Corações', FRANQ],
    ['3001', 'Cooperativa Vale do Sapucaí', CONV],
    ['3002', 'Sítio Nossa Senhora Aparecida', CONV],
  ];
  for (const [bm, nome, cl] of associados) {
    await q('INSERT INTO associados (bmsoft_id, nome, classificacao_id) VALUES (?, ?, ?)', [bm, nome, cl]);
  }
  // ids 1..11 na ordem acima

  // ------------------------------------------------------------------
  // Usuários
  // ------------------------------------------------------------------
  const hashAdmin = bcrypt.hashSync('admin123', 10);
  const hashLoja = bcrypt.hashSync('loja123', 10);
  await q(
    `INSERT INTO usuarios (nome_completo, cpf, email, senha_hash, tipo, associado_id) VALUES
     ('Central de Compras (Administrador)', '111.111.111-11', 'admin@central.com', ?, 'administrador', NULL),
     ('Mariana Souza', '222.222.222-22', 'compras@central.com', ?, 'administrador', NULL),
     ('João Batista', '333.333.333-33', 'loja1001@boasafra.com', ?, 'loja', 1),
     ('Carla Mendes', '444.444.444-44', 'loja1002@boasafra.com', ?, 'loja', 2),
     ('Pedro Henrique', '555.555.555-55', 'loja1003@casadoprodutor.com', ?, 'loja', 3),
     ('Ana Paula Lima', '666.666.666-66', 'varginha@agromais.com', ?, 'loja', 6),
     ('Rafael Costa', '777.777.777-77', 'lavras@agromais.com', ?, 'loja', 7),
     ('Luciana Prado', '888.888.888-88', 'cooperativa@valesapucai.com', ?, 'loja', 10)`,
    [hashAdmin, hashAdmin, hashLoja, hashLoja, hashLoja, hashLoja, hashLoja, hashLoja],
  );
  const ADMIN = 1;
  const USR = { a1: 3, a2: 4, a3: 5, a6: 6, a7: 7, a10: 8 };

  // ------------------------------------------------------------------
  // Fornecedores
  // ------------------------------------------------------------------
  await q(
    `INSERT INTO fornecedores (bmsoft_id, descricao, email, origem) VALUES
     ('F100', 'Nutrição Animal Brasil Ltda', 'vendas@nutribrasil.com.br', 'bmsoft'),
     ('F200', 'Sementes Horizonte S.A.', 'pedidos@sementeshorizonte.com.br', 'bmsoft'),
     ('F300', 'Defensivos Agrícolas União', 'comercial@defuniao.com.br', 'bmsoft'),
     ('F400', 'Ferragens e Ferramentas Minas', 'faturamento@ffminas.com.br', 'bmsoft'),
     (NULL, 'Distribuidora Pet Nova (cotação)', NULL, 'manual')`,
  );

  // ------------------------------------------------------------------
  // Produtos
  // ------------------------------------------------------------------
  // [bmsoft, gtin, descricao, unidade, marca, classe, embalagem, preco_estimado]
  const produtos: [string | null, string | null, string, string, string, string, number | null, number][] = [
    ['P0001', '7891000100011', 'Ração Bovinos Engorda 22% 40kg', 'SC', 'NutriBrasil', 'Rações', 1, 98.9],
    ['P0002', '7891000100028', 'Ração Bovinos Leite 20% 40kg', 'SC', 'NutriBrasil', 'Rações', 1, 104.5],
    ['P0003', '7891000100035', 'Ração Aves Postura 25kg', 'SC', 'NutriBrasil', 'Rações', 1, 79.9],
    ['P0004', '7891000100042', 'Ração Suínos Crescimento 40kg', 'SC', 'NutriBrasil', 'Rações', 1, 112.0],
    ['P0005', '7891000100059', 'Sal Mineral Bovinos 30kg', 'SC', 'NutriBrasil', 'Suplementos', 1, 89.0],
    ['P0006', '7891000100066', 'Núcleo Proteico Gado de Corte 25kg', 'SC', 'NutriBrasil', 'Suplementos', 1, 132.0],
    ['P0007', '7891000100073', 'Ração Equinos Performance 40kg', 'SC', 'NutriBrasil', 'Rações', 1, 118.0],
    ['P0008', '7891000100080', 'Ração Cães Adultos Premium 15kg', 'SC', 'NutriBrasil Pet', 'Pet', 1, 159.9],
    ['P0009', '7891000100097', 'Ração Gatos Adultos 10kg', 'SC', 'NutriBrasil Pet', 'Pet', 1, 139.9],
    ['P0010', '7891000100103', 'Milho Moído 50kg', 'SC', 'Grãos Minas', 'Grãos', 1, 72.0],
    ['P0011', '7892000200014', 'Semente Milho Híbrido HZ-3040 20kg', 'SC', 'Horizonte', 'Sementes', 1, 890.0],
    ['P0012', '7892000200021', 'Semente Soja HZ-Pro 40kg', 'SC', 'Horizonte', 'Sementes', 1, 420.0],
    ['P0013', '7892000200038', 'Semente Capim Braquiária 10kg', 'SC', 'Horizonte', 'Sementes', 1, 210.0],
    ['P0014', '7892000200045', 'Semente Sorgo Forrageiro 20kg', 'SC', 'Horizonte', 'Sementes', 1, 310.0],
    ['P0015', '7893000300017', 'Herbicida Glifosato 480 20L', 'GL', 'União', 'Defensivos', 1, 380.0],
    ['P0016', '7893000300024', 'Inseticida Piretroide 1L', 'LT', 'União', 'Defensivos', 12, 64.0],
    ['P0017', '7893000300031', 'Fungicida Sistêmico 5L', 'GL', 'União', 'Defensivos', 4, 295.0],
    ['P0018', '7893000300048', 'Espalhante Adesivo 1L', 'LT', 'União', 'Adjuvantes', 12, 28.5],
    ['P0019', '7893000300055', 'Carrapaticida Pour-On 1L', 'LT', 'União Vet', 'Veterinária', 12, 89.0],
    ['P0020', '7893000300062', 'Vermífugo Ivermectina 1% 500ml', 'FR', 'União Vet', 'Veterinária', 12, 54.0],
    ['P0021', '7894000400010', 'Arame Farpado 500m Fio 16', 'RL', 'FF Minas', 'Cercas', 1, 389.0],
    ['P0022', '7894000400027', 'Arame Liso Ovalado 1000m', 'RL', 'FF Minas', 'Cercas', 1, 520.0],
    ['P0023', '7894000400034', 'Grampo para Cerca 1kg', 'KG', 'FF Minas', 'Cercas', 25, 18.9],
    ['P0024', '7894000400041', 'Enxada Larga 2,5 lb com Cabo', 'UN', 'FF Minas', 'Ferramentas', 6, 62.0],
    ['P0025', '7894000400058', 'Cavadeira Articulada', 'UN', 'FF Minas', 'Ferramentas', 6, 98.0],
    ['P0026', '7894000400065', 'Mangueira Jardim 1/2 50m', 'RL', 'FF Minas', 'Irrigação', 1, 145.0],
    ['P0027', '7894000400072', 'Bota PVC Cano Longo', 'PR', 'FF Minas', 'EPI', 10, 49.9],
    ['P0028', '7894000400089', 'Luva Nitrílica Agrícola', 'PR', 'FF Minas', 'EPI', 12, 12.5],
    [null, null, 'Tapete Higiênico Pet 30un (cotação)', 'PC', 'Pet Nova', 'Pet', 10, 59.9],
    [null, null, 'Areia Sanitária Gatos 4kg (cotação)', 'PC', 'Pet Nova', 'Pet', 6, 19.9],
  ];
  for (const [bm, gtin, desc, un, marca, classe, emb, preco] of produtos) {
    await q(
      `INSERT INTO produtos (bmsoft_id, gtin, descricao, unidade, marca, classe, qtd_embalagem, preco_estimado, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bm, gtin, desc, un, marca, classe, emb, preco, bm ? 'bmsoft' : 'manual'],
    );
  }

  // ------------------------------------------------------------------
  // Helpers de pedido
  // ------------------------------------------------------------------
  const prodRows: any[] = await q('SELECT * FROM produtos ORDER BY id');
  const prod = (id: number) => prodRows.find((p) => p.id === id);

  async function criarPedido(p: {
    nome: string;
    situacao: string;
    fornecedor_id?: number | null;
    fornecedor_manual?: string | null;
    fechamento: string;
    marcadores?: number[];
    grupos?: number[];
    associados: number[];
    produtos: [number, number][]; // [produto_id, desconto % sobre o estimado]
    condicoes: [string, number, number | null, number | null][];
    obs?: string;
    compra?: string | null;
    avaliacao?: boolean;
    economizado?: boolean;
    criado_em?: string;
  }) {
    const r = await q(
      `INSERT INTO pedidos (nome, situacao, fornecedor_id, fornecedor_manual, data_fechamento,
          observacao_associado, observacao_fornecedor, solicitar_avaliacao_compra, mostrar_valor_economizado,
          compra_efetuada, data_compra_efetuada, criado_por, tipo_frete, prazo_entrega, local_entrega, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CIF', '15 dias após o pedido', 'Centro de Distribuição - Rod. BR-381, km 750', ?)`,
      [
        p.nome, p.situacao, p.fornecedor_id ?? null, p.fornecedor_manual ?? null, p.fechamento,
        p.obs ?? null, p.obs ?? null, p.avaliacao ? 1 : 0, p.economizado ? 1 : 0,
        p.compra ? 1 : 0, p.compra ?? null, ADMIN, p.criado_em ?? dia(-3, '09:00:00'),
      ],
    );
    const pedidoId = r.insertId as number;

    for (const m of p.marcadores ?? []) {
      await q('INSERT INTO pedido_marcadores (pedido_id, marcador_id) VALUES (?, ?)', [pedidoId, m]);
    }
    for (const g of p.grupos ?? []) {
      await q('INSERT INTO pedido_grupos (pedido_id, classificacao_id) VALUES (?, ?)', [pedidoId, g]);
    }

    const condIds: number[] = [];
    let ordem = 0;
    for (const [cond, perc, minimo, grupo] of p.condicoes) {
      const c = await q(
        `INSERT INTO pedido_condicoes_pagamento (pedido_id, condicao_pagamento, percentual, valor_minimo, classificacao_id, ordem)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pedidoId, cond, perc, minimo, grupo, ordem++],
      );
      condIds.push(c.insertId);
    }

    const itemIds: number[] = [];
    ordem = 0;
    for (const [pid, desconto] of p.produtos) {
      const pr = prod(pid);
      const preco = Math.round(Number(pr.preco_estimado) * (1 - desconto / 100) * 100) / 100;
      const it = await q(
        `INSERT INTO pedido_itens (pedido_id, produto_id, gtin, descricao, unidade, qtd_embalagem, preco_compra, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [pedidoId, pr.id, pr.gtin, pr.descricao, pr.unidade, pr.qtd_embalagem, preco, ordem++],
      );
      itemIds.push(it.insertId);
    }

    const paIds: Record<number, number> = {};
    for (const a of p.associados) {
      const assoc = associados[a - 1];
      const via = p.grupos?.includes(assoc[2]) ? 'grupo' : 'individual';
      const pa = await q(
        'INSERT INTO pedido_associados (pedido_id, associado_id, incluido_via) VALUES (?, ?, ?)',
        [pedidoId, a, via],
      );
      paIds[a] = pa.insertId;
    }
    await q(
      `INSERT INTO pedido_log (pedido_id, acao, usuario_id, data_acao, observacao)
       VALUES (?, 'criacao', ?, ?, 'Pedido criado (dados de exemplo)')`,
      [pedidoId, ADMIN, p.criado_em ?? dia(-3, '09:00:00')],
    );
    return { pedidoId, condIds, itemIds, paIds };
  }

  /** Grava o preenchimento de uma loja: [índice do item, quantidade] */
  async function preencher(
    ped: { pedidoId: number; condIds: number[]; itemIds: number[]; paIds: Record<number, number> },
    associadoId: number,
    usuarioId: number,
    quando: string,
    quantidades: [number, number][],
    condIndex = 0,
  ) {
    const paId = ped.paIds[associadoId];
    for (const [idx, qtd] of quantidades) {
      await q(
        'INSERT INTO pedido_item_quantidades (pedido_item_id, pedido_associado_id, quantidade) VALUES (?, ?, ?)',
        [ped.itemIds[idx], paId, qtd],
      );
    }
    await q(
      `UPDATE pedido_associados SET situacao = 'preenchido', data_acao = ?, usuario_acao_id = ?, condicao_pagamento_id = ?
        WHERE id = ?`,
      [quando, usuarioId, ped.condIds[condIndex] ?? null, paId],
    );
    await q(
      `INSERT INTO pedido_log (pedido_id, pedido_associado_id, acao, usuario_id, data_acao, observacao)
       VALUES (?, ?, 'preenchimento', ?, ?, ?)`,
      [ped.pedidoId, paId, usuarioId, quando, `${quantidades.length} item(ns) preenchido(s)`],
    );
  }

  async function rejeitar(ped: { pedidoId: number; paIds: Record<number, number> }, associadoId: number, usuarioId: number, quando: string) {
    const paId = ped.paIds[associadoId];
    await q(`UPDATE pedido_associados SET situacao = 'rejeitado', data_acao = ?, usuario_acao_id = ? WHERE id = ?`, [quando, usuarioId, paId]);
    await q(
      `INSERT INTO pedido_log (pedido_id, pedido_associado_id, acao, usuario_id, data_acao, observacao)
       VALUES (?, ?, 'rejeicao', ?, ?, 'Loja rejeitou o pedido')`,
      [ped.pedidoId, paId, usuarioId, quando],
    );
  }

  const todosSocios = [1, 2, 3, 4, 5];
  const todosFranq = [6, 7, 8, 9];

  // 19400 — Aberto e liberado: pronto para as lojas preencherem (fluxo principal de teste)
  const p1 = await criarPedido({
    nome: 'Rações e Suplementos - Campanha Setembro',
    situacao: 'liberado_loja',
    fornecedor_id: 1,
    fechamento: dia(5),
    marcadores: [PARCEIRO],
    grupos: [SOCIO, FRANQ],
    associados: [...todosSocios, ...todosFranq, 10],
    produtos: [[1, 8], [2, 8], [3, 6], [4, 5], [5, 10], [6, 7], [7, 5], [8, 12], [9, 12], [10, 4]],
    condicoes: [
      ['28dd', 0, 1500, SOCIO],
      ['30/60dd', 2.5, 3000, SOCIO],
      ['28dd', 3, 1500, FRANQ],
      ['À vista', 0, null, null],
    ],
    obs: '<p><b>Frete CIF</b> para pedidos acima do valor mínimo.</p><ul><li>Entrega no CD em até 15 dias</li><li>Preços válidos até o fechamento</li></ul>',
    avaliacao: true,
    economizado: true,
  });
  await preencher(p1, 2, USR.a2, dia(-1, '10:32:00'), [[0, 20], [1, 10], [4, 15]], 0);

  // 19401 — Em elaboração (ainda não liberado para as lojas)
  await criarPedido({
    nome: 'Sementes Safra Verão 26/27',
    situacao: 'em_elaboracao',
    fornecedor_id: 2,
    fechamento: dia(12, '12:00:00'),
    marcadores: [PROMOCAO],
    grupos: [SOCIO],
    associados: todosSocios,
    produtos: [[11, 6], [12, 5], [13, 8], [14, 8]],
    condicoes: [['Safra (30/04)', 4, 5000, SOCIO], ['30/60/90dd', 2, 3000, null]],
    criado_em: dia(-1, '14:00:00'),
  });

  // 19402 — Fechamento passou: aguardando fechamento/negociação da Central
  const p3 = await criarPedido({
    nome: 'Defensivos e Veterinária - Lote 08',
    situacao: 'aguardando_fechamento',
    fornecedor_id: 3,
    fechamento: dia(-1, '17:00:00'),
    marcadores: [URGENTE],
    grupos: [SOCIO],
    associados: [...todosSocios, 6, 7],
    produtos: [[15, 5], [16, 7], [17, 5], [18, 10], [19, 9], [20, 9]],
    condicoes: [['30dd', 0, 1000, null]],
    criado_em: dia(-8, '08:30:00'),
  });
  await preencher(p3, 1, USR.a1, dia(-4, '09:12:00'), [[0, 4], [1, 24], [4, 12]]);
  await preencher(p3, 3, USR.a3, dia(-3, '16:45:00'), [[0, 2], [2, 4], [5, 24]]);
  await preencher(p3, 6, USR.a6, dia(-2, '11:05:00'), [[1, 12], [3, 12], [4, 24]]);
  await rejeitar(p3, 7, USR.a7, dia(-2, '15:20:00'));

  // 19403 — Encerrado com volume, compra já efetuada (vai para Confirmar Recebimento)
  const p4 = await criarPedido({
    nome: 'Cercas e Ferramentas - Agosto',
    situacao: 'encerrado_com_volume',
    fornecedor_id: 4,
    fechamento: dia(-10, '18:00:00'),
    marcadores: [PARCEIRO],
    grupos: [FRANQ],
    associados: [...todosFranq, 1, 3],
    produtos: [[21, 6], [22, 6], [23, 5], [24, 8], [25, 8], [27, 10], [28, 10]],
    condicoes: [['28dd', 0, 800, null], ['30/60dd', 3, 2000, FRANQ]],
    compra: dia(-8, '10:00:00'),
    criado_em: dia(-20, '09:00:00'),
  });
  await preencher(p4, 6, USR.a6, dia(-14, '09:00:00'), [[0, 3], [2, 50], [5, 20]]);
  await preencher(p4, 7, USR.a7, dia(-13, '14:00:00'), [[1, 2], [3, 12], [6, 24]], 1);
  await preencher(p4, 1, USR.a1, dia(-12, '08:40:00'), [[0, 5], [4, 6]]);
  await rejeitar(p4, 3, USR.a3, dia(-12, '17:00:00'));
  await q(
    `INSERT INTO compras_fornecedor (pedido_id, fornecedor_id, email_envio, tipo_envio, apenas_cotacao, assunto, status_envio, data_envio, usuario_id)
     VALUES (?, 4, 'faturamento@ffminas.com.br', 'email_cadastrado', 0, 'Pedido de compra nº ${p4.pedidoId}', 'simulado', ?, ?)`,
    [p4.pedidoId, dia(-8, '10:00:00'), ADMIN],
  );
  await q(
    `INSERT INTO pedido_log (pedido_id, acao, usuario_id, data_acao, observacao)
     VALUES (?, 'compra_efetuada', ?, ?, 'Enviado para faturamento@ffminas.com.br')`,
    [p4.pedidoId, ADMIN, dia(-8, '10:00:00')],
  );
  for (const a of [6, 7, 1]) {
    await q(
      `INSERT INTO recebimentos (pedido_id, pedido_associado_id, data_compra, situacao_entrega, observacao, confirmado_por, confirmado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      a === 1
        ? [p4.pedidoId, p4.paIds[a], dia(-8).slice(0, 10), 'divergencia', 'Entrega parcial: faltaram 2 cavadeiras.', ADMIN, dia(-2, '15:00:00')]
        : [p4.pedidoId, p4.paIds[a], dia(-8).slice(0, 10), 'pendente', null, null, null],
    );
  }

  // 19404 — Encerrado com volume, aguardando envio da ordem de compra
  const p5 = await criarPedido({
    nome: 'Pet Shop - Cotação Distribuidora Nova',
    situacao: 'encerrado_com_volume',
    fornecedor_id: null,
    fornecedor_manual: 'Distribuidora Pet Nova (cotação)',
    fechamento: dia(-2, '12:00:00'),
    marcadores: [],
    associados: [1, 2, 6, 8],
    produtos: [[8, 10], [9, 10], [29, 5], [30, 5]],
    condicoes: [['21dd', 0, null, null]],
    criado_em: dia(-9, '10:00:00'),
  });
  await preencher(p5, 1, USR.a1, dia(-5, '10:00:00'), [[0, 6], [2, 20]]);
  await preencher(p5, 6, USR.a6, dia(-4, '10:00:00'), [[1, 4], [3, 12]]);

  console.log('\nBanco pronto! Acessos de teste:');
  console.log('  Administrador : admin@central.com        / admin123');
  console.log('  Loja (sócio)  : loja1001@boasafra.com    / loja123');
  console.log('  Loja (franq.) : varginha@agromais.com    / loja123');
  await conn.end();
}

main().catch((err) => {
  console.error('Falha ao preparar o banco:', err);
  process.exit(1);
});

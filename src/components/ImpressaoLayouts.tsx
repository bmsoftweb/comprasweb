import React from 'react';
import { PedidoCompleto } from '../types';
import { formatDataHora, formatMoeda, formatNumero } from '../utils/formatters';

/**
 * Layouts de impressão do pedido. Usam estilos inline (e não Tailwind) porque o
 * mesmo HTML é enviado no corpo do e-mail ao fornecedor/associados.
 */

export type LayoutImpressao = 'sintetico' | 'grade' | 'detalhado';

export const LAYOUTS: { id: LayoutImpressao; rotulo: string; descricao: string }[] = [
  { id: 'sintetico', rotulo: 'Agrupado por produtos', descricao: 'Sintético: ID, descrição, quantidade e valor total de cada item' },
  { id: 'grade', rotulo: 'Grade por associado', descricao: 'Lojas que preencheram × itens (somente o ID do item)' },
  { id: 'detalhado', rotulo: 'Detalhado por associado', descricao: 'Uma folha por loja, igual à impressão da própria loja' },
];

const s = {
  folha: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 11, color: '#1c1917' } as React.CSSProperties,
  titulo: { fontSize: 15, fontWeight: 700, margin: 0 } as React.CSSProperties,
  sub: { fontSize: 11, color: '#57534e', margin: '2px 0 0' } as React.CSSProperties,
  tabela: { width: '100%', borderCollapse: 'collapse', marginTop: 10 } as React.CSSProperties,
  th: { background: '#f5f5f4', border: '1px solid #d6d3d1', padding: '4px 6px', textAlign: 'left', fontSize: 10, fontWeight: 700 } as React.CSSProperties,
  td: { border: '1px solid #e7e5e4', padding: '4px 6px', fontSize: 10, verticalAlign: 'top' } as React.CSSProperties,
  num: { textAlign: 'right', whiteSpace: 'nowrap' } as React.CSSProperties,
  total: { background: '#fafaf9', fontWeight: 700 } as React.CSSProperties,
  bloco: { border: '1px solid #e7e5e4', borderRadius: 6, padding: '8px 10px', marginTop: 8 } as React.CSSProperties,
};

export interface CabecalhoPedido {
  id: number;
  nome: string;
  fornecedor_nome: string | null;
  data_fechamento: string;
  tipo_frete?: string | null;
  prazo_entrega?: string | null;
  local_entrega?: string | null;
}

const Cabecalho: React.FC<{ pedido: CabecalhoPedido; subtitulo: string; extra?: React.ReactNode }> = ({ pedido, subtitulo, extra }) => (
  <div style={{ borderBottom: '2px solid #1d4ed8', paddingBottom: 6 }}>
    <p style={s.titulo}>
      Pedido nº {pedido.id} — {pedido.nome}
    </p>
    <p style={s.sub}>
      {subtitulo} • Fornecedor: <b>{pedido.fornecedor_nome || '—'}</b> • Fechamento: {formatDataHora(pedido.data_fechamento)}
      {pedido.tipo_frete ? ` • Frete ${pedido.tipo_frete}` : ''}
      {pedido.prazo_entrega ? ` • Entrega: ${pedido.prazo_entrega}` : ''}
    </p>
    {pedido.local_entrega && <p style={s.sub}>Local de entrega: {pedido.local_entrega}</p>}
    {extra}
  </div>
);

const Observacao: React.FC<{ html: string | null | undefined; titulo: string }> = ({ html, titulo }) =>
  html ? (
    <div style={s.bloco}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#57534e', marginBottom: 2 }}>{titulo}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  ) : null;

function percentualDoPa(pedido: PedidoCompleto, paId: number) {
  return Number(pedido.associados.find((a) => a.id === paId)?.condicao_percentual || 0);
}

function codigoItem(it: { produto_bmsoft_id?: string | null; id?: number; produto_id: number | null }) {
  return it.produto_bmsoft_id || (it.produto_id ? `#${it.produto_id}` : `i${it.id}`);
}

// ---------------------------------------------------------------------
// 1. Agrupado por produtos (sintético)
// ---------------------------------------------------------------------
export const LayoutSintetico: React.FC<{ pedido: PedidoCompleto; observacao?: string | null; mensagem?: string }> = ({
  pedido,
  observacao,
  mensagem,
}) => {
  let totalGeral = 0;
  const linhas = pedido.itens
    .map((it) => {
      const qs = pedido.quantidades.filter((q) => q.pedido_item_id === it.id);
      const qtd = qs.reduce((t, q) => t + Number(q.quantidade), 0);
      const valor = qs.reduce((t, q) => t + Number(q.quantidade) * Number(it.preco_compra) * (1 + percentualDoPa(pedido, q.pedido_associado_id) / 100), 0);
      totalGeral += valor;
      return { it, qtd, valor };
    })
    .filter((l) => l.qtd > 0);

  return (
    <div style={s.folha}>
      <Cabecalho pedido={pedido} subtitulo="Agrupado por produtos" />
      {mensagem && <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{mensagem}</p>}
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={s.th}>ID</th>
            <th style={s.th}>GTIN</th>
            <th style={s.th}>Descrição</th>
            <th style={s.th}>Un.</th>
            <th style={{ ...s.th, ...s.num }}>Preço</th>
            <th style={{ ...s.th, ...s.num }}>Qtde total</th>
            <th style={{ ...s.th, ...s.num }}>Valor total</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ it, qtd, valor }) => (
            <tr key={it.id}>
              <td style={s.td}>{codigoItem(it)}</td>
              <td style={s.td}>{it.gtin || ''}</td>
              <td style={s.td}>{it.descricao}</td>
              <td style={s.td}>{it.unidade}</td>
              <td style={{ ...s.td, ...s.num }}>{formatMoeda(it.preco_compra)}</td>
              <td style={{ ...s.td, ...s.num }}>{formatNumero(qtd)}</td>
              <td style={{ ...s.td, ...s.num }}>{formatMoeda(valor)}</td>
            </tr>
          ))}
          {!linhas.length && (
            <tr>
              <td style={s.td} colSpan={7}>
                Nenhuma quantidade preenchida pelas lojas.
              </td>
            </tr>
          )}
          <tr style={s.total}>
            <td style={s.td} colSpan={5}>
              {linhas.length} item(ns) • {pedido.total_preenchidos} associado(s) preencheram
            </td>
            <td style={{ ...s.td, ...s.num }}>{formatNumero(linhas.reduce((t, l) => t + l.qtd, 0))}</td>
            <td style={{ ...s.td, ...s.num }}>{formatMoeda(totalGeral)}</td>
          </tr>
        </tbody>
      </table>
      <Observacao html={observacao} titulo="Observações" />
    </div>
  );
};

// ---------------------------------------------------------------------
// 2. Grade por associado (itens × lojas, só o ID do item)
// ---------------------------------------------------------------------
export const LayoutGrade: React.FC<{ pedido: PedidoCompleto }> = ({ pedido }) => {
  const lojas = pedido.associados.filter((a) => a.situacao === 'preenchido');
  const itens = pedido.itens.filter((it) => pedido.quantidades.some((q) => q.pedido_item_id === it.id));
  const qtd = (itemId: number, paId: number) =>
    Number(pedido.quantidades.find((q) => q.pedido_item_id === itemId && q.pedido_associado_id === paId)?.quantidade || 0);

  return (
    <div style={s.folha}>
      <Cabecalho pedido={pedido} subtitulo="Grade por associado" />
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={s.th}>ID item</th>
            {lojas.map((l) => (
              <th key={l.id} style={{ ...s.th, ...s.num }} title={l.associado_nome}>
                {l.associado_bmsoft_id}
                <div style={{ fontWeight: 400, fontSize: 9, color: '#78716c', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.associado_nome}
                </div>
              </th>
            ))}
            <th style={{ ...s.th, ...s.num }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((it) => (
            <tr key={it.id}>
              <td style={s.td}>{codigoItem(it)}</td>
              {lojas.map((l) => {
                const q = qtd(it.id!, l.id!);
                return (
                  <td key={l.id} style={{ ...s.td, ...s.num, color: q ? '#1c1917' : '#d6d3d1' }}>
                    {q ? formatNumero(q) : '·'}
                  </td>
                );
              })}
              <td style={{ ...s.td, ...s.num, fontWeight: 700 }}>{formatNumero(lojas.reduce((t, l) => t + qtd(it.id!, l.id!), 0))}</td>
            </tr>
          ))}
          <tr style={s.total}>
            <td style={s.td}>Volume (R$)</td>
            {lojas.map((l) => (
              <td key={l.id} style={{ ...s.td, ...s.num }}>
                {formatMoeda(l.volume)}
              </td>
            ))}
            <td style={{ ...s.td, ...s.num }}>{formatMoeda(pedido.volume)}</td>
          </tr>
        </tbody>
      </table>
      {!lojas.length && <p style={s.sub}>Nenhum associado preencheu este pedido.</p>}
    </div>
  );
};

// ---------------------------------------------------------------------
// 3. Detalhado por associado (mesmo layout da impressão da loja)
// ---------------------------------------------------------------------
export interface LinhaDetalhe {
  chave: number | string;
  codigo: string;
  descricao: string;
  unidade: string;
  qtd_embalagem: number | null;
  preco: number;
  quantidade: number;
}

export const FolhaAssociado: React.FC<{
  pedido: CabecalhoPedido;
  associado: string;
  condicao: string | null;
  situacao?: string;
  linhas: LinhaDetalhe[];
  observacao?: string | null;
  quebraPagina?: boolean;
  somentePreenchidos?: boolean;
}> = ({ pedido, associado, condicao, situacao, linhas, observacao, quebraPagina, somentePreenchidos = true }) => {
  const visiveis = somentePreenchidos ? linhas.filter((l) => l.quantidade > 0) : linhas;
  const total = linhas.reduce((t, l) => t + l.quantidade * l.preco, 0);
  return (
    <div style={{ ...s.folha, marginBottom: 18 }} className={quebraPagina ? 'quebra-pagina' : undefined}>
      <Cabecalho
        pedido={pedido}
        subtitulo="Pedido do associado"
        extra={
          <p style={{ ...s.sub, color: '#1c1917' }}>
            Associado: <b>{associado}</b> • Condição de pagamento: <b>{condicao || '—'}</b>
            {situacao ? ` • ${situacao}` : ''}
          </p>
        }
      />
      <table style={s.tabela}>
        <thead>
          <tr>
            <th style={s.th}>ID</th>
            <th style={s.th}>Descrição</th>
            <th style={s.th}>Un.</th>
            <th style={{ ...s.th, ...s.num }}>Qtde múltiplo</th>
            <th style={{ ...s.th, ...s.num }}>Preço</th>
            <th style={{ ...s.th, ...s.num }}>Quantidade</th>
            <th style={{ ...s.th, ...s.num }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) => (
            <tr key={l.chave}>
              <td style={s.td}>{l.codigo}</td>
              <td style={s.td}>{l.descricao}</td>
              <td style={s.td}>{l.unidade}</td>
              <td style={{ ...s.td, ...s.num }}>{l.qtd_embalagem ? formatNumero(l.qtd_embalagem) : ''}</td>
              <td style={{ ...s.td, ...s.num }}>{formatMoeda(l.preco)}</td>
              <td style={{ ...s.td, ...s.num }}>{l.quantidade ? formatNumero(l.quantidade) : ''}</td>
              <td style={{ ...s.td, ...s.num }}>{l.quantidade ? formatMoeda(l.quantidade * l.preco) : ''}</td>
            </tr>
          ))}
          {!visiveis.length && (
            <tr>
              <td style={s.td} colSpan={7}>
                Nenhum item preenchido.
              </td>
            </tr>
          )}
          <tr style={s.total}>
            <td style={s.td} colSpan={5}>
              {linhas.filter((l) => l.quantidade > 0).length} item(ns)
            </td>
            <td style={{ ...s.td, ...s.num }}>{formatNumero(linhas.reduce((t, l) => t + l.quantidade, 0))}</td>
            <td style={{ ...s.td, ...s.num }}>{formatMoeda(total)}</td>
          </tr>
        </tbody>
      </table>
      <Observacao html={observacao} titulo="Observações" />
    </div>
  );
};

export const LayoutDetalhado: React.FC<{ pedido: PedidoCompleto }> = ({ pedido }) => {
  const lojas = pedido.associados.filter((a) => a.situacao === 'preenchido');
  if (!lojas.length) {
    return (
      <div style={s.folha}>
        <Cabecalho pedido={pedido} subtitulo="Detalhado por associado" />
        <p style={s.sub}>Nenhum associado preencheu este pedido.</p>
      </div>
    );
  }
  return (
    <div>
      {lojas.map((l, i) => {
        const perc = Number(l.condicao_percentual || 0);
        return (
          <FolhaAssociado
            key={l.id}
            pedido={pedido}
            associado={`${l.associado_bmsoft_id} — ${l.associado_nome}`}
            condicao={l.condicao_nome ? `${l.condicao_nome}${perc ? ` (+${formatNumero(perc, 2)}%)` : ''}` : null}
            situacao={l.data_acao ? `Preenchido em ${formatDataHora(l.data_acao)} por ${l.usuario_acao_nome || '—'}` : undefined}
            quebraPagina={i < lojas.length - 1}
            observacao={pedido.observacao_associado}
            linhas={pedido.itens.map((it) => ({
              chave: it.id!,
              codigo: codigoItem(it),
              descricao: it.descricao,
              unidade: it.unidade,
              qtd_embalagem: it.qtd_embalagem,
              preco: Number(it.preco_compra) * (1 + perc / 100),
              quantidade: Number(pedido.quantidades.find((q) => q.pedido_item_id === it.id && q.pedido_associado_id === l.id)?.quantidade || 0),
            }))}
          />
        );
      })}
    </div>
  );
};

export const LayoutPedido: React.FC<{ layout: LayoutImpressao; pedido: PedidoCompleto; observacao?: string | null; mensagem?: string }> = ({
  layout,
  pedido,
  observacao,
  mensagem,
}) =>
  layout === 'grade' ? (
    <LayoutGrade pedido={pedido} />
  ) : layout === 'detalhado' ? (
    <LayoutDetalhado pedido={pedido} />
  ) : (
    <LayoutSintetico pedido={pedido} observacao={observacao} mensagem={mensagem} />
  );

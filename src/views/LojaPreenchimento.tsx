import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Download,
  PiggyBank,
  Printer,
  Save,
  Search,
  Star,
  Truck,
  Undo2,
  X,
} from 'lucide-react';
import { PedidoLoja } from '../types';
import { api, urlArquivo } from '../services/api';
import { Alerta, Botao, Carregando, ImagemHover, MarcadorTag, Modal, Pill, SituacaoBadge, TD, TH, useApp } from '../components/ui';
import { TextoRico } from '../components/RichTextEditor';
import { FolhaAssociado } from '../components/ImpressaoLayouts';
import { AreaImpressao } from './PedidoAcoes';
import { INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { faltam, formatDataHora, formatMoeda, formatNumero } from '../utils/formatters';

export const LojaPreenchimento: React.FC<{ pedidoId: number }> = ({ pedidoId }) => {
  const { navegar, toast, confirmar, usuario, refreshToken } = useApp();
  const [pedido, setPedido] = useState<PedidoLoja | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [quantidades, setQuantidades] = useState<Record<number, string>>({});
  const [condicaoId, setCondicaoId] = useState<number | null>(null);
  const [busca, setBusca] = useState('');
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [somentePreenchidos, setSomentePreenchidos] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [rejeitando, setRejeitando] = useState(false);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const inputs = useRef<Map<number, HTMLInputElement>>(new Map());

  const aplicar = (p: PedidoLoja) => {
    setPedido(p);
    setQuantidades(Object.fromEntries(p.itens.map((it) => [it.id, it.quantidade ? String(it.quantidade) : ''])));
    setCondicaoId(p.participacao.condicao_pagamento_id ?? (p.condicoes.length === 1 ? p.condicoes[0].id! : null));
  };

  const carregar = () =>
    api
      .get<PedidoLoja>(`/loja/pedidos/${pedidoId}`)
      .then((p) => {
        aplicar(p);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, [pedidoId, refreshToken]);

  const condicao = pedido?.condicoes.find((c) => c.id === condicaoId) || null;
  const perc = Number(condicao?.percentual || 0);
  const precoFinal = (preco: number | null) => Number(preco || 0) * (1 + perc / 100);
  const qtd = (id: number) => {
    const n = Number(String(quantidades[id] || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const totais = useMemo(() => {
    if (!pedido) return { total: 0, itens: 0, economizado: 0 };
    let total = 0, itens = 0, economizado = 0;
    for (const it of pedido.itens) {
      const q = qtd(it.id);
      if (!q) continue;
      itens++;
      total += q * precoFinal(it.preco_compra);
      if (it.preco_estimado && Number(it.preco_estimado) > precoFinal(it.preco_compra)) {
        economizado += q * (Number(it.preco_estimado) - precoFinal(it.preco_compra));
      }
    }
    return { total, itens, economizado };
  }, [pedido, quantidades, perc]);

  const alterado = useMemo(
    () =>
      Boolean(pedido) &&
      (pedido!.itens.some((it) => qtd(it.id) !== Number(it.quantidade || 0)) ||
        (pedido!.condicoes.length > 0 && condicaoId !== pedido!.participacao.condicao_pagamento_id)),
    [pedido, quantidades, condicaoId],
  );

  if (erro) {
    return (
      <div className="p-6 space-y-3">
        <Alerta>{erro}</Alerta>
        <Botao icone={<ArrowLeft className="w-3.5 h-3.5" />} onClick={() => navegar('loja-abertos')}>
          Voltar
        </Botao>
      </div>
    );
  }
  if (!pedido) return <Carregando texto="Carregando pedido…" />;

  const editavel = pedido.pode_preencher;
  const f = faltam(pedido.data_fechamento);
  const termo = busca.trim().toLowerCase();
  const sugestoes = termo
    ? pedido.itens.filter((it) => it.descricao.toLowerCase().includes(termo) || (it.gtin || '').includes(termo) || (it.codigo || '').toLowerCase() === termo).slice(0, 8)
    : [];
  const itensVisiveis = pedido.itens.filter((it) => (!somentePreenchidos || qtd(it.id) > 0) && (!termo || sugestoes.length === 0 || it.descricao.toLowerCase().includes(termo) || (it.gtin || '').includes(termo) || (it.codigo || '').toLowerCase() === termo));

  const irParaItem = (id: number) => {
    setSugestoesAbertas(false);
    setBusca('');
    setDestaque(id);
    window.setTimeout(() => {
      const el = inputs.current.get(id);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    }, 30);
    window.setTimeout(() => setDestaque((d) => (d === id ? null : d)), 2500);
  };

  const gravar = async () => {
    setErroGravar(null);
    setGravando(true);
    try {
      const p = await api.put<PedidoLoja>(`/loja/pedidos/${pedido.id}`, {
        condicao_pagamento_id: condicaoId,
        quantidades: Object.fromEntries(pedido.itens.map((it) => [it.id, qtd(it.id)])),
      });
      aplicar(p);
      toast('Pedido gravado. A Central já pode ver o seu preenchimento.');
    } catch (e: any) {
      setErroGravar(e.message);
    } finally {
      setGravando(false);
    }
  };

  const descartar = async () => {
    if (alterado && !(await confirmar({ titulo: 'Descartar alterações', mensagem: 'Descartar as quantidades digitadas e voltar ao que está gravado?', confirmar: 'Descartar', perigo: true }))) return;
    aplicar(pedido);
    setErroGravar(null);
    toast('Alterações descartadas.');
  };

  const minimo = condicao?.valor_minimo ? Number(condicao.valor_minimo) : null;
  const abaixoMinimo = minimo !== null && totais.total > 0 && totais.total < minimo;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Cabeçalho */}
      <div className="shrink-0 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <button onClick={() => navegar('loja-abertos')} className="text-[11px] text-stone-400 hover:text-blue-600 flex items-center gap-1 cursor-pointer">
              <ArrowLeft className="w-3 h-3" /> Pedidos disponíveis
            </button>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="font-mono text-xs text-stone-400">nº {pedido.id}</span>
              <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{pedido.nome}</h3>
              {pedido.marcadores.map((m) => (
                <MarcadorTag key={m.id} marcador={m} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-stone-600 dark:text-stone-300">
              <span className="flex items-center gap-1">
                <Truck className="w-3.5 h-3.5 text-stone-400" /> {pedido.fornecedor_nome || '—'}
              </span>
              <span className="flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5 text-stone-400" /> Fechamento {formatDataHora(pedido.data_fechamento)}
              </span>
              {!f.vencido && <span className={`font-bold ${f.urgente ? 'text-rose-600' : 'text-blue-700 dark:text-blue-400'}`}>Faltam {f.texto}</span>}
              {pedido.tipo_frete && <span>Frete {pedido.tipo_frete}</span>}
              {pedido.prazo_entrega && <span>Entrega: {pedido.prazo_entrega}</span>}
            </div>
          </div>

          <div className="w-full sm:w-72">
            <label className={LABEL_CLASS}>Condição de pagamento</label>
            {pedido.condicoes.length ? (
              <select
                value={condicaoId ?? ''}
                onChange={(e) => setCondicaoId(e.target.value ? Number(e.target.value) : null)}
                disabled={!editavel}
                required
                className={`${INPUT_CLASS} w-full mt-1`}
              >
                <option value="">— Escolha —</option>
                {pedido.condicoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.condicao_pagamento}
                    {Number(c.percentual) ? ` (+${formatNumero(c.percentual, 2)}%)` : ''}
                    {c.valor_minimo ? ` • mín. ${formatMoeda(c.valor_minimo)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs mt-1 text-stone-500">Preço conforme cada item</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {!editavel && (
            <SituacaoBadge situacao={pedido.situacao} />
          )}
          {pedido.participacao.situacao === 'preenchido' && (
            <Pill cor="verde">
              Gravado em {formatDataHora(pedido.participacao.data_acao)} por {pedido.participacao.usuario_acao_nome}
            </Pill>
          )}
          {pedido.participacao.situacao === 'rejeitado' && (
            <Pill cor="vermelho">
              Rejeitado em {formatDataHora(pedido.participacao.data_acao)} por {pedido.participacao.usuario_acao_nome}
            </Pill>
          )}
          {pedido.arquivos.map((a) => (
            <a key={a.id} href={urlArquivo(pedido.id, a.id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline">
              <Download className="w-3 h-3" /> {a.nome_arquivo}
            </a>
          ))}
        </div>
        {pedido.observacao_associado && (
          <details className="mt-2 group">
            <summary className="text-[11px] font-semibold text-stone-500 cursor-pointer select-none">Observações da Central</summary>
            <TextoRico html={pedido.observacao_associado} className="mt-1 p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 text-stone-700 dark:text-stone-200" />
          </details>
        )}
      </div>

      {/* Barra de busca */}
      <div className="shrink-0 px-4 sm:px-6 py-2.5 bg-stone-50 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setSugestoesAbertas(true);
            }}
            onFocus={() => setSugestoesAbertas(true)}
            onBlur={() => window.setTimeout(() => setSugestoesAbertas(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && sugestoes[0]) irParaItem(sugestoes[0].id);
              if (e.key === 'Escape') setBusca('');
            }}
            placeholder="Buscar produto pela descrição (ou GTIN)…"
            className={`${INPUT_CLASS} w-full pl-9 pr-8 bg-white dark:bg-stone-900`}
          />
          {busca && (
            <button onClick={() => setBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {sugestoesAbertas && sugestoes.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl py-1 max-h-72 overflow-auto">
              {sugestoes.map((s) => (
                <button
                  key={s.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => irParaItem(s.id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-stone-800 flex items-center gap-2 cursor-pointer"
                >
                  <span className="font-mono text-stone-400 w-14 shrink-0">{s.codigo || '—'}</span>
                  <span className="flex-1 truncate">{s.descricao}</span>
                  <span className="text-stone-500">{formatMoeda(precoFinal(s.preco_compra))}</span>
                  {qtd(s.id) > 0 && <span className="text-emerald-600 font-bold">{formatNumero(qtd(s.id))}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 cursor-pointer">
          <input type="checkbox" checked={somentePreenchidos} onChange={(e) => setSomentePreenchidos(e.target.checked)} />
          Somente itens com quantidade
        </label>
        <span className="text-xs text-stone-400">{pedido.itens.length} item(ns)</span>
        <Botao className="ml-auto" icone={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()}>
          Imprimir pedido
        </Botao>
      </div>

      {/* Itens */}
      <div className="flex-1 overflow-auto min-h-0 bg-white dark:bg-stone-900">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH className="w-8" />
              <TH>ID</TH>
              <TH className="min-w-64">Descrição</TH>
              <TH>Unidade</TH>
              <TH className="text-right">Preço</TH>
              <TH className="text-right">Qtde múltiplo</TH>
              <TH className="text-right w-36">Quantidade</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </thead>
          <tbody>
            {itensVisiveis.map((it, idx) => {
              const q = qtd(it.id);
              const multiplo = Number(it.qtd_embalagem || 0);
              const foraMultiplo = multiplo > 1 && q > 0 && Math.abs(q / multiplo - Math.round(q / multiplo)) > 1e-9;
              const disponivelLogistica = it.limite_logistica !== null ? Math.max(0, Number(it.limite_logistica) - it.quantidade_outras_lojas) : null;
              const acimaMax = it.limite_maximo !== null && q > Number(it.limite_maximo);
              const acimaLog = disponivelLogistica !== null && q > disponivelLogistica;
              return (
                <tr
                  key={it.id}
                  className={`transition-colors ${
                    destaque === it.id ? 'bg-yellow-100 dark:bg-yellow-900/30' : q > 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-white dark:bg-stone-900'
                  } hover:bg-stone-50 dark:hover:bg-stone-800`}
                >
                  <TD>
                    <ImagemHover url={it.imagem_url} descricao={it.descricao} />
                  </TD>
                  <TD className="font-mono text-stone-500">{it.codigo || '—'}</TD>
                  <TD>
                    <div className="font-medium text-stone-900 dark:text-stone-100">{it.descricao}</div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-stone-400 mt-0.5">
                      {it.gtin && <span className="font-mono">GTIN {it.gtin}</span>}
                      {it.limite_maximo !== null && <span className={acimaMax ? 'text-rose-600 font-bold' : ''}>Máx: {formatNumero(it.limite_maximo)}</span>}
                      {disponivelLogistica !== null && <span className={acimaLog ? 'text-rose-600 font-bold' : ''}>Logística: {formatNumero(disponivelLogistica)} disponível</span>}
                    </div>
                  </TD>
                  <TD>{it.unidade}</TD>
                  <TD className="text-right whitespace-nowrap">
                    <div className="font-semibold">{formatMoeda(precoFinal(it.preco_compra))}</div>
                    {pedido.mostrar_valor_economizado === 1 && it.preco_estimado && Number(it.preco_estimado) > precoFinal(it.preco_compra) && (
                      <div className="text-[10px] text-stone-400 line-through">{formatMoeda(it.preco_estimado)}</div>
                    )}
                  </TD>
                  <TD className="text-right">{multiplo ? formatNumero(multiplo) : '—'}</TD>
                  <TD className="text-right">
                    <input
                      ref={(el) => {
                        if (el) inputs.current.set(it.id, el);
                        else inputs.current.delete(it.id);
                      }}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={multiplo > 1 ? multiplo : 'any'}
                      value={quantidades[it.id] ?? ''}
                      disabled={!editavel}
                      onChange={(e) => setQuantidades((qs) => ({ ...qs, [it.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          const prox = itensVisiveis[idx + 1];
                          if (prox) inputs.current.get(prox.id)?.focus();
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          const ant = itensVisiveis[idx - 1];
                          if (ant) inputs.current.get(ant.id)?.focus();
                        }
                      }}
                      placeholder="0"
                      className={`${INPUT_CLASS} w-28 text-right font-bold text-sm ${acimaMax || acimaLog ? '!bg-rose-50 dark:!bg-rose-950/40' : ''}`}
                    />
                    {foraMultiplo && <div className="text-[10px] text-amber-600 mt-0.5">não é múltiplo de {formatNumero(multiplo)}</div>}
                  </TD>
                  <TD className="text-right font-semibold whitespace-nowrap">{q ? formatMoeda(q * precoFinal(it.preco_compra)) : ''}</TD>
                </tr>
              );
            })}
            {!itensVisiveis.length && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-stone-400">
                  Nenhum item para exibir.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rodapé */}
      <div className="shrink-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-4 sm:px-6 py-3 space-y-2">
        {erroGravar && <Alerta>{erroGravar}</Alerta>}
        {!editavel && (
          <Alerta tipo="aviso">
            {pedido.situacao === 'indisponivel'
              ? 'A Central tornou este pedido indisponível no momento. O preenchimento está bloqueado.'
              : 'O prazo de preenchimento deste pedido terminou. Ele está somente para consulta.'}
          </Alerta>
        )}
        {pedido.solicitar_avaliacao_compra === 1 && pedido.participacao.situacao === 'preenchido' && (
          <Avaliacao pedido={pedido} onGravada={carregar} />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-stone-500">{totais.itens} item(ns) •</span>
            <span className="text-lg font-bold text-stone-900 dark:text-stone-100">{formatMoeda(totais.total)}</span>
          </div>
          {minimo !== null && (
            <span className={`text-[11px] font-semibold ${abaixoMinimo ? 'text-rose-600' : 'text-emerald-600'}`}>
              {abaixoMinimo ? `Faltam ${formatMoeda(minimo - totais.total)} para o mínimo de ${formatMoeda(minimo)}` : `Mínimo de ${formatMoeda(minimo)} atingido`}
            </span>
          )}
          {pedido.mostrar_valor_economizado === 1 && totais.economizado > 0 && (
            <Pill cor="verde">
              <PiggyBank className="w-3 h-3" /> Você economiza {formatMoeda(totais.economizado)}
            </Pill>
          )}
          {editavel && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Botao
                variante="fantasma"
                className="!text-rose-600"
                icone={<Ban className="w-3.5 h-3.5" />}
                onClick={() => setRejeitando(true)}
                disabled={gravando}
              >
                Rejeitar pedido
              </Botao>
              <Botao icone={<Undo2 className="w-3.5 h-3.5" />} onClick={descartar} disabled={gravando || !alterado}>
                Descartar
              </Botao>
              <Botao variante="primario" icone={<Save className="w-3.5 h-3.5" />} onClick={gravar} carregando={gravando}>
                Gravar
              </Botao>
            </div>
          )}
        </div>
      </div>

      {rejeitando && (
        <RejeitarModal
          pedido={pedido}
          onFechar={() => setRejeitando(false)}
          onRejeitado={(p) => {
            setRejeitando(false);
            aplicar(p);
            toast('Pedido rejeitado. A Central foi informada.');
          }}
        />
      )}

      <AreaImpressao>
        <FolhaAssociado
          pedido={pedido}
          associado={usuario.associado_nome || ''}
          condicao={condicao ? `${condicao.condicao_pagamento}${perc ? ` (+${formatNumero(perc, 2)}%)` : ''}` : null}
          observacao={pedido.observacao_associado}
          somentePreenchidos={totais.itens > 0}
          linhas={pedido.itens.map((it) => ({
            chave: it.id,
            codigo: it.codigo || '',
            descricao: it.descricao,
            unidade: it.unidade,
            qtd_embalagem: it.qtd_embalagem,
            preco: precoFinal(it.preco_compra),
            quantidade: qtd(it.id),
          }))}
        />
      </AreaImpressao>
    </div>
  );
};

const RejeitarModal: React.FC<{ pedido: PedidoLoja; onFechar: () => void; onRejeitado: (p: PedidoLoja) => void }> = ({ pedido, onFechar, onRejeitado }) => {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <Modal
      titulo="Rejeitar pedido"
      subtitulo={`Pedido nº ${pedido.id} — ${pedido.nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao
            variante="perigo"
            carregando={enviando}
            onClick={async () => {
              setEnviando(true);
              try {
                onRejeitado(await api.post<PedidoLoja>(`/loja/pedidos/${pedido.id}/rejeitar`, { motivo }));
              } catch (e: any) {
                setErro(e.message);
                setEnviando(false);
              }
            }}
          >
            Rejeitar pedido
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        {erro && <Alerta>{erro}</Alerta>}
        <p className="text-xs text-stone-600 dark:text-stone-300">
          Sua loja não participará deste pedido. {pedido.participacao.situacao === 'preenchido' && <b>As quantidades já gravadas serão apagadas. </b>}
          A data, o horário e o seu usuário ficam registrados. Enquanto o pedido estiver aberto, você pode voltar e preencher novamente.
        </p>
        <div className={LABEL_CLASS}>Motivo (opcional)</div>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Ex.: Estoque suficiente para o período." className={`${INPUT_CLASS} w-full`} />
      </div>
    </Modal>
  );
};

const Avaliacao: React.FC<{ pedido: PedidoLoja; onGravada: () => void }> = ({ pedido, onGravada }) => {
  const { toast } = useApp();
  const [nota, setNota] = useState(pedido.participacao.avaliacao_nota || 0);
  const [comentario, setComentario] = useState(pedido.participacao.avaliacao_comentario || '');
  const [hover, setHover] = useState(0);
  const jaAvaliado = Boolean(pedido.participacao.avaliacao_nota);

  return (
    <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
      <span className="text-xs font-semibold text-stone-700 dark:text-stone-200">Avalie o processo de compra:</span>
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onMouseEnter={() => setHover(n)} onClick={() => setNota(n)} className="p-0.5 cursor-pointer" title={`${n} estrela(s)`}>
            <Star className={`w-4 h-4 ${(hover || nota) >= n ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} />
          </button>
        ))}
      </div>
      <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} placeholder="Comentário (opcional)" className={`${INPUT_CLASS} flex-1 min-w-48 bg-white dark:bg-stone-900`} />
      <Botao
        disabled={!nota}
        onClick={async () => {
          try {
            await api.post(`/loja/pedidos/${pedido.id}/avaliacao`, { nota, comentario });
            toast('Obrigado pela avaliação!');
            onGravada();
          } catch (e: any) {
            toast(e.message, 'erro');
          }
        }}
      >
        {jaAvaliado ? 'Atualizar avaliação' : 'Enviar avaliação'}
      </Botao>
    </div>
  );
};

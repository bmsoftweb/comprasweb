import React, { useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Clock, Search, Truck, X } from 'lucide-react';
import { PedidoLojaResumo } from '../types';
import { api, qs } from '../services/api';
import { Carregando, MarcadorTag, Pill, SituacaoBadge, TD, TH, useApp, Vazio } from '../components/ui';
import { INPUT_CLASS } from '../utils/formStyles';
import { faltam, formatDataHora, formatMoeda } from '../utils/formatters';

/** Lista de pedidos da loja, no mesmo layout da lista de pedidos da Central */
export const LojaPedidos: React.FC<{ grupo: 'abertos' | 'historico' }> = ({ grupo }) => {
  const { navegar, refreshToken } = useApp();
  const [lista, setLista] = useState<PedidoLojaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    setCarregando(true);
    api
      .get<PedidoLojaResumo[]>(`/loja/pedidos${qs({ grupo: grupo === 'historico' ? 'historico' : undefined })}`)
      .then((l) => {
        setLista(l);
        setErro(null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [grupo, refreshToken]);

  // A contagem "Faltam" é recalculada a cada minuto
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter(
    (p) =>
      !termo ||
      String(p.id).includes(termo) ||
      p.nome.toLowerCase().includes(termo) ||
      (p.fornecedor_nome || '').toLowerCase().includes(termo),
  );
  const meuVolume = visiveis.reduce((s, p) => s + Number(p.meu_volume), 0);
  const pendentes = visiveis.filter((p) => p.minha_situacao === 'pendente').length;

  const minhaSituacao = (p: PedidoLojaResumo) =>
    p.minha_situacao === 'preenchido' ? (
      <Pill cor="verde" title={formatDataHora(p.data_acao)}>
        Preenchido
      </Pill>
    ) : p.minha_situacao === 'rejeitado' ? (
      <Pill cor="vermelho" title={formatDataHora(p.data_acao)}>
        Rejeitado
      </Pill>
    ) : (
      <Pill cor="ambar">{grupo === 'abertos' ? 'Aguardando preenchimento' : 'Não respondido'}</Pill>
    );

  const colunas = 8;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500 dark:text-stone-400">
          {carregando
            ? 'Carregando…'
            : `${visiveis.length} pedido(s)${grupo === 'abertos' ? ` • ${pendentes} aguardando seu preenchimento` : ''} • seu volume ${formatMoeda(meuVolume)}`}
        </div>
        <div className="flex items-center gap-2.5">
          <div className="relative w-60 sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, nome ou fornecedor…"
              className={`${INPUT_CLASS} w-full pl-9 pr-8`}
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {erro && (
        <div className="mx-4 mt-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {erro}
        </div>
      )}

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH className="w-20">Código</TH>
              <TH>Pedido</TH>
              <TH>Fechamento</TH>
              {grupo === 'abertos' ? <TH>Faltam</TH> : <TH>Entrega</TH>}
              <TH>Situação</TH>
              <TH>Minha situação</TH>
              <TH className="text-right">Meu volume</TH>
              <TH className="w-10" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={colunas}>
                  <Carregando texto="Carregando pedidos…" />
                </td>
              </tr>
            )}
            {!carregando && !visiveis.length && (
              <tr>
                <td colSpan={colunas}>
                  <Vazio
                    texto={
                      busca
                        ? 'Nenhum pedido corresponde à busca'
                        : grupo === 'abertos'
                        ? 'Nenhum pedido disponível para a sua loja no momento'
                        : 'Nenhum pedido no histórico'
                    }
                  />
                </td>
              </tr>
            )}
            {!carregando &&
              visiveis.map((p) => {
                const f = faltam(p.data_fechamento);
                return (
                  <tr
                    key={p.id}
                    onClick={() => navegar('loja-pedido', { id: p.id })}
                    className="cursor-pointer transition-colors bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 group"
                    title="Clique para abrir o pedido"
                  >
                    <TD className="font-mono font-semibold text-stone-900 dark:text-stone-100">{p.id}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-stone-900 dark:text-stone-100">{p.nome}</span>
                        {p.marcadores.map((m) => (
                          <MarcadorTag key={m.id} marcador={m} />
                        ))}
                      </div>
                      <div className="text-[11px] text-stone-400 flex items-center gap-1 mt-0.5">
                        <Truck className="w-3 h-3" />
                        {p.fornecedor_nome || 'Fornecedor não definido'} • {p.total_itens} item(ns)
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">{formatDataHora(p.data_fechamento)}</TD>
                    {grupo === 'abertos' ? (
                      <TD className="whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            f.vencido ? 'text-stone-400' : f.urgente ? 'text-rose-600 dark:text-rose-400' : 'text-stone-700 dark:text-stone-200'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {f.texto}
                        </span>
                      </TD>
                    ) : (
                      <TD>
                        {p.situacao_entrega === 'confirmado' ? (
                          <Pill cor="verde">Entregue</Pill>
                        ) : p.situacao_entrega === 'divergencia' ? (
                          <Pill cor="vermelho">Entregue com divergência</Pill>
                        ) : p.situacao_entrega === 'pendente' ? (
                          <Pill cor="ambar">Aguardando entrega</Pill>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </TD>
                    )}
                    <TD>
                      {grupo === 'historico' && p.compra_efetuada ? (
                        <Pill cor="azul">Compra efetuada</Pill>
                      ) : (
                        <SituacaoBadge situacao={p.situacao} />
                      )}
                    </TD>
                    <TD>{minhaSituacao(p)}</TD>
                    <TD className="text-right font-semibold whitespace-nowrap">{formatMoeda(p.meu_volume)}</TD>
                    <TD className="text-right">
                      <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-blue-600 inline" />
                    </TD>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

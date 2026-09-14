import React, { useCallback, useEffect, useState } from 'react';
import { Search, X, Truck, Clock, FilePlus2, AlertCircle } from 'lucide-react';
import { PedidoResumo } from '../types';
import { api, qs } from '../services/api';
import { Andamento, Botao, Carregando, MarcadorTag, MenuContexto, Pill, SituacaoBadge, TD, TH, useApp, Vazio } from '../components/ui';
import { INPUT_CLASS } from '../utils/formStyles';
import { faltam, formatDataHora, formatMoeda } from '../utils/formatters';
import { usePedidoAcoes } from './PedidoAcoes';

interface Props {
  grupo: 'abertos' | 'encerrados';
  selecionado: { id: number; nome: string } | null;
  onSelecionar: (p: { id: number; nome: string } | null) => void;
}

export const PedidosLista: React.FC<Props> = ({ grupo, selecionado, onSelecionar }) => {
  const { usuario, navegar, refreshToken } = useApp();
  const ehAdmin = usuario.tipo === 'administrador';
  const [pedidos, setPedidos] = useState<PedidoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [, setTick] = useState(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPedidos(await api.get<PedidoResumo[]>(`/pedidos${qs({ grupo, busca })}`));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [grupo, busca]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  // A contagem "Faltam" é recalculada a cada minuto
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 60000);
    return () => window.clearInterval(t);
  }, []);

  const { itensAbertos, itensEncerrados, modais } = usePedidoAcoes(carregar);

  const volumeTotal = pedidos.reduce((s, p) => s + Number(p.volume), 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {modais}
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500 dark:text-stone-400">
          {carregando ? 'Carregando…' : `${pedidos.length} pedido(s) • volume ${formatMoeda(volumeTotal)}`}
        </div>
        <div className="flex items-center gap-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusca(buscaInput.trim());
            }}
            className="relative w-60 sm:w-80"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="text"
              value={buscaInput}
              onChange={(e) => setBuscaInput(e.target.value)}
              placeholder={grupo === 'encerrados' ? 'Buscar por nome do pedido ou fornecedor…' : 'Buscar por código, nome ou fornecedor…'}
              className={`${INPUT_CLASS} w-full pl-9 pr-8`}
            />
            {buscaInput && (
              <button
                type="button"
                onClick={() => {
                  setBuscaInput('');
                  setBusca('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>
          {ehAdmin && grupo === 'abertos' && (
            <Botao variante="primario" icone={<FilePlus2 className="w-3.5 h-3.5" />} onClick={() => navegar('novo')}>
              Novo Pedido
            </Botao>
          )}
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
              <TH>{grupo === 'abertos' ? 'Pedido' : 'Nome do pedido'}</TH>
              {grupo === 'encerrados' && <TH>Comprador</TH>}
              <TH>Fechamento</TH>
              {grupo === 'abertos' && <TH>Faltam</TH>}
              <TH>Situação</TH>
              <TH className="text-right">Volume</TH>
              <TH>Andamento</TH>
              {ehAdmin && <TH className="w-12 text-right" />}
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={9}>
                  <Carregando texto="Carregando pedidos…" />
                </td>
              </tr>
            )}
            {!carregando && !pedidos.length && (
              <tr>
                <td colSpan={9}>
                  <Vazio texto={busca ? 'Nenhum pedido corresponde à busca' : grupo === 'abertos' ? 'Nenhum pedido aberto' : 'Nenhum pedido encerrado'}>
                    {ehAdmin && grupo === 'abertos' && !busca && (
                      <button onClick={() => navegar('novo')} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
                        Abrir o primeiro pedido
                      </button>
                    )}
                  </Vazio>
                </td>
              </tr>
            )}
            {!carregando &&
              pedidos.map((p) => {
                const f = faltam(p.data_fechamento);
                const ativo = selecionado?.id === p.id;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelecionar(ativo ? null : { id: p.id, nome: p.nome })}
                    onDoubleClick={() => ehAdmin && navegar('novo', { id: p.id })}
                    className={`cursor-pointer transition-colors ${
                      ativo ? 'bg-blue-100 dark:bg-blue-950' : 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800'
                    }`}
                    title="Clique para selecionar • duplo clique para alterar"
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
                    {grupo === 'encerrados' && <TD className="whitespace-nowrap">{p.comprador_nome || '—'}</TD>}
                    <TD className="whitespace-nowrap">{formatDataHora(p.data_fechamento)}</TD>
                    {grupo === 'abertos' && (
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
                    )}
                    <TD>
                      {grupo === 'encerrados' ? (
                        p.compra_efetuada ? (
                          <Pill cor="verde" title={p.data_compra_efetuada ? `Em ${formatDataHora(p.data_compra_efetuada)}` : undefined}>
                            Enviado para compra
                          </Pill>
                        ) : p.situacao === 'encerrado_sem_volume' ? (
                          <SituacaoBadge situacao={p.situacao} />
                        ) : (
                          <Pill cor="ambar">Aguardando envio da ordem de compra</Pill>
                        )
                      ) : (
                        <SituacaoBadge situacao={p.situacao} />
                      )}
                    </TD>
                    <TD className="text-right font-semibold whitespace-nowrap">{formatMoeda(p.volume)}</TD>
                    <TD>
                      <Andamento preenchidos={p.total_preenchidos} total={p.total_associados} />
                    </TD>
                    {ehAdmin && (
                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <MenuContexto itens={grupo === 'abertos' ? itensAbertos(p) : itensEncerrados(p)} />
                      </TD>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Clock, Truck } from 'lucide-react';
import { PedidoLojaResumo } from '../types';
import { api, qs } from '../services/api';
import { Alerta, Carregando, MarcadorTag, Pill, SituacaoBadge, useApp, Vazio } from '../components/ui';
import { faltam, formatDataHora, formatMoeda } from '../utils/formatters';

export const LojaPedidos: React.FC<{ grupo: 'abertos' | 'historico' }> = ({ grupo }) => {
  const { navegar, refreshToken, usuario } = useApp();
  const [lista, setLista] = useState<PedidoLojaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

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

  const minhaSituacao = (p: PedidoLojaResumo) =>
    p.minha_situacao === 'preenchido' ? (
      <Pill cor="verde">Preenchido {formatDataHora(p.data_acao)}</Pill>
    ) : p.minha_situacao === 'rejeitado' ? (
      <Pill cor="vermelho">Rejeitado {formatDataHora(p.data_acao)}</Pill>
    ) : (
      <Pill cor="ambar">Aguardando seu preenchimento</Pill>
    );

  return (
    <div className="flex-1 overflow-auto min-h-0 px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4 text-xs text-stone-500">
        {usuario.associado_nome} • {usuario.classificacao_nome || 'Sem classificação'}
      </div>
      {erro && <Alerta className="mb-4">{erro}</Alerta>}
      {carregando && <Carregando />}
      {!carregando && !lista.length && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl">
          <Vazio texto={grupo === 'abertos' ? 'Nenhum pedido disponível para a sua loja no momento' : 'Nenhum pedido no histórico'} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
        {lista.map((p) => {
          const f = faltam(p.data_fechamento);
          return (
            <button
              key={p.id}
              onClick={() => navegar('loja-pedido', { id: p.id })}
              className="text-left bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-stone-400">Pedido nº {p.id}</div>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100 mt-0.5">{p.nome}</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.marcadores.map((m) => (
                      <MarcadorTag key={m.id} marcador={m} />
                    ))}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-stone-300 group-hover:text-blue-600 shrink-0 mt-1" />
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-stone-600 dark:text-stone-300">
                <div className="flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-stone-400" /> {p.fornecedor_nome || '—'} • {p.total_itens} item(ns)
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-stone-400" /> Fechamento {formatDataHora(p.data_fechamento)}
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center gap-2">
                {grupo === 'abertos' ? (
                  <>
                    {p.situacao === 'indisponivel' ? (
                      <SituacaoBadge situacao={p.situacao} />
                    ) : (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold ${f.urgente ? 'text-rose-600' : 'text-blue-700 dark:text-blue-400'}`}>
                        <Clock className="w-3.5 h-3.5" /> Faltam {f.texto}
                      </span>
                    )}
                    {minhaSituacao(p)}
                  </>
                ) : (
                  <>
                    {p.compra_efetuada ? <Pill cor="azul">Compra efetuada</Pill> : <SituacaoBadge situacao={p.situacao} />}
                    {minhaSituacao(p)}
                    {p.situacao_entrega && (
                      <Pill cor={p.situacao_entrega === 'confirmado' ? 'verde' : p.situacao_entrega === 'divergencia' ? 'vermelho' : 'cinza'}>
                        {p.situacao_entrega === 'confirmado' ? 'Entregue' : p.situacao_entrega === 'divergencia' ? 'Entrega com divergência' : 'Entrega pendente'}
                      </Pill>
                    )}
                  </>
                )}
                {Number(p.meu_volume) > 0 && <span className="ml-auto text-sm font-bold text-stone-900 dark:text-stone-100">{formatMoeda(p.meu_volume)}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { PedidoLog } from '../types';
import { api } from '../services/api';
import { Alerta, Carregando, TD, TH, TR_CLASS, useApp, Vazio } from '../components/ui';
import { INPUT_CLASS } from '../utils/formStyles';
import { ACOES_LOG, formatDataHora } from '../utils/formatters';

const CORES_ACAO: Record<string, string> = {
  preenchimento: 'text-emerald-600 dark:text-emerald-400',
  rejeicao: 'text-rose-600 dark:text-rose-400',
  compra_efetuada: 'text-blue-600 dark:text-blue-400',
  recebimento_divergencia: 'text-amber-600 dark:text-amber-400',
};

export const HistoricoAcoes: React.FC = () => {
  const { refreshToken, navegar } = useApp();
  const [lista, setLista] = useState<PedidoLog[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [acao, setAcao] = useState('');

  useEffect(() => {
    setCarregando(true);
    api
      .get<PedidoLog[]>('/log')
      .then((l) => {
        setLista(l);
        setErro(null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [refreshToken]);

  const termo = filtro.trim().toLowerCase();
  const visiveis = lista.filter(
    (l) =>
      (!acao || l.acao === acao) &&
      (!termo ||
        String(l.pedido_id).includes(termo) ||
        (l.pedido_nome || '').toLowerCase().includes(termo) ||
        (l.usuario_nome || '').toLowerCase().includes(termo) ||
        (l.associado_nome || '').toLowerCase().includes(termo)),
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500">{carregando ? 'Carregando…' : `${visiveis.length} registro(s) (últimos 500)`}</div>
        <div className="flex items-center gap-2">
          <select value={acao} onChange={(e) => setAcao(e.target.value)} className={INPUT_CLASS}>
            <option value="">Todas as ações</option>
            {Object.entries(ACOES_LOG).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Pedido, usuário ou associado" className={`${INPUT_CLASS} w-64`} />
        </div>
      </div>
      {erro && <Alerta className="m-4">{erro}</Alerta>}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH>Data/hora</TH>
              <TH>Pedido</TH>
              <TH>Ação</TH>
              <TH>Usuário</TH>
              <TH>Associado</TH>
              <TH>Observação</TH>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={6}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !visiveis.length && (
              <tr>
                <td colSpan={6}>
                  <Vazio texto="Nenhum registro" />
                </td>
              </tr>
            )}
            {!carregando &&
              visiveis.map((l) => (
                <tr key={l.id} className={TR_CLASS}>
                  <TD className="whitespace-nowrap">{formatDataHora(l.data_acao)}</TD>
                  <TD>
                    <button onClick={() => navegar('novo', { id: l.pedido_id })} className="text-left hover:underline cursor-pointer">
                      <span className="font-mono font-semibold mr-1.5">{l.pedido_id}</span>
                      {l.pedido_nome}
                    </button>
                  </TD>
                  <TD className={`whitespace-nowrap font-semibold ${CORES_ACAO[l.acao] || ''}`}>{ACOES_LOG[l.acao] || l.acao}</TD>
                  <TD className="whitespace-nowrap">{l.usuario_nome || 'Sistema'}</TD>
                  <TD>{l.associado_nome || '—'}</TD>
                  <TD className="text-stone-500">{l.observacao || ''}</TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

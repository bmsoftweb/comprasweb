import React, { useCallback, useEffect, useState } from 'react';
import { PackageCheck, AlertTriangle } from 'lucide-react';
import { Recebimento } from '../types';
import { api, qs } from '../services/api';
import { Alerta, Botao, Carregando, Modal, Pill, TD, TH, TR_CLASS, useApp, Vazio } from '../components/ui';
import { Toggle } from '../components/Toggle';
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { formatData, formatDataHora, formatMoeda, hojeIso } from '../utils/formatters';

export const ConfirmarRecebimento: React.FC = () => {
  const { refreshToken, toast } = useApp();
  const [lista, setLista] = useState<Recebimento[]>([]);
  const [todos, setTodos] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Recebimento | null>(null);
  const [filtro, setFiltro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await api.get<Recebimento[]>(`/recebimentos${qs({ situacao: todos ? 'todos' : undefined })}`));
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [todos]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const termo = filtro.trim().toLowerCase();
  const visiveis = lista.filter(
    (r) =>
      !termo ||
      String(r.pedido_id).includes(termo) ||
      r.pedido_nome.toLowerCase().includes(termo) ||
      r.associado_nome.toLowerCase().includes(termo) ||
      (r.fornecedor_nome || '').toLowerCase().includes(termo),
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500">
          {carregando ? 'Carregando…' : `${visiveis.length} entrega(s) ${todos ? '' : 'pendente(s)'}`}
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={todos} onChange={setTodos} size="sm" label="Mostrar também confirmados" />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por pedido, fornecedor ou associado" className={`${INPUT_CLASS} w-72`} />
        </div>
      </div>
      {erro && <Alerta className="m-4">{erro}</Alerta>}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH className="w-20">Código</TH>
              <TH>Pedido</TH>
              <TH>Fornecedor</TH>
              <TH>Associado</TH>
              <TH className="text-right">Volume</TH>
              <TH>Data de Compra</TH>
              <TH>Situação de Entrega</TH>
              <TH className="w-28" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={8}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !visiveis.length && (
              <tr>
                <td colSpan={8}>
                  <Vazio texto={todos ? 'Nenhum recebimento registrado' : 'Nenhuma entrega aguardando confirmação'} />
                </td>
              </tr>
            )}
            {!carregando &&
              visiveis.map((r) => (
                <tr key={r.id} className={TR_CLASS}>
                  <TD className="font-mono font-semibold">{r.pedido_id}</TD>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{r.pedido_nome}</TD>
                  <TD>{r.fornecedor_nome || '—'}</TD>
                  <TD>
                    <span className="font-mono text-stone-400 mr-1.5">{r.associado_bmsoft_id}</span>
                    {r.associado_nome}
                  </TD>
                  <TD className="text-right whitespace-nowrap">{formatMoeda(r.volume)}</TD>
                  <TD className="whitespace-nowrap">{formatData(r.data_compra)}</TD>
                  <TD>
                    {r.situacao_entrega === 'pendente' ? (
                      <Pill cor="ambar">Aguardando entrega</Pill>
                    ) : (
                      <div className="space-y-0.5">
                        <Pill cor={r.situacao_entrega === 'confirmado' ? 'verde' : 'vermelho'}>
                          {r.situacao_entrega === 'confirmado' ? 'Recebido' : 'Recebido com divergência'} em {formatData(r.confirmado_em)}
                        </Pill>
                        {r.observacao && <div className="text-[11px] text-stone-500 max-w-xs">{r.observacao}</div>}
                        <div className="text-[10px] text-stone-400">por {r.confirmado_por_nome}</div>
                      </div>
                    )}
                  </TD>
                  <TD className="text-right">
                    <Botao
                      variante={r.situacao_entrega === 'pendente' ? 'sucesso' : 'secundario'}
                      icone={<PackageCheck className="w-3.5 h-3.5" />}
                      onClick={() => setConfirmando(r)}
                    >
                      {r.situacao_entrega === 'pendente' ? 'Confirmar' : 'Corrigir'}
                    </Botao>
                  </TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {confirmando && (
        <ConfirmarModal
          recebimento={confirmando}
          onFechar={() => setConfirmando(null)}
          onConfirmado={() => {
            setConfirmando(null);
            toast('Recebimento registrado.');
            carregar();
          }}
        />
      )}
    </div>
  );
};

const ConfirmarModal: React.FC<{ recebimento: Recebimento; onFechar: () => void; onConfirmado: () => void }> = ({
  recebimento,
  onFechar,
  onConfirmado,
}) => {
  const [data, setData] = useState(recebimento.confirmado_em ? recebimento.confirmado_em.slice(0, 10) : hojeIso());
  const [divergencia, setDivergencia] = useState(recebimento.situacao_entrega === 'divergencia');
  const [observacao, setObservacao] = useState(recebimento.observacao || '');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const gravar = async () => {
    setGravando(true);
    setErro(null);
    try {
      await api.post(`/recebimentos/${recebimento.id}/confirmar`, {
        data,
        situacao_entrega: divergencia ? 'divergencia' : 'confirmado',
        observacao,
      });
      onConfirmado();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setGravando(false);
    }
  };

  return (
    <Modal
      titulo="Confirmar recebimento"
      subtitulo={`Pedido nº ${recebimento.pedido_id} — ${recebimento.associado_nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante={divergencia ? 'perigo' : 'sucesso'} onClick={gravar} carregando={gravando}>
            {divergencia ? 'Registrar divergência' : 'Confirmar recebimento'}
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {erro && <Alerta>{erro}</Alerta>}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className={LABEL_CLASS}>Fornecedor</div>
            <div className="font-medium mt-0.5">{recebimento.fornecedor_nome || '—'}</div>
          </div>
          <div>
            <div className={LABEL_CLASS}>Data de compra</div>
            <div className="font-medium mt-0.5">{formatData(recebimento.data_compra)}</div>
          </div>
        </div>
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Data do recebimento</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} required className={`${INPUT_CLASS} w-48`} />
        </div>
        <Toggle
          checked={divergencia}
          onChange={setDivergencia}
          size="sm"
          label={
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Houve divergência na entrega
            </span>
          }
        />
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Observação</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={4}
            maxLength={2000}
            required={divergencia}
            placeholder="Ex.: entrega parcial — faltaram 2 volumes; 1 saco avariado."
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
        {recebimento.confirmado_em && (
          <p className="text-[11px] text-stone-400">Última confirmação em {formatDataHora(recebimento.confirmado_em)} por {recebimento.confirmado_por_nome}.</p>
        )}
      </div>
    </Modal>
  );
};

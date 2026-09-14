import React, { useCallback, useEffect, useState } from 'react';
import { MailCheck, Undo2 } from 'lucide-react';
import { EnvioEmail } from '../types';
import { api } from '../services/api';
import { Alerta, Botao, Carregando, Modal, Pill, TD, TH, TR_CLASS, useApp, Vazio } from '../components/ui';
import { INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { formatDataHora } from '../utils/formatters';

export const ConfirmacaoEmail: React.FC = () => {
  const { refreshToken, toast, confirmar } = useApp();
  const [lista, setLista] = useState<EnvioEmail[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<EnvioEmail | null>(null);
  const [observacao, setObservacao] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLista(await api.get<EnvioEmail[]>('/emails'));
      setErro(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const gravar = async (envio: EnvioEmail, desfazer = false) => {
    try {
      await api.post(`/emails/${envio.id}/confirmar`, { observacao, desfazer });
      toast(desfazer ? 'Confirmação desfeita.' : 'Confirmação do fornecedor registrada.');
      setConfirmando(null);
      carregar();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const pendentes = lista.filter((l) => !l.confirmado_fornecedor_em && l.status_envio !== 'falha').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500">
          {carregando ? 'Carregando…' : `${lista.length} envio(s) • ${pendentes} aguardando confirmação do fornecedor`}
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
              <TH>E-mail de envio</TH>
              <TH>Tipo</TH>
              <TH>Enviado em</TH>
              <TH>Envio</TH>
              <TH>Confirmação do fornecedor</TH>
              <TH className="w-28" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={9}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !lista.length && (
              <tr>
                <td colSpan={9}>
                  <Vazio texto="Nenhuma compra ou cotação enviada ainda" />
                </td>
              </tr>
            )}
            {!carregando &&
              lista.map((e) => (
                <tr key={e.id} className={TR_CLASS}>
                  <TD className="font-mono font-semibold">{e.pedido_id}</TD>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{e.pedido_nome}</TD>
                  <TD>{e.fornecedor_nome || '—'}</TD>
                  <TD className="font-mono">{e.email_envio}</TD>
                  <TD>
                    <div className="flex flex-col gap-0.5 items-start">
                      <Pill cor={e.apenas_cotacao ? 'roxo' : 'azul'}>{e.apenas_cotacao ? 'Cotação' : 'Ordem de compra'}</Pill>
                      <span className="text-[10px] text-stone-400">{e.tipo_envio === 'email_cadastrado' ? 'E-mail cadastrado' : 'Digitação livre'}</span>
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap">
                    {formatDataHora(e.data_envio)}
                    <div className="text-[10px] text-stone-400">{e.usuario_nome}</div>
                  </TD>
                  <TD>
                    {e.status_envio === 'enviado' && <Pill cor="verde">Enviado</Pill>}
                    {e.status_envio === 'simulado' && (
                      <Pill cor="cinza" title="SMTP não configurado no servidor">
                        Simulado
                      </Pill>
                    )}
                    {e.status_envio === 'falha' && (
                      <Pill cor="vermelho" title={e.mensagem_erro || ''}>
                        Falha
                      </Pill>
                    )}
                  </TD>
                  <TD>
                    {e.confirmado_fornecedor_em ? (
                      <div>
                        <Pill cor="verde">Confirmado {formatDataHora(e.confirmado_fornecedor_em)}</Pill>
                        {e.observacao_confirmacao && <div className="text-[11px] text-stone-500 mt-0.5 max-w-xs">{e.observacao_confirmacao}</div>}
                        <div className="text-[10px] text-stone-400">por {e.confirmado_por_nome}</div>
                      </div>
                    ) : (
                      <Pill cor="ambar">Aguardando</Pill>
                    )}
                  </TD>
                  <TD className="text-right">
                    {e.confirmado_fornecedor_em ? (
                      <Botao
                        variante="fantasma"
                        icone={<Undo2 className="w-3.5 h-3.5" />}
                        onClick={async () => {
                          if (await confirmar({ titulo: 'Desfazer confirmação', mensagem: 'Marcar este envio como não confirmado pelo fornecedor?' })) gravar(e, true);
                        }}
                      >
                        Desfazer
                      </Botao>
                    ) : (
                      <Botao
                        variante="sucesso"
                        icone={<MailCheck className="w-3.5 h-3.5" />}
                        disabled={e.status_envio === 'falha'}
                        onClick={() => {
                          setObservacao('');
                          setConfirmando(e);
                        }}
                      >
                        Confirmar
                      </Botao>
                    )}
                  </TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {confirmando && (
        <Modal
          titulo="Confirmação do fornecedor"
          subtitulo={`Pedido nº ${confirmando.pedido_id} • ${confirmando.email_envio}`}
          onFechar={() => setConfirmando(null)}
          rodape={
            <>
              <Botao onClick={() => setConfirmando(null)}>Cancelar</Botao>
              <Botao variante="sucesso" onClick={() => gravar(confirmando)}>
                Registrar confirmação
              </Botao>
            </>
          }
        >
          <div className="space-y-2">
            <p className="text-xs text-stone-600 dark:text-stone-300">Registre que o fornecedor confirmou o recebimento do e-mail.</p>
            <div className={LABEL_CLASS}>Observação (opcional)</div>
            <textarea
              value={observacao}
              onChange={(ev) => setObservacao(ev.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ex.: Confirmado por telefone com Sr. Carlos; faturamento em 48h."
              className={`${INPUT_CLASS} w-full`}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Ban,
  BellRing,
  CheckCircle2,
  Copy,
  ImageDown,
  Lock,
  Mail,
  Pencil,
  Printer,
  Send,
  ShoppingCart,
  Trash2,
  Unlock,
} from 'lucide-react';
import { PedidoCompleto, PedidoResumo } from '../types';
import { api } from '../services/api';
import { Alerta, Botao, Carregando, ItemMenu, Modal, useApp } from '../components/ui';
import { Toggle } from '../components/Toggle';
import { LAYOUTS, LayoutImpressao, LayoutPedido } from '../components/ImpressaoLayouts';
import { INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { formatMoeda } from '../utils/formatters';

/** Renderiza o conteúdo direto no body, visível só na impressão */
export const AreaImpressao: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  createPortal(<div className="area-impressao hidden print:block">{children}</div>, document.body);

function usePedidoCompleto(id: number) {
  const [pedido, setPedido] = useState<PedidoCompleto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    api.get<PedidoCompleto>(`/pedidos/${id}`).then(setPedido).catch((e) => setErro(e.message));
  }, [id]);
  return { pedido, erro };
}

// =====================================================================
// Impressão / Envio do Pedido
// =====================================================================
export const ImpressaoModal: React.FC<{ pedidoId: number; onFechar: () => void }> = ({ pedidoId, onFechar }) => {
  const { toast } = useApp();
  const { pedido, erro } = usePedidoCompleto(pedidoId);
  const [layout, setLayout] = useState<LayoutImpressao>('sintetico');
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!pedido) return;
    setEnviando(true);
    try {
      const html = renderToStaticMarkup(<LayoutPedido layout={layout} pedido={pedido} observacao={pedido.observacao_associado} />);
      const r = await api.post(`/pedidos/${pedido.id}/enviar-impressao`, {
        email,
        layout,
        html,
        assunto: `Pedido nº ${pedido.id} — ${pedido.nome} (${LAYOUTS.find((l) => l.id === layout)?.rotulo})`,
      });
      toast(r.status === 'simulado' ? 'Envio registrado (SMTP não configurado: e-mail simulado).' : 'Pedido enviado por e-mail.');
      setEmail('');
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Impressão / Envio do Pedido nº ${pedidoId}`}
      subtitulo={pedido?.nome}
      largura="xl"
      onFechar={onFechar}
      rodape={
        <>
          <div className="mr-auto flex items-center gap-2">
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enviar por e-mail: nome@dominio.com, outro@…"
              className={`${INPUT_CLASS} w-72`}
            />
            <Botao icone={<Mail className="w-3.5 h-3.5" />} onClick={enviar} carregando={enviando} disabled={!email || !pedido}>
              Enviar
            </Botao>
          </div>
          <Botao onClick={onFechar}>Fechar</Botao>
          <Botao variante="primario" icone={<Printer className="w-3.5 h-3.5" />} onClick={() => window.print()} disabled={!pedido}>
            Imprimir
          </Botao>
        </>
      }
    >
      {erro && <Alerta>{erro}</Alerta>}
      {!pedido && !erro && <Carregando />}
      {pedido && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLayout(l.id)}
                className={`text-left p-3 rounded-xl border cursor-pointer transition-colors ${
                  layout === l.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700'
                    : 'border-stone-200 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800'
                }`}
              >
                <div className="text-xs font-bold text-stone-800 dark:text-stone-100">{l.rotulo}</div>
                <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">{l.descricao}</div>
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-auto">
            <LayoutPedido layout={layout} pedido={pedido} observacao={pedido.observacao_associado} />
          </div>
          <AreaImpressao>
            <LayoutPedido layout={layout} pedido={pedido} observacao={pedido.observacao_associado} />
          </AreaImpressao>
        </>
      )}
    </Modal>
  );
};

// =====================================================================
// Efetuar Compra Fornecedor
// =====================================================================
export const CompraFornecedorModal: React.FC<{ pedidoId: number; onFechar: () => void; onConcluido: () => void }> = ({
  pedidoId,
  onFechar,
  onConcluido,
}) => {
  const { toast } = useApp();
  const { pedido, erro } = usePedidoCompleto(pedidoId);
  const [tipo, setTipo] = useState<'email_cadastrado' | 'digitacao_livre'>('email_cadastrado');
  const [email, setEmail] = useState('');
  const [cotacao, setCotacao] = useState(false);
  const [layout, setLayout] = useState<LayoutImpressao>('sintetico');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (pedido && !pedido.fornecedor_email) {
      setTipo('digitacao_livre');
      if (!pedido.fornecedor_id) setCotacao(true);
    }
  }, [pedido]);

  const liberado = pedido?.situacao === 'liberado_loja';

  const enviar = async () => {
    if (!pedido) return;
    setEnviando(true);
    try {
      const html = renderToStaticMarkup(
        <LayoutPedido layout={layout} pedido={pedido} observacao={pedido.observacao_fornecedor} mensagem={mensagem} />,
      );
      const r = await api.post(`/pedidos/${pedido.id}/compra`, {
        tipo_envio: tipo,
        email,
        apenas_cotacao: cotacao,
        html,
      });
      toast(
        cotacao
          ? `Cotação enviada${r.status === 'simulado' ? ' (e-mail simulado)' : ''}.`
          : `Compra efetuada${r.status === 'simulado' ? ' (e-mail simulado)' : ''}: ${r.recebimentos} recebimento(s) aguardando confirmação.`,
      );
      onConcluido();
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={`Efetuar Compra Fornecedor — Pedido nº ${pedidoId}`}
      subtitulo={pedido ? `${pedido.nome} • Volume ${formatMoeda(pedido.volume)} • ${pedido.total_preenchidos} de ${pedido.total_associados} associados` : undefined}
      largura="xl"
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao
            variante={cotacao ? 'primario' : 'sucesso'}
            icone={<Send className="w-3.5 h-3.5" />}
            onClick={enviar}
            carregando={enviando}
            disabled={!pedido || (tipo === 'digitacao_livre' && !email) || (!cotacao && liberado)}
          >
            {cotacao ? 'Enviar cotação' : 'Efetuar compra e enviar'}
          </Botao>
        </>
      }
    >
      {erro && <Alerta>{erro}</Alerta>}
      {!pedido && !erro && <Carregando />}
      {pedido && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
          <div className="space-y-4">
            {pedido.compra_efetuada === 1 && (
              <Alerta tipo="aviso">Este pedido já teve a compra efetuada. Um novo envio será registrado como reenvio.</Alerta>
            )}
            {liberado && !cotacao && (
              <Alerta tipo="aviso">O pedido ainda está liberado para as lojas. Torne-o indisponível antes de efetuar a compra, ou envie apenas uma cotação.</Alerta>
            )}

            <div className="space-y-2">
              <div className={LABEL_CLASS}>Destino do e-mail</div>
              <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${tipo === 'email_cadastrado' ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-800' : 'border-stone-200 dark:border-stone-700'}`}>
                <input type="radio" checked={tipo === 'email_cadastrado'} onChange={() => setTipo('email_cadastrado')} disabled={!pedido.fornecedor_email} className="mt-0.5" />
                <span className="text-xs">
                  <b>E-mail cadastrado do fornecedor</b>
                  <span className="block text-stone-500 dark:text-stone-400 mt-0.5">
                    {pedido.fornecedor_email ? `${pedido.fornecedor_nome} • ${pedido.fornecedor_email}` : 'Fornecedor sem e-mail cadastrado'}
                  </span>
                </span>
              </label>
              <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${tipo === 'digitacao_livre' ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-800' : 'border-stone-200 dark:border-stone-700'}`}>
                <input type="radio" checked={tipo === 'digitacao_livre'} onChange={() => setTipo('digitacao_livre')} className="mt-0.5" />
                <span className="text-xs flex-1">
                  <b>Digitação livre</b>
                  <span className="block text-stone-500 dark:text-stone-400 mt-0.5">Para cotação com fornecedor sem cadastro</span>
                  {tipo === 'digitacao_livre' && (
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="vendas@fornecedor.com.br"
                      required
                      className={`${INPUT_CLASS} w-full mt-2`}
                      autoFocus
                    />
                  )}
                </span>
              </label>
            </div>

            <Toggle checked={cotacao} onChange={setCotacao} size="sm" label="Apenas cotação (não encerra o pedido)" />

            <div>
              <div className={`${LABEL_CLASS} mb-1`}>Layout enviado</div>
              <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutImpressao)} className={`${INPUT_CLASS} w-full`}>
                {LAYOUTS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className={`${LABEL_CLASS} mb-1`}>Mensagem ao fornecedor</div>
              <textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={4}
                placeholder="Ex.: Favor confirmar o recebimento deste pedido e o prazo de entrega."
                className={`${INPUT_CLASS} w-full`}
              />
            </div>
            <p className="text-[11px] text-stone-400">
              {cotacao
                ? 'A cotação fica registrada em "Confirmação de E-mail".'
                : 'Ao efetuar a compra, o pedido é encerrado e cada associado que preencheu passa a aguardar a confirmação de recebimento.'}
            </p>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-5 overflow-auto max-h-[60vh]">
            <LayoutPedido layout={layout} pedido={pedido} observacao={pedido.observacao_fornecedor} mensagem={mensagem} />
          </div>
        </div>
      )}
    </Modal>
  );
};

// =====================================================================
// Notificar associados
// =====================================================================
export const NotificarModal: React.FC<{ pedido: PedidoResumo; onFechar: () => void }> = ({ pedido, onFechar }) => {
  const { toast } = useApp();
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api.post(`/pedidos/${pedido.id}/notificar`, { somentePendentes, mensagem });
      toast(`${r.enviados} e-mail(s) para ${r.associados} associado(s)${r.status === 'simulado' ? ' (simulado)' : ''}.`);
      onFechar();
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo="Notificar associados"
      subtitulo={`Pedido nº ${pedido.id} — ${pedido.nome}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" icone={<BellRing className="w-3.5 h-3.5" />} onClick={enviar} carregando={enviando}>
            Notificar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        {pedido.situacao !== 'liberado_loja' && (
          <Alerta tipo="aviso">O pedido não está liberado: as lojas receberão o aviso, mas ainda não conseguirão preencher.</Alerta>
        )}
        <Toggle
          checked={somentePendentes}
          onChange={setSomentePendentes}
          size="sm"
          label={`Somente quem ainda não respondeu (${pedido.total_associados - pedido.total_preenchidos - pedido.total_rejeitados} de ${pedido.total_associados})`}
        />
        <div>
          <div className={`${LABEL_CLASS} mb-1`}>Mensagem adicional</div>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={4}
            placeholder="Ex.: Últimos dias para aproveitar as condições negociadas!"
            className={`${INPUT_CLASS} w-full`}
          />
        </div>
      </div>
    </Modal>
  );
};

// =====================================================================
// Ações do menu de contexto "..." (Abertos e Encerrados)
// =====================================================================
export function usePedidoAcoes(onAtualizar: () => void) {
  const { navegar, toast, confirmar } = useApp();
  const [modal, setModal] = useState<{ tipo: 'impressao' | 'compra' | 'notificar'; pedido: PedidoResumo } | null>(null);

  const mudarSituacao = async (p: PedidoResumo, situacao: string, texto: string) => {
    try {
      await api.post(`/pedidos/${p.id}/situacao`, { situacao });
      toast(texto);
      onAtualizar();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const buscarImagens = async (p: PedidoResumo) => {
    const ok = await confirmar({
      titulo: 'Buscar imagens dos produtos',
      mensagem: (
        <>
          Pesquisar no Google Imagens uma foto para cada produto do pedido <b>nº {p.id}</b> que ainda não tem imagem. A imagem encontrada
          também é gravada no cadastro do produto.
        </>
      ),
      confirmar: 'Buscar',
    });
    if (!ok) return;
    toast('Buscando imagens… isto pode levar alguns segundos.');
    try {
      const r = await api.post(`/pedidos/${p.id}/buscar-imagens`, {});
      toast(r.pesquisados ? `${r.encontradas} de ${r.pesquisados} imagem(ns) encontrada(s).` : 'Todos os produtos já têm imagem.');
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const excluir = async (p: PedidoResumo) => {
    const ok = await confirmar({
      titulo: 'Excluir pedido',
      mensagem: (
        <>
          Excluir definitivamente o pedido <b>nº {p.id} — {p.nome}</b> com itens, quantidades, recebimentos e anexos?
        </>
      ),
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.del(`/pedidos/${p.id}`);
      toast(`Pedido nº ${p.id} excluído.`);
      onAtualizar();
    } catch (e: any) {
      toast(e.message, 'erro');
    }
  };

  const itensAbertos = (p: PedidoResumo): (ItemMenu | 'separador')[] => [
    { rotulo: 'Impressão/Envio do Pedido', icone: <Printer />, onClick: () => setModal({ tipo: 'impressao', pedido: p }) },
    p.situacao === 'indisponivel' || p.situacao === 'em_elaboracao'
      ? {
          rotulo: 'Liberar para as lojas',
          icone: <Unlock />,
          onClick: () => mudarSituacao(p, 'liberado_loja', `Pedido nº ${p.id} liberado para as lojas.`),
        }
      : {
          rotulo: 'Tornar Indisponível',
          icone: <Lock />,
          desabilitado: p.situacao !== 'liberado_loja',
          dica: p.situacao !== 'liberado_loja' ? 'O pedido não está disponível às lojas' : undefined,
          onClick: () => mudarSituacao(p, 'indisponivel', `Pedido nº ${p.id} indisponível para as lojas.`),
        },
    { rotulo: 'Efetuar Compra Fornecedor', icone: <ShoppingCart />, onClick: () => setModal({ tipo: 'compra', pedido: p }) },
    { rotulo: 'Notificar associados', icone: <BellRing />, onClick: () => setModal({ tipo: 'notificar', pedido: p }) },
    { rotulo: 'Buscar imagens dos produtos', icone: <ImageDown />, onClick: () => buscarImagens(p) },
    'separador',
    { rotulo: 'Duplicar', icone: <Copy />, onClick: () => navegar('novo', { duplicarDe: p.id }) },
    { rotulo: 'Alterar', icone: <Pencil />, onClick: () => navegar('novo', { id: p.id }) },
    'separador',
    {
      rotulo: 'Encerrar preenchimento',
      icone: <Ban />,
      onClick: async () => {
        const ok = await confirmar({
          titulo: 'Encerrar preenchimento',
          mensagem: (
            <>
              Encerrar o pedido <b>nº {p.id}</b>? As lojas não poderão mais preencher e ele passa para "Encerrados", aguardando o envio da
              ordem de compra.
            </>
          ),
          confirmar: 'Encerrar',
        });
        if (ok) mudarSituacao(p, 'encerrar', `Pedido nº ${p.id} encerrado.`);
      },
    },
  ];

  const itensEncerrados = (p: PedidoResumo): (ItemMenu | 'separador')[] => [
    { rotulo: 'Impressão/Envio do Pedido', icone: <Printer />, onClick: () => setModal({ tipo: 'impressao', pedido: p }) },
    {
      rotulo: p.compra_efetuada ? 'Reenviar Compra Fornecedor' : 'Efetuar Compra Fornecedor',
      icone: p.compra_efetuada ? <CheckCircle2 /> : <ShoppingCart />,
      onClick: () => setModal({ tipo: 'compra', pedido: p }),
    },
    { rotulo: 'Duplicar', icone: <Copy />, onClick: () => navegar('novo', { duplicarDe: p.id }) },
    { rotulo: 'Alterar', icone: <Pencil />, onClick: () => navegar('novo', { id: p.id }) },
    'separador',
    { rotulo: 'Excluir', icone: <Trash2 />, perigo: true, onClick: () => excluir(p) },
  ];

  const modais = modal ? (
    modal.tipo === 'impressao' ? (
      <ImpressaoModal pedidoId={modal.pedido.id} onFechar={() => setModal(null)} />
    ) : modal.tipo === 'compra' ? (
      <CompraFornecedorModal
        pedidoId={modal.pedido.id}
        onFechar={() => setModal(null)}
        onConcluido={() => {
          setModal(null);
          onAtualizar();
        }}
      />
    ) : (
      <NotificarModal pedido={modal.pedido} onFechar={() => setModal(null)} />
    )
  ) : null;

  return { itensAbertos, itensEncerrados, modais };
}

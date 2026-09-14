import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Download,
  Eraser,
  FileUp,
  Info,
  PackagePlus,
  Plus,
  Save,
  Search,
  Trash2,
  Unlock,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  Associado,
  Classificacao,
  CondicaoPagamento,
  Fornecedor,
  Marcador,
  PedidoAssociado,
  PedidoCompleto,
  PedidoItem,
  Produto,
  SituacaoPedido,
} from '../types';
import { api, qs, urlArquivo } from '../services/api';
import { Abas, Alerta, Botao, Carregando, ImagemHover, Modal, Pill, TD, TH, useApp } from '../components/ui';
import { Toggle } from '../components/Toggle';
import { RichTextEditor } from '../components/RichTextEditor';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../utils/formStyles';
import { ACOES_LOG, SITUACAO_PEDIDO, faltam, formatDataHora, formatMoeda, formatNumero, paraInputDataHora } from '../utils/formatters';

type Aba = 'gerais' | 'compras' | 'entrega' | 'pagamento' | 'associados' | 'permissao' | 'arquivos' | 'historico';

interface FormPedido {
  id: number | null;
  nome: string;
  situacao: SituacaoPedido;
  fornecedor_id: number | null;
  fornecedor_manual: string;
  fornecedor_digitado: boolean;
  data_fechamento: string;
  tipo_frete: string;
  prazo_entrega: string;
  local_entrega: string;
  observacao_associado: string;
  observacao_fornecedor: string;
  observacao_individual: string;
  usar_mesma_observacao: boolean;
  solicitar_avaliacao_compra: boolean;
  mostrar_valor_economizado: boolean;
  duplicado_de_pedido_id: number | null;
  marcadores: number[];
  grupos: number[];
  condicoes: CondicaoPagamento[];
  itens: PedidoItem[];
  associados: PedidoAssociado[];
}

let seq = 0;
const novaChave = () => `n${++seq}`;
const chaveItem = (it: PedidoItem) => (it.id ? `i${it.id}` : it.chave!);

function dataPadraoFechamento() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
}

const FORM_VAZIO: FormPedido = {
  id: null,
  nome: '',
  situacao: 'em_elaboracao',
  fornecedor_id: null,
  fornecedor_manual: '',
  fornecedor_digitado: false,
  data_fechamento: dataPadraoFechamento(),
  tipo_frete: 'CIF',
  prazo_entrega: '',
  local_entrega: '',
  observacao_associado: '',
  observacao_fornecedor: '',
  observacao_individual: '',
  usar_mesma_observacao: false,
  solicitar_avaliacao_compra: false,
  mostrar_valor_economizado: false,
  duplicado_de_pedido_id: null,
  marcadores: [],
  grupos: [],
  condicoes: [],
  itens: [],
  associados: [],
};

function paraForm(p: PedidoCompleto, duplicar: boolean): FormPedido {
  return {
    id: duplicar ? null : p.id,
    nome: duplicar ? `${p.nome} (cópia)` : p.nome,
    situacao: duplicar ? 'em_elaboracao' : p.situacao,
    fornecedor_id: p.fornecedor_id,
    fornecedor_manual: p.fornecedor_manual || '',
    fornecedor_digitado: !p.fornecedor_id && Boolean(p.fornecedor_manual),
    data_fechamento: duplicar ? dataPadraoFechamento() : paraInputDataHora(p.data_fechamento),
    tipo_frete: p.tipo_frete || '',
    prazo_entrega: p.prazo_entrega || '',
    local_entrega: p.local_entrega || '',
    observacao_associado: p.observacao_associado || '',
    observacao_fornecedor: p.observacao_fornecedor || '',
    observacao_individual: p.observacao_individual || '',
    usar_mesma_observacao: Boolean(p.usar_mesma_observacao),
    solicitar_avaliacao_compra: Boolean(p.solicitar_avaliacao_compra),
    mostrar_valor_economizado: Boolean(p.mostrar_valor_economizado),
    duplicado_de_pedido_id: duplicar ? p.id : p.duplicado_de_pedido_id,
    marcadores: p.marcadores.map((m) => m.id),
    grupos: p.grupos,
    condicoes: p.condicoes.map((c) => ({ ...c, id: duplicar ? undefined : c.id })),
    itens: p.itens.map((it) => ({
      ...it,
      id: duplicar ? undefined : it.id,
      chave: novaChave(),
      quantidade_total: duplicar ? 0 : it.quantidade_total,
    })),
    associados: p.associados.map((a) =>
      duplicar
        ? {
            associado_id: a.associado_id,
            associado_nome: a.associado_nome,
            associado_bmsoft_id: a.associado_bmsoft_id,
            classificacao_id: a.classificacao_id,
            classificacao_nome: a.classificacao_nome,
            incluido_via: a.incluido_via,
          }
        : a,
    ),
  };
}

export const PedidoForm: React.FC<{ pedidoId?: number; duplicarDe?: number }> = ({ pedidoId, duplicarDe }) => {
  const { navegar, toast, confirmar } = useApp();
  const [form, setForm] = useState<FormPedido>(FORM_VAZIO);
  const [original, setOriginal] = useState<PedidoCompleto | null>(null);
  const [carregando, setCarregando] = useState(Boolean(pedidoId || duplicarDe));
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('gerais');
  const [gravando, setGravando] = useState(false);
  const [proximoNumero, setProximoNumero] = useState<number | null>(null);

  const [marcadores, setMarcadores] = useState<Marcador[]>([]);
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const carregarPedido = async (id: number, duplicar: boolean) => {
    const p = await api.get<PedidoCompleto>(`/pedidos/${id}`);
    setOriginal(duplicar ? null : p);
    setForm(paraForm(p, duplicar));
  };

  useEffect(() => {
    Promise.all([
      api.get<Marcador[]>('/marcadores').then(setMarcadores),
      api.get<Classificacao[]>('/classificacoes').then(setClassificacoes),
      api.get<Fornecedor[]>('/fornecedores').then(setFornecedores),
      !pedidoId ? api.get<{ proximo: number }>('/pedidos/proximo-numero').then((r) => setProximoNumero(r.proximo)) : null,
      pedidoId ? carregarPedido(pedidoId, false) : duplicarDe ? carregarPedido(duplicarDe, true) : null,
    ])
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [pedidoId, duplicarDe]);

  const set = <K extends keyof FormPedido>(campo: K, valor: FormPedido[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const itensRemovidosComQuantidade = useMemo(() => {
    if (!original) return [];
    const mantidos = new Set(form.itens.map((i) => i.id).filter(Boolean));
    return original.itens.filter((i) => !mantidos.has(i.id) && Number(i.quantidade_total) > 0);
  }, [original, form.itens]);

  const associadosRemovidosComPreenchimento = useMemo(() => {
    if (!original) return [];
    const mantidos = new Set(form.associados.map((a) => a.associado_id));
    return original.associados.filter((a) => !mantidos.has(a.associado_id) && a.situacao === 'preenchido');
  }, [original, form.associados]);

  const gravar = async (liberar = false) => {
    setErro(null);
    const payload = {
      ...form,
      situacao: liberar ? 'liberado_loja' : form.situacao,
      fornecedor_id: form.fornecedor_digitado ? null : form.fornecedor_id,
      fornecedor_manual: form.fornecedor_digitado ? form.fornecedor_manual : '',
    };
    if (!payload.nome.trim()) {
      setAba('gerais');
      setErro('Informe o nome do pedido.');
      return;
    }
    if (itensRemovidosComQuantidade.length || associadosRemovidosComPreenchimento.length) {
      const ok = await confirmar({
        titulo: 'Remover itens/associados com preenchimento',
        perigo: true,
        confirmar: 'Gravar mesmo assim',
        mensagem: (
          <div className="space-y-2">
            {itensRemovidosComQuantidade.length > 0 && (
              <p>
                {itensRemovidosComQuantidade.length} produto(s) excluído(s) já têm quantidades preenchidas pelas lojas (
                {itensRemovidosComQuantidade.map((i) => i.descricao).join(', ')}). Essas quantidades serão apagadas.
              </p>
            )}
            {associadosRemovidosComPreenchimento.length > 0 && (
              <p>
                {associadosRemovidosComPreenchimento.length} associado(s) desmarcado(s) já preencheram o pedido (
                {associadosRemovidosComPreenchimento.map((a) => a.associado_nome).join(', ')}). O preenchimento será apagado.
              </p>
            )}
          </div>
        ),
      });
      if (!ok) return;
    }

    setGravando(true);
    try {
      if (form.id) {
        await api.put(`/pedidos/${form.id}`, payload);
        toast(liberar ? `Pedido nº ${form.id} gravado e liberado para as lojas.` : `Pedido nº ${form.id} gravado.`);
        await carregarPedido(form.id, false);
      } else {
        const r = await api.post<{ id: number }>('/pedidos', payload);
        toast(liberar ? `Pedido nº ${r.id} criado e liberado para as lojas.` : `Pedido nº ${r.id} criado.`);
        navegar('novo', { id: r.id });
      }
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setGravando(false);
    }
  };

  if (carregando) return <Carregando texto="Carregando pedido…" />;

  const f = faltam(form.data_fechamento);
  const qtdPreenchidos = form.associados.filter((a) => a.situacao === 'preenchido').length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Cabeçalho do pedido */}
      <div className="shrink-0 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-4 sm:px-6 pt-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-mono font-bold text-stone-900 dark:text-stone-100 text-sm">
            Nº {form.id ?? proximoNumero ?? '—'}
            {!form.id && <span className="ml-1.5 font-sans font-medium text-[11px] text-stone-400">(gerado ao gravar)</span>}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${SITUACAO_PEDIDO[form.situacao].cor}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${SITUACAO_PEDIDO[form.situacao].ponto}`} />
            {SITUACAO_PEDIDO[form.situacao].rotulo}
          </span>
          <span className="text-stone-500 dark:text-stone-400 truncate max-w-md">{form.nome || 'Pedido sem nome'}</span>
          {form.duplicado_de_pedido_id && <Pill cor="roxo">Duplicado do nº {form.duplicado_de_pedido_id}</Pill>}
          <span className="ml-auto flex items-center gap-3 text-stone-500 dark:text-stone-400">
            <span>{form.itens.length} produto(s)</span>
            <span>
              {qtdPreenchidos} de {form.associados.length} associado(s)
            </span>
            {original && <span className="font-semibold text-stone-700 dark:text-stone-200">{formatMoeda(original.volume)}</span>}
          </span>
        </div>
        <Abas
          className="mt-2"
          ativa={aba}
          onChange={(a) => setAba(a as Aba)}
          abas={[
            { id: 'gerais', rotulo: 'Informações Gerais' },
            { id: 'compras', rotulo: 'Compras', contador: form.itens.length },
            { id: 'entrega', rotulo: 'Entrega' },
            { id: 'pagamento', rotulo: 'Cond. de Pagamento', contador: form.condicoes.length },
            'divisor',
            { id: 'associados', rotulo: 'Associados', contador: form.associados.length },
            { id: 'permissao', rotulo: 'Permissão de Compra' },
            { id: 'arquivos', rotulo: 'Arquivos', contador: original?.arquivos.length },
            ...(original ? ['divisor' as const, { id: 'historico', rotulo: 'Histórico' }] : []),
          ]}
        />
      </div>

      <div className="flex-1 overflow-auto min-h-0 px-4 sm:px-6 py-5">
        {erro && (
          <Alerta className="mb-4">
            {erro}
          </Alerta>
        )}

        {aba === 'gerais' && (
          <AbaGerais form={form} set={set} marcadores={marcadores} proximoNumero={proximoNumero} faltamTexto={f} />
        )}
        {aba === 'compras' && <AbaCompras form={form} set={set} setForm={setForm} fornecedores={fornecedores} editando={Boolean(original)} />}
        {aba === 'entrega' && <AbaEntrega form={form} set={set} />}
        {aba === 'pagamento' && <AbaPagamento form={form} set={set} classificacoes={classificacoes} />}
        {aba === 'associados' && <AbaAssociados form={form} set={set} setForm={setForm} classificacoes={classificacoes} />}
        {aba === 'permissao' && <AbaPermissao form={form} setForm={setForm} />}
        {aba === 'arquivos' && <AbaArquivos pedido={original} onAtualizar={() => original && carregarPedido(original.id, false)} />}
        {aba === 'historico' && original && <AbaHistorico pedido={original} />}
      </div>

      {/* Rodapé de ações */}
      <div className="shrink-0 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        <span className={`${HINT_CLASS} mr-auto`}>
          {form.situacao === 'liberado_loja'
            ? 'Liberado: as lojas já podem preencher este pedido.'
            : 'O pedido só aparece para as lojas quando a situação for "Liberado para as lojas".'}
        </span>
        <Botao onClick={() => navegar(original && original.situacao.startsWith('encerrado') ? 'encerrados' : 'abertos')}>
          {original ? 'Voltar' : 'Cancelar'}
        </Botao>
        <Botao variante="primario" icone={<Save className="w-3.5 h-3.5" />} onClick={() => gravar(false)} carregando={gravando}>
          Gravar
        </Botao>
        {form.situacao !== 'liberado_loja' && !form.situacao.startsWith('encerrado') && (
          <Botao variante="sucesso" icone={<Unlock className="w-3.5 h-3.5" />} onClick={() => gravar(true)} disabled={gravando}>
            Gravar e liberar para as lojas
          </Botao>
        )}
      </div>
    </div>
  );
};

type SetCampo = <K extends keyof FormPedido>(campo: K, valor: FormPedido[K]) => void;

// =====================================================================
// Informações Gerais (+ Observações)
// =====================================================================
const AbaGerais: React.FC<{
  form: FormPedido;
  set: SetCampo;
  marcadores: Marcador[];
  proximoNumero: number | null;
  faltamTexto: ReturnType<typeof faltam>;
}> = ({ form, set, marcadores, proximoNumero, faltamTexto }) => {
  const [abaObs, setAbaObs] = useState<'associado' | 'fornecedor' | 'individual'>('associado');
  const situacoes: SituacaoPedido[] = form.situacao.startsWith('encerrado') || form.situacao === 'aguardando_fechamento'
    ? ['em_elaboracao', 'liberado_loja', 'indisponivel', 'aguardando_fechamento', 'encerrado_com_volume', 'encerrado_sem_volume']
    : ['em_elaboracao', 'liberado_loja', 'indisponivel'];

  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Número do pedido</label>
          <input value={form.id ?? proximoNumero ?? ''} readOnly className={`${INPUT_CLASS} font-mono font-bold opacity-80 cursor-not-allowed`} />
          <span className={HINT_CLASS}>Sequencial automático, não editável</span>
        </div>
        <div className={FIELD_CLASS}>
          <label className={LABEL_CLASS}>Situação</label>
          <select value={form.situacao} onChange={(e) => set('situacao', e.target.value as SituacaoPedido)} required className={INPUT_CLASS}>
            {situacoes.map((s) => (
              <option key={s} value={s}>
                {s === 'liberado_loja' ? 'Liberado para as lojas' : SITUACAO_PEDIDO[s].rotulo}
              </option>
            ))}
          </select>
          <span className={HINT_CLASS}>Controla se a loja pode preencher</span>
        </div>
        <div className={`${FIELD_CLASS} md:col-span-2`}>
          <label className={LABEL_CLASS}>Data e horário de fechamento</label>
          <input
            type="datetime-local"
            value={form.data_fechamento}
            onChange={(e) => set('data_fechamento', e.target.value)}
            required
            className={INPUT_CLASS}
          />
          <span className={`${HINT_CLASS} flex items-center gap-1 ${faltamTexto.urgente ? '!text-rose-500' : ''}`}>
            <CalendarClock className="w-3 h-3" />
            {faltamTexto.vencido ? `${faltamTexto.texto} — as lojas não conseguem mais preencher` : `Faltam ${faltamTexto.texto} (visível para a Central e para a loja)`}
          </span>
        </div>
      </div>

      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Nome do pedido</label>
        <input
          value={form.nome}
          onChange={(e) => set('nome', e.target.value)}
          maxLength={200}
          required
          placeholder="Ex.: Rações e Suplementos - Campanha Outubro"
          className={INPUT_CLASS}
        />
      </div>

      <div className={FIELD_CLASS}>
        <label className={LABEL_CLASS}>Marcadores</label>
        <div className="flex flex-wrap gap-2">
          {marcadores.map((m) => {
            const ativo = form.marcadores.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => set('marcadores', ativo ? form.marcadores.filter((x) => x !== m.id) : [...form.marcadores, m.id])}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase cursor-pointer transition-all ${
                  ativo ? 'text-white border-transparent shadow-xs' : 'text-stone-500 border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
                style={ativo ? { backgroundColor: m.cor || '#0EA5E9' } : undefined}
              >
                {m.nome}
              </button>
            );
          })}
          {!marcadores.length && <span className={HINT_CLASS}>Nenhum marcador cadastrado (Mais opções → Marcadores)</span>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={LABEL_CLASS}>Observações</div>
          <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300 cursor-pointer">
            <input
              type="checkbox"
              checked={form.usar_mesma_observacao}
              onChange={(e) => {
                set('usar_mesma_observacao', e.target.checked);
                if (e.target.checked) set('observacao_fornecedor', form.observacao_associado);
              }}
            />
            Utilizar a mesma observação do associado para o fornecedor
          </label>
        </div>
        <Abas
          ativa={abaObs}
          onChange={(a) => setAbaObs(a as typeof abaObs)}
          className="border-b border-stone-200 dark:border-stone-800"
          abas={[
            { id: 'associado', rotulo: 'Associado' },
            { id: 'fornecedor', rotulo: 'Fornecedor' },
            { id: 'individual', rotulo: 'Associado - Individual por Fornecedor' },
          ]}
        />
        {abaObs === 'associado' && (
          <RichTextEditor
            valor={form.observacao_associado}
            onChange={(v) => {
              set('observacao_associado', v);
              if (form.usar_mesma_observacao) set('observacao_fornecedor', v);
            }}
            placeholder="Exibida para a loja no preenchimento e na impressão do pedido"
          />
        )}
        {abaObs === 'fornecedor' && (
          <>
            {form.usar_mesma_observacao && <Alerta tipo="aviso">Usando a mesma observação do associado.</Alerta>}
            <RichTextEditor
              valor={form.usar_mesma_observacao ? form.observacao_associado : form.observacao_fornecedor}
              onChange={(v) => set('observacao_fornecedor', v)}
              desabilitado={form.usar_mesma_observacao}
              placeholder="Enviada ao fornecedor junto com a ordem de compra"
            />
          </>
        )}
        {abaObs === 'individual' && (
          <RichTextEditor
            valor={form.observacao_individual}
            onChange={(v) => set('observacao_individual', v)}
            placeholder="Observação individual por fornecedor (uso interno da Central)"
          />
        )}
      </div>
    </div>
  );
};

// =====================================================================
// Compras: fornecedor e produtos
// =====================================================================
const AbaCompras: React.FC<{
  form: FormPedido;
  set: SetCampo;
  setForm: React.Dispatch<React.SetStateAction<FormPedido>>;
  fornecedores: Fornecedor[];
  editando: boolean;
}> = ({ form, set, setForm, fornecedores, editando }) => {
  const { confirmar } = useApp();
  const [busca, setBusca] = useState('');
  const [selecionarAberto, setSelecionarAberto] = useState(false);

  const termo = busca.trim().toLowerCase();
  const itensVisiveis = form.itens.filter(
    (it) => !termo || it.descricao.toLowerCase().includes(termo) || (it.gtin || '').includes(termo) || (it.produto_bmsoft_id || '').toLowerCase() === termo,
  );

  const atualizarItem = (chave: string, campo: keyof PedidoItem, valor: any) =>
    setForm((f) => ({ ...f, itens: f.itens.map((it) => (chaveItem(it) === chave ? { ...it, [campo]: valor } : it)) }));

  const removerItem = (chave: string) => setForm((f) => ({ ...f, itens: f.itens.filter((it) => chaveItem(it) !== chave) }));

  const adicionarManual = () =>
    setForm((f) => ({
      ...f,
      itens: [
        ...f.itens,
        { chave: novaChave(), produto_id: null, gtin: null, descricao: '', unidade: 'UN', qtd_embalagem: null, preco_compra: null, limite_maximo: null, limite_logistica: null, imagem_url: null },
      ],
    }));

  const limpar = async () => {
    const ok = await confirmar({
      titulo: 'Limpar produtos do pedido',
      mensagem: editando
        ? 'Remover todos os produtos do pedido? Ao gravar, as quantidades já preenchidas pelas lojas também serão apagadas.'
        : 'Remover todos os produtos do pedido?',
      confirmar: 'Limpar',
      perigo: true,
    });
    if (ok) set('itens', []);
  };

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-2">
        <div className="flex items-center justify-between">
          <label className={LABEL_CLASS}>Fornecedor</label>
          <Toggle checked={form.fornecedor_digitado} onChange={(v) => set('fornecedor_digitado', v)} size="sm" label="Digitar manualmente (cotação)" />
        </div>
        {form.fornecedor_digitado ? (
          <input
            value={form.fornecedor_manual}
            onChange={(e) => set('fornecedor_manual', e.target.value)}
            maxLength={150}
            placeholder="Nome do fornecedor não cadastrado"
            className={`${INPUT_CLASS} w-full`}
          />
        ) : (
          <select value={form.fornecedor_id ?? ''} onChange={(e) => set('fornecedor_id', e.target.value ? Number(e.target.value) : null)} className={`${INPUT_CLASS} w-full`}>
            <option value="">— Selecione um fornecedor cadastrado —</option>
            {fornecedores.map((fo) => (
              <option key={fo.id} value={fo.id}>
                {fo.bmsoft_id ? `${fo.bmsoft_id} — ` : ''}
                {fo.descricao}
                {fo.email ? ` (${fo.email})` : ' (sem e-mail)'}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className={`${LABEL_CLASS} mr-2`}>Produtos</div>
          <Botao variante="primario" icone={<PackagePlus className="w-3.5 h-3.5" />} onClick={() => setSelecionarAberto(true)}>
            Selecionar Produtos
          </Botao>
          <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={adicionarManual}>
            Digitar produto
          </Botao>
          <Botao icone={<Eraser className="w-3.5 h-3.5" />} onClick={limpar} disabled={!form.itens.length}>
            Limpar produtos do pedido
          </Botao>
          <div className="relative ml-auto w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por descrição ou código de barras (GTIN)"
              className={`${INPUT_CLASS} w-full pl-9`}
            />
          </div>
        </div>

        <div className="overflow-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <TH className="w-8">#</TH>
                <TH>ID</TH>
                <TH>GTIN</TH>
                <TH className="min-w-64">Descrição</TH>
                <TH>Un.</TH>
                <TH>Embalagem</TH>
                <TH className="text-right">Preço estimado</TH>
                <TH className="text-right">Preço de compra</TH>
                {editando && <TH className="text-right">Qtde preenchida</TH>}
                <TH className="w-8" />
                <TH className="w-8" />
              </tr>
            </thead>
            <tbody>
              {itensVisiveis.map((it, i) => {
                const chave = chaveItem(it);
                const manual = !it.produto_id;
                return (
                  <tr key={chave} className="bg-white dark:bg-stone-900">
                    <TD className="text-stone-400">{i + 1}</TD>
                    <TD className="font-mono whitespace-nowrap">{it.produto_bmsoft_id || (manual ? <span className="text-stone-300">—</span> : `#${it.produto_id}`)}</TD>
                    <TD>
                      {manual ? (
                        <input value={it.gtin || ''} onChange={(e) => atualizarItem(chave, 'gtin', e.target.value)} className={`${INPUT_CLASS} w-32 font-mono`} />
                      ) : (
                        <span className="font-mono text-stone-500">{it.gtin || '—'}</span>
                      )}
                    </TD>
                    <TD>
                      {manual ? (
                        <input
                          value={it.descricao}
                          onChange={(e) => atualizarItem(chave, 'descricao', e.target.value)}
                          required
                          placeholder="Descrição do produto"
                          className={`${INPUT_CLASS} w-full`}
                        />
                      ) : (
                        <span className="font-medium text-stone-800 dark:text-stone-100">{it.descricao}</span>
                      )}
                    </TD>
                    <TD>
                      <input
                        value={it.unidade}
                        onChange={(e) => atualizarItem(chave, 'unidade', e.target.value.toUpperCase())}
                        maxLength={10}
                        required
                        className={`${INPUT_CLASS} w-14`}
                      />
                    </TD>
                    <TD>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={it.qtd_embalagem ?? ''}
                        onChange={(e) => atualizarItem(chave, 'qtd_embalagem', e.target.value === '' ? null : Number(e.target.value))}
                        className={`${INPUT_CLASS} w-20 text-right`}
                        title="Quantidade múltiplo (informativo)"
                      />
                    </TD>
                    <TD className="text-right text-stone-400 whitespace-nowrap">{it.preco_estimado ? formatMoeda(it.preco_estimado) : '—'}</TD>
                    <TD className="text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={it.preco_compra ?? ''}
                        onChange={(e) => atualizarItem(chave, 'preco_compra', e.target.value === '' ? null : Number(e.target.value))}
                        required
                        className={`${INPUT_CLASS} w-28 text-right font-semibold`}
                      />
                    </TD>
                    {editando && <TD className="text-right font-semibold">{it.quantidade_total ? formatNumero(it.quantidade_total) : '—'}</TD>}
                    <TD>
                      <ImagemHover url={it.imagem_url} descricao={it.descricao} />
                    </TD>
                    <TD>
                      <button
                        type="button"
                        onClick={() => removerItem(chave)}
                        title="Excluir produto do pedido"
                        className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TD>
                  </tr>
                );
              })}
              {!itensVisiveis.length && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-stone-400">
                    {form.itens.length ? 'Nenhum produto corresponde à busca.' : 'Nenhum produto no pedido. Use "Selecionar Produtos" ou "Digitar produto".'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selecionarAberto && (
        <SelecionarProdutosModal
          jaNoPedido={new Set(form.itens.map((i) => i.produto_id).filter((x): x is number => Boolean(x)))}
          onFechar={() => setSelecionarAberto(false)}
          onAdicionar={(produtos) => {
            setForm((f) => ({
              ...f,
              itens: [
                ...f.itens,
                ...produtos.map((p) => ({
                  chave: novaChave(),
                  produto_id: p.id,
                  produto_bmsoft_id: p.bmsoft_id,
                  gtin: p.gtin,
                  descricao: p.descricao,
                  unidade: p.unidade,
                  qtd_embalagem: p.qtd_embalagem,
                  preco_compra: p.preco_estimado,
                  preco_estimado: p.preco_estimado,
                  limite_maximo: null,
                  limite_logistica: null,
                  imagem_url: p.imagem_url,
                })),
              ],
            }));
            setSelecionarAberto(false);
          }}
        />
      )}
    </div>
  );
};

const SelecionarProdutosModal: React.FC<{
  jaNoPedido: Set<number>;
  onFechar: () => void;
  onAdicionar: (p: Produto[]) => void;
}> = ({ jaNoPedido, onFechar, onAdicionar }) => {
  const [filtros, setFiltros] = useState<{ classes: string[]; marcas: string[] }>({ classes: [], marcas: [] });
  const [classe, setClasse] = useState('');
  const [marca, setMarca] = useState('');
  const [busca, setBusca] = useState('');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [marcados, setMarcados] = useState<Map<number, Produto>>(new Map());
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    api.get('/produtos/filtros').then(setFiltros).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setCarregando(true);
      api
        .get<Produto[]>(`/produtos${qs({ classe, marca, busca })}`)
        .then(setProdutos)
        .finally(() => setCarregando(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [classe, marca, busca]);

  const disponiveis = produtos.filter((p) => !jaNoPedido.has(p.id));
  const alternar = (p: Produto) =>
    setMarcados((m) => {
      const n = new Map(m);
      n.has(p.id) ? n.delete(p.id) : n.set(p.id, p);
      return n;
    });
  const todosMarcados = disponiveis.length > 0 && disponiveis.every((p) => marcados.has(p.id));

  return (
    <Modal
      titulo="Selecionar Produtos"
      subtitulo="Busque por classe, marca, descrição ou GTIN no cadastro existente"
      largura="xl"
      onFechar={onFechar}
      rodape={
        <>
          <span className="mr-auto text-xs text-stone-500">{marcados.size} produto(s) marcado(s)</span>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!marcados.size} onClick={() => onAdicionar([...marcados.values()])}>
            Adicionar ao pedido
          </Botao>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <select value={classe} onChange={(e) => setClasse(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todas as classes</option>
          {filtros.classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={marca} onChange={(e) => setMarca(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todas as marcas</option>
          {filtros.marcas.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição, GTIN ou ID BMSoft" className={INPUT_CLASS} autoFocus />
      </div>
      <div className="border border-stone-200 dark:border-stone-800 rounded-xl overflow-auto max-h-[52vh]">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH className="w-8">
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={() =>
                    setMarcados((m) => {
                      const n = new Map(m);
                      disponiveis.forEach((p) => (todosMarcados ? n.delete(p.id) : n.set(p.id, p)));
                      return n;
                    })
                  }
                />
              </TH>
              <TH>ID</TH>
              <TH>GTIN</TH>
              <TH>Descrição</TH>
              <TH>Classe</TH>
              <TH>Marca</TH>
              <TH>Un.</TH>
              <TH className="text-right">Preço estimado</TH>
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
            {!carregando &&
              produtos.map((p) => {
                const ja = jaNoPedido.has(p.id);
                return (
                  <tr
                    key={p.id}
                    onClick={() => !ja && alternar(p)}
                    className={`${ja ? 'opacity-40' : 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800'} ${marcados.has(p.id) ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-white dark:bg-stone-900'}`}
                  >
                    <TD>
                      <input type="checkbox" disabled={ja} checked={ja || marcados.has(p.id)} readOnly />
                    </TD>
                    <TD className="font-mono">{p.bmsoft_id || '—'}</TD>
                    <TD className="font-mono text-stone-500">{p.gtin || '—'}</TD>
                    <TD className="font-medium">
                      {p.descricao}
                      {ja && <span className="ml-2 text-[10px] text-stone-500">(já no pedido)</span>}
                    </TD>
                    <TD>{p.classe || '—'}</TD>
                    <TD>{p.marca || '—'}</TD>
                    <TD>{p.unidade}</TD>
                    <TD className="text-right">{p.preco_estimado !== null ? formatMoeda(p.preco_estimado) : '—'}</TD>
                  </tr>
                );
              })}
            {!carregando && !produtos.length && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-stone-400">
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Modal>
  );
};

// =====================================================================
// Entrega
// =====================================================================
const AbaEntrega: React.FC<{ form: FormPedido; set: SetCampo }> = ({ form, set }) => (
  <div className="max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS}>Tipo de frete</label>
      <select value={form.tipo_frete} onChange={(e) => set('tipo_frete', e.target.value)} className={INPUT_CLASS}>
        <option value="">Não informado</option>
        <option value="CIF">CIF (fornecedor paga)</option>
        <option value="FOB">FOB (comprador paga)</option>
      </select>
    </div>
    <div className={`${FIELD_CLASS} md:col-span-2`}>
      <label className={LABEL_CLASS}>Prazo de entrega</label>
      <input value={form.prazo_entrega} onChange={(e) => set('prazo_entrega', e.target.value)} maxLength={100} placeholder="Ex.: 15 dias após o pedido" className={INPUT_CLASS} />
    </div>
    <div className={`${FIELD_CLASS} md:col-span-3`}>
      <label className={LABEL_CLASS}>Local de entrega</label>
      <input value={form.local_entrega} onChange={(e) => set('local_entrega', e.target.value)} maxLength={200} placeholder="Ex.: Centro de Distribuição — endereço" className={INPUT_CLASS} />
      <span className={HINT_CLASS}>Exibido para a loja no cabeçalho do pedido e na impressão enviada ao fornecedor.</span>
    </div>
  </div>
);

// =====================================================================
// Condições de pagamento
// =====================================================================
const AbaPagamento: React.FC<{ form: FormPedido; set: SetCampo; classificacoes: Classificacao[] }> = ({ form, set, classificacoes }) => {
  const atualizar = (i: number, campo: keyof CondicaoPagamento, valor: any) =>
    set('condicoes', form.condicoes.map((c, idx) => (idx === i ? { ...c, [campo]: valor } : c)));

  return (
    <div className="max-w-4xl space-y-3">
      <Alerta tipo="aviso">
        <b>Percentual</b> é o acréscimo aplicado ao preço dos produtos para quem escolher a condição. <b>Grupo</b> define para qual
        classificação a condição vale (em branco = todos). Com percentual e grupo em branco, vale o preço informado item a item. A loja só
        vê as condições do seu grupo e precisa atingir o <b>valor mínimo</b> para gravar.
      </Alerta>
      <div className="overflow-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <TH>Condição de Pagamento</TH>
              <TH className="text-right">Percentual (%)</TH>
              <TH className="text-right">Valor Mínimo (R$)</TH>
              <TH>Grupo</TH>
              <TH className="w-8" />
            </tr>
          </thead>
          <tbody>
            {form.condicoes.map((c, i) => (
              <tr key={c.id ?? `n${i}`}>
                <TD>
                  <input
                    value={c.condicao_pagamento}
                    onChange={(e) => atualizar(i, 'condicao_pagamento', e.target.value)}
                    placeholder="Ex.: 30/60dd"
                    maxLength={100}
                    required
                    className={`${INPUT_CLASS} w-full`}
                  />
                </TD>
                <TD className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    value={c.percentual ?? ''}
                    onChange={(e) => atualizar(i, 'percentual', e.target.value === '' ? null : Number(e.target.value))}
                    className={`${INPUT_CLASS} w-24 text-right`}
                  />
                </TD>
                <TD className="text-right">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={c.valor_minimo ?? ''}
                    onChange={(e) => atualizar(i, 'valor_minimo', e.target.value === '' ? null : Number(e.target.value))}
                    className={`${INPUT_CLASS} w-32 text-right`}
                  />
                </TD>
                <TD>
                  <select
                    value={c.classificacao_id ?? ''}
                    onChange={(e) => atualizar(i, 'classificacao_id', e.target.value ? Number(e.target.value) : null)}
                    className={`${INPUT_CLASS} w-full`}
                  >
                    <option value="">Todos</option>
                    {classificacoes.map((cl) => (
                      <option key={cl.id} value={cl.id}>
                        {cl.nome}
                      </option>
                    ))}
                  </select>
                </TD>
                <TD>
                  <button
                    type="button"
                    onClick={() => set('condicoes', form.condicoes.filter((_, idx) => idx !== i))}
                    title="Remover condição"
                    className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TD>
              </tr>
            ))}
            {!form.condicoes.length && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-stone-400">
                  Nenhuma condição: a loja grava sem escolher condição e vale o preço de cada item.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Botao
        icone={<Plus className="w-3.5 h-3.5" />}
        onClick={() => set('condicoes', [...form.condicoes, { condicao_pagamento: '', percentual: null, valor_minimo: null, classificacao_id: null }])}
      >
        Adicionar condição
      </Botao>
    </div>
  );
};

// =====================================================================
// Associados
// =====================================================================
const AbaAssociados: React.FC<{
  form: FormPedido;
  set: SetCampo;
  setForm: React.Dispatch<React.SetStateAction<FormPedido>>;
  classificacoes: Classificacao[];
}> = ({ form, set, setForm, classificacoes }) => {
  const { toast } = useApp();
  // Associados já carregados na tela, marcados ou não: permite desmarcar e remarcar
  const [candidatos, setCandidatos] = useState<PedidoAssociado[]>(form.associados);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Associado[]>([]);
  const [filtroLista, setFiltroLista] = useState('');

  const selecionados = new Set(form.associados.map((a) => a.associado_id));

  useEffect(() => {
    if (busca.trim().length < 2) {
      setResultados([]);
      return;
    }
    const t = window.setTimeout(() => api.get<Associado[]>(`/associados${qs({ busca })}`).then(setResultados), 250);
    return () => window.clearTimeout(t);
  }, [busca]);

  const paraPA = (a: Associado, via: 'grupo' | 'individual'): PedidoAssociado => ({
    associado_id: a.id,
    associado_nome: a.nome,
    associado_bmsoft_id: a.bmsoft_id,
    classificacao_id: a.classificacao_id,
    classificacao_nome: a.classificacao_nome,
    incluido_via: via,
  });

  const incluir = (novos: PedidoAssociado[]) => {
    setCandidatos((c) => [...c, ...novos.filter((n) => !c.some((x) => x.associado_id === n.associado_id))]);
    setForm((f) => ({ ...f, associados: [...f.associados, ...novos.filter((n) => !f.associados.some((x) => x.associado_id === n.associado_id))] }));
  };

  const carregarGrupo = async (cl: Classificacao) => {
    const lista = await api.get<Associado[]>(`/associados${qs({ classificacao_id: cl.id })}`);
    incluir(lista.map((a) => paraPA(a, 'grupo')));
    if (!form.grupos.includes(cl.id)) set('grupos', [...form.grupos, cl.id]);
    toast(`${lista.length} associado(s) do grupo ${cl.nome} carregado(s).`);
  };

  const removerGrupo = (cl: Classificacao) => {
    set('grupos', form.grupos.filter((g) => g !== cl.id));
    setForm((f) => ({
      ...f,
      associados: f.associados.filter((a) => !(a.classificacao_id === cl.id && a.incluido_via === 'grupo' && a.situacao !== 'preenchido')),
    }));
  };

  const alternar = (pa: PedidoAssociado) =>
    setForm((f) => ({
      ...f,
      associados: selecionados.has(pa.associado_id) ? f.associados.filter((a) => a.associado_id !== pa.associado_id) : [...f.associados, pa],
    }));

  const termo = filtroLista.trim().toLowerCase();
  const lista = candidatos
    .filter((c) => !termo || c.associado_nome.toLowerCase().includes(termo) || c.associado_bmsoft_id.includes(termo))
    .sort((a, b) => a.associado_nome.localeCompare(b.associado_nome));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className={`${LABEL_CLASS} flex items-center gap-1.5`}>
            <Users className="w-3.5 h-3.5" /> Grupo de Associados (classificação)
          </div>
          {classificacoes.map((cl) => {
            const usado = form.grupos.includes(cl.id);
            return (
              <div
                key={cl.id}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border ${
                  usado ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30' : 'border-stone-200 dark:border-stone-800'
                }`}
              >
                <div className="text-xs">
                  <div className="font-semibold text-stone-800 dark:text-stone-100">{cl.nome}</div>
                  <div className="text-[11px] text-stone-500">{cl.total_associados} associado(s) ativos</div>
                </div>
                <div className="flex gap-1">
                  <Botao onClick={() => carregarGrupo(cl)} variante={usado ? 'secundario' : 'primario'}>
                    {usado ? 'Recarregar' : 'Carregar todos'}
                  </Botao>
                  {usado && (
                    <button onClick={() => removerGrupo(cl)} title="Retirar o grupo" className="p-1.5 rounded text-stone-400 hover:text-rose-600 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className={`${LABEL_CLASS} flex items-center gap-1.5`}>
            <UserPlus className="w-3.5 h-3.5" /> Incluir individualmente
          </div>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, ID BMSoft ou classificação" className={`${INPUT_CLASS} w-full`} />
          {resultados.length > 0 && (
            <div className="border border-stone-200 dark:border-stone-800 rounded-lg max-h-60 overflow-auto divide-y divide-stone-100 dark:divide-stone-800">
              {resultados.map((a) => {
                const ja = selecionados.has(a.id);
                return (
                  <button
                    key={a.id}
                    disabled={ja}
                    onClick={() => incluir([paraPA(a, 'individual')])}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                  >
                    <span className="font-mono text-stone-500 mr-1.5">{a.bmsoft_id}</span>
                    {a.nome}
                    <span className="text-[10px] text-stone-400 ml-1.5">{a.classificacao_nome}</span>
                    {ja && <span className="text-[10px] text-emerald-600 ml-1.5">✓ incluído</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t border-stone-200 dark:border-stone-800">
          <Toggle
            checked={form.solicitar_avaliacao_compra}
            onChange={(v) => set('solicitar_avaliacao_compra', v)}
            size="sm"
            label="Solicitar avaliação do processo de compra para o associado"
          />
          <Toggle
            checked={form.mostrar_valor_economizado}
            onChange={(v) => set('mostrar_valor_economizado', v)}
            size="sm"
            label="Mostrar valor economizado ao associado"
          />
        </div>
      </div>

      <div className="space-y-2 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs text-stone-500">
            <b className="text-stone-800 dark:text-stone-100">{form.associados.length}</b> selecionado(s) de {candidatos.length} carregado(s)
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Botao onClick={() => setForm((f) => ({ ...f, associados: [...candidatos] }))} disabled={!candidatos.length}>
              Marcar todos
            </Botao>
            <Botao
              onClick={() => setForm((f) => ({ ...f, associados: f.associados.filter((a) => a.situacao === 'preenchido') }))}
              disabled={!form.associados.length}
            >
              Desmarcar todos
            </Botao>
            <input value={filtroLista} onChange={(e) => setFiltroLista(e.target.value)} placeholder="Filtrar lista" className={`${INPUT_CLASS} w-44`} />
          </div>
        </div>
        <div className="overflow-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900 max-h-[60vh]">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr>
                <TH className="w-8" />
                <TH>ID</TH>
                <TH>Associado</TH>
                <TH>Classificação</TH>
                <TH>Incluído via</TH>
                <TH>Preenchimento</TH>
                <TH className="text-right">Volume</TH>
              </tr>
            </thead>
            <tbody>
              {lista.map((pa) => {
                const marcado = selecionados.has(pa.associado_id);
                const atual = form.associados.find((a) => a.associado_id === pa.associado_id) || pa;
                return (
                  <tr
                    key={pa.associado_id}
                    onClick={() => alternar(atual)}
                    className={`cursor-pointer ${marcado ? 'bg-white dark:bg-stone-900' : 'bg-stone-50 dark:bg-stone-950 opacity-60'} hover:bg-stone-50 dark:hover:bg-stone-800`}
                  >
                    <TD>
                      <input type="checkbox" checked={marcado} readOnly />
                    </TD>
                    <TD className="font-mono">{pa.associado_bmsoft_id}</TD>
                    <TD className="font-medium text-stone-800 dark:text-stone-100">{pa.associado_nome}</TD>
                    <TD>{pa.classificacao_nome || '—'}</TD>
                    <TD>
                      <Pill cor={pa.incluido_via === 'grupo' ? 'azul' : 'cinza'}>{pa.incluido_via === 'grupo' ? 'Grupo' : 'Individual'}</Pill>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {atual.situacao === 'preenchido' ? (
                        <Pill cor="verde" title={`${formatDataHora(atual.data_acao)} • ${atual.usuario_acao_nome}`}>
                          Preenchido {formatDataHora(atual.data_acao)}
                        </Pill>
                      ) : atual.situacao === 'rejeitado' ? (
                        <Pill cor="vermelho" title={`${formatDataHora(atual.data_acao)} • ${atual.usuario_acao_nome}`}>
                          Rejeitado {formatDataHora(atual.data_acao)}
                        </Pill>
                      ) : atual.situacao === 'pendente' ? (
                        <Pill cor="ambar">Pendente</Pill>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </TD>
                    <TD className="text-right font-semibold">{atual.volume ? formatMoeda(atual.volume) : '—'}</TD>
                  </tr>
                );
              })}
              {!lista.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-stone-400">
                    Carregue um grupo de associados ou inclua associados individualmente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// =====================================================================
// Permissão de Compra: limites por item
// =====================================================================
const AbaPermissao: React.FC<{ form: FormPedido; setForm: React.Dispatch<React.SetStateAction<FormPedido>> }> = ({ form, setForm }) => {
  const atualizar = (chave: string, campo: 'limite_maximo' | 'limite_logistica', valor: string) =>
    setForm((f) => ({
      ...f,
      itens: f.itens.map((it) => (chaveItem(it) === chave ? { ...it, [campo]: valor === '' ? null : Number(valor) } : it)),
    }));

  return (
    <div className="max-w-5xl space-y-3">
      <Alerta tipo="aviso">
        <b>Máximo por loja</b>: maior quantidade que cada associado pode pedir do item. <b>Logística</b>: quantidade total disponível do
        item somando todas as lojas (ex.: capacidade de carga). Em branco = sem limite.
      </Alerta>
      <div className="overflow-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <TH>ID</TH>
              <TH>Descrição</TH>
              <TH>Un.</TH>
              <TH className="text-right">Máximo por loja</TH>
              <TH className="text-right">Logística (total)</TH>
              <TH className="text-right">Já preenchido</TH>
            </tr>
          </thead>
          <tbody>
            {form.itens.map((it) => {
              const chave = chaveItem(it);
              return (
                <tr key={chave}>
                  <TD className="font-mono">{it.produto_bmsoft_id || '—'}</TD>
                  <TD className="font-medium">{it.descricao || <span className="text-stone-400">sem descrição</span>}</TD>
                  <TD>{it.unidade}</TD>
                  <TD className="text-right">
                    <input type="number" min={0} step="any" value={it.limite_maximo ?? ''} onChange={(e) => atualizar(chave, 'limite_maximo', e.target.value)} className={`${INPUT_CLASS} w-28 text-right`} />
                  </TD>
                  <TD className="text-right">
                    <input type="number" min={0} step="any" value={it.limite_logistica ?? ''} onChange={(e) => atualizar(chave, 'limite_logistica', e.target.value)} className={`${INPUT_CLASS} w-28 text-right`} />
                  </TD>
                  <TD className="text-right">{it.quantidade_total ? formatNumero(it.quantidade_total) : '—'}</TD>
                </tr>
              );
            })}
            {!form.itens.length && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-stone-400">
                  Inclua produtos na aba Compras para definir limites.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// =====================================================================
// Arquivos
// =====================================================================
const AbaArquivos: React.FC<{ pedido: PedidoCompleto | null; onAtualizar: () => void }> = ({ pedido, onAtualizar }) => {
  const { toast, confirmar } = useApp();
  const [enviando, setEnviando] = useState(false);

  if (!pedido) {
    return (
      <Alerta tipo="aviso">
        <span className="inline-flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> Grave o pedido para anexar arquivos (catálogos, tabelas do fornecedor etc.).
        </span>
      </Alerta>
    );
  }

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setEnviando(true);
    try {
      for (const arq of Array.from(arquivos)) {
        const conteudo = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(arq);
        });
        await api.post(`/pedidos/${pedido.id}/arquivos`, { nome: arq.name, conteudo });
      }
      toast('Arquivo(s) anexado(s).');
      onAtualizar();
    } catch (e: any) {
      toast(e.message, 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-3">
      <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-xl cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-900 text-xs text-stone-500">
        <FileUp className="w-6 h-6 text-stone-400" />
        {enviando ? 'Enviando…' : 'Clique para anexar arquivos (até 15 MB cada) — visíveis também para as lojas'}
        <input type="file" multiple className="hidden" onChange={(e) => enviar(e.target.files)} disabled={enviando} />
      </label>
      <div className="border border-stone-200 dark:border-stone-800 rounded-xl divide-y divide-stone-100 dark:divide-stone-800 bg-white dark:bg-stone-900">
        {pedido.arquivos.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2 text-xs">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{a.nome_arquivo}</div>
              <div className="text-[11px] text-stone-400">
                {formatDataHora(a.criado_em)} • {a.enviado_por_nome || '—'}
              </div>
            </div>
            <a href={urlArquivo(pedido.id, a.id)} className="p-1.5 rounded text-stone-500 hover:text-blue-600" title="Baixar">
              <Download className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={async () => {
                if (!(await confirmar({ titulo: 'Excluir arquivo', mensagem: `Excluir "${a.nome_arquivo}"?`, perigo: true, confirmar: 'Excluir' }))) return;
                await api.del(`/pedidos/${pedido.id}/arquivos/${a.id}`).catch((e) => toast(e.message, 'erro'));
                onAtualizar();
              }}
              className="p-1.5 rounded text-stone-400 hover:text-rose-600 cursor-pointer"
              title="Excluir"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {!pedido.arquivos.length && <div className="px-3 py-6 text-center text-xs text-stone-400">Nenhum arquivo anexado.</div>}
      </div>
    </div>
  );
};

// =====================================================================
// Histórico do pedido
// =====================================================================
const AbaHistorico: React.FC<{ pedido: PedidoCompleto }> = ({ pedido }) => (
  <div className="max-w-4xl overflow-auto border border-stone-200 dark:border-stone-800 rounded-xl bg-white dark:bg-stone-900">
    <table className="w-full text-xs border-separate border-spacing-0">
      <thead>
        <tr>
          <TH>Data/hora</TH>
          <TH>Ação</TH>
          <TH>Usuário</TH>
          <TH>Associado</TH>
          <TH>Observação</TH>
        </tr>
      </thead>
      <tbody>
        {pedido.log.map((l) => (
          <tr key={l.id}>
            <TD className="whitespace-nowrap">{formatDataHora(l.data_acao)}</TD>
            <TD className="whitespace-nowrap font-semibold">{ACOES_LOG[l.acao] || l.acao}</TD>
            <TD className="whitespace-nowrap">{l.usuario_nome || 'Sistema'}</TD>
            <TD>{l.associado_nome || '—'}</TD>
            <TD className="text-stone-500">{l.observacao || ''}</TD>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

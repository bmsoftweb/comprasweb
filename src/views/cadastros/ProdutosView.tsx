import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Produto } from '../../types';
import { api, qs } from '../../services/api';
import { Alerta, Botao, Carregando, ImagemHover, Modal, Pill, TD, TH, TR_CLASS, useApp, Vazio } from '../../components/ui';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../../utils/formStyles';
import { formatMoeda, formatNumero, parseDecimal } from '../../utils/formatters';
import { BarraCadastro, ImportarModal, useDebounce } from './comum';

type Edicao = Partial<Produto> & { preco_txt?: string; emb_txt?: string };

export const ProdutosView: React.FC = () => {
  const { refreshToken, toast, confirmar } = useApp();
  const [lista, setLista] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [origem, setOrigem] = useState('');
  const buscaDeb = useDebounce(busca);
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api
      .get<Produto[]>(`/produtos${qs({ busca: buscaDeb, origem })}`)
      .then(setLista)
      .catch((e) => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, [buscaDeb, origem]);

  useEffect(carregar, [carregar, refreshToken]);

  const gravar = async () => {
    if (!editando) return;
    setErro(null);
    const dados = { ...editando, preco_estimado: parseDecimal(editando.preco_txt ?? ''), qtd_embalagem: parseDecimal(editando.emb_txt ?? '') };
    try {
      if (editando.id) await api.put(`/produtos/${editando.id}`, dados);
      else await api.post('/produtos', dados);
      toast('Produto gravado.');
      setEditando(null);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const campo = (nome: keyof Edicao, rotulo: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={FIELD_CLASS}>
      <label className={LABEL_CLASS}>{rotulo}</label>
      <input value={(editando?.[nome] as any) ?? ''} onChange={(e) => setEditando((p) => ({ ...p!, [nome]: e.target.value }))} className={INPUT_CLASS} {...props} />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <BarraCadastro resumo={`${lista.length} produto(s)`} busca={busca} onBusca={setBusca} placeholder="Descrição, GTIN, ID BMSoft ou marca">
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todas as origens</option>
          <option value="bmsoft">BMSoft</option>
          <option value="manual">Digitados</option>
        </select>
        <Botao icone={<Upload className="w-3.5 h-3.5" />} onClick={() => setImportando(true)}>
          Carregar do BMSoft
        </Botao>
        <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditando({ unidade: 'UN' })}>
          Novo
        </Botao>
      </BarraCadastro>

      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH className="w-8" />
              <TH>ID</TH>
              <TH>GTIN</TH>
              <TH>Descrição</TH>
              <TH>Unidade</TH>
              <TH>Classe / Marca</TH>
              <TH className="text-right">Embalagem</TH>
              <TH className="text-right">Preço estimado</TH>
              <TH>Origem</TH>
              <TH className="w-20" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={10}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !lista.length && (
              <tr>
                <td colSpan={10}>
                  <Vazio texto="Nenhum produto" />
                </td>
              </tr>
            )}
            {!carregando &&
              lista.map((p) => (
                <tr key={p.id} className={TR_CLASS} onDoubleClick={() => setEditando({ ...p, preco_txt: p.preco_estimado?.toString() ?? '', emb_txt: p.qtd_embalagem?.toString() ?? '' })}>
                  <TD>
                    <ImagemHover url={p.imagem_url} descricao={p.descricao} />
                  </TD>
                  <TD className="font-mono">{p.bmsoft_id || <span className="text-stone-300">—</span>}</TD>
                  <TD className="font-mono text-stone-500">{p.gtin || '—'}</TD>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{p.descricao}</TD>
                  <TD>{p.unidade}</TD>
                  <TD className="text-stone-500">{[p.classe, p.marca].filter(Boolean).join(' / ') || '—'}</TD>
                  <TD className="text-right">{p.qtd_embalagem ? formatNumero(p.qtd_embalagem) : '—'}</TD>
                  <TD className="text-right">{p.preco_estimado !== null ? formatMoeda(p.preco_estimado) : '—'}</TD>
                  <TD>
                    <Pill cor={p.origem === 'bmsoft' ? 'azul' : 'cinza'}>{p.origem === 'bmsoft' ? 'BMSoft' : 'Digitado'}</Pill>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditando({ ...p, preco_txt: p.preco_estimado?.toString() ?? '', emb_txt: p.qtd_embalagem?.toString() ?? '' })}
                      className="p-1.5 rounded text-stone-400 hover:text-blue-600 cursor-pointer"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirmar({ titulo: 'Excluir produto', mensagem: `Excluir "${p.descricao}"?`, perigo: true, confirmar: 'Excluir' }))) return;
                        try {
                          await api.del(`/produtos/${p.id}`);
                          carregar();
                        } catch (e: any) {
                          toast(e.message, 'erro');
                        }
                      }}
                      className="p-1.5 rounded text-stone-400 hover:text-rose-600 cursor-pointer"
                      title="Excluir"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <Modal
          titulo={editando.id ? 'Editar produto' : 'Novo produto (digitado)'}
          onFechar={() => setEditando(null)}
          largura="lg"
          rodape={
            <>
              <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
              <Botao variante="primario" onClick={gravar}>
                Gravar
              </Botao>
            </>
          }
        >
          <div className="space-y-4">
            {erro && <Alerta>{erro}</Alerta>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {campo('bmsoft_id', 'ID BMSoft', { placeholder: 'Em branco se digitado', maxLength: 30 })}
              {campo('gtin', 'Código de barras (GTIN)', { maxLength: 20 })}
              {campo('unidade', 'Unidade', { required: true, maxLength: 10, placeholder: 'SC, LT, KG…' })}
            </div>
            {campo('descricao', 'Descrição', { required: true, maxLength: 200 })}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {campo('classe', 'Classe', { maxLength: 80 })}
              {campo('marca', 'Marca', { maxLength: 80 })}
              {campo('emb_txt', 'Embalagem (qtde múltiplo)', { placeholder: 'Informativo', inputMode: 'decimal' })}
              {campo('preco_txt', 'Preço estimado (R$)', { inputMode: 'decimal', placeholder: '0,00' })}
            </div>
            {campo('imagem_url', 'URL da imagem', { maxLength: 500, placeholder: 'https://…' })}
            <p className={HINT_CLASS}>A embalagem é apenas informativa: a loja não é obrigada a pedir em múltiplos.</p>
          </div>
        </Modal>
      )}

      {importando && (
        <ImportarModal
          titulo="Carregar produtos do BMSoft"
          colunas={['bmsoft_id', 'gtin', 'descricao', 'unidade', 'marca', 'classe', 'qtd_embalagem', 'preco_estimado']}
          exemplo={'P0100;7891000999990;Ração Peixes 25kg;SC;NutriBrasil;Rações;1;145,90\nP0101;;Farelo de Soja 50kg;SC;Grãos Minas;Grãos;1;160'}
          onFechar={() => setImportando(false)}
          onImportar={async (linhas) => {
            const r = await api.post('/produtos/importar', {
              linhas: linhas.map((l) => ({ ...l, qtd_embalagem: parseDecimal(l.qtd_embalagem), preco_estimado: parseDecimal(l.preco_estimado) })),
            });
            carregar();
            return `${r.inseridos} produto(s) incluído(s) e ${r.atualizados} atualizado(s).`;
          }}
        />
      )}
    </div>
  );
};

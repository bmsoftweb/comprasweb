import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Fornecedor } from '../../types';
import { api, qs } from '../../services/api';
import { Alerta, Botao, Carregando, Modal, Pill, TD, TH, TR_CLASS, useApp, Vazio } from '../../components/ui';
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from '../../utils/formStyles';
import { BarraCadastro, ImportarModal, useDebounce } from './comum';

export const FornecedoresView: React.FC = () => {
  const { refreshToken, toast, confirmar } = useApp();
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const buscaDeb = useDebounce(busca);
  const [editando, setEditando] = useState<Partial<Fornecedor> | null>(null);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api
      .get<Fornecedor[]>(`/fornecedores${qs({ busca: buscaDeb })}`)
      .then(setLista)
      .catch((e) => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, [buscaDeb]);

  useEffect(carregar, [carregar, refreshToken]);

  const gravar = async () => {
    if (!editando) return;
    setErro(null);
    try {
      if (editando.id) await api.put(`/fornecedores/${editando.id}`, editando);
      else await api.post('/fornecedores', editando);
      toast('Fornecedor gravado.');
      setEditando(null);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <BarraCadastro resumo={`${lista.length} fornecedor(es)`} busca={busca} onBusca={setBusca} placeholder="Descrição, ID BMSoft ou e-mail">
        <Botao icone={<Upload className="w-3.5 h-3.5" />} onClick={() => setImportando(true)}>
          Carregar do BMSoft
        </Botao>
        <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditando({})}>
          Novo
        </Botao>
      </BarraCadastro>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH>ID</TH>
              <TH>Descrição</TH>
              <TH>E-mail para envio da compra</TH>
              <TH>Origem</TH>
              <TH className="w-20" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={5}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !lista.length && (
              <tr>
                <td colSpan={5}>
                  <Vazio texto="Nenhum fornecedor" />
                </td>
              </tr>
            )}
            {!carregando &&
              lista.map((f) => (
                <tr key={f.id} className={TR_CLASS} onDoubleClick={() => setEditando(f)}>
                  <TD className="font-mono">{f.bmsoft_id || <span className="text-stone-300">—</span>}</TD>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{f.descricao}</TD>
                  <TD className="font-mono">{f.email || <span className="text-amber-600 font-sans">sem e-mail (use digitação livre)</span>}</TD>
                  <TD>
                    <Pill cor={f.origem === 'bmsoft' ? 'azul' : 'cinza'}>{f.origem === 'bmsoft' ? 'BMSoft' : 'Digitado'}</Pill>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <button onClick={() => setEditando(f)} className="p-1.5 rounded text-stone-400 hover:text-blue-600 cursor-pointer" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirmar({ titulo: 'Excluir fornecedor', mensagem: `Excluir "${f.descricao}"?`, perigo: true, confirmar: 'Excluir' }))) return;
                        try {
                          await api.del(`/fornecedores/${f.id}`);
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
          titulo={editando.id ? 'Editar fornecedor' : 'Novo fornecedor (digitado)'}
          onFechar={() => setEditando(null)}
          rodape={
            <>
              <Botao onClick={() => setEditando(null)}>Cancelar</Botao>
              <Botao variante="primario" onClick={gravar}>
                Gravar
              </Botao>
            </>
          }
        >
          <div className="space-y-3">
            {erro && <Alerta>{erro}</Alerta>}
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>ID BMSoft</label>
              <input value={editando.bmsoft_id ?? ''} onChange={(e) => setEditando({ ...editando, bmsoft_id: e.target.value })} placeholder="Em branco se digitado" maxLength={30} className={INPUT_CLASS} />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Descrição</label>
              <input value={editando.descricao ?? ''} onChange={(e) => setEditando({ ...editando, descricao: e.target.value })} required maxLength={150} className={INPUT_CLASS} />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>E-mail</label>
              <input type="email" value={editando.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} maxLength={150} className={INPUT_CLASS} />
            </div>
          </div>
        </Modal>
      )}

      {importando && (
        <ImportarModal
          titulo="Carregar fornecedores do BMSoft"
          colunas={['bmsoft_id', 'descricao', 'email']}
          exemplo={'F500;Agro Insumos Paraná Ltda;vendas@agroinsumospr.com.br\nF501;Embalagens Sul;'}
          onFechar={() => setImportando(false)}
          onImportar={async (linhas) => {
            const r = await api.post('/fornecedores/importar', { linhas });
            carregar();
            return `${r.inseridos} fornecedor(es) incluído(s) e ${r.atualizados} atualizado(s).`;
          }}
        />
      )}
    </div>
  );
};

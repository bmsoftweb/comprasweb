import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Marcador } from '../../types';
import { api } from '../../services/api';
import { Alerta, Botao, Carregando, MarcadorTag, Modal, TD, TH, TR_CLASS, useApp, Vazio } from '../../components/ui';
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from '../../utils/formStyles';

const CORES = ['#0EA5E9', '#10B981', '#F59E0B', '#E11D48', '#8B5CF6', '#64748B', '#EA580C', '#0D9488'];

export const MarcadoresView: React.FC = () => {
  const { refreshToken, toast, confirmar } = useApp();
  const [lista, setLista] = useState<Marcador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Partial<Marcador> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api
      .get<Marcador[]>('/marcadores')
      .then(setLista)
      .catch((e) => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, []);
  useEffect(carregar, [carregar, refreshToken]);

  const gravar = async () => {
    if (!editando) return;
    setErro(null);
    try {
      if (editando.id) await api.put(`/marcadores/${editando.id}`, editando);
      else await api.post('/marcadores', editando);
      setEditando(null);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0">
        <div className="text-xs text-stone-500">{lista.length} marcador(es)</div>
        <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditando({ cor: CORES[0] })}>
          Novo
        </Botao>
      </div>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH>Marcador</TH>
              <TH>Cor</TH>
              <TH className="w-20" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={3}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !lista.length && (
              <tr>
                <td colSpan={3}>
                  <Vazio texto="Nenhum marcador" />
                </td>
              </tr>
            )}
            {!carregando &&
              lista.map((m) => (
                <tr key={m.id} className={TR_CLASS}>
                  <TD>
                    <MarcadorTag marcador={m} />
                  </TD>
                  <TD className="font-mono text-stone-500">{m.cor}</TD>
                  <TD className="text-right whitespace-nowrap">
                    <button onClick={() => setEditando(m)} className="p-1.5 rounded text-stone-400 hover:text-blue-600 cursor-pointer" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        if (!(await confirmar({ titulo: 'Excluir marcador', mensagem: `Excluir "${m.nome}"?`, perigo: true, confirmar: 'Excluir' }))) return;
                        try {
                          await api.del(`/marcadores/${m.id}`);
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
          titulo={editando.id ? 'Editar marcador' : 'Novo marcador'}
          largura="sm"
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
              <label className={LABEL_CLASS}>Nome</label>
              <input value={editando.nome ?? ''} onChange={(e) => setEditando({ ...editando, nome: e.target.value.toUpperCase() })} required maxLength={50} className={INPUT_CLASS} />
            </div>
            <div className={FIELD_CLASS}>
              <label className={LABEL_CLASS}>Cor</label>
              <div className="flex flex-wrap gap-2">
                {CORES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditando({ ...editando, cor: c })}
                    className={`w-7 h-7 rounded-lg cursor-pointer ${editando.cor === c ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            {editando.nome && <MarcadorTag marcador={{ id: 0, nome: editando.nome, cor: editando.cor || null }} />}
          </div>
        </Modal>
      )}
    </div>
  );
};

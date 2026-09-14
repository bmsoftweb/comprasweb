import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Associado, UsuarioCadastro } from '../../types';
import { api } from '../../services/api';
import { Alerta, Botao, Carregando, Modal, Pill, TD, TH, TR_CLASS, useApp, Vazio } from '../../components/ui';
import { Toggle } from '../../components/Toggle';
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from '../../utils/formStyles';
import { maskCPF } from '../../utils/formatters';
import { BarraCadastro } from './comum';

type Edicao = Partial<UsuarioCadastro> & { senha?: string };

export const UsuariosView: React.FC = () => {
  const { refreshToken, toast, confirmar, usuario } = useApp();
  const [lista, setLista] = useState<UsuarioCadastro[]>([]);
  const [associados, setAssociados] = useState<Associado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    api
      .get<UsuarioCadastro[]>('/usuarios')
      .then(setLista)
      .catch((e) => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(carregar, [carregar, refreshToken]);
  useEffect(() => {
    api.get<Associado[]>('/associados').then(setAssociados).catch(() => undefined);
  }, []);

  const termo = busca.trim().toLowerCase();
  const visiveis = lista.filter(
    (u) => !termo || u.nome_completo.toLowerCase().includes(termo) || u.email.includes(termo) || (u.associado_nome || '').toLowerCase().includes(termo) || u.cpf.includes(termo),
  );

  const gravar = async () => {
    if (!editando) return;
    setErro(null);
    try {
      if (editando.id) await api.put(`/usuarios/${editando.id}`, editando);
      else await api.post('/usuarios', editando);
      toast('Usuário gravado.');
      setEditando(null);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <BarraCadastro resumo={`${visiveis.length} usuário(s)`} busca={busca} onBusca={setBusca} placeholder="Nome, e-mail, CPF ou associado">
        <Botao variante="primario" icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setEditando({ tipo: 'loja', ativo: 1 })}>
          Novo
        </Botao>
      </BarraCadastro>
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH>Nome completo</TH>
              <TH>CPF</TH>
              <TH>E-mail (login)</TH>
              <TH>Perfil</TH>
              <TH>Associado (loja)</TH>
              <TH>Situação</TH>
              <TH className="w-20" />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={7}>
                  <Carregando />
                </td>
              </tr>
            )}
            {!carregando && !visiveis.length && (
              <tr>
                <td colSpan={7}>
                  <Vazio texto="Nenhum usuário" />
                </td>
              </tr>
            )}
            {!carregando &&
              visiveis.map((u) => (
                <tr key={u.id} className={TR_CLASS} onDoubleClick={() => setEditando({ ...u })}>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{u.nome_completo}</TD>
                  <TD className="font-mono">{u.cpf}</TD>
                  <TD className="font-mono">{u.email}</TD>
                  <TD>
                    <Pill cor={u.tipo === 'administrador' ? 'roxo' : 'azul'}>{u.tipo === 'administrador' ? 'Administrador (CD)' : 'Loja'}</Pill>
                  </TD>
                  <TD>{u.associado_nome ? `${u.associado_bmsoft_id} — ${u.associado_nome}` : '—'}</TD>
                  <TD>{u.ativo ? <Pill cor="verde">Ativo</Pill> : <Pill cor="cinza">Inativo</Pill>}</TD>
                  <TD className="text-right whitespace-nowrap">
                    <button onClick={() => setEditando({ ...u })} className="p-1.5 rounded text-stone-400 hover:text-blue-600 cursor-pointer" title="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {u.id !== usuario.id && (
                      <button
                        onClick={async () => {
                          if (!(await confirmar({ titulo: 'Excluir usuário', mensagem: `Excluir "${u.nome_completo}"? Prefira desativar se ele já registrou ações em pedidos.`, perigo: true, confirmar: 'Excluir' }))) return;
                          try {
                            await api.del(`/usuarios/${u.id}`);
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
                    )}
                  </TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <Modal
          titulo={editando.id ? 'Editar usuário' : 'Novo usuário'}
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
          <div className="space-y-3">
            {erro && <Alerta>{erro}</Alerta>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`${FIELD_CLASS} sm:col-span-2`}>
                <label className={LABEL_CLASS}>Nome completo</label>
                <input value={editando.nome_completo ?? ''} onChange={(e) => setEditando({ ...editando, nome_completo: e.target.value })} required maxLength={150} className={INPUT_CLASS} />
              </div>
              <div className={FIELD_CLASS}>
                <label className={LABEL_CLASS}>CPF</label>
                <input value={editando.cpf ?? ''} onChange={(e) => setEditando({ ...editando, cpf: maskCPF(e.target.value) })} required placeholder="000.000.000-00" className={`${INPUT_CLASS} font-mono`} />
              </div>
              <div className={FIELD_CLASS}>
                <label className={LABEL_CLASS}>E-mail (login)</label>
                <input type="email" value={editando.email ?? ''} onChange={(e) => setEditando({ ...editando, email: e.target.value })} required maxLength={150} className={INPUT_CLASS} />
              </div>
              <div className={FIELD_CLASS}>
                <label className={LABEL_CLASS}>Perfil</label>
                <select value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as any })} required className={INPUT_CLASS}>
                  <option value="loja">Loja / Associado</option>
                  <option value="administrador">Administrador (Central)</option>
                </select>
              </div>
              <div className={FIELD_CLASS}>
                <label className={LABEL_CLASS}>{editando.id ? 'Nova senha' : 'Senha'}</label>
                <input
                  type="password"
                  value={editando.senha ?? ''}
                  onChange={(e) => setEditando({ ...editando, senha: e.target.value })}
                  required={!editando.id}
                  autoComplete="new-password"
                  placeholder={editando.id ? 'Em branco mantém a atual' : 'Mínimo 6 caracteres'}
                  className={INPUT_CLASS}
                />
              </div>
              {editando.tipo === 'loja' && (
                <div className={`${FIELD_CLASS} sm:col-span-2`}>
                  <label className={LABEL_CLASS}>Associado (loja)</label>
                  <select
                    value={editando.associado_id ?? ''}
                    onChange={(e) => setEditando({ ...editando, associado_id: e.target.value ? Number(e.target.value) : null })}
                    required
                    className={INPUT_CLASS}
                  >
                    <option value="">— Selecione —</option>
                    {associados.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bmsoft_id} — {a.nome} ({a.classificacao_nome || 'sem classificação'})
                      </option>
                    ))}
                  </select>
                  <span className={HINT_CLASS}>O usuário de loja só vê os pedidos em que este associado estiver incluído.</span>
                </div>
              )}
            </div>
            <Toggle checked={editando.ativo !== 0} onChange={(v) => setEditando({ ...editando, ativo: v ? 1 : 0 })} size="sm" label="Usuário ativo" />
          </div>
        </Modal>
      )}
    </div>
  );
};

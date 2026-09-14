import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Associado, Classificacao } from '../../types';
import { api, qs } from '../../services/api';
import { Alerta, Botao, Carregando, TD, TH, TR_CLASS, useApp, Vazio } from '../../components/ui';
import { Toggle } from '../../components/Toggle';
import { INPUT_CLASS } from '../../utils/formStyles';
import { formatDataHora } from '../../utils/formatters';
import { BarraCadastro, ImportarModal, useDebounce } from './comum';

export const AssociadosView: React.FC = () => {
  const { refreshToken, toast } = useApp();
  const [lista, setLista] = useState<Associado[]>([]);
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const buscaDeb = useDebounce(busca);
  const [classificacao, setClassificacao] = useState('');
  const [inativos, setInativos] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const carregar = useCallback(() => {
    setCarregando(true);
    api.get<Classificacao[]>('/classificacoes').then(setClassificacoes).catch(() => undefined);
    api
      .get<Associado[]>(`/associados${qs({ busca: buscaDeb, classificacao_id: classificacao, ativos: inativos ? 'todos' : undefined })}`)
      .then(setLista)
      .catch((e) => toast(e.message, 'erro'))
      .finally(() => setCarregando(false));
  }, [buscaDeb, classificacao, inativos]);

  useEffect(carregar, [carregar, refreshToken]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      <BarraCadastro resumo={`${lista.length} associado(s)`} busca={busca} onBusca={setBusca} placeholder="Nome, ID ou classificação">
        <Toggle checked={inativos} onChange={setInativos} size="sm" label="Incluir inativos" />
        <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)} className={INPUT_CLASS}>
          <option value="">Todas as classificações</option>
          {classificacoes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({c.total_associados})
            </option>
          ))}
        </select>
        <Botao variante="primario" icone={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setSincronizando(true)}>
          Sincronizar com BMSoft
        </Botao>
      </BarraCadastro>
      <Alerta tipo="aviso" className="mx-4 mt-3">
        Associados (lojas/clientes) vêm obrigatoriamente da sincronização com o BMSoft — não há inclusão manual. Aqui é possível apenas
        ativar/desativar a participação nos pedidos.
      </Alerta>
      <div className="flex-1 overflow-auto min-h-0 mt-3">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH>ID BMSoft</TH>
              <TH>Nome</TH>
              <TH>Classificação</TH>
              <TH className="text-right">Usuários</TH>
              <TH>Sincronizado em</TH>
              <TH>Ativo</TH>
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
            {!carregando && !lista.length && (
              <tr>
                <td colSpan={6}>
                  <Vazio texto="Nenhum associado" />
                </td>
              </tr>
            )}
            {!carregando &&
              lista.map((a) => (
                <tr key={a.id} className={`${TR_CLASS} ${a.ativo ? '' : 'opacity-50'}`}>
                  <TD className="font-mono font-semibold">{a.bmsoft_id}</TD>
                  <TD className="font-medium text-stone-900 dark:text-stone-100">{a.nome}</TD>
                  <TD>{a.classificacao_nome || '—'}</TD>
                  <TD className="text-right">{a.total_usuarios}</TD>
                  <TD className="whitespace-nowrap text-stone-500">{formatDataHora(a.sincronizado_em)}</TD>
                  <TD>
                    <Toggle
                      size="sm"
                      checked={Boolean(a.ativo)}
                      onChange={async (v) => {
                        try {
                          await api.put(`/associados/${a.id}`, { ativo: v });
                          carregar();
                        } catch (e: any) {
                          toast(e.message, 'erro');
                        }
                      }}
                    />
                  </TD>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {sincronizando && (
        <ImportarModal
          titulo="Sincronizar associados com o BMSoft"
          colunas={['bmsoft_id', 'nome', 'classificacao']}
          exemplo={'1006;Agropecuária Serra Azul;Socio\n2005;Franquia AgroMais Alfenas;Franqueado'}
          onFechar={() => setSincronizando(false)}
          onImportar={async (linhas) => {
            const r = await api.post('/associados/sincronizar', { linhas });
            carregar();
            return `${r.inseridos} associado(s) incluído(s), ${r.atualizados} atualizado(s)${r.classificacoesNovas ? ` e ${r.classificacoesNovas} classificação(ões) nova(s)` : ''}.`;
          }}
        />
      )}
    </div>
  );
};

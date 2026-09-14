import React, { useState } from 'react';
import { Search, X, Upload } from 'lucide-react';
import { Alerta, Botao, Modal } from '../../components/ui';
import { HINT_CLASS, INPUT_CLASS } from '../../utils/formStyles';
import { parseLinhasColadas } from '../../utils/formatters';

/** Barra superior padrão das telas de cadastro */
export const BarraCadastro: React.FC<{
  resumo: React.ReactNode;
  busca: string;
  onBusca: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}> = ({ resumo, busca, onBusca, placeholder, children }) => (
  <div className="px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div className="text-xs text-stone-500 dark:text-stone-400">{resumo}</div>
    <div className="flex flex-wrap items-center gap-2.5">
      {children}
      <div className="relative w-60 sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
        <input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder={placeholder} className={`${INPUT_CLASS} w-full pl-9 pr-8`} />
        {busca && (
          <button onClick={() => onBusca('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  </div>
);

/**
 * Carga a partir do BMSoft: o usuário cola as linhas exportadas (planilha/CSV)
 * e o servidor faz upsert pelo ID BMSoft.
 */
export const ImportarModal: React.FC<{
  titulo: string;
  colunas: string[];
  exemplo: string;
  onFechar: () => void;
  onImportar: (linhas: Record<string, string>[]) => Promise<string>;
}> = ({ titulo, colunas, exemplo, onFechar, onImportar }) => {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const linhas = parseLinhasColadas(texto, colunas);

  return (
    <Modal
      titulo={titulo}
      subtitulo="Cole as linhas exportadas do BMSoft (colunas separadas por TAB, ponto e vírgula ou vírgula)"
      largura="lg"
      onFechar={onFechar}
      rodape={
        <>
          <span className="mr-auto text-xs text-stone-500">{linhas.length} linha(s) reconhecida(s)</span>
          <Botao onClick={onFechar}>Fechar</Botao>
          <Botao
            variante="primario"
            icone={<Upload className="w-3.5 h-3.5" />}
            disabled={!linhas.length}
            carregando={enviando}
            onClick={async () => {
              setEnviando(true);
              setErro(null);
              try {
                setResultado(await onImportar(linhas));
                setTexto('');
              } catch (e: any) {
                setErro(e.message);
              } finally {
                setEnviando(false);
              }
            }}
          >
            Importar
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        {erro && <Alerta>{erro}</Alerta>}
        {resultado && <Alerta tipo="ok">{resultado}</Alerta>}
        <div className={HINT_CLASS}>
          Ordem das colunas: <b className="font-mono">{colunas.join(' | ')}</b>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={10} placeholder={exemplo} className={`${INPUT_CLASS} w-full font-mono`} />
        {linhas.length > 0 && (
          <div className="overflow-auto max-h-48 border border-stone-200 dark:border-stone-800 rounded-lg">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-stone-50 dark:bg-stone-950">
                  {colunas.map((c) => (
                    <th key={c} className="px-2 py-1 text-left font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.slice(0, 20).map((l, i) => (
                  <tr key={i} className="border-t border-stone-100 dark:border-stone-800">
                    {colunas.map((c) => (
                      <td key={c} className="px-2 py-1">
                        {l[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
};

export function useDebounce<T>(valor: T, ms = 250): T {
  const [v, setV] = useState(valor);
  React.useEffect(() => {
    const t = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return v;
}

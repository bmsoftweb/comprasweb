import React, { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Underline, Eraser } from 'lucide-react';

interface Props {
  valor: string;
  onChange: (html: string) => void;
  placeholder?: string;
  desabilitado?: boolean;
  altura?: string;
}

/**
 * Editor de texto rico leve (negrito, itálico, sublinhado, tamanho de fonte e listas)
 * sobre contentEditable. O HTML gerado é guardado nas colunas observacao_* do pedido.
 */
export const RichTextEditor: React.FC<Props> = ({ valor, onChange, placeholder, desabilitado, altura = 'min-h-40' }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Só reescreve o conteúdo quando o valor muda por fora (troca de aba/pedido)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== (valor || '')) {
      ref.current.innerHTML = valor || '';
    }
  }, [valor]);

  const comando = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML || '');
  };

  const Btn: React.FC<{ titulo: string; onClick: () => void; children: React.ReactNode }> = ({ titulo, onClick, children }) => (
    <button
      type="button"
      title={titulo}
      disabled={desabilitado}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="p-1.5 rounded text-stone-600 hover:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-700 cursor-pointer disabled:opacity-40"
    >
      {children}
    </button>
  );

  return (
    <div className="border border-stone-200 dark:border-stone-700 rounded-lg overflow-hidden bg-white dark:bg-stone-900">
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/60">
        <Btn titulo="Negrito" onClick={() => comando('bold')}>
          <Bold className="w-3.5 h-3.5" />
        </Btn>
        <Btn titulo="Itálico" onClick={() => comando('italic')}>
          <Italic className="w-3.5 h-3.5" />
        </Btn>
        <Btn titulo="Sublinhado" onClick={() => comando('underline')}>
          <Underline className="w-3.5 h-3.5" />
        </Btn>
        <span className="mx-1 h-4 w-px bg-stone-300 dark:bg-stone-600" />
        <select
          title="Tamanho da fonte"
          disabled={desabilitado}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) comando('fontSize', e.target.value);
            e.target.value = '';
          }}
          className="bg-transparent text-[11px] font-medium text-stone-600 dark:text-stone-300 px-1.5 py-0.5 cursor-pointer"
        >
          <option value="">Tamanho</option>
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="4">Médio</option>
          <option value="5">Grande</option>
          <option value="6">Muito grande</option>
        </select>
        <span className="mx-1 h-4 w-px bg-stone-300 dark:bg-stone-600" />
        <Btn titulo="Lista com marcadores" onClick={() => comando('insertUnorderedList')}>
          <List className="w-3.5 h-3.5" />
        </Btn>
        <Btn titulo="Lista numerada" onClick={() => comando('insertOrderedList')}>
          <ListOrdered className="w-3.5 h-3.5" />
        </Btn>
        <Btn titulo="Limpar formatação" onClick={() => comando('removeFormat')}>
          <Eraser className="w-3.5 h-3.5" />
        </Btn>
      </div>
      <div
        ref={ref}
        contentEditable={!desabilitado}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML || '')}
        className={`texto-rico ${altura} max-h-80 overflow-auto px-3 py-2 text-xs text-stone-800 dark:text-stone-100 outline-none ${
          desabilitado ? 'opacity-60' : ''
        }`}
      />
    </div>
  );
};

/** Exibe HTML de observação (gerado pelo próprio editor da Central) */
export const TextoRico: React.FC<{ html: string | null | undefined; className?: string }> = ({ html, className = '' }) =>
  html ? <div className={`texto-rico text-xs ${className}`} dangerouslySetInnerHTML={{ __html: html }} /> : null;

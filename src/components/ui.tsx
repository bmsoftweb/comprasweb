import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, ImageIcon, Inbox, Loader2, MoreHorizontal, X } from 'lucide-react';
import { Marcador, SituacaoPedido, Usuario } from '../types';
import { SITUACAO_PEDIDO } from '../utils/formatters';

// =====================================================================
// Contexto do app: usuário, navegação, notificações e confirmação
// =====================================================================
export type Tela =
  | 'abertos'
  | 'encerrados'
  | 'novo'
  | 'recebimento'
  | 'emails'
  | 'historico'
  | 'produtos'
  | 'fornecedores'
  | 'associados'
  | 'usuarios'
  | 'marcadores'
  | 'loja-abertos'
  | 'loja-historico'
  | 'loja-pedido';

export interface ParamsTela {
  id?: number;
  duplicarDe?: number;
}

interface AppCtx {
  usuario: Usuario;
  navegar: (tela: Tela, params?: ParamsTela) => void;
  toast: (mensagem: string, tipo?: 'ok' | 'erro') => void;
  confirmar: (opcoes: OpcoesConfirmacao) => Promise<boolean>;
  refreshToken: number;
}

export interface OpcoesConfirmacao {
  titulo: string;
  mensagem: React.ReactNode;
  confirmar?: string;
  perigo?: boolean;
}

export const AppContext = createContext<AppCtx | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext ausente');
  return ctx;
}

// =====================================================================
// Botões
// =====================================================================
type Variante = 'primario' | 'secundario' | 'perigo' | 'sucesso' | 'fantasma';

const VARIANTES: Record<Variante, string> = {
  primario: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-xs',
  secundario:
    'border border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800',
  perigo: 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs',
  sucesso: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs',
  fantasma: 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800',
};

export const Botao: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icone?: React.ReactNode; carregando?: boolean }
> = ({ variante = 'secundario', icone, carregando, children, className = '', disabled, ...rest }) => (
  <button
    type="button"
    {...rest}
    disabled={disabled || carregando}
    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTES[variante]} ${className}`}
  >
    {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icone}
    {children}
  </button>
);

// =====================================================================
// Indicadores
// =====================================================================
export const SituacaoBadge: React.FC<{ situacao: SituacaoPedido }> = ({ situacao }) => {
  const s = SITUACAO_PEDIDO[situacao];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.cor}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.ponto}`} />
      {s.rotulo}
    </span>
  );
};

export const Pill: React.FC<{ cor: 'verde' | 'ambar' | 'vermelho' | 'azul' | 'cinza' | 'roxo'; children: React.ReactNode; title?: string }> = ({
  cor,
  children,
  title,
}) => {
  const cores = {
    verde: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    ambar: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    vermelho: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    azul: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
    cinza: 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
    roxo: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${cores[cor]}`}>
      {children}
    </span>
  );
};

export const MarcadorTag: React.FC<{ marcador: Marcador }> = ({ marcador }) => (
  <span
    className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold tracking-wide text-white uppercase"
    style={{ backgroundColor: marcador.cor || '#0EA5E9' }}
  >
    {marcador.nome}
  </span>
);

export const Andamento: React.FC<{ preenchidos: number; total: number }> = ({ preenchidos, total }) => {
  const perc = total ? Math.round((preenchidos / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-28">
      <div className="flex-1 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${perc}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap">
        {preenchidos} de {total}
      </span>
    </div>
  );
};

export const Alerta: React.FC<{ tipo?: 'erro' | 'aviso' | 'ok'; children: React.ReactNode; className?: string }> = ({
  tipo = 'erro',
  children,
  className = '',
}) => {
  const estilos = {
    erro: ['bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300', AlertCircle],
    aviso: ['bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300', AlertTriangle],
    ok: ['bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300', CheckCircle2],
  } as const;
  const [classes, Icone] = estilos[tipo];
  return (
    <div className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${classes} ${className}`}>
      <Icone className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
};

export const Carregando: React.FC<{ texto?: string }> = ({ texto = 'Carregando…' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-xs text-stone-500 dark:text-stone-400">
    <Loader2 className="w-4 h-4 animate-spin" />
    {texto}
  </div>
);

export const Vazio: React.FC<{ texto: string; children?: React.ReactNode }> = ({ texto, children }) => (
  <div className="flex flex-col items-center gap-2 py-16 text-stone-400">
    <Inbox className="w-8 h-8" />
    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">{texto}</span>
    {children}
  </div>
);

// =====================================================================
// Tabela padrão (mesmo visual da grade do admin B2B)
// =====================================================================
export const TH: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className = '', ...rest }) => (
  <th
    {...rest}
    className={`px-3 py-2.5 text-left font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 ${className}`}
  />
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className = '', ...rest }) => (
  <td {...rest} className={`px-3 py-2.5 text-stone-700 dark:text-stone-300 align-middle border-b border-stone-100 dark:border-stone-800/60 ${className}`} />
);

export const TR_CLASS = 'bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors';

// =====================================================================
// Modal
// =====================================================================
export const Modal: React.FC<{
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  onFechar: () => void;
  children: React.ReactNode;
  rodape?: React.ReactNode;
  largura?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}> = ({ titulo, subtitulo, onFechar, children, rodape, largura = 'md' }) => {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);
  const larguras = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-[96vw]' };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 nao-imprimir">
      <div className="absolute inset-0 bg-stone-950/60 backdrop-blur-xs" onClick={onFechar} />
      <div className={`relative w-full ${larguras[largura]} max-h-[92vh] flex flex-col bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl`}>
        <div className="px-5 py-3.5 border-b border-stone-200 dark:border-stone-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">{titulo}</h3>
            {subtitulo && <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">{subtitulo}</p>}
          </div>
          <button onClick={onFechar} className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto min-h-0 p-5">{children}</div>
        {rodape && (
          <div className="px-5 py-3 border-t border-stone-200 dark:border-stone-800 flex items-center justify-end gap-2 shrink-0 bg-stone-50/60 dark:bg-stone-950/40 rounded-b-2xl">
            {rodape}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** Host da confirmação: renderizado uma vez no App */
export function useConfirmacao() {
  const [pendente, setPendente] = useState<(OpcoesConfirmacao & { resolver: (v: boolean) => void }) | null>(null);
  const confirmar = useCallback(
    (opcoes: OpcoesConfirmacao) => new Promise<boolean>((resolver) => setPendente({ ...opcoes, resolver })),
    [],
  );
  const fechar = (v: boolean) => {
    pendente?.resolver(v);
    setPendente(null);
  };
  const elemento = pendente ? (
    <Modal
      titulo={pendente.titulo}
      largura="sm"
      onFechar={() => fechar(false)}
      rodape={
        <>
          <Botao onClick={() => fechar(false)}>Cancelar</Botao>
          <Botao variante={pendente.perigo ? 'perigo' : 'primario'} onClick={() => fechar(true)} autoFocus>
            {pendente.confirmar || 'Confirmar'}
          </Botao>
        </>
      }
    >
      <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">{pendente.mensagem}</div>
    </Modal>
  ) : null;
  return { confirmar, elemento };
}

// =====================================================================
// Menu de contexto "..."
// =====================================================================
export interface ItemMenu {
  rotulo: string;
  icone?: React.ReactNode;
  onClick: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  dica?: string;
}

export const MenuContexto: React.FC<{ itens: (ItemMenu | 'separador')[]; titulo?: string }> = ({ itens, titulo = 'Mais ações' }) => {
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current || !menuRef.current) return;
    const r = botaoRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    setPos({ top, left: Math.max(8, r.right - m.width) });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !botaoRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const fecharRolagem = () => setAberto(false);
    document.addEventListener('mousedown', fechar);
    window.addEventListener('resize', fecharRolagem);
    document.addEventListener('scroll', fecharRolagem, true);
    return () => {
      document.removeEventListener('mousedown', fechar);
      window.removeEventListener('resize', fecharRolagem);
      document.removeEventListener('scroll', fecharRolagem, true);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        title={titulo}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((a) => !a);
        }}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
          aberto
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
            : 'text-stone-400 hover:text-stone-800 hover:bg-stone-100 dark:hover:text-stone-100 dark:hover:bg-stone-800'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {aberto &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 min-w-56 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {itens.map((item, i) =>
              item === 'separador' ? (
                <div key={i} className="my-1 border-t border-stone-100 dark:border-stone-800" />
              ) : (
                <button
                  key={i}
                  type="button"
                  disabled={item.desabilitado}
                  title={item.dica}
                  onClick={() => {
                    setAberto(false);
                    item.onClick();
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    item.perigo
                      ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                      : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800'
                  }`}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{item.icone}</span>
                  {item.rotulo}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
};

// =====================================================================
// Ícone de imagem com prévia ao passar o mouse (sem clicar)
// =====================================================================
export const ImagemHover: React.FC<{ url: string | null | undefined; descricao: string }> = ({ url, descricao }) => {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [falhou, setFalhou] = useState(false);
  if (!url) {
    return (
      <span title="Produto sem imagem" className="inline-flex text-stone-300 dark:text-stone-700">
        <ImageIcon className="w-4 h-4" />
      </span>
    );
  }
  return (
    <>
      <span
        className="inline-flex text-blue-600 dark:text-blue-400 cursor-zoom-in"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ x: r.right, y: r.top + r.height / 2 });
        }}
        onMouseLeave={() => setPos(null)}
      >
        <ImageIcon className="w-4 h-4" />
      </span>
      {pos &&
        createPortal(
          <div
            className="fixed z-[60] pointer-events-none bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl p-2"
            style={{
              left: Math.min(pos.x + 12, window.innerWidth - 276),
              top: Math.max(8, Math.min(pos.y - 130, window.innerHeight - 290)),
            }}
          >
            {falhou ? (
              <div className="w-64 h-64 flex items-center justify-center text-[11px] text-stone-400">Imagem indisponível</div>
            ) : (
              <img src={url} alt={descricao} onError={() => setFalhou(true)} className="w-64 h-64 object-contain rounded-lg bg-white" />
            )}
            <div className="text-[10px] text-stone-500 mt-1 max-w-64 truncate">{descricao}</div>
          </div>,
          document.body,
        )}
    </>
  );
};

// =====================================================================
// Abas
// =====================================================================
export const Abas: React.FC<{
  abas: ({ id: string; rotulo: React.ReactNode; contador?: number } | 'divisor')[];
  ativa: string;
  onChange: (id: string) => void;
  className?: string;
}> = ({ abas, ativa, onChange, className = '' }) => (
  <div className={`flex items-center gap-1 overflow-x-auto ${className}`}>
    {abas.map((a, i) =>
      a === 'divisor' ? (
        <span key={`d${i}`} className="mx-1.5 h-5 w-px bg-stone-300 dark:bg-stone-700 shrink-0" />
      ) : (
        <button
          key={a.id}
          type="button"
          onClick={() => onChange(a.id)}
          className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer transition-colors ${
            ativa === a.id
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          {a.rotulo}
          {a.contador !== undefined && (
            <span className="ml-1.5 px-1.5 py-px rounded-full text-[10px] bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
              {a.contador}
            </span>
          )}
        </button>
      ),
    )}
  </div>
);

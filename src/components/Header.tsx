import React from 'react';
import { Menu, Database, RefreshCw, Lock, Store } from 'lucide-react';
import { Usuario, DbStatus } from '../types';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  titulo: string;
  subtitulo: string;
  usuario: Usuario;
  dbStatus: DbStatus | null;
  onOpenMobileSidebar: () => void;
  onRefresh: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  titulo,
  subtitulo,
  usuario,
  dbStatus,
  onOpenMobileSidebar,
  onRefresh,
  theme,
  onToggleTheme,
}) => (
  <header className="h-[var(--altura-topo)] shrink-0 z-20 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
    <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          title="Abrir menu de navegação"
          className="lg:hidden p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider hidden sm:inline-flex items-center gap-1">
              <Lock className="w-3 h-3 text-blue-500" />
              {usuario.tipo === 'administrador' ? 'Central (CD)' : 'Loja'}
            </span>
            <span className="text-stone-300 dark:text-stone-700 hidden sm:inline">•</span>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight truncate">{titulo}</h2>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 hidden sm:block truncate mt-0.5">{subtitulo}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {usuario.tipo === 'loja' && (
          <div className="hidden xl:flex items-center gap-2 bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700/80 rounded-xl px-3 py-1.5 text-xs">
            <Store className="w-3.5 h-3.5 text-blue-500" />
            <div className="text-left">
              <div className="font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[200px]">{usuario.associado_nome}</div>
              <div className="text-[10px] text-stone-400">{usuario.classificacao_nome || 'Sem classificação'}</div>
            </div>
          </div>
        )}

        {/* Status do banco fica oculto; só aparece um alerta se a conexão cair */}
        {dbStatus && !dbStatus.connected && (
          <div
            title={dbStatus.error || 'Sem conexão com o banco de dados'}
            className="hidden md:flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400"
          >
            <Database className="w-3.5 h-3.5 animate-pulse" />
            Banco offline
          </div>
        )}

        <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="header" />

        <button
          onClick={onRefresh}
          title="Recarregar os dados desta tela"
          className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>
);

import React from 'react';
import {
  ClipboardList,
  Archive,
  History,
  Package,
  Truck,
  Store,
  Users,
  Tags,
  LogOut,
  X,
  User,
  ShoppingBasket,
  type LucideIcon,
} from 'lucide-react';
import { Usuario } from '../types';
import { Tela } from './ui';

interface SidebarProps {
  tela: Tela;
  onNavegar: (tela: Tela) => void;
  usuario: Usuario;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface ItemNav {
  id: Tela;
  rotulo: string;
  descricao: string;
  icone: LucideIcon;
  /** telas que mantêm este item marcado como ativo */
  ativoEm?: Tela[];
}

const MENU_ADMIN: { grupo: string; itens: ItemNav[] }[] = [
  {
    grupo: 'Pedidos',
    itens: [
      // Encerrados, Novo Pedido, Confirmar Recebimento e Confirmação de E-mail ficam só nas abas
      {
        id: 'abertos',
        rotulo: 'Pedidos',
        descricao: 'Abertos, encerrados e entregas',
        icone: ClipboardList,
        ativoEm: ['encerrados', 'novo', 'recebimento', 'emails'],
      },
      { id: 'historico', rotulo: 'Histórico de Ações', descricao: 'Log com data, hora e usuário', icone: History },
    ],
  },
  {
    grupo: 'Cadastros',
    itens: [
      { id: 'produtos', rotulo: 'Produtos', descricao: 'BMSoft ou digitados', icone: Package },
      { id: 'fornecedores', rotulo: 'Fornecedores', descricao: 'BMSoft ou digitados', icone: Truck },
      { id: 'associados', rotulo: 'Associados', descricao: 'Sincronizados do BMSoft', icone: Store },
      { id: 'usuarios', rotulo: 'Usuários', descricao: 'Acesso da Central e lojas', icone: Users },
      { id: 'marcadores', rotulo: 'Marcadores', descricao: 'Tags dos pedidos', icone: Tags },
    ],
  },
];

const MENU_LOJA: { grupo: string; itens: ItemNav[] }[] = [
  {
    grupo: 'Minha Loja',
    itens: [
      { id: 'loja-abertos', rotulo: 'Pedidos Disponíveis', descricao: 'Preencher quantidades', icone: ShoppingBasket, ativoEm: ['loja-pedido'] },
      { id: 'loja-historico', rotulo: 'Histórico', descricao: 'Pedidos fechados e entregas', icone: Archive },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ tela, onNavegar, usuario, onLogout, isOpenMobile, onCloseMobile }) => {
  const menu = usuario.tipo === 'administrador' ? MENU_ADMIN : MENU_LOJA;

  const conteudo = (
    <div className="flex flex-col h-full bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 border-r border-stone-200 dark:border-stone-800 select-none">
      {/* Marca — mesma altura do header da área de trabalho */}
      <div className="h-[var(--altura-topo)] shrink-0 px-4 border-b border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-3 bg-stone-50/50 dark:bg-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 px-3 min-w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-[11px] tracking-widest shadow-md shrink-0">
            {usuario.tipo === 'administrador' ? 'CD' : 'LOJA'}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-stone-900 dark:text-white leading-tight truncate">ComprasWeb</h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {usuario.tipo === 'administrador' ? 'Central de Compras' : usuario.associado_nome}
            </p>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          title="Fechar menu lateral"
          className="lg:hidden p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {menu.map((g, gi) => (
          <div key={g.grupo} className={gi ? 'pt-3' : ''}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{g.grupo}</div>
            <div className="space-y-1">
              {g.itens.map((item) => {
                const ativo = tela === item.id || item.ativoEm?.includes(tela);
                const Icone = item.icone;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onNavegar(item.id);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer group ${
                      ativo
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
                    }`}
                  >
                    <Icone
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        ativo ? 'text-white' : 'text-stone-400 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs leading-none truncate">{item.rotulo}</div>
                      <div className={`text-[10px] mt-0.5 truncate ${ativo ? 'text-blue-100' : 'text-stone-400 dark:text-stone-500'}`}>
                        {item.descricao}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-2 bg-stone-50 dark:bg-stone-950/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 flex items-center justify-center font-semibold text-xs shrink-0">
            {usuario.nome_completo ? usuario.nome_completo.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 dark:text-white truncate leading-tight">{usuario.nome_completo}</div>
            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {usuario.tipo === 'administrador' ? 'Administrador' : usuario.email}
            </div>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Encerrar sessão"
          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 z-30">{conteudo}</aside>
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative flex-1 flex flex-col max-w-xs w-full h-full shadow-2xl z-10">{conteudo}</div>
        </div>
      )}
    </>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  History,
  MailCheck,
  Package,
  PackageCheck,
  Store,
  Tags,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';
import { DbStatus, Usuario } from './types';
import { api, onSessaoExpirada, setToken } from './services/api';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { AppContext, ParamsTela, Tela, useConfirmacao } from './components/ui';
import { ThemeMode, getInitialTheme, applyTheme } from './utils/theme';
import { lerSessao, salvarSessao, limparSessao } from './utils/session';
import { PedidosLista } from './views/PedidosLista';
import { PedidoForm } from './views/PedidoForm';
import { ConfirmarRecebimento } from './views/ConfirmarRecebimento';
import { ConfirmacaoEmail } from './views/ConfirmacaoEmail';
import { HistoricoAcoes } from './views/HistoricoAcoes';
import { LojaPedidos } from './views/LojaPedidos';
import { LojaPreenchimento } from './views/LojaPreenchimento';
import { ProdutosView } from './views/cadastros/ProdutosView';
import { FornecedoresView } from './views/cadastros/FornecedoresView';
import { AssociadosView } from './views/cadastros/AssociadosView';
import { UsuariosView } from './views/cadastros/UsuariosView';
import { MarcadoresView } from './views/cadastros/MarcadoresView';

const TITULOS: Record<Tela, [string, string]> = {
  abertos: ['Pedidos Abertos', 'Pedidos em elaboração, liberados às lojas ou aguardando fechamento'],
  encerrados: ['Pedidos Encerrados', 'Pedidos fechados: envio da ordem de compra ao fornecedor'],
  novo: ['Novo Pedido', 'Informações gerais, compras, entrega, condições de pagamento e associados'],
  recebimento: ['Confirmar Recebimento', 'Registre a entrega de cada associado e eventuais divergências'],
  emails: ['Confirmação de E-mail', 'Ordens de compra e cotações enviadas aos fornecedores'],
  historico: ['Histórico de Ações', 'Preenchimentos, rejeições e alterações com data, hora e usuário'],
  produtos: ['Produtos', 'Carregados do BMSoft ou digitados para cotações'],
  fornecedores: ['Fornecedores', 'Carregados do BMSoft ou digitados para cotações'],
  associados: ['Associados', 'Lojas/clientes sincronizados do sistema BMSoft'],
  usuarios: ['Usuários', 'Acesso da Central e das lojas (e-mail é o login)'],
  marcadores: ['Marcadores', 'Tags exibidas ao lado do nome do pedido'],
  'loja-abertos': ['Pedidos Disponíveis', 'Pedidos liberados pela Central para a sua loja preencher'],
  'loja-historico': ['Histórico', 'Pedidos já fechados, compras e entregas da sua loja'],
  'loja-pedido': ['Preenchimento do Pedido', 'Informe as quantidades desejadas e grave'],
};

const TELAS_PEDIDOS: Tela[] = ['abertos', 'encerrados', 'novo', 'recebimento', 'emails', 'historico'];

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  useEffect(() => applyTheme(theme), [theme]);
  const alternarTema = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const [sessao, setSessao] = useState(() => {
    const s = lerSessao();
    if (s) setToken(s.token);
    return s;
  });
  const usuario = sessao?.usuario ?? null;

  const [tela, setTela] = useState<Tela>(() => (usuario?.tipo === 'loja' ? 'loja-abertos' : 'abertos'));
  const [params, setParams] = useState<ParamsTela>({});
  const [mobileAberto, setMobileAberto] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [toastMsg, setToastMsg] = useState<{ texto: string; tipo: 'ok' | 'erro' } | null>(null);
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<{ id: number; nome: string } | null>(null);
  const { confirmar, elemento: confirmacao } = useConfirmacao();
  const toastTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToastMsg({ texto, tipo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), tipo === 'erro' ? 6000 : 4000);
  }, []);

  const sair = useCallback((aviso?: string) => {
    limparSessao();
    setToken(null);
    setSessao(null);
    setPedidoSelecionado(null);
    if (aviso) setAvisoLogin(aviso);
  }, []);

  useEffect(() => {
    onSessaoExpirada((msg) => sair(msg));
  }, [sair]);

  // Confere a sessão guardada e atualiza os dados do usuário
  useEffect(() => {
    if (!sessao) return;
    api
      .get<{ usuario: Usuario }>('/auth/me')
      .then(({ usuario: u }) => setSessao((s) => (s ? { ...s, usuario: u } : s)))
      .catch(() => undefined);
    api.get<DbStatus>('/db/status').then(setDbStatus).catch(() => setDbStatus({ connected: false, latencyMs: 0 }));
  }, [sessao?.token]);

  const navegar = useCallback((nova: Tela, p: ParamsTela = {}) => {
    setTela(nova);
    setParams(p);
    setPedidoSelecionado(null);
  }, []);

  const ctx = useMemo(
    () => (usuario ? { usuario, navegar, toast, confirmar, refreshToken } : null),
    [usuario, navegar, toast, confirmar, refreshToken],
  );

  if (!usuario || !ctx) {
    return (
      <LoginView
        avisoInicial={avisoLogin}
        theme={theme}
        onToggleTheme={alternarTema}
        onLoginSuccess={(token, u, lembrar) => {
          setToken(token);
          salvarSessao({ token, usuario: u }, lembrar);
          setSessao({ token, usuario: u });
          setTela(u.tipo === 'loja' ? 'loja-abertos' : 'abertos');
          setParams({});
          setAvisoLogin(null);
          toast(`Bem-vindo(a), ${u.nome_completo}!`);
        }}
      />
    );
  }

  // Loja nunca vê telas da Central (e vice-versa)
  const telaEfetiva: Tela =
    usuario.tipo === 'loja' ? (tela.startsWith('loja-') ? tela : 'loja-abertos') : tela.startsWith('loja-') ? 'abertos' : tela;

  let [titulo, subtitulo] = TITULOS[telaEfetiva];
  if (telaEfetiva === 'novo' && params.id) [titulo, subtitulo] = [`Alterar Pedido nº ${params.id}`, TITULOS.novo[1]];
  if (telaEfetiva === 'novo' && params.duplicarDe) [titulo, subtitulo] = [`Duplicar Pedido nº ${params.duplicarDe}`, 'Revise as informações copiadas e grave como um novo pedido'];

  const excluirSelecionado = async () => {
    if (!pedidoSelecionado) return;
    const ok = await confirmar({
      titulo: 'Excluir pedido',
      mensagem: (
        <>
          Excluir definitivamente o pedido <b>nº {pedidoSelecionado.id} — {pedidoSelecionado.nome}</b>? Todos os itens, quantidades
          preenchidas pelas lojas, recebimentos e anexos serão apagados.
        </>
      ),
      confirmar: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.del(`/pedidos/${pedidoSelecionado.id}`);
      toast(`Pedido nº ${pedidoSelecionado.id} excluído.`);
      setPedidoSelecionado(null);
      setRefreshToken((t) => t + 1);
    } catch (err: any) {
      toast(err.message, 'erro');
    }
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="h-screen overflow-hidden bg-stone-100/70 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex font-sans antialiased selection:bg-blue-600 selection:text-white">
        {toastMsg && (
          <div className="fixed bottom-5 right-5 z-[70] max-w-md bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${toastMsg.tipo === 'erro' ? 'bg-rose-400' : 'bg-emerald-400'}`} />
            <span>{toastMsg.texto}</span>
          </div>
        )}
        {confirmacao}

        <Sidebar
          tela={telaEfetiva}
          onNavegar={(t) => navegar(t)}
          usuario={usuario}
          onLogout={() => sair()}
          isOpenMobile={mobileAberto}
          onCloseMobile={() => setMobileAberto(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <Header
            titulo={titulo}
            subtitulo={subtitulo}
            usuario={usuario}
            dbStatus={dbStatus}
            onOpenMobileSidebar={() => setMobileAberto(true)}
            onRefresh={() => setRefreshToken((t) => t + 1)}
            theme={theme}
            onToggleTheme={alternarTema}
          />

          {usuario.tipo === 'administrador' && TELAS_PEDIDOS.includes(telaEfetiva) && (
            <MenuPedidos
              tela={telaEfetiva}
              editando={Boolean(params.id || params.duplicarDe)}
              onNavegar={navegar}
              selecionado={pedidoSelecionado}
              onExcluir={excluirSelecionado}
            />
          )}

          <main className="flex-1 flex flex-col min-h-0 w-full">
            {telaEfetiva === 'abertos' && <PedidosLista grupo="abertos" selecionado={pedidoSelecionado} onSelecionar={setPedidoSelecionado} />}
            {telaEfetiva === 'encerrados' && <PedidosLista grupo="encerrados" selecionado={pedidoSelecionado} onSelecionar={setPedidoSelecionado} />}
            {telaEfetiva === 'novo' && <PedidoForm key={`${params.id || ''}-${params.duplicarDe || ''}`} pedidoId={params.id} duplicarDe={params.duplicarDe} />}
            {telaEfetiva === 'recebimento' && <ConfirmarRecebimento />}
            {telaEfetiva === 'emails' && <ConfirmacaoEmail />}
            {telaEfetiva === 'historico' && <HistoricoAcoes />}
            {telaEfetiva === 'produtos' && <ProdutosView />}
            {telaEfetiva === 'fornecedores' && <FornecedoresView />}
            {telaEfetiva === 'associados' && <AssociadosView />}
            {telaEfetiva === 'usuarios' && <UsuariosView />}
            {telaEfetiva === 'marcadores' && <MarcadoresView />}
            {telaEfetiva === 'loja-abertos' && <LojaPedidos grupo="abertos" />}
            {telaEfetiva === 'loja-historico' && <LojaPedidos grupo="historico" />}
            {telaEfetiva === 'loja-pedido' && params.id && <LojaPreenchimento key={params.id} pedidoId={params.id} />}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}

/** Abas do menu principal de pedidos: Abertos · Encerrados · Novo · Recebimento · E-mail · Mais opções · Excluir */
const MenuPedidos: React.FC<{
  tela: Tela;
  editando: boolean;
  onNavegar: (t: Tela, p?: ParamsTela) => void;
  selecionado: { id: number; nome: string } | null;
  onExcluir: () => void;
}> = ({ tela, editando, onNavegar, selecionado, onExcluir }) => {
  const [maisAberto, setMaisAberto] = useState(false);
  const maisRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!maisAberto) return;
    const fechar = (e: MouseEvent) => !maisRef.current?.contains(e.target as Node) && setMaisAberto(false);
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [maisAberto]);

  const aba = (id: Tela, rotulo: string, Icone: React.FC<{ className?: string }>) => {
    const ativa = tela === id;
    return (
      <button
        onClick={() => onNavegar(id)}
        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer transition-colors ${
          ativa
            ? 'border-blue-600 text-blue-700 dark:text-blue-400'
            : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
        }`}
      >
        <Icone className="w-3.5 h-3.5" />
        {id === 'novo' && editando ? 'Pedido em edição' : rotulo}
      </button>
    );
  };

  const opcoesMais: [Tela, string, React.FC<{ className?: string }>][] = [
    ['historico', 'Histórico de ações', History],
    ['produtos', 'Produtos', Package],
    ['fornecedores', 'Fornecedores', Truck],
    ['associados', 'Associados (BMSoft)', Store],
    ['usuarios', 'Usuários', Users],
    ['marcadores', 'Marcadores', Tags],
  ];

  return (
    <div className="shrink-0 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800 px-2 sm:px-4 flex items-center gap-1 barra-abas">
      {aba('abertos', 'Abertos', ClipboardList)}
      {aba('encerrados', 'Encerrados', Archive)}
      {aba('novo', 'Novo Pedido', FilePlus2)}
      {aba('recebimento', 'Confirmar Recebimento', PackageCheck)}
      {aba('emails', 'Confirmação de E-mail', MailCheck)}

      <div ref={maisRef} className="relative">
        <button
          onClick={() => setMaisAberto((a) => !a)}
          className={`flex items-center gap-1 px-3 py-2.5 text-xs font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
            tela === 'historico' || maisAberto
              ? 'border-blue-600 text-blue-700 dark:text-blue-400'
              : 'border-transparent text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          }`}
        >
          Mais opções <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {maisAberto && (
          <div className="fixed mt-1 z-40 min-w-52 py-1.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-2xl">
            {opcoesMais.map(([id, rotulo, Icone]) => (
              <button
                key={id}
                onClick={() => {
                  setMaisAberto(false);
                  onNavegar(id);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800 cursor-pointer"
              >
                <Icone className="w-3.5 h-3.5 text-stone-400" />
                {rotulo}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto pl-3 flex items-center gap-2 shrink-0">
        {(tela === 'abertos' || tela === 'encerrados') && (
          <span className="hidden md:inline text-[11px] text-stone-400 truncate max-w-64">
            {selecionado ? `Selecionado: nº ${selecionado.id}` : 'Clique numa linha para selecionar'}
          </span>
        )}
        <button
          onClick={onExcluir}
          disabled={!selecionado}
          title={selecionado ? `Excluir o pedido nº ${selecionado.id}` : 'Selecione um pedido na lista para excluir'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Excluir
        </button>
      </div>
    </div>
  );
};

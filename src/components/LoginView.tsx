import React, { useEffect, useState } from 'react';
import { Lock, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShoppingCart } from 'lucide-react';
import { Modal } from './ui';
import { Usuario } from '../types';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';
import { Toggle } from './Toggle';
import { api, login } from '../services/api';
import { INPUT_CLASS_LG } from '../utils/formStyles';
import { lerLembrete, salvarLembrete } from '../utils/session';

interface LoginViewProps {
  avisoInicial?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLoginSuccess: (token: string, usuario: Usuario, lembrar: boolean) => void;
}

const ROTULO = 'text-[10px] font-bold uppercase tracking-widest ml-1 text-stone-400 dark:text-stone-500';

/** Marca do app: ícone + nome, usada no painel esquerdo e no topo em telas pequenas */
const Marca: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`items-center gap-2.5 ${className}`}>
    <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200/50 dark:shadow-none shrink-0">
      <ShoppingCart className="w-5 h-5 text-white" />
    </div>
    <span className="text-sm font-black tracking-wider uppercase text-stone-800 dark:text-stone-100">ComprasWeb</span>
  </div>
);

/** Layout em duas colunas, no mesmo modelo da tela de login do meuConsultorioWeb */
export const LoginView: React.FC<LoginViewProps> = ({ avisoInicial, theme, onToggleTheme, onLoginSuccess }) => {
  const [lembrete] = useState(() => lerLembrete());
  const [email, setEmail] = useState(() => lembrete ?? '');
  const [lembrar, setLembrar] = useState(() => Boolean(lembrete));
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(avisoInicial ?? null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [esqueciAberto, setEsqueciAberto] = useState(false);
  // Link recebido por e-mail: /?redefinir=<token>
  const [tokenRedefinir, setTokenRedefinir] = useState(() => new URLSearchParams(window.location.search).get('redefinir'));

  const sairDaRedefinicao = (mensagem?: string, emailRedefinido?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('redefinir');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    setTokenRedefinir(null);
    if (emailRedefinido) setEmail(emailRedefinido);
    setSenha('');
    setErro(null);
    setInfo(mensagem ?? null);
  };

  useEffect(() => {
    api
      .get<{ connected: boolean }>('/db/status')
      .then((s) => setOnline(s.connected))
      .catch(() => setOnline(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLimpo = email.trim().toLowerCase();
    if (!emailLimpo || !senha) {
      setErro('Informe o e-mail e a senha.');
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const data = await login(emailLimpo, senha);
      salvarLembrete(lembrar ? emailLimpo : null);
      onLoginSuccess(data.token, data.usuario, lembrar);
    } catch (err: any) {
      setErro(err.message || 'Não foi possível validar o acesso.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans relative bg-white dark:bg-stone-900 text-stone-900 dark:text-white">
      {/* Painel esquerdo: identidade visual (oculto em telas pequenas) */}
      <div className="hidden lg:flex lg:w-1/2 relative isolate overflow-hidden flex-col p-12 bg-white dark:bg-stone-950 select-none">
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border-[60px] border-blue-100 dark:border-blue-500/10" />
          <div className="absolute top-[15%] left-[10%] w-[280px] h-[280px] rounded-[40%] rotate-12 blur-3xl bg-blue-100/70 dark:bg-blue-500/10" />
          <div className="absolute bottom-[10%] right-[5%] w-[220px] h-[220px] rounded-[45%] -rotate-12 blur-2xl bg-indigo-100/60 dark:bg-indigo-500/10" />
        </div>

        <Marca className="flex" />

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-6xl font-black leading-[0.95] tracking-tight text-stone-900 dark:text-white">
            CENTRAL
            <br />
            DE COMPRAS
          </h1>
        </div>
      </div>

      {/* Painel direito: formulário de login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative bg-stone-50 dark:bg-stone-900">
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
        </div>

        <div className="w-full max-w-md">
          <Marca className="flex lg:hidden mb-8" />

          {tokenRedefinir ? (
            <RedefinirSenha
              token={tokenRedefinir}
              onConcluido={(msg, emailRedefinido) => sairDaRedefinicao(msg, emailRedefinido)}
              onCancelar={() => sairDaRedefinicao()}
            />
          ) : (
          <>
          <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Login</h2>
          <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">Insira suas credenciais para acessar.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-8">
            {info && !erro && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
                <span>{info}</span>
              </div>
            )}
            {erro && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{erro}</span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className={ROTULO}>
                Identificação
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro(null);
                  }}
                  placeholder="E-mail"
                  autoComplete="username"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-11 !bg-white dark:!bg-stone-800`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-senha" className={ROTULO}>
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
                <input
                  id="login-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro(null);
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-11 pr-11 !bg-white dark:!bg-stone-800`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  title={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="py-1">
              <Toggle
                checked={lembrar}
                onChange={setLembrar}
                size="sm"
                label={<span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Lembrar neste dispositivo</span>}
                title="Mantém a sessão ao fechar o navegador e preenche o e-mail no próximo acesso. A senha nunca é guardada."
              />
            </div>

            <button
              type="submit"
              disabled={carregando}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all flex items-center justify-center gap-2 group disabled:opacity-70 cursor-pointer"
            >
              {carregando ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-sm">Autenticando...</span>
                </>
              ) : (
                <>
                  <span className="uppercase tracking-wide">Entrar</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setEsqueciAberto(true)}
              className="w-full text-center text-xs font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline py-1 cursor-pointer"
            >
              Esqueci a senha
            </button>
          </form>
          </>
          )}

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-stone-200 dark:border-stone-800 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  online === null ? 'bg-stone-400 animate-pulse' : online ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              {online === null ? 'Verificando servidor' : online ? 'Servidor online' : 'Servidor offline'}
            </span>
            <span className="font-mono normal-case">v0.1.0</span>
          </div>
        </div>
      </div>

      {esqueciAberto && <EsqueciSenhaModal emailInicial={email} onFechar={() => setEsqueciAberto(false)} />}
    </div>
  );
};

// =====================================================================
// Esqueci a senha: pede o e-mail e envia o link de redefinição
// =====================================================================
const EsqueciSenhaModal: React.FC<{ emailInicial: string; onFechar: () => void }> = ({ emailInicial, onFechar }) => {
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.post<{ message: string }>('/auth/esqueci-senha', { email: email.trim().toLowerCase() });
      setEnviado(r.message);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      titulo={
        <span className="inline-flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-600" /> Esqueci a senha
        </span>
      }
      largura="sm"
      onFechar={onFechar}
    >
      {enviado ? (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 flex items-start gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
            <span>{enviado}</span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Confira também a caixa de spam. O link vale por 1 hora e só pode ser usado uma vez.
          </p>
          <button
            type="button"
            onClick={onFechar}
            className="w-full py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-xs font-bold cursor-pointer"
          >
            Fechar
          </button>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">
            Informe o e-mail usado no login. Enviaremos um link para você criar uma nova senha.
          </p>
          {erro && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              <span>{erro}</span>
            </div>
          )}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoFocus
              className={`${INPUT_CLASS_LG} w-full pl-11`}
            />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
          >
            {enviando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Enviar link de redefinição'}
          </button>
        </form>
      )}
    </Modal>
  );
};

// =====================================================================
// Redefinir senha: aberto pelo link recebido por e-mail
// =====================================================================
const RedefinirSenha: React.FC<{
  token: string;
  onConcluido: (mensagem: string, email: string) => void;
  onCancelar: () => void;
}> = ({ token, onConcluido, onCancelar }) => {
  const [conta, setConta] = useState<{ email: string; nome: string } | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    api
      .post<{ email: string; nome: string }>('/auth/redefinir-senha/validar', { token })
      .then(setConta)
      .catch((e) => setErroLink(e.message));
  }, [token]);

  const gravar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (senha.length < 6) return setErro('A nova senha precisa ter pelo menos 6 caracteres.');
    if (senha !== confirmacao) return setErro('As senhas não conferem.');
    setGravando(true);
    try {
      const r = await api.post<{ message: string; email: string }>('/auth/redefinir-senha', { token, senha });
      onConcluido(r.message, r.email);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setGravando(false);
    }
  };

  const campoSenha = (id: string, rotulo: string, valor: string, setValor: (v: string) => void) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      <div className="relative">
        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
        <input
          id={id}
          type={mostrar ? 'text' : 'password'}
          value={valor}
          onChange={(e) => {
            setValor(e.target.value);
            setErro(null);
          }}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          required
          className={`${INPUT_CLASS_LG} w-full pl-11 pr-11 !bg-white dark:!bg-stone-800`}
        />
        <button
          type="button"
          onClick={() => setMostrar(!mostrar)}
          title={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-0 pr-4 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
          tabIndex={-1}
        >
          {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Nova senha</h2>
      <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
        {conta ? (
          <>
            Crie uma nova senha para <b className="text-stone-700 dark:text-stone-200">{conta.email}</b>.
          </>
        ) : erroLink ? (
          'Não foi possível usar este link.'
        ) : (
          'Validando o link…'
        )}
      </p>

      {erroLink ? (
        <div className="mt-8 space-y-5">
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            <span>{erroLink}</span>
          </div>
          <VoltarAoLogin onClick={onCancelar} />
        </div>
      ) : (
        conta && (
          <form onSubmit={gravar} className="flex flex-col gap-5 mt-8">
            {erro && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{erro}</span>
              </div>
            )}
            {campoSenha('nova-senha', 'Nova senha', senha, setSenha)}
            {campoSenha('confirma-senha', 'Confirme a nova senha', confirmacao, setConfirmacao)}
            <button
              type="submit"
              disabled={gravando}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 dark:shadow-none transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
            >
              {gravando ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="uppercase tracking-wide">Gravar nova senha</span>
              )}
            </button>
            <VoltarAoLogin onClick={onCancelar} />
          </form>
        )
      )}
    </>
  );
};

const VoltarAoLogin: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 py-1 cursor-pointer"
  >
    <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
  </button>
);

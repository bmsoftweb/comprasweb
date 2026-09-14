import React, { useEffect, useState } from 'react';
import { Lock, ArrowRight, AlertCircle, Eye, EyeOff, Mail, ShoppingCart } from 'lucide-react';
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

          <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Login</h2>
          <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">Insira suas credenciais para acessar.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-8">
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
          </form>

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
    </div>
  );
};

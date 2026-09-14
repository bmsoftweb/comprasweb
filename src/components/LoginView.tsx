import React, { useState } from 'react';
import { Lock, ArrowRight, AlertCircle, Eye, EyeOff, Mail } from 'lucide-react';
import { Usuario } from '../types';
import { ThemeMode } from '../utils/theme';
import { ThemeToggle } from './ThemeToggle';
import { Toggle } from './Toggle';
import { login } from '../services/api';
import { INPUT_CLASS_LG, LABEL_CLASS } from '../utils/formStyles';
import { lerLembrete, salvarLembrete } from '../utils/session';

interface LoginViewProps {
  avisoInicial?: string | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLoginSuccess: (token: string, usuario: Usuario, lembrar: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ avisoInicial, theme, onToggleTheme, onLoginSuccess }) => {
  const [lembrete] = useState(() => lerLembrete());
  const [email, setEmail] = useState(() => lembrete ?? '');
  const [lembrar, setLembrar] = useState(() => Boolean(lembrete));
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(avisoInicial ?? null);

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
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 flex flex-col items-center p-4 sm:p-6 select-none relative">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} variant="login" />
      </div>

      <div className="w-full max-w-md my-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 px-6 min-w-20 rounded-2xl bg-blue-700 text-white font-black text-xl tracking-widest shadow-lg shadow-blue-700/20 mb-3 border border-blue-600">
            PULL
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Compras PULL</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            A Central abre o pedido, as lojas preenchem e a compra sai consolidada
          </p>
        </div>

        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Acesso</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Central de Compras (CD) ou Loja/Associado — o perfil é identificado pelo seu usuário
            </p>
          </div>

          {erro && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{erro}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className={`block ${LABEL_CLASS} mb-1.5`}>
                E-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErro(null);
                  }}
                  placeholder="seu@email.com"
                  autoComplete="username"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-10`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-senha" className={`block ${LABEL_CLASS} mb-1.5`}>
                Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="login-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setErro(null);
                  }}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  required
                  className={`${INPUT_CLASS_LG} w-full pl-10 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Toggle
              checked={lembrar}
              onChange={setLembrar}
              size="sm"
              label="Lembrar neste dispositivo"
              title="Mantém a sessão ao fechar o navegador e preenche o e-mail no próximo acesso. A senha nunca é guardada."
            />

            <button
              type="submit"
              disabled={carregando}
              className="w-full mt-2 flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-700/20 disabled:opacity-50 cursor-pointer"
            >
              {carregando ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Entrar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

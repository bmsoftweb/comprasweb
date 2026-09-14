import { Usuario } from '../types';

/**
 * Sessão guardada no navegador.
 * "Lembrar neste dispositivo" marcado: localStorage (sobrevive ao fechar o navegador)
 * e o e-mail vem preenchido no próximo login. Desmarcado: sessionStorage.
 * A senha nunca é armazenada.
 */

const CHAVE_SESSAO = 'compras_pull_sessao';
const CHAVE_LEMBRETE = 'compras_pull_lembrar_email';

interface Sessao {
  token: string;
  usuario: Usuario;
}

function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

export function lerSessao(): Sessao | null {
  return seguro(() => {
    const bruto = localStorage.getItem(CHAVE_SESSAO) ?? sessionStorage.getItem(CHAVE_SESSAO);
    return bruto ? (JSON.parse(bruto) as Sessao) : null;
  }, null);
}

export function salvarSessao(sessao: Sessao, lembrar: boolean) {
  seguro(() => {
    const destino = lembrar ? localStorage : sessionStorage;
    const outro = lembrar ? sessionStorage : localStorage;
    destino.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    outro.removeItem(CHAVE_SESSAO);
  }, undefined);
}

export function limparSessao() {
  seguro(() => {
    localStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_SESSAO);
  }, undefined);
}

export function lerLembrete(): string | null {
  return seguro(() => localStorage.getItem(CHAVE_LEMBRETE), null);
}

export function salvarLembrete(email: string | null) {
  seguro(() => (email ? localStorage.setItem(CHAVE_LEMBRETE, email) : localStorage.removeItem(CHAVE_LEMBRETE)), undefined);
}

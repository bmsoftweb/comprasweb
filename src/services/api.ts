import { Usuario } from '../types';

/**
 * Cliente HTTP do app. O token da sessão acompanha toda requisição no header
 * Authorization; uma resposta 401 dispara o callback de sessão expirada.
 */
let token: string | null = null;
let aoExpirar: ((mensagem: string) => void) | null = null;

export function setToken(novo: string | null) {
  token = novo;
}

export function getToken() {
  return token;
}

export function onSessaoExpirada(fn: (mensagem: string) => void) {
  aoExpirar = fn;
}

async function req<T = any>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${url}`, {
    method: metodo,
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !url.startsWith('/auth/login')) {
    aoExpirar?.(data?.error || 'Sessão expirada. Entre novamente.');
  }
  if (!res.ok) throw new Error(data?.error || `Falha na requisição (HTTP ${res.status}).`);
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => req<T>('GET', url),
  post: <T = any>(url: string, corpo: unknown = {}) => req<T>('POST', url, corpo),
  put: <T = any>(url: string, corpo: unknown = {}) => req<T>('PUT', url, corpo),
  del: <T = any>(url: string) => req<T>('DELETE', url),
};

export function login(email: string, senha: string) {
  return api.post<{ token: string; usuario: Usuario }>('/auth/login', { email, senha });
}

export function urlArquivo(pedidoId: number, arquivoId: number) {
  return `/api/arquivos/${pedidoId}/${arquivoId}?token=${encodeURIComponent(token || '')}`;
}

/** Monta querystring ignorando valores vazios */
export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

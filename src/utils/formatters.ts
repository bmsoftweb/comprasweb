import { SituacaoPedido } from '../types';

export function parseDataMysql(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00` : valor.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export function formatMoeda(valor: number | string | null | undefined): string {
  const n = Number(valor || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumero(valor: number | string | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: Math.max(casas, 3) });
}

export function formatData(valor: string | null | undefined): string {
  const d = parseDataMysql(valor);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}

export function formatDataHora(valor: string | null | undefined): string {
  const d = parseDataMysql(valor);
  if (!d) return '—';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Valor para <input type="datetime-local"> */
export function paraInputDataHora(valor: string | null | undefined): string {
  if (!valor) return '';
  return valor.replace(' ', 'T').slice(0, 16);
}

export function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Contagem regressiva a partir de data_fechamento.
 * dias: dias inteiros restantes (0 = fecha hoje); negativo = já fechou.
 */
export function faltam(valor: string | null | undefined): { dias: number; texto: string; vencido: boolean; urgente: boolean } {
  const d = parseDataMysql(valor);
  if (!d) return { dias: 0, texto: '—', vencido: false, urgente: false };
  const ms = d.getTime() - Date.now();
  if (ms <= 0) {
    // dias de calendário: fechado ontem às 17h conta como 1 dia, mesmo que tenham passado menos de 24h
    const inicioDia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diasPassados = Math.round((inicioDia(new Date()) - inicioDia(d)) / 86400000);
    return { dias: -diasPassados, texto: diasPassados === 0 ? 'Fechado hoje' : `Fechado há ${diasPassados}d`, vencido: true, urgente: false };
  }
  const horas = ms / 3600000;
  if (horas < 24) {
    const h = Math.floor(horas);
    return { dias: 0, texto: h === 0 ? `${Math.max(1, Math.floor(ms / 60000))} min` : `${h} h`, vencido: false, urgente: true };
  }
  const dias = Math.floor(horas / 24);
  return { dias, texto: `${dias} ${dias === 1 ? 'dia' : 'dias'}`, vencido: false, urgente: dias <= 2 };
}

export const SITUACAO_PEDIDO: Record<SituacaoPedido, { rotulo: string; cor: string; ponto: string }> = {
  em_elaboracao: {
    rotulo: 'Em elaboração',
    cor: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
    ponto: 'bg-stone-400',
  },
  liberado_loja: {
    rotulo: 'Disponível',
    cor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
    ponto: 'bg-emerald-500',
  },
  indisponivel: {
    rotulo: 'Indisponível',
    cor: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
    ponto: 'bg-rose-500',
  },
  aguardando_fechamento: {
    rotulo: 'Aguardando fechamento',
    cor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
    ponto: 'bg-amber-500',
  },
  encerrado_com_volume: {
    rotulo: 'Encerrado com volume',
    cor: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
    ponto: 'bg-blue-500',
  },
  encerrado_sem_volume: {
    rotulo: 'Encerrado sem volume',
    cor: 'bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700',
    ponto: 'bg-stone-400',
  },
};

export const ACOES_LOG: Record<string, string> = {
  criacao: 'Criação',
  duplicacao: 'Duplicação',
  alteracao: 'Alteração',
  alteracao_situacao: 'Situação alterada',
  exclusao_itens: 'Produtos excluídos',
  fechamento_programado: 'Fechamento programado',
  preenchimento: 'Preenchimento',
  rejeicao: 'Rejeição',
  avaliacao: 'Avaliação',
  notificacao_associados: 'Notificação aos associados',
  busca_imagens: 'Busca de imagens',
  envio_impressao: 'Envio da impressão',
  cotacao_enviada: 'Cotação enviada',
  compra_efetuada: 'Compra efetuada',
  recebimento_confirmado: 'Recebimento confirmado',
  recebimento_divergencia: 'Recebimento com divergência',
  confirmacao_email: 'Confirmação de e-mail',
  confirmacao_email_desfeita: 'Confirmação de e-mail desfeita',
};

export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

/** Converte texto colado de planilha (TAB, ; ou ,) em linhas de objetos pelas colunas informadas */
export function parseLinhasColadas(texto: string, colunas: string[]): Record<string, string>[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linha) => {
      const sep = linha.includes('\t') ? '\t' : linha.includes(';') ? ';' : ',';
      const partes = linha.split(sep).map((p) => p.trim());
      const obj: Record<string, string> = {};
      colunas.forEach((c, i) => (obj[c] = partes[i] ?? ''));
      return obj;
    });
}

/** Aceita "1.234,56" e "1234.56" */
export function parseDecimal(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = v.trim();
  if (!s) return null;
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normal);
  return isNaN(n) ? null : n;
}

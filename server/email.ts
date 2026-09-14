import nodemailer from 'nodemailer';

export interface ResultadoEnvio {
  status: 'enviado' | 'simulado' | 'falha';
  erro?: string;
}

/**
 * Envia um e-mail HTML pelo SMTP configurado no .env.
 * Sem SMTP_HOST o envio é apenas registrado como "simulado", para que o fluxo
 * possa ser testado de ponta a ponta sem um servidor de e-mail.
 */
export async function enviarEmail(para: string | string[], assunto: string, html: string): Promise<ResultadoEnvio> {
  const destinatarios = (Array.isArray(para) ? para : [para]).filter(Boolean);
  if (!destinatarios.length) return { status: 'falha', erro: 'Nenhum destinatário informado.' };

  if (!process.env.SMTP_HOST) {
    console.log(`[e-mail simulado] Para: ${destinatarios.join(', ')} | Assunto: ${assunto}`);
    return { status: 'simulado' };
  }

  try {
    // Mesmas variáveis do meuConsultorioWeb (SMTP_PASS; porta 465 = conexão segura)
    const porta = Number(process.env.SMTP_PORT) || 587;
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: porta,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : porta === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD }
        : undefined,
    });
    await transporte.sendMail({
      from: `"ComprasWeb" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: destinatarios.join(', '),
      subject: assunto,
      html,
    });
    return { status: 'enviado' };
  } catch (err: any) {
    return { status: 'falha', erro: String(err?.message || err).slice(0, 500) };
  }
}

export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

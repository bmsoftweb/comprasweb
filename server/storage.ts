import fs from 'fs';
import path from 'path';
import { put, del } from '@vercel/blob';

/**
 * Armazenamento dos anexos do pedido.
 *
 * Com BLOB_READ_WRITE_TOKEN: Vercel Blob (mesmo store do b2bweb), sempre dentro da
 * pasta "comprasweb/" para não se misturar com os arquivos do portal B2B.
 * Sem token: pasta local uploads/ (desenvolvimento).
 *
 * O caminho gravado em pedido_arquivos.caminho_arquivo é a URL do blob ou o caminho
 * relativo local; a origem é reconhecida pelo prefixo http(s).
 */

export const PASTA_BLOB = 'comprasweb';
const PASTA_LOCAL = path.join(process.cwd(), 'uploads');

export const usaBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const ehBlob = (caminho: string) => /^https?:\/\//i.test(caminho);

export async function salvarAnexo(pedidoId: number, nome: string, bytes: Buffer): Promise<string> {
  const relativo = `pedidos/${pedidoId}/${Date.now()}-${nome}`;
  if (usaBlob()) {
    const blob = await put(`${PASTA_BLOB}/${relativo}`, bytes, {
      access: 'public',
      // sufixo aleatório: o store é público, a URL do anexo não pode ser adivinhável
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }
  const destino = path.join(PASTA_LOCAL, relativo);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, bytes);
  return relativo;
}

export async function removerAnexos(caminhos: string[]) {
  const blobs = caminhos.filter(ehBlob);
  if (blobs.length && usaBlob()) {
    await del(blobs, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((e) =>
      console.warn('Falha ao remover anexos do Vercel Blob:', e?.message || e),
    );
  }
  for (const c of caminhos.filter((x) => !ehBlob(x))) {
    fs.rmSync(path.join(PASTA_LOCAL, c), { force: true });
  }
}

/** Caminho absoluto de um anexo local, garantindo que não saia da pasta uploads */
export function caminhoLocal(relativo: string): string | null {
  const absoluto = path.resolve(PASTA_LOCAL, relativo);
  return absoluto.startsWith(PASTA_LOCAL) && fs.existsSync(absoluto) ? absoluto : null;
}

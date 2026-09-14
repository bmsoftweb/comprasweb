export type TipoUsuario = 'administrador' | 'loja';

export interface Usuario {
  id: number;
  nome_completo: string;
  email: string;
  cpf: string;
  tipo: TipoUsuario;
  associado_id: number | null;
  associado_nome: string | null;
  classificacao_id: number | null;
  classificacao_nome: string | null;
}

export type SituacaoPedido =
  | 'em_elaboracao'
  | 'liberado_loja'
  | 'indisponivel'
  | 'aguardando_fechamento'
  | 'encerrado_com_volume'
  | 'encerrado_sem_volume';

export interface Marcador {
  id: number;
  nome: string;
  cor: string | null;
}

export interface Classificacao {
  id: number;
  bmsoft_id: string | null;
  nome: string;
  total_associados?: number;
}

export interface Associado {
  id: number;
  bmsoft_id: string;
  nome: string;
  classificacao_id: number | null;
  classificacao_nome: string | null;
  ativo: number;
  sincronizado_em: string;
  total_usuarios?: number;
}

export interface Fornecedor {
  id: number;
  bmsoft_id: string | null;
  descricao: string;
  email: string | null;
  origem: 'bmsoft' | 'manual';
}

export interface Produto {
  id: number;
  bmsoft_id: string | null;
  gtin: string | null;
  descricao: string;
  unidade: string;
  marca: string | null;
  classe: string | null;
  qtd_embalagem: number | null;
  preco_estimado: number | null;
  imagem_url: string | null;
  origem: 'bmsoft' | 'manual';
}

export interface UsuarioCadastro {
  id: number;
  nome_completo: string;
  cpf: string;
  email: string;
  tipo: TipoUsuario;
  associado_id: number | null;
  associado_nome: string | null;
  associado_bmsoft_id: string | null;
  ativo: number;
}

export interface PedidoResumo {
  id: number;
  nome: string;
  situacao: SituacaoPedido;
  data_fechamento: string;
  compra_efetuada: number;
  data_compra_efetuada: string | null;
  fornecedor_nome: string | null;
  comprador_nome: string | null;
  total_associados: number;
  total_preenchidos: number;
  total_rejeitados: number;
  total_itens: number;
  volume: number;
  marcadores: Marcador[];
}

export interface CondicaoPagamento {
  id?: number;
  condicao_pagamento: string;
  percentual: number | null;
  valor_minimo: number | null;
  classificacao_id: number | null;
  classificacao_nome?: string | null;
}

export interface PedidoItem {
  id?: number;
  /** chave local para itens ainda não gravados */
  chave?: string;
  produto_id: number | null;
  produto_bmsoft_id?: string | null;
  gtin: string | null;
  descricao: string;
  unidade: string;
  qtd_embalagem: number | null;
  preco_compra: number | null;
  preco_estimado?: number | null;
  limite_maximo: number | null;
  limite_logistica: number | null;
  imagem_url: string | null;
  quantidade_total?: number;
}

export interface PedidoAssociado {
  id?: number;
  associado_id: number;
  associado_nome: string;
  associado_bmsoft_id: string;
  classificacao_id: number | null;
  classificacao_nome: string | null;
  incluido_via: 'grupo' | 'individual';
  situacao?: 'pendente' | 'preenchido' | 'rejeitado';
  data_acao?: string | null;
  usuario_acao_nome?: string | null;
  condicao_pagamento_id?: number | null;
  condicao_nome?: string | null;
  condicao_percentual?: number | null;
  volume?: number;
  avaliacao_nota?: number | null;
  avaliacao_comentario?: string | null;
  recebimento_id?: number | null;
  situacao_entrega?: string | null;
}

export interface PedidoArquivo {
  id: number;
  nome_arquivo: string;
  criado_em: string;
  enviado_por_nome: string | null;
}

export interface PedidoLog {
  id: number;
  acao: string;
  data_acao: string;
  observacao: string | null;
  usuario_nome: string | null;
  associado_nome: string | null;
  pedido_id?: number;
  pedido_nome?: string;
}

export interface PedidoCompleto {
  id: number;
  nome: string;
  situacao: SituacaoPedido;
  fornecedor_id: number | null;
  fornecedor_manual: string | null;
  fornecedor_nome: string | null;
  fornecedor_email: string | null;
  data_fechamento: string;
  tipo_frete: 'CIF' | 'FOB' | null;
  prazo_entrega: string | null;
  local_entrega: string | null;
  observacao_associado: string | null;
  observacao_fornecedor: string | null;
  observacao_individual: string | null;
  usar_mesma_observacao: number;
  solicitar_avaliacao_compra: number;
  mostrar_valor_economizado: number;
  compra_efetuada: number;
  data_compra_efetuada: string | null;
  criado_por_nome: string | null;
  duplicado_de_pedido_id: number | null;
  criado_em: string;
  marcadores: Marcador[];
  grupos: number[];
  condicoes: CondicaoPagamento[];
  itens: PedidoItem[];
  associados: PedidoAssociado[];
  arquivos: PedidoArquivo[];
  quantidades: { pedido_item_id: number; pedido_associado_id: number; quantidade: number }[];
  log: PedidoLog[];
  volume: number;
  total_associados: number;
  total_preenchidos: number;
}

export interface PedidoLoja {
  id: number;
  nome: string;
  situacao: SituacaoPedido;
  data_fechamento: string;
  fornecedor_nome: string | null;
  tipo_frete: string | null;
  prazo_entrega: string | null;
  local_entrega: string | null;
  observacao_associado: string | null;
  solicitar_avaliacao_compra: number;
  mostrar_valor_economizado: number;
  compra_efetuada: number;
  marcadores: Marcador[];
  arquivos: PedidoArquivo[];
  condicoes: CondicaoPagamento[];
  itens: (PedidoItem & { id: number; codigo: string | null; quantidade: number; quantidade_outras_lojas: number })[];
  participacao: {
    id: number;
    situacao: 'pendente' | 'preenchido' | 'rejeitado';
    data_acao: string | null;
    usuario_acao_nome: string | null;
    condicao_pagamento_id: number | null;
    avaliacao_nota: number | null;
    avaliacao_comentario: string | null;
  };
  pode_preencher: boolean;
}

export interface PedidoLojaResumo {
  id: number;
  nome: string;
  situacao: SituacaoPedido;
  data_fechamento: string;
  compra_efetuada: number;
  fornecedor_nome: string | null;
  minha_situacao: 'pendente' | 'preenchido' | 'rejeitado';
  data_acao: string | null;
  meu_volume: number;
  total_itens: number;
  situacao_entrega: string | null;
  marcadores: Marcador[];
}

export interface Recebimento {
  id: number;
  pedido_id: number;
  pedido_associado_id: number;
  pedido_nome: string;
  fornecedor_nome: string | null;
  associado_nome: string;
  associado_bmsoft_id: string;
  data_compra: string | null;
  situacao_entrega: 'pendente' | 'confirmado' | 'divergencia';
  observacao: string | null;
  confirmado_por_nome: string | null;
  confirmado_em: string | null;
  volume: number;
}

export interface EnvioEmail {
  id: number;
  pedido_id: number;
  pedido_nome: string;
  fornecedor_nome: string | null;
  email_envio: string;
  tipo_envio: 'email_cadastrado' | 'digitacao_livre';
  apenas_cotacao: number;
  assunto: string | null;
  status_envio: 'enviado' | 'simulado' | 'falha';
  mensagem_erro: string | null;
  data_envio: string;
  usuario_nome: string | null;
  confirmado_fornecedor_em: string | null;
  confirmado_por_nome: string | null;
  observacao_confirmacao: string | null;
}

export interface DbStatus {
  connected: boolean;
  latencyMs: number;
  database?: string;
  error?: string;
}

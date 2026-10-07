// Tipos de dados usados nas telas (espelham as tabelas do banco).

export type Perfil = 'admin' | 'operador';

// Permissões que o administrador pode dar (ou tirar) de cada operador
export type Permissao =
  | 'produtos'
  | 'entrada'
  | 'saida'
  | 'transferir'
  | 'inventario'
  | 'estornar'
  | 'relatorios'
  | 'historico';

export type StatusTransferencia = 'concluida' | 'estornada';
export type TipoOperacao = 'entrada' | 'saida' | 'ajuste' | 'transferencia' | 'estorno';

export interface Loja {
  id: number;
  codigo: string;
  nome: string;
  cor: string;
  ordem: number;
  ativa: boolean;
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criado_em: string;
  perm_produtos: boolean;
  perm_entrada: boolean;
  perm_saida: boolean;
  perm_transferir: boolean;
  perm_inventario: boolean;
  perm_estornar: boolean;
  perm_relatorios: boolean;
  perm_historico: boolean;
  loja_atual: number | null; // estoque em que a pessoa está trabalhando agora
}

export interface Estoque {
  loja_id: number;
  saldo: number;
  estoque_minimo: number;
}

export interface Produto {
  id: number;
  sku: string;
  ean: string | null;
  nome: string;
  categoria_id: number | null;
  marca_id: number | null;
  unidade: string;
  preco_custo: number;
  preco_venda: number;
  custo_medio: number;
  foto_path: string | null;
  observacoes: string | null;
  ativo: boolean;
  ml_item_id: string | null;
  criado_em: string;
  atualizado_em: string;
  estoques: Estoque[];
}

export interface Cadastro {
  id: number;
  nome: string;
}

export interface Fornecedor extends Cadastro {
  cnpj: string | null;
}

export interface OperacaoResumo {
  id: number;
  criado_em: string;
  data_referencia: string;
  transferencia_id: number | null;
  tipo: TipoOperacao;
  motivo: string | null;
  observacao: string | null;
  origem: string;
  loja_origem_id: number | null;
  origem_nome: string | null;
  origem_cor: string | null;
  loja_destino_id: number | null;
  destino_nome: string | null;
  destino_cor: string | null;
  nota_fiscal_id: number | null;
  nf_numero: string | null;
  nf_serie: string | null;
  fornecedor_nome: string | null;
  estorno_de: number | null;
  estornada_por: number | null;
  usuario_id: string | null;
  usuario_nome: string;
  qtd_produtos: number;
  qtd_unidades: number;
}

export interface MovimentacaoLinha {
  id: number;
  criado_em: string;
  data_referencia: string;
  transferencia_id: number | null;
  saldo_antes: number;
  origem_nome: string | null;
  destino_nome: string | null;
  operacao_id: number;
  tipo: TipoOperacao;
  motivo: string | null;
  observacao: string | null;
  produto_id: number;
  produto_nome: string;
  sku: string;
  ean: string | null;
  unidade: string;
  loja_id: number;
  loja_nome: string;
  loja_codigo: string;
  loja_cor: string;
  quantidade: number;
  custo_unitario: number | null;
  saldo_apos: number;
  usuario_nome: string;
  nota_fiscal_id: number | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_chave: string | null;
  fornecedor_nome: string | null;
  estorno_de: number | null;
  estornada_por: number | null;
}

export interface NotaFiscal {
  id: number;
  numero: string;
  serie: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  valor_total: number | null;
  cfop: string | null;
  natureza_operacao: string | null;
  arquivo_path: string | null;
  arquivo_nome: string | null;
  criado_em: string;
  criado_por_nome: string;
  qtd_operacoes: number;
}

// Dados de nota fiscal digitados num formulário (enviados para o banco)
export interface NotaForm {
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string;
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  valor_total: string;
  cfop: string;
  natureza_operacao: string;
}

export const NOTA_VAZIA: NotaForm = {
  numero: '',
  serie: '',
  chave_acesso: '',
  data_emissao: '',
  fornecedor_nome: '',
  fornecedor_cnpj: '',
  valor_total: '',
  cfop: '',
  natureza_operacao: '',
};

export interface Transferencia {
  id: number;
  status: StatusTransferencia;
  loja_origem_id: number;
  loja_destino_id: number;
  origem_nome: string;
  origem_cor: string;
  destino_nome: string;
  destino_cor: string;
  observacao: string | null;
  nota_fiscal_id: number | null;
  nf_numero: string | null;
  usuario_id: string | null;
  usuario_nome: string;
  criado_em: string;
  estornado_por_nome: string | null;
  estornado_em: string | null;
  motivo_estorno: string | null;
  qtd_produtos: number;
  total_unidades: number;
}

export interface TransferenciaItem {
  transferencia_id: number;
  produto_id: number;
  produto_nome: string;
  sku: string;
  unidade: string;
  quantidade: number;
}

export interface RegistroLog {
  quando: string;
  usuario_id: string | null;
  usuario_nome: string;
  perfil: string | null;
  acao: string;
  detalhe: string;
  origem: 'operacao' | 'auditoria';
  referencia: string;
}

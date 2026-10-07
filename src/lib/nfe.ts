'use client';

// Leitura do arquivo XML da NF-e (padrão da SEFAZ) para preencher a entrada automaticamente.

export interface ItemNFe {
  codigo: string; // código do produto no fornecedor (cProd)
  ean: string | null; // código de barras (cEAN)
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  cfop: string;
}

export interface DadosNFe {
  numero: string;
  serie: string;
  chave_acesso: string;
  data_emissao: string; // AAAA-MM-DD
  fornecedor_nome: string;
  fornecedor_cnpj: string;
  valor_total: number;
  natureza_operacao: string;
  cfop: string;
  itens: ItemNFe[];
}

const lista = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export async function lerXmlNFe(texto: string): Promise<DadosNFe> {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xml: any = parser.parse(texto);
  const nfe = xml?.nfeProc?.NFe ?? xml?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error('Este arquivo não parece ser o XML de uma NF-e.');

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const chave =
    String(xml?.nfeProc?.protNFe?.infProt?.chNFe ?? '') || String(inf['@Id'] ?? '').replace(/^NFe/, '');

  const itens: ItemNFe[] = lista(inf.det).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (d: any) => {
      const p = d.prod ?? {};
      const ean = String(p.cEAN ?? '').trim();
      return {
        codigo: String(p.cProd ?? '').trim(),
        ean: /^\d{8,14}$/.test(ean) ? ean : null, // "SEM GTIN" vira vazio
        descricao: String(p.xProd ?? '').trim(),
        quantidade: Number(p.qCom ?? 0),
        unidade: String(p.uCom ?? 'UN').trim().toUpperCase(),
        valor_unitario: Number(p.vUnCom ?? 0),
        cfop: String(p.CFOP ?? ''),
      };
    },
  );

  return {
    numero: String(ide.nNF ?? ''),
    serie: String(ide.serie ?? ''),
    chave_acesso: chave,
    data_emissao: String(ide.dhEmi ?? ide.dEmi ?? '').slice(0, 10),
    fornecedor_nome: String(emit.xNome ?? ''),
    fornecedor_cnpj: String(emit.CNPJ ?? emit.CPF ?? ''),
    valor_total: Number(inf.total?.ICMSTot?.vNF ?? 0),
    natureza_operacao: String(ide.natOp ?? ''),
    cfop: itens[0]?.cfop ?? '',
    itens,
  };
}

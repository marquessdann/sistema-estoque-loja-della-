// Agrupa as peças que saíram por causa de um KIT.
// No banco, a baixa de 1 kit vira 1 movimento por peça (é o que mexe no estoque),
// e a operação guarda a anotação "Kit: <nome> xN". Aqui juntamos de volta as peças
// de cada kit para mostrar "Kit X — 1 kit (3 peças)" em vez de 3 linhas soltas.
import type { Produto } from './tipos';

type Linha = { id: number; operacao_id: number; loja_id: number; produto_id: number; quantidade: number; observacao: string | null };

export interface InfoKit {
  chave: string; // operação + loja + kit
  kit_id: number;
  nome: string;
  sku: string;
  kits: number; // quantos kits
  pecas: number; // quantas peças no total
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Para cada linha que faz parte de um kit, diz de qual kit ela é. */
export function kitsDasLinhas<T extends Linha>(linhas: T[], produtos: Produto[]): Map<number, InfoKit> {
  const resultado = new Map<number, InfoKit>();
  const kits = produtos.filter((p) => p.eh_kit && p.kit?.length).sort((a, b) => b.nome.length - a.nome.length);
  if (kits.length === 0) return resultado;

  const grupos = new Map<string, T[]>();
  for (const l of linhas) {
    if (!l.observacao?.includes('Kit: ')) continue;
    const k = `${l.operacao_id}-${l.loja_id}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(l);
  }

  for (const [chaveOp, doGrupo] of grupos) {
    const obs = doGrupo[0].observacao ?? '';
    const trecho = obs.slice(obs.indexOf('Kit: ') + 5).split(' · ')[0];
    // kits citados na anotação (o nome mais longo primeiro, para não confundir nomes parecidos)
    let resto = trecho;
    const citados: { kit: Produto; qtd: number }[] = [];
    for (const kit of kits) {
      const m = new RegExp(`(?:^|, )${escapar(kit.nome)} x(\\d+)`).exec(resto);
      if (!m) continue;
      citados.push({ kit, qtd: Number(m[1]) });
      resto = resto.replace(m[0], '');
    }
    if (citados.length === 0) continue;

    // quanto de cada peça os kits usam; a linha só entra no kit se a quantidade bater certinho
    const usado = new Map<number, number>();
    for (const { kit, qtd } of citados) for (const c of kit.kit) usado.set(c.produto_id, (usado.get(c.produto_id) ?? 0) + c.quantidade * qtd);
    for (const { kit, qtd } of citados) {
      const info: InfoKit = {
        chave: `${chaveOp}-${kit.id}`,
        kit_id: kit.id,
        nome: kit.nome,
        sku: kit.sku,
        kits: qtd,
        pecas: kit.kit.reduce((s, c) => s + c.quantidade * qtd, 0),
      };
      for (const c of kit.kit) {
        const linha = doGrupo.find((l) => l.produto_id === c.produto_id && !resultado.has(l.id));
        if (linha && Math.abs(linha.quantidade) === usado.get(c.produto_id)) resultado.set(linha.id, info);
      }
    }
  }
  return resultado;
}

export type ItemAgrupado<T> = { tipo: 'linha'; linha: T } | { tipo: 'kit'; info: InfoKit; linhas: T[] };

/** Lista para mostrar na tela: as peças de um kit viram um item só (na posição da 1ª peça). */
export function agruparPorKit<T extends Linha>(linhas: T[], produtos: Produto[]): ItemAgrupado<T>[] {
  const mapa = kitsDasLinhas(linhas, produtos);
  const saida: ItemAgrupado<T>[] = [];
  const vistos = new Map<string, ItemAgrupado<T> & { tipo: 'kit' }>();
  for (const l of linhas) {
    const info = mapa.get(l.id);
    if (!info) {
      saida.push({ tipo: 'linha', linha: l });
      continue;
    }
    const existente = vistos.get(info.chave);
    if (existente) existente.linhas.push(l);
    else {
      const item = { tipo: 'kit' as const, info, linhas: [l] };
      vistos.set(info.chave, item);
      saida.push(item);
    }
  }
  return saida;
}

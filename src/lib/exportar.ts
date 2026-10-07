'use client';

// Exportação para Excel (.xlsx), CSV e PDF — tudo feito no próprio navegador.

export interface Coluna<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
  largura?: number; // largura aproximada (caracteres)
  formato?: 'moeda' | 'inteiro' | 'texto';
}

export interface Aba<T = unknown> {
  nome: string;
  colunas: Coluna<T>[];
  linhas: T[];
}

function baixar(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const carimbo = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function exportarExcel(nomeBase: string, abas: Aba<any>[]) {
  const ExcelJS = (await import('exceljs')).default;
  const livro = new ExcelJS.Workbook();
  livro.creator = 'DELLA Estoque';
  for (const aba of abas) {
    const planilha = livro.addWorksheet(aba.nome.slice(0, 31));
    planilha.columns = aba.colunas.map((c) => ({
      header: c.titulo,
      width: c.largura ?? Math.max(12, c.titulo.length + 2),
      style:
        c.formato === 'moeda'
          ? { numFmt: '"R$" #,##0.00' }
          : c.formato === 'inteiro'
            ? { numFmt: '0' }
            : {},
    }));
    for (const l of aba.linhas) planilha.addRow(aba.colunas.map((c) => c.valor(l) ?? ''));
    const cab = planilha.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D3B82' } };
    planilha.views = [{ state: 'frozen', ySplit: 1 }];
  }
  const buffer = await livro.xlsx.writeBuffer();
  baixar(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nomeBase}-${carimbo()}.xlsx`,
  );
}

export function exportarCSV<T>(nomeBase: string, colunas: Coluna<T>[], linhas: T[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // ponto e vírgula + BOM: abre certinho no Excel em português
  const texto = [
    colunas.map((c) => esc(c.titulo)).join(';'),
    ...linhas.map((l) =>
      colunas
        .map((c) => {
          const v = c.valor(l);
          return esc(typeof v === 'number' && c.formato === 'moeda' ? v.toFixed(2).replace('.', ',') : v);
        })
        .join(';'),
    ),
  ].join('\n');
  baixar(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }), `${nomeBase}-${carimbo()}.csv`);
}

export async function exportarPDF<T>(
  nomeBase: string,
  titulo: string,
  subtitulo: string,
  colunas: Coluna<T>[],
  linhas: T[],
  rodape?: string,
) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: colunas.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();

  // cabeçalho com a logo
  try {
    const img = await fetch('/logo-pdf.jpg').then((r) => r.blob());
    const dataUrl = await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result as string);
      fr.readAsDataURL(img);
    });
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, largura, 24, 'F');
    doc.addImage(dataUrl, 'JPEG', 10, 2, 22, 20);
  } catch {
    /* sem logo, segue */
  }
  doc.setTextColor(212, 164, 55);
  doc.setFontSize(14);
  doc.text(titulo, 38, 11);
  doc.setTextColor(220, 220, 220);
  doc.setFontSize(9);
  doc.text(subtitulo, 38, 17);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, largura - 10, 17, { align: 'right' });

  const fmt = (c: Coluna<T>, v: unknown) => {
    if (v === null || v === undefined) return '';
    if (c.formato === 'moeda' && typeof v === 'number')
      return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (typeof v === 'number') return v.toLocaleString('pt-BR');
    return String(v);
  };

  autoTable(doc, {
    startY: 28,
    head: [colunas.map((c) => c.titulo)],
    body: linhas.map((l) => colunas.map((c) => fmt(c, c.valor(l)))),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [13, 59, 130], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: Object.fromEntries(
      colunas.map((c, i) => [i, c.formato === 'moeda' || c.formato === 'inteiro' ? { halign: 'right' } : {}]),
    ),
    didDrawPage: () => {
      const altura = doc.internal.pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text('DELLA Distribuidora de Produtos — Controle de Estoque', 10, altura - 6);
      doc.text(`Página ${doc.getNumberOfPages()}`, largura - 10, altura - 6, { align: 'right' });
    },
  });

  if (rodape) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const y = ((doc as any).lastAutoTable?.finalY ?? 30) + 8;
    doc.setFontSize(10);
    doc.setTextColor(30);
    doc.text(rodape, 10, y);
  }
  doc.save(`${nomeBase}-${carimbo()}.pdf`);
}

// Lê uma planilha (.xlsx ou .csv) e devolve as linhas como objetos {cabeçalho: valor}
export async function lerPlanilha(arquivo: File): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(arquivo.name) || arquivo.type === 'text/csv') {
    const Papa = (await import('papaparse')).default;
    const texto = await arquivo.text();
    const r = Papa.parse<Record<string, string>>(texto.replace(/^﻿/, ''), {
      header: true,
      skipEmptyLines: 'greedy',
      delimitersToGuess: [';', ',', '\t'],
    });
    return r.data;
  }
  const ExcelJS = (await import('exceljs')).default;
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(await arquivo.arrayBuffer());
  const planilha = livro.worksheets[0];
  if (!planilha) return [];
  const cabecalhos: string[] = [];
  const linhas: Record<string, string>[] = [];
  planilha.eachRow({ includeEmpty: false }, (row, n) => {
    const valores = row.values as unknown[];
    if (n === 1) {
      valores.forEach((v, i) => (cabecalhos[i] = String(v ?? '').trim()));
      return;
    }
    const obj: Record<string, string> = {};
    let temAlgo = false;
    cabecalhos.forEach((c, i) => {
      if (!c) return;
      let v = valores[i];
      if (v && typeof v === 'object') {
        const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
        v = o.text ?? o.result ?? o.richText?.map((t) => t.text).join('') ?? '';
      }
      const s = v === null || v === undefined ? '' : String(v).trim();
      if (s) temAlgo = true;
      obj[c] = s;
    });
    if (temAlgo) linhas.push(obj);
  });
  return linhas;
}

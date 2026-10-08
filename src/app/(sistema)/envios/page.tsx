'use client';

import { Camera, CircleCheck, Keyboard, Loader2, QrCode, RotateCcw, Search, TriangleAlert, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { MiniaturasEnvio, NOMES_FOTOS } from '@/components/fotos-envio';
import { DetalheOperacao } from '@/components/operacoes';
import { SemPermissao, Titulo, Vazio } from '@/components/ui';
import { abrirCamera, caminhoFoto, codigoDaEtiqueta, criarLeitor, fecharCamera, tirarFoto } from '@/lib/camera';
import { useDados } from '@/lib/dados';
import { mensagemErro } from '@/lib/erros';
import { dataHora, novaChave } from '@/lib/formato';
import { supabaseNavegador } from '@/lib/supabase/client';
import type { ProvaEnvio } from '@/lib/tipos';

// Prova de envio na expedição: lê o QR da etiqueta e tira 3 fotos seguidas.
// As fotos sobem sozinhas em segundo plano e a câmera já volta para a próxima etiqueta.
type Envio = {
  chave: string;
  codigo: string;
  fotos: Blob[];
  caminhos: (string | null)[];
  status: 'enviando' | 'ok' | 'erro';
  erro?: string;
};

export default function Envios() {
  const { pode, usuario, lojaAtual } = useDados();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cameraPronta, setCameraPronta] = useState(false);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [previas, setPrevias] = useState<string[]>([]);
  const [repetido, setRepetido] = useState<string | null>(null);
  const [digitar, setDigitar] = useState(false);
  const [manual, setManual] = useState('');
  const [clarao, setClarao] = useState(false);
  const [tirando, setTirando] = useState(false);
  const [fila, setFila] = useState<Envio[]>([]);
  const [versao, setVersao] = useState(0);
  const feitos = useRef(new Set<string>());

  const podeUsar = pode('saida');

  // abre a câmera ao entrar na tela e fecha ao sair
  const ligarCamera = useCallback(async () => {
    if (!video.current) return;
    setErroCamera(null);
    try {
      fecharCamera(stream.current);
      stream.current = await abrirCamera(video.current);
      setCameraPronta(true);
    } catch (e) {
      setCameraPronta(false);
      setErroCamera((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!podeUsar) return;
    ligarCamera();
    return () => fecharCamera(stream.current);
  }, [podeUsar, ligarCamera]);

  // lê a etiqueta enquanto não houver um pedido em andamento
  const aguardandoEtiqueta = cameraPronta && !codigo && !repetido && !digitar;
  useEffect(() => {
    if (!aguardandoEtiqueta) return;
    let vivo = true;
    (async () => {
      const ler = await criarLeitor();
      while (vivo) {
        const lido = video.current ? await ler(video.current) : null;
        if (lido && vivo) {
          const c = codigoDaEtiqueta(lido);
          navigator.vibrate?.(80);
          if (feitos.current.has(c)) setRepetido(c);
          else setCodigo(c);
          break;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aguardandoEtiqueta]);

  // avisa se tentar sair com fotos ainda subindo
  const pendentes = fila.filter((f) => f.status !== 'ok').length;
  useEffect(() => {
    if (!pendentes) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [pendentes]);

  function limparPedido() {
    previas.forEach((u) => URL.revokeObjectURL(u));
    setPrevias([]);
    setFotos([]);
    setCodigo(null);
  }

  async function fotografar() {
    if (!video.current || !codigo || tirando) return;
    setTirando(true);
    try {
      const n = fotos.length + 1;
      const blob = await tirarFoto(video.current, [
        `Pedido / etiqueta: ${codigo}`,
        `${dataHora(new Date().toISOString())} · ${usuario?.nome ?? ''} · ${lojaAtual?.nome ?? ''}`,
        `Foto ${n}/3 - ${NOMES_FOTOS[n - 1]}`,
      ]);
      setClarao(true);
      setTimeout(() => setClarao(false), 120);
      navigator.vibrate?.(40);
      const novas = [...fotos, blob];
      if (novas.length < 3) {
        setFotos(novas);
        setPrevias((p) => [...p, URL.createObjectURL(blob)]);
      } else {
        const item: Envio = { chave: novaChave(), codigo, fotos: novas, caminhos: [null, null, null], status: 'enviando' };
        feitos.current.add(codigo);
        setFila((f) => [item, ...f]);
        enviar(item);
        limparPedido();
        toast.success(`Pedido ${codigo}: 3 fotos registradas. Pode ler a próxima etiqueta.`);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTirando(false);
    }
  }

  function desfazer() {
    if (fotos.length === 0) return limparPedido();
    URL.revokeObjectURL(previas[previas.length - 1]);
    setPrevias((p) => p.slice(0, -1));
    setFotos((f) => f.slice(0, -1));
  }

  async function enviar(item: Envio) {
    const sb = supabaseNavegador();
    const atualizar = (mud: Partial<Envio>) =>
      setFila((f) => f.map((x) => (x.chave === item.chave ? { ...x, ...mud } : x)));
    atualizar({ status: 'enviando', erro: undefined });
    try {
      // a foto já enviada não sobe de novo numa nova tentativa
      for (let i = 0; i < item.fotos.length; i++) {
        if (item.caminhos[i]) continue;
        const caminho = caminhoFoto();
        const { error } = await sb.storage
          .from('envios')
          .upload(caminho, item.fotos[i], { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        item.caminhos[i] = caminho;
      }
      const { error } = await sb.rpc('registrar_prova_envio', {
        p: { codigo: item.codigo, fotos: item.caminhos, chave: item.chave },
      });
      if (error) throw error;
      atualizar({ status: 'ok', caminhos: [...item.caminhos] });
      setVersao((v) => v + 1);
    } catch (e) {
      atualizar({ status: 'erro', erro: mensagemErro(e) });
    }
  }

  function usarManual(e: React.FormEvent) {
    e.preventDefault();
    const c = codigoDaEtiqueta(manual);
    if (!c) return toast.error('Digite o código da etiqueta.');
    setManual('');
    setDigitar(false);
    if (feitos.current.has(c)) setRepetido(c);
    else setCodigo(c);
  }

  if (!podeUsar) return <SemPermissao />;

  const etapa = codigo ? fotos.length : -1;

  return (
    <div className="mx-auto max-w-xl">
      <Titulo sub="Leia o QR da etiqueta e tire as 3 fotos. Salva sozinho e já volta para a próxima.">Envio com fotos</Titulo>

      <div className="relative overflow-hidden rounded-2xl border border-borda bg-black" data-etapa={etapa}>
        <video ref={video} className="aspect-[3/4] max-h-[62vh] w-full object-cover" playsInline muted />
        {clarao && <div className="absolute inset-0 bg-white/70" />}

        {/* faixa de cima: o que fazer agora */}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent p-3 text-center">
          {codigo ? (
            <>
              <div className="text-xs uppercase tracking-widest text-dourado" data-codigo={codigo}>
                Pedido {codigo}
              </div>
              <div className="text-lg font-bold text-white">
                Foto {fotos.length + 1} de 3: {NOMES_FOTOS[fotos.length]}
              </div>
            </>
          ) : cameraPronta ? (
            <div className="flex items-center justify-center gap-2 text-base font-bold text-white">
              <QrCode className="h-5 w-5 text-dourado" /> Aponte para o QR da etiqueta
            </div>
          ) : null}
        </div>

        {!codigo && cameraPronta && !repetido && (
          <div className="pointer-events-none absolute inset-[22%] rounded-2xl border-4 border-dourado/80" />
        )}

        {!cameraPronta && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            {erroCamera ? (
              <>
                <TriangleAlert className="h-8 w-8 text-orange-300" />
                <p className="text-sm text-white">{erroCamera}</p>
                <button className="btn-principal" onClick={ligarCamera}>
                  <Camera className="h-4 w-4" /> Abrir câmera
                </button>
              </>
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-dourado" />
            )}
          </div>
        )}

        {repetido && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-6 text-center">
            <p className="text-base font-semibold text-white">O pedido {repetido} já foi fotografado agora há pouco.</p>
            <div className="flex gap-2">
              <button className="btn-secundario" onClick={() => setRepetido(null)}>
                Ler outra etiqueta
              </button>
              <button
                className="btn-principal"
                onClick={() => {
                  setCodigo(repetido);
                  setRepetido(null);
                }}
              >
                Fotografar de novo
              </button>
            </div>
          </div>
        )}

        {/* faixa de baixo: miniaturas + botão de foto */}
        {codigo && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent p-3">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) =>
                previas[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={previas[i]} alt="" className="h-12 w-12 rounded-md border border-white/40 object-cover" />
                ) : (
                  <div
                    key={i}
                    className={`flex h-12 w-12 items-center justify-center rounded-md border text-sm font-bold ${
                      i === fotos.length ? 'border-dourado text-dourado' : 'border-white/30 text-white/50'
                    }`}
                  >
                    {i + 1}
                  </div>
                ),
              )}
            </div>
            <button
              aria-label="Tirar foto"
              data-testid="disparar"
              onClick={fotografar}
              disabled={tirando}
              className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-4 border-white bg-white/25 active:scale-95 disabled:opacity-60"
            >
              <span className="h-[54px] w-[54px] rounded-full bg-white" />
            </button>
            <div className="flex flex-col gap-1.5">
              <button className="btn-fantasma h-10 px-2 text-xs text-white" onClick={desfazer}>
                <Undo2 className="h-4 w-4" /> {fotos.length ? 'Refazer' : 'Voltar'}
              </button>
              <button className="btn-fantasma h-10 px-2 text-xs text-white" onClick={limparPedido}>
                <X className="h-4 w-4" /> Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {!codigo &&
        (digitar ? (
          <form onSubmit={usarManual} className="mt-3 flex gap-2">
            <input
              className="campo flex-1"
              autoFocus
              name="codigo_manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Nº do pedido ou código da etiqueta"
              maxLength={200}
            />
            <button className="btn-principal">OK</button>
            <button type="button" className="btn-secundario" onClick={() => setDigitar(false)}>
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <button className="btn-secundario mt-3 w-full" onClick={() => setDigitar(true)}>
            <Keyboard className="h-4 w-4" /> O QR não lê? Digitar o código
          </button>
        ))}

      {fila.length > 0 && (
        <div className="mt-4 rounded-xl border border-borda bg-painel p-3">
          <div className="mb-2 text-sm font-semibold">Feitos agora ({fila.length})</div>
          <ul className="divide-y divide-borda text-sm">
            {fila.map((f) => (
              <li key={f.chave} className="flex items-center justify-between gap-2 py-2" data-status={f.status}>
                <span className="truncate font-semibold">Pedido {f.codigo}</span>
                {f.status === 'ok' && (
                  <span className="flex items-center gap-1 text-emerald-300">
                    <CircleCheck className="h-4 w-4" /> Salvo
                  </span>
                )}
                {f.status === 'enviando' && (
                  <span className="flex items-center gap-1 text-suave">
                    <Loader2 className="h-4 w-4 animate-spin" /> Enviando…
                  </span>
                )}
                {f.status === 'erro' && (
                  <button className="btn-secundario h-9 px-2 text-xs text-orange-300" onClick={() => enviar(f)} title={f.erro}>
                    <RotateCcw className="h-4 w-4" /> Falhou: tentar de novo
                  </button>
                )}
              </li>
            ))}
          </ul>
          {pendentes > 0 && <p className="mt-2 text-xs text-suave">Não feche esta tela até todos ficarem “Salvo”.</p>}
        </div>
      )}

      <HistoricoEnvios versao={versao} />
    </div>
  );
}

function HistoricoEnvios({ versao }: { versao: number }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState<ProvaEnvio[] | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = supabaseNavegador().from('vw_provas_envio').select('*').order('criado_em', { ascending: false }).limit(20);
      const termo = busca.trim().replace(/[%_,()]/g, '');
      if (termo) q = q.ilike('codigo', `%${termo}%`);
      const { data, error } = await q;
      if (error) toast.error(mensagemErro(error));
      setLista((data ?? []) as ProvaEnvio[]);
    }, 250);
    return () => clearTimeout(t);
  }, [busca, versao]);

  return (
    <div className="mt-6">
      <h2 className="mb-2 font-titulo text-lg font-bold">Fotos já registradas</h2>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
        <input
          className="campo pl-9"
          name="buscar_envio"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nº do pedido / etiqueta"
        />
      </div>
      {!lista ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-suave" />
      ) : lista.length === 0 ? (
        <Vazio>Nenhuma prova de envio encontrada.</Vazio>
      ) : (
        <ul className="space-y-3">
          {lista.map((p) => (
            <li key={p.id} className="rounded-xl border border-borda bg-painel p-3" data-prova={p.codigo}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">Pedido {p.codigo}</span>
                {p.operacao_id ? (
                  <button className="text-xs text-dourado underline" onClick={() => setAberta(p.operacao_id)}>
                    Ver saída nº {p.operacao_id}
                  </button>
                ) : (
                  <span className="text-xs text-suave">Saída ainda não lançada com este nº</span>
                )}
              </div>
              <div className="mb-2 text-xs text-suave">
                {dataHora(p.criado_em)} · {p.usuario_nome}
                {p.loja_nome ? ` · ${p.loja_nome}` : ''}
              </div>
              <MiniaturasEnvio fotos={p.fotos} />
            </li>
          ))}
        </ul>
      )}
      <DetalheOperacao id={aberta} aoFechar={() => setAberta(null)} />
    </div>
  );
}

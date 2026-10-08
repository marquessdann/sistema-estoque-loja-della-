'use client';

import { QrCode } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { abrirCamera, codigoDaEtiqueta, criarLeitor, fecharCamera } from '@/lib/camera';
import { Modal } from './ui';

// Janela que abre a câmera, lê o QR Code / código de barras da etiqueta e devolve o código.
export function LeitorQR({
  aberto,
  aoFechar,
  aoLer,
}: {
  aberto: boolean;
  aoFechar: () => void;
  aoLer: (codigo: string) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    let stream: MediaStream | null = null;
    let vivo = true;
    setErro(null);
    (async () => {
      try {
        if (!video.current) return;
        stream = await abrirCamera(video.current);
        if (!vivo) return fecharCamera(stream);
        const ler = await criarLeitor();
        while (vivo) {
          const lido = video.current ? await ler(video.current) : null;
          if (lido && vivo) {
            vivo = false;
            navigator.vibrate?.(80);
            aoLer(codigoDaEtiqueta(lido));
            aoFechar();
            break;
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (e) {
        setErro((e as Error).message);
      }
    })();
    return () => {
      vivo = false;
      fecharCamera(stream);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Ler etiqueta" largura="max-w-md">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} className="aspect-[3/4] w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-dourado/80" />
        </div>
        {erro ? (
          <p className="text-sm text-red-300">{erro}</p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-suave">
            <QrCode className="h-4 w-4" /> Aponte para o QR Code da etiqueta.
          </p>
        )}
      </div>
    </Modal>
  );
}

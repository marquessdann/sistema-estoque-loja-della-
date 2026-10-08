// Câmera do celular: abrir a câmera de trás, ler QR Code / código de barras
// da etiqueta e tirar foto já reduzida (≈150–250 KB) com um carimbo de data e pedido.
import jsQR from 'jsqr';

type Detector = { detect: (fonte: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = {
  new (opcoes: { formats: string[] }): Detector;
  getSupportedFormats?: () => Promise<string[]>;
};

const FORMATOS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'data_matrix', 'pdf417'];
const LADO_FOTO = 1280; // lado maior da foto guardada
const QUALIDADE = 0.72;

export async function abrirCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não libera a câmera. Abra o site pelo Chrome ou Safari, com https.');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    const nome = (e as DOMException)?.name;
    if (nome === 'NotAllowedError' || nome === 'SecurityError')
      throw new Error('A câmera foi bloqueada. Toque no cadeado ao lado do endereço do site e permita a câmera.');
    if (nome === 'NotFoundError') throw new Error('Nenhuma câmera encontrada neste aparelho.');
    throw new Error('Não foi possível abrir a câmera.');
  }
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play().catch(() => undefined);
  return stream;
}

export function fecharCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

// Cria um leitor: usa o leitor nativo do celular (Android/Chrome lê QR e código de barras);
// se não houver, lê QR Code pela biblioteca jsQR.
export async function criarLeitor(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const Nativo = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Nativo) {
    try {
      const suportados = (await Nativo.getSupportedFormats?.()) ?? FORMATOS;
      const formatos = FORMATOS.filter((f) => suportados.includes(f));
      if (formatos.includes('qr_code')) {
        const detector = new Nativo({ formats: formatos });
        return async (video) => {
          if (video.readyState < 2) return null;
          const r = await detector.detect(video).catch(() => []);
          return r[0]?.rawValue?.trim() || null;
        };
      }
    } catch {
      /* usa o jsQR */
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || video.readyState < 2 || !video.videoWidth) return null;
    const escala = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data?.trim() || null;
  };
}

// O QR da etiqueta do Mercado Livre traz um texto como {"id":"44012345678","t":"lm"}.
// Guardamos só o número (id). Outras etiquetas: o próprio texto/código lido.
export function codigoDaEtiqueta(lido: string): string {
  const texto = lido.trim();
  if (texto.startsWith('{')) {
    try {
      const j = JSON.parse(texto) as Record<string, unknown>;
      for (const k of ['id', 'shipment_id', 'order_id', 'pedido']) {
        const v = j[k];
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
      }
    } catch {
      /* não é JSON */
    }
  }
  return texto.slice(0, 200);
}

// Tira a foto do vídeo, reduz e escreve o carimbo na faixa de baixo.
export async function tirarFoto(video: HTMLVideoElement, carimbo: string[]): Promise<Blob> {
  const w0 = video.videoWidth;
  const h0 = video.videoHeight;
  if (!w0 || !h0) throw new Error('A câmera ainda não está pronta.');
  const escala = Math.min(1, LADO_FOTO / Math.max(w0, h0));
  const w = Math.round(w0 * escala);
  const h = Math.round(h0 * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível tirar a foto.');
  ctx.drawImage(video, 0, 0, w, h);

  const fonte = Math.max(14, Math.round(w / 45));
  const linha = Math.round(fonte * 1.35);
  const faixa = linha * carimbo.length + fonte * 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, h - faixa, w, faixa);
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${fonte}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  carimbo.forEach((t, i) => ctx.fillText(t, fonte * 0.6, h - faixa + fonte * 0.4 + i * linha, w - fonte * 1.2));

  return new Promise((ok, falha) =>
    canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível gerar a foto.'))), 'image/jpeg', QUALIDADE),
  );
}

// Caminho na pasta "envios": ano/mês/código-aleatório.jpg
export function caminhoFoto(agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  return `${ano}/${mes}/${crypto.randomUUID()}.jpg`;
}

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Roda antes de cada página: renova o login e manda para /login quem não entrou.
const ROTAS_LIVRES = ['/login', '/redefinir-senha'];

// Página simples em português quando falta configurar algo na Vercel
function avisoConfiguracao(texto: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<body style="font-family:system-ui;background:#0a0a0a;color:#f5f3ee;padding:24px;line-height:1.6">` +
      `<h1 style="color:#d4a437">DELLA Estoque: falta configurar</h1><p>${texto}</p>` +
      `<p>Na Vercel: <b>Settings → Environment Variables</b>. Depois: <b>Deployments → ⋯ → Redeploy</b>.</p></body>`,
    { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const faltando = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !chave && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter(Boolean);
  if (faltando.length) return avisoConfiguracao(`Não encontrei a(s) variável(is): <b>${faltando.join(', ')}</b>.`);
  if (!/^https?:\/\/[^\s/]+\/?$/.test(url!.trim()))
    return avisoConfiguracao(
      'A variável <b>NEXT_PUBLIC_SUPABASE_URL</b> está num formato estranho. Ela deve ser só o endereço, sem espaços, ' +
        'por exemplo <code>https://abcdefgh.supabase.co</code> (sem espaços e sem nada depois de .co).',
    );

  const supabase = createServerClient(
    url!.trim().replace(/\/$/, ''),
    chave!.trim(),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => request.cookies.set(name, value));
          resposta = NextResponse.next({ request });
          lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  // se o Supabase não responder, trata como "não entrou" (vai para o login) em vez de derrubar a página
  let user = null;
  try {
    user = (await supabase.auth.getUser()).data.user;
  } catch {
    user = null;
  }

  const caminho = request.nextUrl.pathname;
  const livre = ROTAS_LIVRES.some((r) => caminho.startsWith(r)) || caminho.startsWith('/api/');

  if (!user && !livre) {
    const destino = request.nextUrl.clone();
    destino.pathname = '/login';
    destino.search = '';
    return NextResponse.redirect(destino);
  }
  if (user && caminho === '/login') {
    const destino = request.nextUrl.clone();
    destino.pathname = '/';
    return NextResponse.redirect(destino);
  }
  return resposta;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.*|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};

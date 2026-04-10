# Proxy da rota pública no harmonics-app (Cloudflare)

Use este handler na rota pública existente `/api/cliente/repertorio/pdf/[token]` do repositório **harmonics-app**.

```ts
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = String(params?.token || '').trim();

  if (!token) {
    return new Response(JSON.stringify({ ok: false, message: 'Token obrigatório.' }), {
      status: 400,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const baseUrl = String(process.env.CONTRACT_SERVICE_URL || '').replace(/\/$/, '');
  if (!baseUrl) {
    return new Response(JSON.stringify({ ok: false, message: 'CONTRACT_SERVICE_URL não definida.' }), {
      status: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  const upstream = `${baseUrl}/api/repertoire/pdf/${encodeURIComponent(token)}`;
  const upstreamResponse = await fetch(upstream, {
    method: 'GET',
    headers: {
      accept: 'application/pdf,application/json',
      'x-api-key': process.env.CONTRACT_SERVICE_API_KEY || '',
    },
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      'content-type': upstreamResponse.headers.get('content-type') || 'application/pdf',
      'content-disposition':
        upstreamResponse.headers.get('content-disposition') ||
        `inline; filename="repertorio-premium-${token.slice(0, 8)}.pdf"`,
      'cache-control': upstreamResponse.headers.get('cache-control') || 'private, max-age=120',
    },
  });
}
```

Com isso, o botão **Baixar PDF** continua na mesma URL pública, mas a geração efetiva acontece no Render.

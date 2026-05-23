import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

function buildAppReturnUrl(appReturnUri: string, params: URLSearchParams): string {
  const query = params.toString();
  if (!query) return appReturnUri;
  return `${appReturnUri}${appReturnUri.includes('?') ? '&' : '?'}${query}`;
}

function redirectToApp(appReturnUri: string, params: URLSearchParams): Response {
  const target = buildAppReturnUrl(appReturnUri, params);

  // 302 opens Expo Go / dev client reliably; HTML was rendering as raw text in Safari.
  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const appReturnUri = url.searchParams.get('return_uri') ?? 'parcel://strava-auth';

  const forward = new URLSearchParams();
  for (const key of ['code', 'scope', 'state', 'error', 'intent']) {
    const value = url.searchParams.get(key);
    if (value) forward.set(key, value);
  }

  if (forward.get('error')) {
    return redirectToApp(appReturnUri, forward);
  }

  if (!forward.get('code')) {
    return new Response('Missing authorization code', { status: 400 });
  }

  return redirectToApp(appReturnUri, forward);
});

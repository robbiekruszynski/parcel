import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async () => {
  return new Response(JSON.stringify({ error: 'speed-check not implemented' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json' },
  });
});

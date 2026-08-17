// Shared HTTP helpers for Edge Functions.
//
// CORS: hosted Supabase adds `Access-Control-Allow-Origin: *` for
// /functions/v1/* by default, but local `functions serve` and direct
// invocations do not. Setting the header explicitly keeps browser calls
// working in every environment; the internal job endpoint additionally
// allows the `x-internal-token` header through preflight.
//
// Internal-only endpoints (bunny-video-webhook, expire-subscriptions,
// recheck-video-states) are never called from a browser, so they reply
// WITHOUT CORS headers (noCors = true): no permissive surface is
// advertised and OPTIONS is rejected. Callers are server-side only
// (Bunny webhook, cron/scheduler chain).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info, x-internal-token',
};

export function jsonResponse(body: unknown, status = 200, noCors = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(noCors ? {} : CORS_HEADERS),
    },
  });
}

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

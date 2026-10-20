import { DeliveryError, PersistenceError } from './policy.mjs';

const reference = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export function normalize(provider, body) {
  const id = provider === 'deskA' && body?.accepted === true ? body.ticket_id
    : provider === 'deskB' && body?.result?.state === 'queued' ? body.result.reference : undefined;
  if (!reference(id)) throw new DeliveryError('INVALID_PROVIDER_RESPONSE', false);
  return { provider, reference: id };
}

export function providerURL(value) {
  const url = new URL(value);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.hash || url.search ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) {
    throw new Error('Provider requires HTTPS or loopback HTTP, without URL credentials/query');
  }
  return url.href;
}

export async function send(provider, endpoint, event, { timeoutMs = 1500, fetcher = fetch } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) throw new Error('Invalid timeout');
  if (!['deskA','deskB'].includes(provider)) throw new Error('Unknown provider');
  if (!/^\d+$/.test(String(event.id))) throw new DeliveryError('INVALID_EVENT', false);
  const payload = event.payload;
  // Explicit allowlist: never serialize notes, descriptions, identity or arbitrary event fields.
  const safe = { requestId: payload.requestId, version: payload.version, action: payload.action };
  const body = provider === 'deskA' ? { event: safe } : { notification: { change: safe } };
  try {
    const response = await fetcher(providerURL(endpoint), {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `campusfix-event-${event.id}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new DeliveryError(`PROVIDER_HTTP_${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500);
    }
    if (!response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      throw new DeliveryError('INVALID_PROVIDER_RESPONSE', false);
    }
    // Bound streamed data as well as the declared content length.
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body ?? []) {
      size += chunk.length;
      if (size > 16_384) throw new DeliveryError('PROVIDER_RESPONSE_TOO_LARGE', false);
      chunks.push(chunk);
    }
    return normalize(provider, JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    if (error instanceof SyntaxError) throw new DeliveryError('INVALID_PROVIDER_RESPONSE', false);
    throw new DeliveryError('PROVIDER_UNAVAILABLE', true);
  }
}

export async function deliver(event, endpoints, options) {
  if (event.selected_provider === 'deskB') return send('deskB', endpoints.deskB, event, options);
  try { return await send('deskA', endpoints.deskA, event, options); }
  catch (error) {
    // An ambiguous timeout must retry the same provider with the same key.
    // Fallback only on explicit 503, which the mock contract promises did not accept.
    if (!(error instanceof DeliveryError) || error.code !== 'PROVIDER_HTTP_503') throw error;
    // Pin the fallback BEFORE calling it so a lost acknowledgement cannot switch providers.
    try {
      if (options?.onFallback && !(await options.onFallback(event))) throw new DeliveryError('LEASE_LOST', false);
    } catch (pinError) {
      if (pinError instanceof DeliveryError) throw pinError;
      throw new PersistenceError('FALLBACK_PIN_FAILED');
    }
    return send('deskB', endpoints.deskB, event, options);
  }
}

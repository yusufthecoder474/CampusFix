import { disposition, retryDelay, DeliveryError, PersistenceError } from './policy.mjs';

export async function tick(store, deliver, { maxAttempts = 5, random = Math.random } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error('Invalid maxAttempts');
  const event = await store.claim();
  if (!event) return { outcome: 'idle' };
  // Claims lost to repeated process crashes also consume the finite attempt budget.
  if (event.attempts > maxAttempts) {
    const changed = await store.fail(event, 'dead', 'ATTEMPT_BUDGET_EXHAUSTED', 0);
    return { outcome: changed ? 'dead' : 'lease_lost', eventId: String(event.id) };
  }
  let result;
  try { result = await deliver(event); }
  catch(error) {
    if (error instanceof PersistenceError) throw error;
    const status = disposition(error, event.attempts, maxAttempts);
    const code = error instanceof DeliveryError ? error.code : 'DELIVERY_INTERNAL_ERROR';
    const changed = await store.fail(event, status, code,
      status === 'pending' ? retryDelay(event.attempts, random) : 0);
    return { outcome: changed ? status : 'lease_lost', eventId: String(event.id), code };
  }
  // A DB acknowledgement failure must escape, leaving the lease to expire.
  // It must not turn a successfully accepted provider request into a dead letter.
  const changed = await store.complete(event, result);
  return { outcome: changed ? 'delivered' : 'lease_lost', eventId: String(event.id) };
}

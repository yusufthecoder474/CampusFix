export class DeliveryError extends Error {
  constructor(code, retryable) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

export class PersistenceError extends Error {}

export function retryDelay(attempt, random = Math.random) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('Invalid attempt');
  const cap = Math.min(60_000, 1000 * 2 ** Math.min(attempt - 1, 16));
  return Math.floor(cap * (0.5 + random() * 0.5));
}

export function disposition(error, attempt, maxAttempts = 5) {
  // Unknown programming/protocol errors fail closed; only classified transient errors retry.
  return error instanceof DeliveryError && error.retryable && attempt < maxAttempts
    ? 'pending' : 'dead';
}

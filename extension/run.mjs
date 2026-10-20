import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { OutboxStore } from './store.mjs';
import { tick } from './worker.mjs';
import { deliver, providerURL } from './providers.mjs';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const endpoints = {
  deskA: providerURL(process.env.DESKA_URL ?? 'http://127.0.0.1:4600/desk-a'),
  deskB: providerURL(process.env.DESKB_URL ?? 'http://127.0.0.1:4600/desk-b'),
};
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2,
  connectionTimeoutMillis: 3000, query_timeout: 5000 });
pool.on('error', () => console.error(JSON.stringify({ event: 'outbox_database_unavailable' })));
const store = new OutboxStore(pool);
let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
try {
  if (process.argv.includes('--stats')) console.log(JSON.stringify(await store.stats()));
  else do {
    try {
      const result = await tick(store, e => deliver(e, endpoints, { onFallback: item => store.pinFallback(item) }));
      if (result.outcome !== 'idle') console.log(JSON.stringify({ event: 'outbox_delivery', ...result }));
      if (process.argv.includes('--once')) break;
      if (result.outcome === 'idle') await delay(500);
    } catch {
      console.error(JSON.stringify({ event: 'outbox_database_or_ack_failure' }));
      if (process.argv.includes('--once')) { process.exitCode = 1; break; }
      await delay(1000);
    }
  } while (!stopping);
} finally { await pool.end(); }

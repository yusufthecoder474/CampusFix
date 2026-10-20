import { randomUUID } from 'node:crypto';

export class OutboxStore {
  constructor(pool) { this.pool = pool; }
  async claim() {
    const token = randomUUID();
    const result = await this.pool.query(`
      WITH due AS (
        SELECT id FROM workflow_outbox
        WHERE (status='pending' AND available_at <= now())
           OR (status='processing' AND lease_until < now())
        ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE workflow_outbox o SET status='processing', attempts=o.attempts+1,
        lease_token=$1, lease_until=now()+interval '30 seconds'
        FROM due WHERE o.id=due.id RETURNING o.*`, [token]);
    return result.rows[0];
  }
  async complete(event, result) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const changed = await client.query(`UPDATE workflow_outbox SET status='delivered',
        delivered_at=now(), lease_token=NULL, lease_until=NULL, last_error=NULL
        WHERE id=$1 AND lease_token=$2 AND status='processing' RETURNING id`, [event.id,event.lease_token]);
      if (changed.rowCount) await client.query(`INSERT INTO provider_receipts(event_id,provider,reference)
        VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING`, [event.id,result.provider,result.reference]);
      await client.query('COMMIT');
      return changed.rowCount === 1;
    } catch(error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async pinFallback(event) {
    const r = await this.pool.query(`UPDATE workflow_outbox SET selected_provider='deskB'
      WHERE id=$1 AND lease_token=$2 AND status='processing'`, [event.id,event.lease_token]);
    return r.rowCount === 1;
  }
  async fail(event, status, code, delayMs) {
    const r = await this.pool.query(`UPDATE workflow_outbox SET status=$3,
      last_error=$4, available_at=now()+($5::integer*interval '1 millisecond'),
      lease_token=NULL, lease_until=NULL
      WHERE id=$1 AND lease_token=$2 AND status='processing'`,
      [event.id,event.lease_token,status,code,delayMs]);
    return r.rowCount === 1;
  }
  async stats() {
    return (await this.pool.query(`SELECT status,count(*)::int AS count,
      max(attempts) AS max_attempts FROM workflow_outbox GROUP BY status ORDER BY status`)).rows;
  }
}

// Intentionally requires native PostgreSQL; never silently substitutes an embedded engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { OutboxStore } from '../store.mjs';
import { tick } from '../worker.mjs';
import { DeliveryError } from '../policy.mjs';

test('native PostgreSQL outbox transaction and concurrency acceptance',async t=>{
  const url=process.env.TEST_DATABASE_URL;
  if(!url || !new URL(url).pathname.endsWith('_test')) throw new Error('Dedicated *_test database required');
  const {default:pg}=await import('pg');
  const schema='outbox_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:url});
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString:url,max:5,options:`-c search_path=${schema}`});
  const store=new OutboxStore(pool),user=randomUUID();
  async function createEvent(client=pool) {
    const id=randomUUID();
    await client.query(`INSERT INTO maintenance_requests(id,reporter_id,title,description,location)
      VALUES($1,$2,'Synthetic request','Synthetic description only','Demo lab')`,[id,user]);
    const r=await client.query(`INSERT INTO request_events(request_id,actor_id,action,next_status,request_version)
      VALUES($1,$2,'create','reported',0) RETURNING id`,[id,user]);
    return String(r.rows[0].id);
  }
  try {
    for(const name of ['001_initial.sql','002_workflow.sql','003_outbox.sql'])
      await pool.query(await readFile(new URL('../../db/'+name,import.meta.url),'utf8'));
    await pool.query(`INSERT INTO users(id,email,display_name,role,password_hash)
      VALUES($1,'outbox@campusfix.test','Synthetic User','student','unusable-test-hash')`,[user]);
    await t.test('audit insert creates a minimal outbox row',async()=>{
      const id=await createEvent();
      const r=await pool.query('SELECT payload FROM workflow_outbox WHERE id=$1',[id]);
      assert.equal(r.rowCount,1);
      assert.deepEqual(Object.keys(r.rows[0].payload).sort(),['action','requestId','version']);
    });
    await t.test('request audit and outbox all roll back together',async()=>{
      const before=await pool.query('SELECT count(*)::int AS n FROM workflow_outbox');
      const c=await pool.connect();
      try { await c.query('BEGIN');await createEvent(c);await c.query('ROLLBACK'); }
      finally {c.release();}
      const after=await pool.query('SELECT count(*)::int AS n FROM workflow_outbox');
      assert.equal(before.rows[0].n,after.rows[0].n);
    });
    await t.test('outbox failure aborts the source transaction',async()=>{
      const c=await pool.connect();
      const before=await pool.query('SELECT count(*)::int AS n FROM maintenance_requests');
      await pool.query("ALTER TABLE workflow_outbox ADD CONSTRAINT injected_outbox_failure CHECK(false) NOT VALID");
      try {
        await c.query('BEGIN');
        await assert.rejects(()=>createEvent(c),{code:'23514'});
        await c.query('ROLLBACK');
      } finally {await c.query('ROLLBACK');c.release();await pool.query('ALTER TABLE workflow_outbox DROP CONSTRAINT injected_outbox_failure');}
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM maintenance_requests')).rows[0].n,before.rows[0].n);
    });
    await t.test('two workers claim different events and fence stale acknowledgements',async()=>{
      await createEvent();
      const [a,b]=await Promise.all([store.claim(),store.claim()]);
      assert.ok(a && b);assert.notEqual(String(a.id),String(b.id));
      await pool.query("UPDATE workflow_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[a.id]);
      const again=await store.claim();assert.equal(String(a.id),String(again.id));
      assert.notEqual(a.lease_token,again.lease_token);
      assert.equal(await store.pinFallback(a),false);
      assert.equal(await store.pinFallback(again),true);
      assert.equal((await pool.query('SELECT selected_provider FROM workflow_outbox WHERE id=$1',[a.id])).rows[0].selected_provider,'deskB');
      assert.equal(await store.complete(a,{provider:'deskA',reference:'stale'}),false);
      assert.equal(await store.complete(again,{provider:'deskA',reference:'current'}),true);
      assert.equal(await store.complete(again,{provider:'deskA',reference:'current'}),false);
      await store.complete(b,{provider:'deskA',reference:'b'});
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM provider_receipts WHERE event_id=$1',[a.id])).rows[0].n,1);
    });
    await t.test('receipt failure rolls acknowledgement back',async()=>{
      await createEvent();const e=await store.claim();
      await assert.rejects(()=>store.complete(e,{provider:'unknown',reference:'bad'}),{code:'23514'});
      const row=(await pool.query('SELECT status FROM workflow_outbox WHERE id=$1',[e.id])).rows[0];
      assert.equal(row.status,'processing');
      assert.equal(await store.complete(e,{provider:'deskA',reference:'valid'}),true);
    });
    await t.test('retry is durable and future events cannot be claimed early',async()=>{
      await createEvent();
      assert.equal((await tick(store,async()=>{throw new DeliveryError('PROVIDER_UNAVAILABLE',true);})).outcome,'pending');
      assert.equal(await store.claim(),undefined);
      await pool.query("UPDATE workflow_outbox SET available_at=now()-interval '1 second' WHERE status='pending'");
      assert.equal((await tick(store,async()=>({provider:'deskB',reference:'recovered'}))).outcome,'delivered');
    });
    await t.test('terminal failure remains visible',async()=>{
      const id=await createEvent();
      await tick(store,async()=>{throw new DeliveryError('INVALID_PROVIDER_RESPONSE',false);});
      const row=(await pool.query('SELECT status,last_error FROM workflow_outbox WHERE id=$1',[id])).rows[0];
      assert.equal(row.status,'dead');assert.equal(row.last_error,'INVALID_PROVIDER_RESPONSE');
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});

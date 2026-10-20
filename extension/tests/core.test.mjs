import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { normalize, send, deliver, providerURL } from '../providers.mjs';
import { DeliveryError, PersistenceError, retryDelay, disposition } from '../policy.mjs';
import { tick } from '../worker.mjs';
import { mockProviders } from '../mock-providers.mjs';

const event = { id:'42', attempts:1, lease_token:'lease', payload: {
  requestId:'00000000-0000-4000-8000-000000000001',version:0,action:'create',note:'PRIVATE',reporterId:'PRIVATE' } };
async function withMock(options, work) {
  const mock = mockProviders(options);
  mock.server.listen(0,'127.0.0.1');
  await once(mock.server,'listening');
  const base = `http://127.0.0.1:${mock.server.address().port}`;
  try { return await work(mock,{ deskA:base+'/desk-a',deskB:base+'/desk-b' }); }
  finally { mock.server.closeAllConnections(); await new Promise(resolve=>mock.server.close(resolve)); }
}
test('two distinct provider contracts normalize to the same shape',()=>{
  assert.deepEqual(normalize('deskA',{accepted:true,ticket_id:'A_1'}),{provider:'deskA',reference:'A_1'});
  assert.deepEqual(normalize('deskB',{result:{state:'queued',reference:'B_2'}}),{provider:'deskB',reference:'B_2'});
});
test('malformed and unaccepted responses fail closed',()=>{
  for(const body of [null,{}, {accepted:false,ticket_id:'x'}, {accepted:true,ticket_id:'<script>'}])
    assert.throws(()=>normalize('deskA',body),{code:'INVALID_PROVIDER_RESPONSE'});
});
test('retry backoff grows, jitters and caps',()=>{
  assert.equal(retryDelay(1,()=>0),500);
  assert.equal(retryDelay(3,()=>1),4000);
  assert.equal(retryDelay(20,()=>1),60_000);
  assert.throws(()=>retryDelay(0));
});
test('permanent, unknown and exhausted failures stop; transient failures retry',()=>{
  assert.equal(disposition(new DeliveryError('HTTP_503',true),1),'pending');
  assert.equal(disposition(new DeliveryError('HTTP_503',true),5),'dead');
  assert.equal(disposition(new DeliveryError('BAD_INPUT',false),1),'dead');
  assert.equal(disposition(new Error('private details'),1),'dead');
});
test('provider endpoints reject insecure remote URLs and URL credentials',()=>{
  for(const url of ['http://example.org/a','https://user:secret@example.org/a','file:///etc/passwd','https://example.org/?key=x'])
    assert.throws(()=>providerURL(url));
  assert.equal(providerURL('http://127.0.0.1:4600/a'),'http://127.0.0.1:4600/a');
});
test('real loopback HTTP uses stable idempotency and redacts private payload fields',async()=>{
  await withMock({},async(mock,endpoints)=>{
    const first=await deliver(event,endpoints), second=await deliver(event,endpoints);
    assert.deepEqual(first,second);
    assert.equal(mock.accepted.size,1);
    assert.equal(mock.calls.length,2);
    assert.equal(mock.calls[0].key,'campusfix-event-42');
    assert.ok(!JSON.stringify([...mock.accepted.values()]).includes('PRIVATE'));
  });
});
test('explicit primary 503 falls back to a differently shaped provider',async()=>{
  await withMock({primaryStatus:503},async(mock,endpoints)=>{
    const result=await deliver(event,endpoints);
    assert.equal(result.provider,'deskB');
    assert.equal(mock.calls.length,2);
    assert.equal(mock.accepted.size,1);
  });
});
test('ambiguous timeout never calls the alternate provider',async()=>{
  await withMock({primaryDelayMs:300},async(mock,endpoints)=>{
    await assert.rejects(()=>deliver(event,endpoints,{timeoutMs:30}),{code:'PROVIDER_UNAVAILABLE',retryable:true});
    assert.ok(mock.calls.every(c=>c.path==='/desk-a'));
  });
});
test('pinned fallback redelivery cannot switch back to a recovered primary',async()=>{
  await withMock({},async(mock,endpoints)=>{
    const r=await deliver({...event,selected_provider:'deskB'},endpoints);
    assert.equal(r.provider,'deskB');assert.ok(mock.calls.every(c=>c.path==='/desk-b'));
  });
});
test('fallback is not sent if persistence fails or the lease is stale',async()=>{
  await withMock({primaryStatus:503},async(mock,endpoints)=>{
    await assert.rejects(()=>deliver(event,endpoints,{onFallback:async()=>false}),{code:'LEASE_LOST'});
    await assert.rejects(()=>deliver(event,endpoints,{onFallback:async()=>{throw new Error('DB down');}}),PersistenceError);
    assert.ok(mock.calls.every(c=>c.path==='/desk-a'));
  });
});
test('fallback pin database failure leaves the lease recoverable',async()=>{
  const store=fakeStore();store.fail=()=>assert.fail();
  await assert.rejects(()=>tick(store,async()=>{throw new PersistenceError('DB failure');}),PersistenceError);
});
for(const status of [400,401,403,409,422,429,500]) test(`HTTP ${status} classification without fallback`,async()=>{
  await withMock({primaryStatus:status},async(mock,endpoints)=>{
    await assert.rejects(()=>deliver(event,endpoints),{code:`PROVIDER_HTTP_${status}`,retryable:status===429||status>=500});
    assert.equal(mock.calls.length,1);
  });
});
test('streamed provider response size is limited',async()=>{
  const fetcher=async()=>new Response(JSON.stringify({x:'x'.repeat(20_000)}),{headers:{'content-type':'application/json'}});
  await assert.rejects(()=>send('deskA','http://localhost/a',event,{fetcher}),{code:'PROVIDER_RESPONSE_TOO_LARGE'});
});
test('malformed JSON is permanent',async()=>{
  const fetcher=async()=>new Response('{',{headers:{'content-type':'application/json'}});
  await assert.rejects(()=>send('deskA','http://localhost/a',event,{fetcher}),{code:'INVALID_PROVIDER_RESPONSE',retryable:false});
});
test('a conflicting duplicate payload is refused by the mock',async()=>{
  await withMock({},async(_mock,endpoints)=>{
    await deliver(event,endpoints);
    await assert.rejects(()=>deliver({...event,payload:{...event.payload,action:'triage'}},endpoints),{code:'PROVIDER_HTTP_409'});
  });
});
function fakeStore(item=event) {
  return { claim:async()=>item,complete:async()=>true,fail:async()=>true };
}
test('idle worker makes no provider call',async()=>{
  assert.deepEqual(await tick(fakeStore(null),()=>assert.fail()),{outcome:'idle'});
});
test('successful delivery acknowledges the event',async()=>{
  let receipt;
  const store=fakeStore();store.complete=async(_e,r)=>{receipt=r;return true;};
  const r=await tick(store,async()=>({provider:'deskA',reference:'a'}));
  assert.equal(r.outcome,'delivered');assert.equal(receipt.reference,'a');
});
test('transient failure schedules a bounded retry without acknowledging',async()=>{
  const store=fakeStore();let failure;
  store.complete=()=>assert.fail();store.fail=async(...args)=>{failure=args;return true;};
  const r=await tick(store,async()=>{throw new DeliveryError('PROVIDER_UNAVAILABLE',true);},{random:()=>0});
  assert.equal(r.outcome,'pending');assert.equal(failure[3],500);
});
test('fifth transient attempt reaches dead letter',async()=>{
  const store=fakeStore({...event,attempts:5});
  const r=await tick(store,async()=>{throw new DeliveryError('PROVIDER_UNAVAILABLE',true);});
  assert.equal(r.outcome,'dead');
});
test('repeated worker crashes cannot cause unlimited provider calls',async()=>{
  const r=await tick(fakeStore({...event,attempts:6}),()=>assert.fail());
  assert.equal(r.outcome,'dead');
});
test('an expired claimant cannot acknowledge another worker lease',async()=>{
  const store=fakeStore();store.complete=async()=>false;
  assert.equal((await tick(store,async()=>({provider:'deskA',reference:'a'}))).outcome,'lease_lost');
});
test('database ack failure escapes for lease recovery and does not mark delivered work dead',async()=>{
  const store=fakeStore();store.complete=async()=>{throw new Error('DB down');};store.fail=()=>assert.fail();
  await assert.rejects(()=>tick(store,async()=>({provider:'deskA',reference:'a'})),/DB down/);
});
test('unknown delivery exceptions are redacted from outcomes',async()=>{
  const r=await tick(fakeStore(),async()=>{throw new Error('secret personal data');});
  assert.equal(r.code,'DELIVERY_INTERNAL_ERROR');assert.ok(!JSON.stringify(r).includes('secret'));
});

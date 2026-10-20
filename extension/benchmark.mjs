import { once } from 'node:events';
import { mockProviders } from './mock-providers.mjs';
import { deliver } from './providers.mjs';
const mock=mockProviders();
mock.server.listen(0,'127.0.0.1');await once(mock.server,'listening');
const root=`http://127.0.0.1:${mock.server.address().port}`;
const endpoints={deskA:root+'/desk-a',deskB:root+'/desk-b'};
const runs=[];
try {
  for(let run=0;run<3;run++) {
    const samples=[];let errors=0;
    for(let i=0;i<100;i++) {
      const started=performance.now();
      try { await deliver({id:String(run*100+i+1),payload:{requestId:'synthetic',version:0,action:'create'}},endpoints); }
      catch {errors++;}
      samples.push(performance.now()-started);
    }
    samples.sort((a,b)=>a-b);
    runs.push({run:run+1,requests:100,errors,medianMs:samples[49],p95Ms:samples[94],maxMs:samples[99],samplesMs:samples});
  }
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),node:process.version,
    scope:'Sequential loopback HTTP adapter to mock provider only; no API, PostgreSQL, outbox, cloud or load claim',runs},null,2));
} finally {mock.server.closeAllConnections();await new Promise(r=>mock.server.close(r));}

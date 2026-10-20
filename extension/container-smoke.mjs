// Run only in disposable native CI: node --import tsx extension/container-smoke.mjs
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import pg from 'pg';
import { migrate } from '../scripts/migrate.ts';
import { createHash } from 'node:crypto';

const url=process.env.TEST_DATABASE_URL;
if(process.env.CAMPUSFIX_CONTAINER_TEST!=='1' || !url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Explicit container test opt-in and dedicated *_test database required');
const id=randomUUID().replaceAll('-',''),schema='container_test_'+id;
const appName='campusfix-api-'+id,mockName='campusfix-mock-'+id;
const image='campusfix-delivery-test:'+id;
const admin=new pg.Client({connectionString:url});
await admin.connect();await admin.query(`CREATE SCHEMA "${schema}"`);
const scoped=new URL(url);scoped.searchParams.set('options',`-c search_path=${schema}`);
const database=scoped.href;
const pool=new pg.Pool({connectionString:database});
function docker(args,options={}) {
  return (execFileSync('docker',args,{stdio:['ignore','pipe','pipe'],...options}) ?? '').toString();
}
try {
  await migrate(url,schema);
  const user=randomUUID(),request=randomUUID();
  await pool.query(`INSERT INTO users(id,email,display_name,role,password_hash)
    VALUES($1,'container@campusfix.test','Container Demo','student','unusable-fixture-hash')`,[user]);
  await pool.query(`INSERT INTO maintenance_requests(id,reporter_id,title,description,location)
    VALUES($1,$2,'Container fixture','Synthetic container smoke test','Demo lab')`,[request,user]);
  await pool.query(`INSERT INTO request_events(request_id,actor_id,action,next_status,request_version)
    VALUES($1,$2,'create','reported',0)`,[request,user]);
  // Hash only identifies the public synthetic fixture in evidence, not a credential.
  const fixture=createHash('sha256').update(request).digest('hex').slice(0,12);
  docker(['build','-t',image,'.'],{stdio:'inherit'});
  docker(['run','-d','--network','host','--name',mockName,image,'node','extension/mock-providers.mjs']);
  docker(['run','-d','--network','host','--name',appName,
    '-e','NODE_ENV=test','-e','PORT=4312','-e','APP_ORIGIN=http://127.0.0.1:4312',
    '-e',`DATABASE_URL=${database}`,image]);
  // Retry startup readiness only; failed provider delivery is not hidden by this loop.
  let ready=false;
  for(let i=0;i<40;i++) {
    try { ready=(await fetch('http://127.0.0.1:4312/health/ready',{signal:AbortSignal.timeout(1000)})).ok; }
    catch { ready=false; }
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!ready)throw new Error('Container readiness did not become healthy');
  const log=docker(['run','--rm','--network','host','-e',`DATABASE_URL=${database}`,
    image,'node','extension/run.mjs','--once']);
  const result=await pool.query(`SELECT o.status,r.provider FROM workflow_outbox o
    JOIN provider_receipts r ON r.event_id=o.id WHERE o.request_id=$1`,[request]);
  if(result.rowCount!==1 || result.rows[0].status!=='delivered')throw new Error('Container did not deliver and acknowledge fixture');
  const evidence={measuredAt:new Date().toISOString(),fixture,ready,
    outboxDelivered:true,provider:result.rows[0].provider,scope:'Native PostgreSQL plus built API, mock and one-shot worker containers; synthetic data'};
  await mkdir('docs/evidence',{recursive:true});
  await writeFile('docs/evidence/outbox-container.json',JSON.stringify(evidence,null,2)+'\n');
  console.log(log);console.log(JSON.stringify(evidence));
} finally {
  for(const name of [appName,mockName])try{docker(['rm','-f',name]);}catch{}
  try{docker(['image','rm',image]);}catch{}
  await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
}

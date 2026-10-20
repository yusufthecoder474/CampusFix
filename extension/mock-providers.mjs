import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function mockProviders({ primaryStatus = 200, primaryDelayMs = 0 } = {}) {
  const accepted = new Map();
  const calls = [];
  const server = createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json');
    if (req.method !== 'POST' || !['/desk-a','/desk-b'].includes(req.url)) {
      res.writeHead(404).end('{}'); return;
    }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 16_384) { res.writeHead(413).end('{}'); return; }
      }
      const input = JSON.parse(raw), key = req.headers['idempotency-key'];
      const data = req.url === '/desk-a' ? input.event : input.notification?.change;
      if (typeof key !== 'string' || !/^campusfix-event-\d+$/.test(key) ||
          !data || typeof data.requestId !== 'string' || typeof data.action !== 'string' ||
          Object.keys(data).some(k => !['requestId','version','action'].includes(k))) {
        res.writeHead(400).end('{}'); return;
      }
      calls.push({ path: req.url, key });
      if (req.url === '/desk-a' && primaryStatus !== 200) {
        // Explicit contract: 503 here means no request was accepted.
        res.writeHead(primaryStatus).end('{}'); return;
      }
      const mapKey = req.url + ':' + key;
      const previous = accepted.get(mapKey);
      const fingerprint = JSON.stringify(data);
      if (previous && previous.fingerprint !== fingerprint) {
        res.writeHead(409).end('{}'); return;
      }
      const ref = createHash('sha256').update(mapKey).digest('hex').slice(0,20);
      const result = previous?.result ?? (req.url === '/desk-a'
        ? { accepted:true,ticket_id:'A_' + ref } : { result:{ state:'queued',reference:'B_' + ref } });
      accepted.set(mapKey,{ fingerprint,result });
      const finish = () => { if (!res.destroyed) res.end(JSON.stringify(result)); };
      if (req.url === '/desk-a' && primaryDelayMs) setTimeout(finish,primaryDelayMs).unref();
      else finish();
    } catch { if (!res.headersSent) res.writeHead(400).end('{}'); }
  });
  return { server, accepted, calls };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = mockProviders({ primaryStatus: process.env.MOCK_PRIMARY_UNAVAILABLE === '1' ? 503 : 200 });
  mock.server.listen(4600,'127.0.0.1',() => console.log('Synthetic providers on 127.0.0.1:4600; no real integrations'));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => mock.server.close());
}

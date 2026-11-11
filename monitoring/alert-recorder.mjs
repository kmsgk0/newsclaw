import { createServer } from 'node:http';

const allowed = new Set(['NewsClawQueueBacklog', 'NewsClawSkillErrors', 'NewsClawQueueUnavailable']);
createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/alerts') { res.writeHead(404).end(); return; }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 65536) { res.writeHead(413).end(); return; }
  }
  try {
    const payload = JSON.parse(body);
    if (!Array.isArray(payload.alerts)) throw new Error('invalid alert');
    for (const alert of payload.alerts) {
      const name = alert.labels?.alertname;
      if (allowed.has(name) && ['firing', 'resolved'].includes(alert.status)) {
        console.log(JSON.stringify({ alert: name, status: alert.status, receivedAt: new Date().toISOString() }));
      }
    }
    res.writeHead(200).end();
  } catch { res.writeHead(400).end(); }
}).listen(9098, '0.0.0.0');

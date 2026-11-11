import { createServer, type Server } from 'node:http';
import type { TaskService } from './tasks.js';

const skills = ['explain', 'comparison', 'brief', 'mindmap', 'bilingual'] as const;
const buckets = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const label = (value: string) => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
interface Histogram { count: number; sum: number; counts: number[] }

export class RuntimeMetrics {
  private requests = new Map<string, Histogram>();
  private skills = new Map<string, number>();

  constructor() {
    for (const kind of skills) for (const result of ['succeeded', 'failed']) this.skills.set(`${kind}:${result}`, 0);
  }

  request(method: string, route: string, status: number, elapsedMs: number) {
    const key = JSON.stringify([method, route, String(status)]);
    const h = this.requests.get(key) ?? { count: 0, sum: 0, counts: buckets.map(() => 0) };
    const seconds = Math.max(0, elapsedMs) / 1000;
    h.count++; h.sum += seconds;
    buckets.forEach((limit, index) => { if (seconds <= limit) h.counts[index]++; });
    this.requests.set(key, h);
  }

  skill(kind: string, result: 'succeeded' | 'failed') {
    if (!(skills as readonly string[]).includes(kind)) return;
    const key = `${kind}:${result}`;
    this.skills.set(key, (this.skills.get(key) ?? 0) + 1);
  }

  render(queue: { waiting: number; active: number; delayed: number } | null) {
    const lines = ['# HELP newsclaw_skill_calls_total Completed skill executions.', '# TYPE newsclaw_skill_calls_total counter'];
    for (const [key, value] of this.skills) {
      const [kind, result] = key.split(':');
      lines.push(`newsclaw_skill_calls_total{skill="${kind}",result="${result}"} ${value}`);
    }
    lines.push('# HELP newsclaw_http_request_duration_seconds API response duration.', '# TYPE newsclaw_http_request_duration_seconds histogram');
    for (const [key, h] of this.requests) {
      const [method, route, status] = JSON.parse(key) as string[];
      const labels = `method="${label(method)}",route="${label(route)}",status="${label(status)}"`;
      buckets.forEach((limit, i) => lines.push(`newsclaw_http_request_duration_seconds_bucket{${labels},le="${limit}"} ${h.counts[i]}`));
      lines.push(`newsclaw_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${h.count}`);
      lines.push(`newsclaw_http_request_duration_seconds_sum{${labels}} ${h.sum}`);
      lines.push(`newsclaw_http_request_duration_seconds_count{${labels}} ${h.count}`);
    }
    lines.push('# HELP newsclaw_queue_available Whether queue data was available.', '# TYPE newsclaw_queue_available gauge', `newsclaw_queue_available ${queue ? 1 : 0}`);
    lines.push('# HELP newsclaw_queue_jobs Number of business queue jobs by state.', '# TYPE newsclaw_queue_jobs gauge');
    if (queue) for (const state of ['waiting', 'active', 'delayed'] as const) lines.push(`newsclaw_queue_jobs{state="${state}"} ${queue[state]}`);
    return lines.join('\n') + '\n';
  }
}

export const metrics = new RuntimeMetrics();

export async function startMetricsServer(tasks: TaskService, host: string, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/metrics') { res.writeHead(404).end(); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let queue: { waiting: number; active: number; delayed: number } | null = null;
    try {
      const counts = await Promise.race([
        tasks.queue.getJobCounts('waiting', 'active', 'delayed'),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('queue timeout')), 2000); timer.unref(); }),
      ]);
      queue = { waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0 };
    } catch { /* queue availability is reported separately */ }
    finally { if (timer) clearTimeout(timer); }
    res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' });
    res.end(metrics.render(queue));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  return server;
}

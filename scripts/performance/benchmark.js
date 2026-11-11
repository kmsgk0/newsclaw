import http from 'k6/http';
import { check } from 'k6';

const scenario = __ENV.SCENARIO;
if (!['submit','task','search'].includes(scenario)) throw new Error('SCENARIO must be submit, task, or search');
export const options = { vus: Number(__ENV.VUS || 1), duration: __ENV.DURATION || '8s' };
const base = __ENV.BASE || 'http://127.0.0.1:3107';
const headers = { Authorization: `Bearer ${__ENV.TOKEN}`, 'Content-Type': 'application/json' };
export default function () {
  let response;
  if (scenario === 'submit') {
    const operationId = `${__ENV.RUN_ID}-${__VU}-${__ITER}`;
    response = http.post(`${base}/api/v1/admin/sources/${__ENV.SOURCE_ID}/collect`, JSON.stringify({operationId}), {headers, tags: {name: 'submit'}});
    check(response, {'submit returns 202': r => r.status === 202});
  } else if (scenario === 'task') {
    response = http.get(`${base}/api/v1/tasks/${__ENV.TASK_ID}`, {headers, tags: {name: 'task'}});
    check(response, {'task returns 200': r => r.status === 200});
  } else {
    response = http.get(`${base}/api/v1/news?q=benchmark&semantic=false&pageSize=20`, {tags: {name: 'search'}});
    check(response, {'search returns 200': r => r.status === 200});
  }
}

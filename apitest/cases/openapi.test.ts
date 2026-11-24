import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAPIEnvironment } from '../fixtures/environment.js';

test('OPS-06 complete application exposes OpenAPI, route permissions and documentation assets', async () => {
  const env = await createAPIEnvironment();
  try {
    const response = await fetch(`${env.baseUrl}/api/v1/openapi.json`);
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const definition = await response.json();
    assert.match(definition.openapi, /^3\.0\.\d+$/);
    assert.equal(definition.info.title, 'NewsClaw API');
    assert.equal(definition.info.version, env.ctx.config.version);
    assert.equal(definition.code, undefined, 'OpenAPI must be a raw definition, without the business envelope');
    assert.deepEqual(definition.components.securitySchemes.bearerAuth, { type: 'http', scheme: 'bearer' });

    for (const [path, method] of [
      ['/live', 'get'],
      ['/health', 'get'],
      ['/api/v1/openapi.json', 'get'],
      ['/api/v1/auth/login', 'post'],
      ['/api/v1/news', 'get'],
      ['/api/v1/skills', 'get'],
      ['/api/v1/shares/{token}', 'get'],
    ]) {
      assert.deepEqual(definition.paths[path]?.[method]?.security, [], `${method} ${path} must be public`);
    }
    for (const [path, method] of [
      ['/api/v1/auth/me', 'get'],
      ['/api/v1/editor', 'get'],
      ['/api/v1/topics', 'post'],
      ['/api/v1/skills/mine', 'get'],
      ['/api/v1/admin/sources', 'get'],
      ['/api/v1/tasks/{id}', 'get'],
    ]) {
      assert.deepEqual(definition.paths[path]?.[method]?.security, [{ bearerAuth: [] }], `${method} ${path} must require Bearer authentication`);
    }

    const loginSchema = definition.paths['/api/v1/auth/login'].post.requestBody.content['application/json'].schema;
    assert.deepEqual(loginSchema.required, ['username', 'password']);
    assert.equal(loginSchema.properties.username.minLength, 3);
    assert.equal(loginSchema.properties.password.minLength, 8);
    assert.ok(definition.paths['/api/v1/news/{id}'].get.parameters.some(
      (parameter: { name: string; in: string; required: boolean; schema: { format: string } }) =>
        parameter.name === 'id' && parameter.in === 'path' && parameter.required && parameter.schema.format === 'uuid',
    ));
    const responses = definition.paths['/api/v1/auth/me'].get.responses;
    for (const status of ['200', '400', '401', '403', '404', '409', '503']) {
      assert.equal(typeof responses[status].description, 'string');
      assert.deepEqual(Object.keys(responses[status].content['application/json'].schema.properties).sort(), ['code', 'data', 'message', 'requestId']);
    }

    for (const path of ['/api/v1/auth/register', '/api/v1/topics', '/api/v1/topics/{id}/notes', '/api/v1/topics/{id}/artifacts', '/api/v1/artifacts/{id}/shares', '/api/v1/skills/{id}/install', '/api/v1/conversations', '/api/v1/memories', '/api/v1/admin/sources']) {
      assert.ok(definition.paths[path].post.responses['201'], path);
      assert.equal(definition.paths[path].post.responses['200'], undefined, path);
    }
    for (const path of ['/api/v1/editor/digests/generate', '/api/v1/editor/journals/generate', '/api/v1/admin/sources/{id}/collect', '/api/v1/admin/news/{id}/reprocess', '/api/v1/admin/digests', '/api/v1/admin/tasks/{id}/retry']) {
      const response = definition.paths[path].post.responses['202'];
      assert.ok(response, path);
      assert.deepEqual(response.content['application/json'].schema.properties.data.required, ['taskId', 'status', 'statusUrl']);
      assert.equal(definition.paths[path].post.responses['200'], undefined, path);
    }
    const stream = definition.paths['/api/v1/conversations/{id}/messages'].post.responses;
    assert.equal(stream['200'].content['text/event-stream'].schema.type, 'string');
    assert.equal(stream['200'].content['application/json'], undefined);
    assert.ok(stream['401'].content['application/json']);

    const registered = await fetch(`${env.baseUrl}/api/v1/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'documented_reader', password: 'correct-password' }),
    });
    assert.equal(registered.status, 201);
    const registration = await registered.json();
    assert.equal(registration.code, 'OK');
    assert.equal(registration.data.user.username, 'documented_reader');
    assert.equal(typeof registration.data.user.id, 'string');

    const admin = await env.auth.login({ username: env.admin.username, password: 'correct-password' });
    const submitted = await fetch(`${env.baseUrl}/api/v1/admin/sources/${env.source.id}/collect`, {
      method: 'POST', headers: { authorization: `Bearer ${admin.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ operationId: 'openapi-contract' }),
    });
    assert.equal(submitted.status, 202);
    const accepted = await submitted.json();
    assert.equal(accepted.code, 'OK');
    assert.equal(accepted.data.status, 'pending');
    assert.equal(accepted.data.statusUrl, `/api/v1/tasks/${accepted.data.taskId}`);

    const news = await fetch(`${env.baseUrl}/api/v1/news`);
    assert.equal(news.status, 200);
    const newsBody = await news.json();
    assert.equal(newsBody.code, 'OK');
    assert.ok(newsBody.data.items.some((item: { id: string }) => item.id === env.state.toolNewsId));
    assert.equal(typeof newsBody.requestId, 'string');
    const anonymous = await fetch(`${env.baseUrl}/api/v1/auth/me`);
    assert.equal(anonymous.status, 401);
    assert.equal((await anonymous.json()).code, 'UNAUTHENTICATED');
    const session = await env.auth.login({ username: env.a.username, password: 'correct-password' });
    const authenticated = await fetch(`${env.baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${session.accessToken}` } });
    assert.equal(authenticated.status, 200);
    const me = await authenticated.json();
    assert.equal(me.code, 'OK');
    assert.equal(me.data.user.id, env.a.id);

    const docs = await fetch(`${env.baseUrl}/docs/api`);
    assert.equal(docs.status, 200);
    assert.match(docs.headers.get('content-type') ?? '', /text\/html/);
    const html = await docs.text();
    assert.match(html, /id="swagger-ui"/);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith('/swagger-ui-bundle.js')));
    assert.ok(assets.some(asset => asset.endsWith('/swagger-ui.css')));
    for (const asset of assets) {
      const resource = await fetch(new URL(asset, docs.url));
      assert.equal(resource.status, 200, asset);
      assert.match(resource.headers.get('content-type') ?? '', asset.endsWith('.css') ? /text\/css/ : /javascript/);
      assert.ok((await resource.text()).length > 0, asset);
    }
    const docsDefinition = await fetch(`${env.baseUrl}/docs/api/json`);
    assert.equal(docsDefinition.status, 200);
    assert.deepEqual(await docsDefinition.json(), definition);
    assert.equal(definition.paths['/docs/api/json'], undefined, 'Hidden documentation routes must remain hidden');
  } finally {
    await env.cleanup();
  }
});

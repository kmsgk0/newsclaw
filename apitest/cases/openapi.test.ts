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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeChatEvents } from '../../src/web/components/chat/stream.js';

test('EDITOR-03 chat events survive fragmented UTF-8, CRLF and a final frame without a separator', async () => {
  const bytes = new TextEncoder().encode('event: text\r\ndata: {"text":"中文"}\r\n\r\nevent: complete\r\ndata: {"status":"completed"}');
  const body = new ReadableStream<Uint8Array>({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  const events: unknown[] = [];
  await consumeChatEvents(body, (name, data) => events.push({ name, data: JSON.parse(data) }));
  assert.deepEqual(events, [{ name: 'text', data: { text: '中文' } }, { name: 'complete', data: { status: 'completed' } }]);
  assert.equal(body.locked, false);
});

test('EDITOR-03 a rejected event cancels the stream and preserves the original failure', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('event: error\ndata: {"message":"failure"}\n\n')); },
    cancel() { cancelled = true; },
  });
  const failure = new Error('synthetic failure');
  await assert.rejects(consumeChatEvents(body, () => { throw failure; }), error => error === failure);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

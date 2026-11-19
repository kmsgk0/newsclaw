export async function consumeChatEvents(
  body: ReadableStream<Uint8Array>,
  accept: (name: string, data: string) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  function dispatch(block: string) {
    const lines = block.split('\n');
    const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (data) accept(name, data);
  }
  try {
    while (true) {
      const chunk = await reader.read();
      buffer = (buffer + decoder.decode(chunk.value, { stream: !chunk.done })).replaceAll('\r\n', '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        dispatch(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) dispatch(buffer);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

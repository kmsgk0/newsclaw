// Node test events provide structured results independently of terminal formatting.
export default async function* report(source) {
  for await (const { type, data } of source) {
    if ((type === 'test:pass' || type === 'test:fail') && data.details?.type !== 'suite') {
      const error = data.details?.error;
      yield JSON.stringify({ type: 'case', name: data.name, file: data.file, line: data.line,
        status: data.skip || data.todo ? 'skipped' : type === 'test:pass' ? 'passed' : error?.failureType === 'cancelledByParent' ? 'cancelled' : 'failed',
        durationMs: data.details?.duration_ms ?? 0,
        ...(error ? { error: error.cause?.stack ?? error.stack ?? String(error) } : {}),
      }) + '\n';
    }
    if (type === 'test:summary' && !data.file) yield JSON.stringify({ type: 'summary', counts: data.counts }) + '\n';
  }
}

import { parseArgs } from 'node:util';
import { createStages, selectStages } from './stages.mjs';
import { finalizeReport, runChecks } from './pipeline.mjs';

try {
  const { values } = parseArgs({ options: {
    group: { type: 'string' }, stage: { type: 'string' }, base: { type: 'string', default: 'main' },
    head: { type: 'string', default: 'HEAD' }, finalize: { type: 'string' }, failure: { type: 'string' },
  } });
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  let report;
  try {
    report = values.finalize ? await finalizeReport(values.finalize, { failure: values.failure }) : await runChecks({
      stages: selectStages(createStages(values), values), outputDir: process.env.VERIFICATION_DIR, signal: controller.signal,
    });
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
  console.log(`\n${report.status === 'passed' ? 'Checks passed.' : `Checks ${report.status}.`}`);
  process.exitCode = values.finalize || report.status === 'passed' ? 0 : 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }

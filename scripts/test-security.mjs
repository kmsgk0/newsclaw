import assert from 'node:assert/strict';
import { chmodSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture, runScript } from './test-helpers.mjs';
import { scanSecrets } from './check-security.mjs';

function failed(result, expected) {
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, expected);
}
test('FLOW-09 clean repository passes and current/historical synthetic credentials fail with redacted output', t => {
  const f = fixture(t);
  assert.doesNotThrow(() => scanSecrets(f.root, [], { quiet: true }));
  const secret = ['gh', 'p_', 'abCDe12345fGHIj67890klMNop12345QRstuv'].join('');
  f.put('credential.txt', `token = "${secret}"\n`);
  const result = runScript('check-security.mjs', f);
  failed(result, /Gitleaks findings/);
  assert.ok(!(result.stdout + result.stderr).includes(secret));
  f.git('add', '--', 'credential.txt'); f.commit('test: store synthetic fixture');
  rmSync(path.join(f.root, 'credential.txt'));
  f.git('add', '--', 'credential.txt'); f.commit('test: remove synthetic fixture');
  assert.throws(() => scanSecrets(f.root, [], { quiet: true }), /Git history/);
});
test('FLOW-09 ignored local files are excluded unless explicitly requested', t => {
  const f = fixture(t);
  f.put('.gitignore', '.env\n');
  f.put('.env', ['token=gh', 'p_', 'abCDe12345fGHIj67890klMNop12345QRstuv'].join('') + '\n');
  assert.doesNotThrow(() => scanSecrets(f.root, [], { quiet: true }));
  assert.throws(() => scanSecrets(f.root, ['.env'], { quiet: true }), /additional path/);
  assert.throws(() => scanSecrets(f.root, ['missing.log'], { quiet: true }), /does not exist/);
});
test('FLOW-09 missing scanner fails explicitly', t => {
  const f = fixture(t);
  failed(runScript('check-security.mjs', f, [], { GITLEAKS_BIN: path.join(f.root, 'missing') }), /Gitleaks.*required/);
});
for (const [name, code, output] of [['clean', 0, 'found 0 vulnerabilities'], ['high', 1, '1 high severity vulnerability'], ['unavailable', 1, 'audit service unavailable']]) {
  test(`FLOW-10 audit command ${name} determines the security result`, t => {
    const f = fixture(t);
    f.put('.gitignore', 'bin/\n');
    f.put('bin/npm', `#!/bin/sh\n[ "$1" = audit ] && [ "$2" = --audit-level=high ] || exit 2\nprintf '%s\\n' '${output}'\nexit ${code}\n`);
    chmodSync(path.join(f.root, 'bin/npm'), 0o755);
    const result = runScript('check-security.mjs', f, [], { PATH: path.join(f.root, 'bin') + path.delimiter + process.env.PATH });
    assert.equal(result.status, code, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, new RegExp(output));
    if (code) assert.match(result.stdout + result.stderr, /Dependency audit/);
  });
}

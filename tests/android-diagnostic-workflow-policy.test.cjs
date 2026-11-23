'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-lan-diagnostic.yml'), 'utf8');
const gradle = fs.readFileSync(path.join(root, 'AndroidProject/app/build.gradle'), 'utf8');

test('diagnostic workflow is limited to explicitly approved development branches', () => {
  const branchBlock = workflow.match(/branches:\n((?:\s+- [^\n]+\n)+)/)?.[1];
  assert.ok(branchBlock, 'push branch allowlist exists');
  const branches = [...branchBlock.matchAll(/^\s+- ([^\n]+)$/gm)].map(match => match[1]);
  assert.deepEqual(branches, [
    'codex/sightline-dev19-mobile-polish',
    'codex/sightline-p0-emergency-recovery',
    'codex/sightline-integration',
    'codex/sightline-recovery-integration'
  ]);
  const jobCondition = workflow.match(/diagnostic-apk:\n\s+if: ([^\n]+)/)?.[1] || '';
  const jobBranches = [...jobCondition.matchAll(/refs\/heads\/([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(jobBranches, branches, 'job-level repository/ref guard exactly matches the push allowlist');
  assert.doesNotMatch(jobCondition, /main|\*|pull_request/i);
  assert.match(workflow, /'AndroidProject\/\*\*'/, 'relevant source pushes can trigger the workflow');
});

test('diagnostic workflow keeps read-only permissions, pinned actions, and persistent signer verification', () => {
  assert.match(workflow, /permissions:\n\s+contents: read\n/);
  assert.doesNotMatch(workflow, /contents:\s*(write|read-all)|id-token:\s*write/);
  const actions = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)(?:\s+#\s+([^\n]+))?$/gm)];
  assert.ok(actions.length >= 4, 'expected checkout, JDK, Android SDK, and artifact actions');
  for (const [, action, comment] of actions) {
    assert.match(action, /^[^@]+@[a-f0-9]{40}$/, `unpinned action: ${action}`);
    assert.match(comment || '', /^v\d/i, `missing pinned action version comment: ${action}`);
  }
  const cert = workflow.match(/SIGHTLINE_DIAGNOSTIC_CERT_SHA256:\s*'([a-f0-9]{64})'/i)?.[1];
  assert.ok(cert, 'persistent diagnostic certificate fingerprint is pinned');
  assert.match(workflow, /SIGHTLINE_DIAGNOSTIC_KEYSTORE_B64:\s*\$\{\{ secrets\.SIGHTLINE_DIAGNOSTIC_KEYSTORE_B64 \}\}/);
  assert.match(workflow, /SIGHTLINE_DIAGNOSTIC_KEYSTORE_PASSWORD:\s*\$\{\{ secrets\.SIGHTLINE_DIAGNOSTIC_KEYSTORE_PASSWORD \}\}/);
  assert.ok(workflow.includes("$env:GITHUB_RUN_NUMBER -notmatch '^[1-9][0-9]{0,8}$'"));
  assert.match(workflow, /"-PsightlineDiagnosticRunNumber=\$env:GITHUB_RUN_NUMBER"/);
  assert.match(workflow, /expectedVersionCode = 100000 \+ \[int64\]\$env:GITHUB_RUN_NUMBER/);
  assert.match(workflow, /diagnostic-\$env:GITHUB_RUN_NUMBER/);
  assert.match(workflow, /sightline-diagnostic-\$\{\{ github\.run_number \}\}-\$\{\{ github\.sha \}\}/);
});

test('diagnostic packaging preserves package identity, debug labeling, source/assets checks, and release gates', () => {
  assert.match(gradle, /applicationIdSuffix '\.diagnostic\.acceptance'/);
  assert.match(gradle, /signingConfig = diagnosticSigningProvided \? signingConfigs\.sightlineDiagnostic : null/);
  assert.match(gradle, /Diagnostic builds require a unique positive sightlineDiagnosticRunNumber/);
  assert.match(gradle, /output\.versionCode\.set\(diagnosticVersionCode as int\)/);
  assert.match(gradle, /output\.versionName\.set\(diagnosticVersionName\)/);
  assert.match(workflow, /com\\\.sightline\\\.v3\\\.diagnostic\\\.acceptance/);
  assert.match(workflow, /application-debuggable/);
  assert.match(workflow, /APK does not use the pinned diagnostic signer/);
  assert.match(workflow, /Checked-out source differs from the workflow commit/);
  assert.match(workflow, /phase2-android-asset-parity\.mjs/);
  assert.match(workflow, /host asset differs from the Windows checkout/);
  assert.match(workflow, /offline asset differs from the checkout/);
  assert.doesNotMatch(workflow, /assembleRelease|bundleRelease|SIGHTLINE_KEYSTORE_PATH|continue-on-error: true|ExecutionPolicy Bypass/);
  assert.match(workflow, /name: sightline-diagnostic-\$\{\{ github\.run_number \}\}-\$\{\{ github\.sha \}\}/);
});

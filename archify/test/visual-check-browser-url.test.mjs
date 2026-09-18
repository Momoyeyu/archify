import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ChromeVisualBrowser, chromeVisualArtifactUrl } from '../bin/visual-check.mjs';

test('Chrome inspection preserves localhost UNC shares instead of treating them as drive-root paths', () => {
  for (const prefix of [String.raw`\\localhost`, String.raw`\\?\UNC\localhost`]) {
    const artifact = `${prefix}\\share\\nested folder\\图 #%25.html`;
    assert.equal(
      chromeVisualArtifactUrl(artifact, 'dark', { platform: 'win32' }),
      'file://localhost/share/nested%20folder/%E5%9B%BE%20%23%2525.html?theme=dark',
    );
  }
});

test('Chrome inspection preserves localhost UNC paths beyond MAX_PATH', () => {
  const directories = Array.from({ length: 10 }, (_, index) => `long-directory-${index}-${'x'.repeat(20)}`);
  const artifact = `\\\\?\\UNC\\LOCALHOST\\share\\${directories.join('\\')}\\artifact-snapshot.html`;
  assert.ok(artifact.length > 320);
  assert.equal(
    chromeVisualArtifactUrl(artifact, 'light', { platform: 'win32' }),
    `file://localhost/share/${directories.join('/')}/artifact-snapshot.html?theme=light`,
  );
});

test('Chrome inspection retains native file URL escaping and theme query semantics', () => {
  const artifact = path.resolve('图 # 100%.html');
  const expected = pathToFileURL(artifact);
  expected.searchParams.set('theme', 'dark&unintended=value');
  assert.equal(chromeVisualArtifactUrl(artifact, 'dark&unintended=value'), expected.href);
});

test('Chrome inspection sends the localhost UNC URL directly to DevTools without recanonicalizing it', async () => {
  const artifact = String.raw`\\?\UNC\localhost\share\artifact-snapshot.html`;
  const browser = Object.create(ChromeVisualBrowser.prototype);
  const calls = [];
  browser.sessionPromise = Promise.resolve('test-session');
  browser.cdp = {
    waitFor: () => Promise.resolve(),
    async send(method, parameters) {
      calls.push({ method, parameters });
      return method === 'Page.navigate' ? { errorText: 'stop after navigation' } : {};
    },
  };
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' });
    await assert.rejects(browser.inspect({ artifactPath: artifact, width: 1440, height: 900, theme: 'dark' }), /stop after navigation/);
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor);
  }
  assert.equal(calls.find(({ method }) => method === 'Page.navigate').parameters.url, 'file://localhost/share/artifact-snapshot.html?theme=dark');
});

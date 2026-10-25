import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Render deployment serves the same UI assets as the local dashboard', () => {
  for (const name of ['index.html', 'app.js', 'style.css', 'icon.svg', 'manifest.webmanifest', 'sw.js']) {
    const local = readFileSync(new URL(`../public/${name}`, import.meta.url));
    const cloud = readFileSync(new URL(`../CODE_DEPLOY_RENDER/public/${name}`, import.meta.url));
    assert.ok(local.equals(cloud), `${name} chưa đồng bộ. Chạy node sync-render-ui.mjs trước khi deploy.`);
  }
});

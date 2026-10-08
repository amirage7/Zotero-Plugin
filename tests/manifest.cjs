const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
const settings = manifest.applications.zotero;
// Zotero 10's ExtensionData.parseManifest rejects any missing value below.
for (const key of ['id', 'update_url', 'strict_max_version']) {
  assert.ok(settings[key], `Zotero installer requires applications.zotero.${key}`);
}
const url = new URL(settings.update_url);
assert.equal(url.protocol, 'https:', 'Zotero rejects updates that are not HTTPS');
console.log('PASS: required installer metadata and HTTPS update URL');

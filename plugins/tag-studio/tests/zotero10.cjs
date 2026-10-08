/* Zotero 10 compatibility smoke test, without modifying a Zotero database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const dir = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
assert.equal(manifest.applications.zotero.strict_max_version, '10.0.*');
assert.equal(manifest.applications.zotero.strict_min_version, '10.0');
assert.equal(manifest.applications.zotero.id, 'tagstudio@local.tools');

const item = (id, libraryID) => ({ id, libraryID, isRegularItem: () => true });
const data = { seenLibraries: [] };
const Zotero = {
  Prefs: { get: () => undefined, set() {} },
  ItemTreeManager: { registerColumn: async () => 'col', unregisterColumn: async () => true, refreshColumns() {} },
  Tags: { getAll: async libraryID => { data.seenLibraries.push(libraryID); throw new Error('TEST_STOP_AFTER_LIB_SELECTION'); } },
  Libraries: { userLibraryID: 1 },
  getActiveZoteroPane: () => null,
};
const sandbox = vm.createContext({ Zotero, Services: {}, pluginID: manifest.applications.zotero.id });
vm.runInContext(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), sandbox, { filename:'app.js' });
const doc = { getElementById() { return null; } };
const win = (selectedItems, libIDs) => ({document:doc, ZoteroPane:{
  getSelectedItems: () => selectedItems,
  getSelectedLibraryIDs: () => libIDs,
  getSelectedLibraryID: () => { throw new Error('legacy getter should not be called'); },
}});
(async () => {
  const app = sandbox.TagStudio;
  await assert.rejects(() => app.open(win([item(1, 7)], [7])), /TEST_STOP_AFTER_LIB_SELECTION/);
  assert.equal(data.seenLibraries.at(-1), 7);
  await assert.rejects(() => app.open(win([], [2,3])), /同时选择了多个文库/);
  assert.equal(data.seenLibraries.length, 1, 'multi library should not query any library');
  await assert.rejects(() => app.open(win([item(1,2),item(3,4)], [2,4])), /属于多个文库/);
  assert.equal(data.seenLibraries.length, 1, 'mixed-library item selection blocked');
  await assert.rejects(() => app.open(win([], [5])), /TEST_STOP_AFTER_LIB_SELECTION/);
  assert.equal(data.seenLibraries.at(-1), 5);
  await assert.rejects(() => app.open(win([], [])), /TEST_STOP_AFTER_LIB_SELECTION/);
  assert.equal(data.seenLibraries.at(-1), 1);
  console.log('PASS: Zotero 10 library selection, mixed-library rejection, fallback library');

  const stubWin = { id: 'existing-zotero-main-window' };
  const mounts = [];
  const Zotero2 = { getMainWindows() {return [stubWin]} };
  const Services2 = {scriptloader:{loadSubScript(_url, scope){
    scope.TagStudio = { start:async()=>{}, mount(w){mounts.push(w)}, stop:async()=>{}, unmount(){} };
  }}};
  const bootsandbox = vm.createContext({ Zotero: Zotero2, Services: Services2 });
  vm.runInContext(fs.readFileSync(path.join(dir,'bootstrap.js'), 'utf8'), bootsandbox, { filename:'bootstrap.js' });
  await bootsandbox.startup({id:'tagstudio@local.tools',version:'0.2.0',rootURI:'jar:file:///tag-studio.xpi!/' });
  assert.equal(mounts.length,1);
  assert.equal(mounts[0],stubWin);
  console.log('PASS: bootstrap mounts existing Zotero windows after installation');
})().catch(err => { console.error(err); process.exitCode=1; });

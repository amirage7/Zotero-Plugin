/* Offline mock smoke test: no Zotero desktop integration is emulated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const store = new Map();
let option = null;
let unregistered = null;
const mockZotero = {
  Prefs: { get: (key) => store.get(key), set: (key,value) => store.set(key,value) },
  ItemTreeManager: {
    registerColumn: async cfg => {
      assert.equal(typeof cfg.width, 'string', 'Zotero 10 column width must be a string');
      option = cfg; return 'registered-column';
    },
    unregisterColumn: async id => { unregistered = id; },
    refreshColumns() {},
  },
  getMainWindows: () => [],
  debug() {}, logError: console.error,
};
const ctx = vm.createContext({ Zotero: mockZotero, Services: {}, pluginID: 'tagstudio@local.tools' });
vm.runInContext(source, ctx, { filename: 'app.js' });
(async () => {
  await ctx.TagStudio.start();
  assert.equal(option.label, '彩色标签');
  assert.equal(option.pluginID, 'tagstudio@local.tools');
  const sample = { getTags: () => [{tag: '#信任'}, {tag: '#VR实验'}, {tag: 'English imported keyword'}] };
  const data = JSON.parse(option.dataProvider(sample));
  assert.deepEqual(data, ['#信任', '#VR实验']);
  const fakeDoc = {
    createElement(type) {
      return {
        tagName: type, className: '', style: {}, children: [],
        appendChild(child) { this.children.push(child); },
      };
    },
  };
  const cell = option.renderCell(0, JSON.stringify(data), {className:'mock-column'}, false, fakeDoc);
  assert.equal(cell.children.length, 2);
  assert.equal(cell.children[0].textContent, '信任');
  assert.equal(cell.children[0].style.backgroundColor, '#E9DFF4');
  assert.equal(cell.children[1].textContent, 'VR实验');
  await ctx.TagStudio.stop();
  assert.equal(unregistered, 'registered-column');
  console.log('PASS: register/unregister column, custom #tag filtering, colored chip rendering');
})().catch(e => { console.error(e); process.exitCode = 1; });

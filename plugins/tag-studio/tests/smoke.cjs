/* Offline mock smoke test: no Zotero desktop integration is emulated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const store = new Map();
let option = null;
const options = [];
const unregistered = [];
store.set('extensions.tagstudio.categories', JSON.stringify({'#信任':'研究主题','#VR实验':'研究方法','#行人':'研究对象','#重要':'阅读进度'}));
const mockZotero = {
  Prefs: { get: (key) => store.get(key), set: (key,value) => store.set(key,value) },
  ItemTreeManager: {
    registerColumn: async cfg => {
      assert.equal(typeof cfg.width, 'string', 'Zotero 10 column width must be a string');
      options.push(cfg); if(cfg.label==='彩色标签') option = cfg; return cfg.dataKey;
    },
    unregisterColumn: async id => { unregistered.push(id); },
    refreshColumns() {},
  },
  getMainWindows: () => [],
  debug() {}, logError: console.error,
};
const ctx = vm.createContext({ Zotero: mockZotero, Services: {}, pluginID: 'tagstudio@local.tools' });
vm.runInContext(source, ctx, { filename: 'app.js' });
(async () => {
  await ctx.TagStudio.start();
  assert.equal(options.length, 6, 'Five category columns and one overview');
  assert.deepEqual(options.filter(c=>!c.hidden).map(c=>c.label), ['研究主题','研究对象','研究方法']);
  const allTags = {getTags:()=>['#信任','#VR实验','#行人','#重要','#未知'].map(tag=>({tag}))};
  for(const [label,tag] of [['研究主题','#信任'],['研究对象','#行人'],['研究方法','#VR实验'],['阅读进度','#重要'],['其他','#未知']]) {
    assert.deepEqual(JSON.parse(options.find(c=>c.label===label).dataProvider(allTags)), [tag]);
  }
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
  assert.equal(cell.title, '#信任、#VR实验', 'Full tags available even when column clips chips');
  const stopping = ctx.TagStudio.stop();
  assert.equal(unregistered.length, 6, 'All columns begin cleanup before shutdown yields');
  await stopping;
  assert.deepEqual(unregistered, options.map(c=>c.dataKey));
  console.log('PASS: register/unregister column, custom #tag filtering, colored chip rendering');
})().catch(e => { console.error(e); process.exitCode = 1; });

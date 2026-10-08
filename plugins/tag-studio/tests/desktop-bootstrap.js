/* Integration harness: runs only in tests/desktop/profile, with an empty database. */
function install() {}
function uninstall() {}
function shutdown() {}
function startup() {
  // Return immediately so Zotero can finish startup and open its main window.
  Zotero.initializationPromise.then(run).catch(reportError);
}
// setup-desktop.py substitutes the current checkout directory and version.
const base = '__TAGSTUDIO_TEST_BASE__';
const results = { checks: [], version: null };
async function write() {
  await IOUtils.writeUTF8(PathUtils.join(base, 'tests', 'desktop', 'result.json'), JSON.stringify(results, null, 2));
}
async function reportError(e) {
  results.error = String(e.message)+'\n'+String(e.stack || e);
  await write();
}
function check(condition, label) {
  if (!condition) throw new Error(label);
  results.checks.push(label);
}
async function run() {
  try {
    results.version = Zotero.version;
    await write();
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const file = Zotero.File.pathToFile(base + 'TagStudio-Zotero10-v__TAGSTUDIO_TEST_VERSION__.xpi');
    const install = await AddonManager.getInstallForFile(file);
    check(install.error === 0 && install.addon?.isCompatible, 'XPI accepted by real Zotero installer');
    await install.install();
    const addon = await AddonManager.getAddonByID('tagstudio@local.tools');
    check(addon?.isActive, 'Installed plugin is active');
    await Zotero.uiReadyPromise;
    const win = Zotero.getMainWindow();
    for(let i=0;i<200 && !win.ZoteroPane.collectionsView?.itemTreeView;i++)await Zotero.Promise.delay(50);
    check(win.ZoteroPane.collectionsView?.itemTreeView,'Library item tree ready');
    win.resizeTo(1200,850);
    for (let i=0; i<100 && !win.document.getElementById('tagstudio-tools-menu'); i++) await Zotero.Promise.delay(100);
    check(win.document.getElementById('tagstudio-tools-menu'), 'Tools menu mounted');
    const columns = Zotero.ItemTreeManager.getCustomColumns();
    const column = columns.find(c => c.pluginID === 'tagstudio@local.tools');
    check(column, 'Colored tag column registered');
    const item = new Zotero.Item('journalArticle');
    item.setField('title', 'Tag Studio isolated integration test');
    item.addTag('#integration');
    await item.saveTx();
    const other = new Zotero.Item('journalArticle');other.setField('title','Other paper');
    for(const name of ['#研究方法','#车辆运动线索','#VR实验','#行人','#信任','#多模态沟通','#并线协商','#不确定性','#信息时机','#道路设计','#阅读进度','#实验场景'])other.addTag(name);
    await other.saveTx();
    await win.ZoteroPane.selectItem(item.id);
    win.document.getElementById('tagstudio-tools-menu').dispatchEvent(new win.Event('command'));
    for (let i=0; i<100 && !win.document.getElementById('tagstudio-root'); i++) await Zotero.Promise.delay(100);
    let root = win.document.getElementById('tagstudio-root');
    check(root && root.textContent.includes('integration'), 'Panel reads tags from real test database');
    check(root.querySelector('.ts-selected-area').textContent.includes('integration'),'Existing tags shown at top');
    check(!root.textContent.includes('待操作') && !root.querySelector('.ts-footer button'),'No staging area or batch action buttons');
    check(root.querySelector('input[aria-label="#integration"]').checked,'Workbench checkbox reflects existing assigned tag');
    const form=root.querySelector('.ts-create-bar');
    form.querySelector('input').value='#新建测试';
    form.dispatchEvent(new win.Event('submit',{cancelable:true}));
    for(let i=0;i<100 && form.querySelector('button').disabled;i++)await Zotero.Promise.delay(50);
    check(item.hasTag('#新建测试') && root.querySelector('.ts-selected-area').textContent.includes('新建测试'),'Inline create immediately saves new tag to paper');
    form.querySelector('input').value='#integration';
    form.dispatchEvent(new win.Event('submit',{cancelable:true}));
    for(let i=0;i<100 && form.querySelector('button').disabled;i++)await Zotero.Promise.delay(50);
    check(item.hasTag('#integration'),'Creating existing assigned tag preserves its assignment');
    const button = text => [...root.querySelectorAll('button')].find(b=>b.textContent.includes(text));
    button('标签库与颜色管理').click();
    const input = [...root.querySelectorAll('input[type=color]')].find(n=>n.title.includes('#integration'));
    input.value = '#123456';
    input.dispatchEvent(new win.Event('change'));
    check(JSON.parse(Zotero.Prefs.get('extensions.tagstudio.colors', true))['#integration'] === '#123456', 'Color setting saved');
    const cell = column.renderCell(0, column.dataProvider(item), {className:'test'}, false, win.document);
    check(cell.firstChild.style.backgroundColor === 'rgb(18, 52, 86)', 'Colored chip rendered with saved color');
    async function screenshot(name) {
      await Zotero.Promise.delay(150);
      const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
      canvas.width=win.innerWidth;canvas.height=win.innerHeight;
      const context=canvas.getContext('2d');
      context.drawWindow(win,0,0,win.innerWidth,win.innerHeight,'rgb(255,255,255)');
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      await IOUtils.write(PathUtils.join(base,'tests','desktop',name),new Uint8Array(await blob.arrayBuffer()));
    }
    await screenshot('manage.png');
    button('快速打标签').click();
    const rows=[...root.querySelectorAll('.ts-tagrow')];
    check(rows.length>3 && rows[0].getBoundingClientRect().top===rows[1].getBoundingClientRect().top,'Compact tags share a row');
    await screenshot('apply.png');
    root.querySelector('input[aria-label="#integration"]').click();
    for(let i=0;i<100 && form.querySelector('button').disabled;i++)await Zotero.Promise.delay(50);
    check(!item.hasTag('#integration') && !root.querySelector('input[aria-label="#integration"]').checked,'Workbench click immediately removes and unchecks tag');
    check(!root.querySelector('.ts-selected-area').textContent.includes('integration'),'Assigned tags at top update after instant removal');
    root.querySelector('input[aria-label="#integration"]').click();
    for(let i=0;i<100 && form.querySelector('button').disabled;i++)await Zotero.Promise.delay(50);
    check(item.hasTag('#integration') && root.querySelector('input[aria-label="#integration"]').checked,'Workbench click immediately adds and checks tag');
    check(item.hasTag('#新建测试'),'Unrelated assigned tag preserved');
    root.querySelector('.ts-x').click();
    check(!win.document.getElementById('tagstudio-root'), 'Panel closes cleanly');
    const menu=win.document.getElementById('tagstudio-item-menu');
    check(menu.localName==='menu' && menu.getAttribute('label')==='标签工作台','Short label and native submenu');
    const popup=menu.firstChild;popup.dispatchEvent(new win.Event('popupshowing'));
    for(let i=0;i<100 && !popup.querySelector('menuitem[type=checkbox]');i++)await Zotero.Promise.delay(50);
    const quickEntry=[...popup.querySelectorAll('menuitem[type=checkbox]')].find(n=>n.getAttribute('tooltiptext')==='#integration');
    check(quickEntry?.getAttribute('checked')==='true','Submenu shows assigned tag checked');
    check(quickEntry?.getAttribute('label').startsWith('☑ '),'Submenu checked state is explicit in visible label');
    check([...popup.querySelectorAll('menuitem[type=checkbox]')].some(n=>n.getAttribute('label').startsWith('☐ ')),'Submenu unchecked state is explicit in visible label');
    quickEntry.dispatchEvent(new win.Event('command'));
    for(let i=0;i<100 && item.hasTag('#integration');i++)await Zotero.Promise.delay(50);
    check(!item.hasTag('#integration'),'Submenu click removes tag immediately');
    await Zotero.Promise.delay(150);
    popup.dispatchEvent(new win.Event('popupshowing'));
    for(let i=0;i<100 && !popup.querySelector('menuitem[type=checkbox]');i++)await Zotero.Promise.delay(50);
    check([...popup.querySelectorAll('menuitem[type=checkbox]')].find(n=>n.getAttribute('tooltiptext')==='#integration')?.getAttribute('label').startsWith('☐ '),'Reopening submenu refreshes visible unchecked state');
    const section=Zotero.ItemPaneManager._sectionManager.options.find(s=>s.pluginID===addon.id);
    check(section,'Reader sidebar registered through official API');
    const body=win.document.createElementNS('http://www.w3.org/1999/xhtml','div');win.document.documentElement.appendChild(body);
    await win.ZoteroPane.selectItem(other.id);
    await section.onAsyncRender({body,doc:win.document,item,editable:true,tabType:'reader'});
    const readerCheck=body.querySelector('input[aria-label="#integration"]');
    readerCheck.checked=true;readerCheck.dispatchEvent(new win.Event('change'));
    for(let i=0;i<100 && !item.hasTag('#integration');i++)await Zotero.Promise.delay(50);
    check(item.hasTag('#integration') && !other.hasTag('#integration'),'Reader action uses reader item, not background selection');
    for(let i=0;i<100 && body.querySelector('button[type=submit]').disabled;i++)await Zotero.Promise.delay(50);
    body.querySelector('input[type=text]').value='#阅读新建';
    body.querySelector('form').dispatchEvent(new win.Event('submit',{cancelable:true}));
    for(let i=0;i<100 && !item.hasTag('#阅读新建');i++)await Zotero.Promise.delay(50);
    check(item.hasTag('#阅读新建'),'Reader creates and applies new tag');
    section.onDestroy({body});body.remove();
    const attachment=await Zotero.Attachments.importFromFile({file:Zotero.File.pathToFile(PathUtils.join(base,'tests','desktop','sample.pdf')),parentItemID:item.id});
    await Zotero.Reader.open(attachment.id);
    win.ZoteroContextPane.collapsed=false;
    for(let i=0;i<100 && ![...win.document.querySelectorAll('item-pane-custom-section')].some(p=>p.paneID===section.paneID && p.tabType==='reader');i++)await Zotero.Promise.delay(100);
    const nativePane=[...win.document.querySelectorAll('item-pane-custom-section')].find(p=>p.paneID===section.paneID && p.tabType==='reader');
    if(nativePane){nativePane.open=true;nativePane.scrollIntoView({block:'center'});}
    for(let i=0;i<200 && !win.document.querySelector(`.tagstudio-quick[data-item-id="${item.id}"]`);i++)await Zotero.Promise.delay(100);
    const actualReader=win.document.querySelector(`.tagstudio-quick[data-item-id="${item.id}"]`);
    results.readerSections=[...win.document.querySelectorAll('item-pane-custom-section')].map(p=>({paneID:p.paneID,tabType:p.tabType,itemID:p.item?.id,hidden:p.hidden,open:p.open,text:p.textContent.slice(-300)}));
    await screenshot('reader.png');
    check(actualReader,'Quick tag section renders in actual PDF reader');
    await addon.disable();
    check(!win.document.getElementById('tagstudio-tools-menu') && !Zotero.ItemTreeManager.getCustomColumns().some(c=>c.pluginID === addon.id), 'Disable cleans menus and column');
    results.passed = true;
    await write();
  } catch (e) { await reportError(e); }
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
}

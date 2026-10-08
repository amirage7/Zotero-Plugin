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
    const pluginColumns = columns.filter(c => c.pluginID === 'tagstudio@local.tools');
    const column = pluginColumns.find(c => c.label === '彩色标签');
    check(column, 'Colored tag column registered');
    check(pluginColumns.length===6,'Five category columns and overview registered in real Zotero');
    check(pluginColumns.filter(c=>!c.hidden).map(c=>c.label).join(',')==='研究主题,研究对象,研究方法','First three category columns visible by default');
    const item = new Zotero.Item('journalArticle');
    item.setField('title', 'Tag Studio isolated integration test');
    item.addTag('#integration');
    await item.saveTx();
    const other = new Zotero.Item('journalArticle');other.setField('title','Other paper');
    for(const name of ['#研究方法','#车辆运动线索','#VR实验','#行人','#信任','#多模态沟通','#并线协商','#不确定性','#信息时机','#道路设计','#阅读进度','#实验场景'])other.addTag(name);
    await other.saveTx();
    await Zotero.DB.executeTransaction(async()=>{
      for(let i=0;i<30;i++) {
        const fixture=new Zotero.Item('journalArticle');fixture.setField('title','Scroll fixture '+String(i).padStart(2,'0'));
        for(const tag of i%3===0 ? ['#信任','#车辆运动线索','#不确定性','#信息时机','#道路设计'] : ['#信任'])fixture.addTag(tag);
        await fixture.save();
      }
    });
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
    check(root.querySelector('.ts-tag-group[data-group="其他"] h3'),'Management has a distinct category heading');
    const categoryControl=[...root.querySelectorAll('.ts-tagrow')].find(r=>r.querySelector('.ts-pill')?.title==='#VR实验').querySelector('select');
    categoryControl.value='研究方法';categoryControl.dispatchEvent(new win.Event('change'));
    check(root.querySelector('.ts-tag-group[data-group="研究方法"] .ts-pill[title="#VR实验"]'),'Changing a category immediately moves its tag into that section');
    check(!root.querySelector('.ts-tag-group[data-group="其他"] .ts-pill[title="#VR实验"]'),'Reclassified tag is absent from its previous section');
    const methodColumn=pluginColumns.find(c=>c.label==='研究方法');
    const otherColumn=pluginColumns.find(c=>c.label==='其他');
    check(JSON.parse(methodColumn.dataProvider(other)).includes('#VR实验') && !JSON.parse(otherColumn.dataProvider(other)).includes('#VR实验'),'Reclassified tag moves between category column providers');
    check(JSON.parse(otherColumn.dataProvider(item)).includes('#integration'),'Unclassified tags appear in Other column');
    await Zotero.Promise.delay(300);
    const treeColumns=win.ZoteroPane.itemsView.tree._columns._columns;
    check(treeColumns.filter(c=>pluginColumns.some(p=>p.dataKey===c.dataKey) && !c.hidden).length===3,'Actual library tree shows three category columns');
    for (const [tag, group] of [['#信任','研究主题'],['#行人','研究对象'],['#车辆运动线索','研究主题'],['#不确定性','研究主题'],['#信息时机','研究主题'],['#道路设计','研究主题']]) {
      const control=[...root.querySelectorAll('.ts-tagrow')].find(r=>r.querySelector('.ts-pill')?.title===tag).querySelector('select');
      control.value=group;control.dispatchEvent(new win.Event('change'));
    }
    check(JSON.parse(pluginColumns.find(c=>c.label==='研究主题').dataProvider(other)).includes('#信任') && JSON.parse(pluginColumns.find(c=>c.label==='研究对象').dataProvider(other)).join(',')==='#行人','Theme and object columns display only matching tags');
    const libraryTree=win.ZoteroPane.itemsView.tree;
    const compactHeight=libraryTree._rowHeight;
    const modeControl=root.querySelector('select[aria-label="列表显示模式"]');
    check(modeControl?.value==='compact','List mode control is discoverable in workbench');
    modeControl.value='comfortable';modeControl.dispatchEvent(new win.Event('change'));
    await Zotero.Promise.delay(250);
    const otherIndex=[...Array(win.ZoteroPane.itemsView.getRowCount()).keys()].find(i=>win.ZoteroPane.itemsView.getRow(i)?.ref.id===other.id);
    const shortIndex=[...Array(win.ZoteroPane.itemsView.getRowCount()).keys()].find(i=>win.ZoteroPane.itemsView.getRow(i)?.ref.getField('title')==='Scroll fixture 01');
    check(libraryTree._rowHeight===compactHeight && libraryTree._customRowHeightMap[otherIndex]>=52,'Adaptive mode increases only overflowing paper height');
    check(!libraryTree._customRowHeightMap[shortIndex],'Short paper keeps original one-line height');
    check(JSON.parse(Zotero.Prefs.get('extensions.tagstudio.categories',true))['#VR实验']==='研究方法' && Zotero.Prefs.get('extensions.tagstudio.listMode',true)==='comfortable','Mode is saved without altering tag categories');
    const groupSearch=root.querySelector('#ts-search');groupSearch.value='VR实验';groupSearch.dispatchEvent(new win.Event('input'));
    check(root.querySelectorAll('.ts-tag-group').length===1 && root.querySelector('.ts-group-count').textContent==='1 个标签','Search hides empty sections and updates group counts');
    groupSearch.value='';groupSearch.dispatchEvent(new win.Event('input'));
    const input = [...root.querySelectorAll('input[type=color]')].find(n=>n.title.includes('#integration'));
    input.value = '#123456';
    input.dispatchEvent(new win.Event('change'));
    check(JSON.parse(Zotero.Prefs.get('extensions.tagstudio.colors', true))['#integration'] === '#123456', 'Color setting saved');
    const cell = column.renderCell(0, column.dataProvider(item), {className:'test'}, false, win.document);
    check(cell.firstChild.style.backgroundColor === 'rgb(18, 52, 86)', 'Colored chip rendered with saved color');
    async function screenshot(name) {
      await Zotero.Promise.delay(700);
      const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
      canvas.width=win.innerWidth;canvas.height=win.innerHeight;
      const context=canvas.getContext('2d');
      context.drawWindow(win,0,0,win.innerWidth,win.innerHeight,'rgb(255,255,255)');
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      await IOUtils.write(PathUtils.join(base,'tests','desktop',name),new Uint8Array(await blob.arrayBuffer()));
    }
    await screenshot('manage.png');
    button('快速打标签').click();
    check(root.querySelector('.ts-tag-group[data-group="研究方法"] input[aria-label="#VR实验"]'),'Quick tagging uses the same category sections');
    const rows=[...root.querySelector('.ts-tag-group[data-group="其他"]').querySelectorAll('.ts-tagrow')];
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
    await Zotero.Promise.delay(700);
    await win.ZoteroPane.selectItem(other.id);
    await screenshot('category-columns.png');
    let topicCell;
    for(let attempt=0;attempt<40;attempt++) {
      const paperRow=win.document.getElementById(win.ZoteroPane.itemsView.id+'-row-'+otherIndex);
      topicCell=[...(paperRow?.querySelectorAll('.cell')||[])].find(c=>c.title?.includes('#车辆运动线索') && c.title?.includes('#信息时机'));
      if(topicCell?.style.visibility==='visible')break;
      await Zotero.Promise.delay(100);
    }
    check(topicCell,'Category cell rendered in real library tree');
    const visibleChips=[...topicCell.children].filter(n=>n.style.display!=='none');
    check(new Set(visibleChips.map(n=>Math.round(n.getBoundingClientRect().top))).size===2,'Visible tags occupy two lines in comfortable mode');
    check(topicCell.querySelector('.tagstudio-more').textContent.startsWith('+'),'Overflow tags have visible remaining count');
    check(visibleChips.every(n=>n.getBoundingClientRect().bottom<=topicCell.getBoundingClientRect().bottom+1),'Second tag line stays inside cell');
    const selectedRow=topicCell.closest('[role=row],[role=treeitem]');
    check(selectedRow.getBoundingClientRect().height===libraryTree._customRowHeightMap[otherIndex],'Actual row height matches its custom virtual scrolling height');
    const shortRow=win.document.getElementById(win.ZoteroPane.itemsView.id+'-row-'+shortIndex);
    check(shortRow.getBoundingClientRect().height===compactHeight,'Actual short paper remains compact beside a tall paper');
    const topicColumn=libraryTree._columns.getAsArray().find(c=>c.label==='研究主题');
    const oldWidth=topicColumn.width;
    libraryTree._columns.onResize({[topicColumn.dataKey]:500},true);
    await Zotero.Promise.delay(700);
    check(!libraryTree._customRowHeightMap[otherIndex],'Widening column shrinks paper to one line');
    libraryTree._columns.onResize({[topicColumn.dataKey]:parseFloat(oldWidth)},true);
    await Zotero.Promise.delay(700);
    check(libraryTree._customRowHeightMap[otherIndex]>=52,'Narrowing column restores adaptive second line');
    await Zotero.Promise.delay(700);
    await screenshot('category-columns.png');
    const selectionBefore=win.ZoteroPane.getSelectedItems().map(i=>i.id).join(',');
    libraryTree._jsWindow.scrollTo(400);
    await Zotero.Promise.delay(700);
    const firstVisible=libraryTree._jsWindow.getFirstVisibleRow();
    const firstNode=libraryTree._jsWindow.getElementByIndex(firstVisible);
    check(firstNode && Math.abs(parseFloat(firstNode.style.top)-libraryTree._jsWindow._getItemPosition(firstVisible))<1,'Mixed-height scrolling positions rows using actual custom offsets');
    check(firstNode.getBoundingClientRect().height===(libraryTree._customRowHeightMap[firstVisible]||compactHeight),'Scrolled row renders at correct individual height');
    win.document.getElementById('tagstudio-tools-menu').dispatchEvent(new win.Event('command'));
    for(let i=0;i<100&&!win.document.getElementById('tagstudio-root');i++)await Zotero.Promise.delay(50);
    root=win.document.getElementById('tagstudio-root');
    check(root.querySelector('select[aria-label="列表显示模式"]').value==='comfortable','Reopened workbench remembers comfortable mode');
    const modeAgain=root.querySelector('select[aria-label="列表显示模式"]');modeAgain.value='compact';modeAgain.dispatchEvent(new win.Event('change'));
    await Zotero.Promise.delay(200);
    check(libraryTree._rowHeight===compactHeight && win.ZoteroPane.getSelectedItems().map(i=>i.id).join(',')===selectionBefore,'Compact mode restores native row height and retains selection');
    modeAgain.value='comfortable';modeAgain.dispatchEvent(new win.Event('change'));
    root.querySelector('.ts-x').click();
    await win.ZoteroPane.selectItem(item.id);
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
    check(libraryTree._rowHeight===compactHeight && !Object.keys(libraryTree._customRowHeightMap).length,'Disabling adaptive mode clears custom row heights');
    results.passed = true;
    await write();
  } catch (e) { await reportError(e); }
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
}

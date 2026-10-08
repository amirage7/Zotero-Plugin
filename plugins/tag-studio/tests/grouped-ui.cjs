// DOM integration test against the actual workbench source, in headless Edge.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TAGSTUDIO_PLAYWRIGHT || 'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.setContent('<!doctype html><html><body></body></html>');
 await page.evaluate(()=>{
  window.pluginID='test';window.rootURI='';window.Services={prompt:{alert(){}}};
  const prefs=new Map([['extensions.tagstudio.categories',JSON.stringify({'#VR实验':'研究方法','#信任':'研究主题','#行人':'研究对象','#重要':'阅读进度'})]]);
  window.Zotero={Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},Tags:{getAll:async()=>['#VR实验','#信任','#行人','#重要','#未分类','#另一个未分类']},Libraries:{userLibraryID:1,get:()=>({editable:true})},ItemTreeManager:{registerColumn:async()=> 'test',refreshColumns(){}},getMainWindows:()=>[],logError:console.error};
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../quick-tags.js'),'utf8')});
 await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../app.js'),'utf8')});
 await page.evaluate(async()=>{await TagStudio.start();await TagStudio.open(window,[{libraryID:1,getTags:()=>[],hasTag:()=>false}]);});
 assert.equal(await page.locator('.ts-tag-group').count(),5);
 assert.equal(await page.locator('[data-group="研究方法"] input[aria-label="#VR实验"]').count(),1);
 await page.getByRole('button',{name:'标签库与颜色管理',exact:true}).click();
 assert.equal(await page.locator('[data-group="研究主题"] .ts-pill[title="#信任"]').count(),1);
 await page.locator('.ts-tagrow').filter({has:page.locator('[title="#VR实验"]')}).locator('select').selectOption('研究主题');
 assert.equal(await page.locator('[data-group="研究主题"] .ts-pill[title="#VR实验"]').count(),1);
 assert.equal(await page.locator('[data-group="研究方法"]').count(),0);
 await page.locator('#ts-search').fill('VR实验');
 assert.equal(await page.locator('.ts-tag-group').count(),1);
 assert.equal(await page.locator('.ts-group-count').textContent(),'1 个标签');
 await page.locator('#ts-search').fill('不存在');assert.equal(await page.locator('.ts-tag-group').count(),0);assert.equal(await page.locator('.ts-empty').count(),1);
 await page.locator('#ts-search').fill('');
  await page.locator('.ts-tagrow').filter({has:page.locator('[title="#VR实验"]')}).locator('select').selectOption('研究方法');
 await page.screenshot({path:path.join(__dirname,'desktop/grouped-ui.png')});
 console.log('PASS: section membership in both tabs, immediate relocation, empty-section filtering, counts and empty search state.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

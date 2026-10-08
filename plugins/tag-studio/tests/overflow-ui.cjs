// Real DOM measurements exercise wrapping and column resizing in headless Edge.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.TAGSTUDIO_PLAYWRIGHT || 'playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<html><body style="font-family:system-ui"></body></html>');
  await page.evaluate(()=>{
   window.pluginID='test';window.Services={};window.columns=[];
   window.Zotero={Prefs:{get(){},set(){}},ItemTreeManager:{registerColumn:c=>{columns.push(c);return c.dataKey;},refreshColumns(){},unregisterColumn(){}},logError:console.error};
  });
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../app.js'),'utf8')});
  await page.evaluate(async()=>{
   await TagStudio.start();TagStudio.setListMode('comfortable');
   const column=columns.find(c=>c.label==='彩色标签');
   const cell=column.renderCell(0,JSON.stringify(['#信任','#不确定性','#车辆运动线索','#信息时机','#道路设计']),{className:'test'},false,document);
   cell.id='tags';cell.style.width='120px';setTimeout(()=>document.body.appendChild(cell),80);
  });
  await page.waitForTimeout(200);
  const inspect=()=>page.evaluate(()=>{
   const cell=document.getElementById('tags'),children=[...cell.children],visible=children.filter(c=>c.style.display!=='none');
   return {lines:new Set(visible.map(c=>Math.round(c.getBoundingClientRect().top))).size,hidden:children.filter(c=>c.style.display==='none'&&!c.classList.contains('tagstudio-more')).length,more:cell.querySelector('.tagstudio-more').textContent,clipped:visible.some(c=>c.getBoundingClientRect().right>cell.getBoundingClientRect().right+1||c.getBoundingClientRect().bottom>cell.getBoundingClientRect().bottom+1)};
  });
  let result=await inspect();assert.equal(result.lines,2);assert.equal(result.clipped,false);assert.equal(result.more,'+'+result.hidden);
  await page.locator('#tags').evaluate(c=>c.style.width='700px');await page.waitForTimeout(100);
  result=await inspect();assert.equal(result.hidden,0);assert.equal(result.clipped,false);
  await page.locator('#tags').evaluate(c=>c.style.width='80px');await page.waitForTimeout(100);
  result=await inspect();assert.equal(result.clipped,false);assert.equal(result.more,'+'+result.hidden);
  await page.evaluate(()=>{
   TagStudio.setListMode('compact');
   const old=document.getElementById('tags'),c=columns.find(c=>c.label==='彩色标签').renderCell(0,JSON.stringify(['#信任','#不确定性','#车辆运动线索','#信息时机','#道路设计']),{className:'test'},false,document);
   c.id='tags';c.style.width='120px';old.replaceWith(c);
  });
  await page.waitForTimeout(100);result=await inspect();assert.equal(result.lines,1);assert.equal(result.clipped,false);assert.equal(result.more,'+'+result.hidden);
  console.log('PASS: one/two-line wrapping, accurate overflow count, narrow/wide resizing and no clipped tags');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

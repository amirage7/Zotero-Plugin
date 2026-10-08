const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const prefs=new Map(), selected=[7], rows=[['#短'],['#甲甲甲甲','#乙乙乙乙','#丙丙丙丙'],[]];
let columnWidth=90;
const tree={_rowHeight:24,updateFontSize(){this._rowHeight=this._getRowHeight();},_getRowHeight(){return 24;},_getWindowedListOptions(){return {customRowHeights:[]};},updateCustomRowHeights(values){this._customRowHeightMap=Object.fromEntries(values);},selection:selected,_columns:{getAsArray:()=>[{dataKey:'tagStudioTags',label:'彩色标签',width:columnWidth}]},_jsWindow:{scrollOffset:48,getFirstVisibleRow:()=>2,_getItemPosition(i){return i*24+(i>1 ? (tree._customRowHeightMap?.[1]||24)-24 : 0);},update(){},invalidate(){},scrollTo(value){this.scrollOffset=value;}}};
const win={ZoteroPane:{itemsView:{tree,getRowCount:()=>rows.length,getRow:i=>({ref:{getTags:()=>rows[i].map(tag=>({tag}))}})}},document:{querySelector(){return null;},getElementById(){return null;},createElement(){return {getContext:()=>({measureText:t=>({width:t.length*11})})};}},setInterval(){return 1;},clearInterval(){}};
const Zotero={Prefs:{get:k=>prefs.get(k),set:(k,v)=>prefs.set(k,v)},getMainWindows:()=>[win],ItemTreeManager:{registerColumn:async c=>c.dataKey,unregisterColumn(){},refreshColumns(){}},logError:console.error};
const ctx=vm.createContext({Zotero,Services:{},pluginID:'test'});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),ctx);
(async()=>{
 await ctx.TagStudio.start();ctx.TagStudio.mount(win);ctx.TagStudio.setListMode('comfortable');
 assert.equal(prefs.get('extensions.tagstudio.listMode'),'comfortable');
 assert.equal(tree._rowHeight,24,'Native base height remains unchanged');
 assert.equal(tree._customRowHeightMap[0],undefined,'One-line paper remains compact');
 assert.equal(tree._customRowHeightMap[1],52,'Only overflowing paper grows to two lines');
 assert.equal(tree._customRowHeightMap[2],undefined,'Empty paper remains compact');
 assert.equal(tree._jsWindow.scrollOffset,76,'Visible row anchor retained');
 assert.equal(tree.selection,selected);
 columnWidth=500;ctx.TagStudio.setListMode('comfortable');assert.equal(Object.keys(tree._customRowHeightMap).length,0);
 columnWidth=90;ctx.TagStudio.setListMode('comfortable');
 ctx.TagStudio.setListMode('compact');assert.equal(Object.keys(tree._customRowHeightMap).length,0);assert.equal(tree._jsWindow.scrollOffset,48);
 ctx.TagStudio.setListMode('comfortable');assert.equal(tree._customRowHeightMap[1],52,'Re-enabling adaptive layout works');await ctx.TagStudio.stop();assert.equal(Object.keys(tree._customRowHeightMap).length,0);
 console.log('PASS: per-paper adaptive height, empty/short rows, resize, scroll anchor, persistence and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});



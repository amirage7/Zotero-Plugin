/* Shared instant tag controls for native menus and the item/reader sidebar. */
var TagStudioQuick = { create(api) {
  const {Zotero, Services, pluginID, loadNames, commonNames, colorFor, foreground, labelFor, open, selection, resolveLibraryContext, refreshColumn} = api;
  let sectionID = null;
  const renders = new Map();
  let observerID = null;
  function tagState(items, tag) {
    const count = items.filter(i => i.hasTag(tag)).length;
    return count === 0 ? 'none' : count === items.length ? 'all' : 'mixed';
  }
  function editable(items) {
    return items.length > 0 && items.every(i => Zotero.Libraries.get(i.libraryID)?.editable !== false);
  }
  function stateLabel(items, tag) {
    const state = tagState(items, tag);
    return (state === 'all' ? '☑ ' : state === 'mixed' ? '▣ ' : '☐ ') + labelFor(tag)
      + (state === 'mixed' ? '（部分已添加）' : '');
  }
  async function toggle(items, tag) {
    if (!editable(items)) throw new Error('当前文库只读，无法修改标签。');
    if (new Set(items.map(i=>i.libraryID)).size !== 1) throw new Error('请只选择同一个文库中的论文。');
    const remove = tagState(items, tag) === 'all';
    await Zotero.DB.executeTransaction(async () => {
      for (const item of items) {
        if (remove) item.removeTag(tag);
        else if (!item.hasTag(tag)) item.addTag(tag);
        else continue;
        await item.save();
      }
    });
    refreshColumn();
    for (const render of renders.values()) render();
  }
  function mount(win) {
    const doc = win.document;
    const parent = doc.querySelector('#zotero-itemmenu');
    if (!parent) return;
    const menu = doc.createXULElement('menu');
    menu.id = 'tagstudio-item-menu'; menu.setAttribute('label', '标签工作台');
    const popup = doc.createXULElement('menupopup'); menu.appendChild(popup); parent.appendChild(menu);
    let generation = 0;
    popup.addEventListener('popuphidden', e => { if(e.target===popup) generation++; });
    popup.addEventListener('popupshowing', async e => {
      if (e.target !== popup) return;
      const token = ++generation;
      popup.replaceChildren();
      function entry(label) {
        const n = doc.createXULElement('menuitem'); n.setAttribute('label',label); popup.appendChild(n); return n;
      }
      entry('打开工作台…').addEventListener('command',()=>open(win).catch(err=>Services.prompt.alert(win,'标签工作台',String(err))));
      popup.appendChild(doc.createXULElement('menuseparator'));
      const loading = entry('正在读取常用标签…'); loading.disabled = true;
      try {
        const {libraryID} = resolveLibraryContext(win);
        const items = selection(win,libraryID);
        const names = await loadNames(libraryID);
        if(token!==generation || !menu.isConnected) return;
        loading.remove();
        const common = commonNames(names,libraryID);
        if (!common.length) {entry('暂无常用标签，请在工作台设置').disabled=true;return;}
        for (const tag of common) {
          const state = tagState(items,tag);
          // Windows native menu themes may hide the checkbox gutter. Keep an
          // explicit state in the label as well as the accessible native state.
          const n=entry(stateLabel(items,tag));
          n.setAttribute('type','checkbox'); n.setAttribute('checked',String(state==='all'));
          n.setAttribute('autocheck','false'); n.disabled=!editable(items);
          n.setAttribute('tooltiptext',tag);
          n.addEventListener('command',()=>toggle(items,tag).catch(err=>Services.prompt.alert(win,'标签操作失败',String(err.message||err))));
        }
      } catch(err) { loading.setAttribute('label',String(err.message||err)); }
    });
  }
  function start() {
    if (!Zotero.ItemPaneManager) return;
    sectionID = Zotero.ItemPaneManager.registerSection({
      paneID:'quick-tags', pluginID,
      header:{l10nID:'tagstudio-quick-tags',icon:api.rootURI+'tag.svg'},
      sidenav:{l10nID:'tagstudio-quick-tags-nav',icon:api.rootURI+'tag.svg'},
      onInit:({doc})=>doc.defaultView.MozXULElement?.insertFTLIfNeeded('tagstudio.ftl'),
      onDestroy:({body})=>{body._tagStudioToken=null;renders.delete(body);},
      onItemChange:({item,body,setEnabled})=>{
        const target=api.usableItem(item);
        if(body._tagStudioItemID!==target?.id){body._tagStudioToken=null;renders.delete(body);}
        setEnabled(!!target);return true;
      },
      onRender:({body})=>{body.textContent='正在读取标签…';},
      onAsyncRender:async props=>{
        const {body,doc,item,editable:canEdit} = props;
        const target=api.usableItem(item);
        if (!target) {body.textContent='请选择一篇论文';return;}
        // A section can be reused for another reader tab while loading.
        const token = {}; body._tagStudioToken=token;
        body._tagStudioItemID=target.id;
        let names = await loadNames(target.libraryID);
        if(body._tagStudioToken!==token) return;
        const el=(type,attrs={},text)=>api.html(doc,type,attrs,text);
        body.replaceChildren();
        const host=el('div',{className:'tagstudio-quick','data-item-id':target.id});body.appendChild(host);
        const style=el('style',{},`
          .tagstudio-quick{font:inherit;color:inherit;padding:4px 0}
          .tagstudio-quick *{box-sizing:border-box}
          .tagstudio-quick input[type=search]{width:100%;height:30px;margin:8px 0;border:1px solid var(--fill-quinary,#cdd3dc);border-radius:5px;padding:0 8px;font:inherit;background:var(--material-background,#fff);color:inherit}
          .tagstudio-quick .tq-heading{font-size:12px;font-weight:600;margin:10px 0 6px}
          .tagstudio-quick .tq-grid{display:flex;flex-wrap:wrap;gap:6px}
          .tagstudio-quick button{font:inherit;cursor:pointer;min-height:28px;border:1px solid var(--fill-quinary,#d6dbe3);border-radius:5px;background:var(--material-background,#fff);color:inherit;padding:3px 7px}
          .tagstudio-quick button:focus-visible,.tagstudio-quick input:focus-visible{outline:2px solid #316bd0;outline-offset:2px}
          .tagstudio-quick label{display:flex;align-items:center;gap:5px;border:1px solid var(--fill-quinary,#d6dbe3);border-radius:5px;padding:4px 6px;cursor:pointer;max-width:100%}
          .tagstudio-quick label span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          .tagstudio-quick input[type=checkbox]{margin:0;accent-color:#316bd0;flex:none}
          .tagstudio-quick .tq-footer{margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px}
          .tagstudio-quick .tq-status{font-size:12px;color:var(--fill-secondary,#556070)}
        `);host.appendChild(style);
        host.appendChild(el('div',{className:'tq-heading'},'已添加'));
        const assigned=el('div',{className:'tq-grid'});host.appendChild(assigned);
        const search=el('input',{type:'search',placeholder:'搜索所有标签', 'aria-label':'搜索标签'});host.appendChild(search);
        const heading=el('div',{className:'tq-heading'},'常用标签');host.appendChild(heading);
        const grid=el('div',{className:'tq-grid'});host.appendChild(grid);
        const footer=el('div',{className:'tq-footer'});host.appendChild(footer);
        const status=el('span',{className:'tq-status',role:'status'},canEdit===false ? '文库只读' : '点击勾选，即时保存');footer.appendChild(status);
        const manage=el('button',{type:'button'},'管理标签');footer.appendChild(manage);
        manage.addEventListener('click',()=>open(doc.defaultView,[target]).catch(err=>{status.textContent=String(err.message||err);}));
        let busy=false;
        const create=el('form',{style:'display:flex;gap:6px;margin-top:10px;align-items:center'});host.appendChild(create);
        const input=el('input',{type:'text',placeholder:'新标签名称','aria-label':'新标签名称',style:'min-width:0;flex:1;width:100%;height:30px;border:1px solid var(--fill-quinary,#cdd3dc);border-radius:5px;padding:0 7px;font:inherit;background:var(--material-background,#fff);color:inherit'});
        const submit=el('button',{type:'submit',style:'white-space:nowrap'},'创建并添加');create.append(input,submit);
        input.disabled=submit.disabled=canEdit===false || !editable([target]);
        create.addEventListener('submit',async e=>{
          e.preventDefault();if(busy)return;
          const tag=input.value.trim();if(!tag || tag==='#'){status.textContent='请输入完整标签名称';return;}
          busy=true;input.disabled=submit.disabled=true;status.textContent='正在创建…';
          try{
            if(!editable([target]) || canEdit===false)throw new Error('当前文库只读');
            if(!target.hasTag(tag)){await Zotero.DB.executeTransaction(async()=>{target.addTag(tag);await target.save();});}
            names=await loadNames(target.libraryID);input.value='';status.textContent='已创建并添加';refreshColumn();
          }catch(err){status.textContent=String(err.message||err);Zotero.logError(err);}
          finally{busy=false;input.disabled=submit.disabled=canEdit===false || !editable([target]);render();}
        });
        function render() {
          if(body._tagStudioToken!==token)return;
          assigned.replaceChildren();grid.replaceChildren();
          const existing=target.getTags().map(t=>t.tag);
          if(!existing.length)assigned.appendChild(el('span',{className:'tq-status'},'尚未添加标签'));
          for(const tag of existing) {
            const chip=el('button',{type:'button',title:'移除 '+tag},labelFor(tag));
            chip.style.backgroundColor=colorFor(tag);chip.style.color=foreground(colorFor(tag));assigned.appendChild(chip);
            chip.disabled=busy || canEdit===false || !editable([target]);
            chip.addEventListener('click',()=>change(tag));
          }
          const query=search.value.trim().toLowerCase();heading.textContent=query?'搜索结果':'常用标签';
          const list=query ? names.filter(t=>t.toLowerCase().includes(query)) : commonNames(names,target.libraryID);
          for(const tag of list) {
            const label=el('label',{title:tag});const cb=el('input',{type:'checkbox','aria-label':tag});
            cb.checked=target.hasTag(tag);cb.disabled=busy || canEdit===false || !editable([target]);
            label.append(cb,el('span',{},labelFor(tag)));grid.appendChild(label);
            cb.addEventListener('change',()=>change(tag));
          }
          if(!list.length)grid.appendChild(el('span',{className:'tq-status'},query?'没有匹配标签':'在管理页设置常用标签'));
        }
        async function change(tag) {
          if(busy)return;busy=true;input.disabled=submit.disabled=true;render();status.textContent='正在保存…';
          try{await toggle([target],tag);status.textContent='已保存';}
          catch(err){status.textContent=String(err.message||err);Zotero.logError(err);}
          finally{busy=false;input.disabled=submit.disabled=canEdit===false || !editable([target]);render();}
        }
        search.addEventListener('input',render);renders.set(body,render);render();
      }
    });
    if(Zotero.Notifier) observerID=Zotero.Notifier.registerObserver({notify(){for(const render of renders.values())render();}},['item','item-tag'],'tagstudio-quick');
  }
  function stop() {
    if(observerID!==null)Zotero.Notifier.unregisterObserver(observerID);
    if(sectionID)Zotero.ItemPaneManager.unregisterSection(sectionID);
    sectionID=null;observerID=null;renders.clear();
  }
  return {tagState,stateLabel,editable,toggle,mount,start,stop};
}};

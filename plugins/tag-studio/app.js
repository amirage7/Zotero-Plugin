/* global Zotero, Services, pluginID */
/* Tag Studio - all UI is deliberately in-process, without a local server. */
var TagStudio = (() => {
  const HTML_NS = "http://www.w3.org/1999/xhtml";
  const PREF = "extensions.tagstudio.";
  const DEFAULT = "#E9DFF4";
  const GROUPS = ["研究主题", "研究对象", "研究方法", "阅读进度", "其他"];
  const windows = new Set();
  const overlayClosers = new Map();
  let columnID = null;
  let palette = readJSON("colors", {});
  let categories = readJSON("categories", {});
  let customCatalog = readJSON("catalog", {});
  let onlyHashtag = readSetting("onlyHashtag", true);
  let favorites = readJSON("favorites", {});
  let quick = null;

  function commonNames(names, libraryID) {
    const pinned = favorites[String(libraryID)] || [];
    if (Object.prototype.hasOwnProperty.call(favorites,String(libraryID))) return pinned.filter(t=>names.includes(t));
    return names.filter(t=>t.startsWith('#')).slice(0, 24);
  }

  function readSetting(name, fallback) {
    try { const v = Zotero.Prefs.get(PREF + name, true); return v === undefined ? fallback : v; }
    catch (_) { return fallback; }
  }
  function readJSON(name, fallback) {
    try { return JSON.parse(readSetting(name, "")) || fallback; }
    catch (_) { return fallback; }
  }
  function store(name, value) { Zotero.Prefs.set(PREF + name, value, true); }
  function saveConfigs() {
    store("colors", JSON.stringify(palette));
    store("categories", JSON.stringify(categories));
    store("catalog", JSON.stringify(customCatalog));
  }
  const normalize = x => String(x || "").trim();
  const safeColor = x => /^#[0-9a-fA-F]{6}$/.test(x || "") ? x : DEFAULT;
  const colorFor = tag => safeColor(palette[tag] || DEFAULT);
  const groupFor = tag => GROUPS.includes(categories[tag]) ? categories[tag] : "其他";
  const labelFor = tag => tag.startsWith("#") ? tag.substring(1) : tag;
  function foreground(hex) {
    const v = safeColor(hex).slice(1);
    const rgb = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 155 ? "#263044" : "#FFFFFF";
  }
  function html(doc, type, attrs = {}, text) {
    const n = doc.createElementNS(HTML_NS, type);
    for (const [k, value] of Object.entries(attrs)) {
      if (k === "className") n.className = value;
      else if (k === "style") n.setAttribute("style", value);
      else n.setAttribute(k, String(value));
    }
    if (text !== undefined) n.textContent = String(text);
    return n;
  }
  function notifyError(win, err) {
    try { Zotero.logError(err); } catch (_) {}
    Services.prompt.alert(win, "Tag Studio 操作失败", String(err?.message || err));
  }
  function refreshColumn() {
    try { Zotero.ItemTreeManager.refreshColumns(); } catch (err) { Zotero.debug("Tag Studio: " + err); }
  }

  async function loadNames(libraryID) {
    const data = await Zotero.Tags.getAll(libraryID);
    const fromZotero = (data || []).map(t => typeof t === "string" ? t : t.tag || t.name || "");
    // Preserve manually curated #tags even if their last paper is untagged.
    const old = customCatalog[String(libraryID)] || [];
    const merged = [...new Set([...old, ...fromZotero.filter(x => x.startsWith("#"))])];
    if (merged.length !== old.length) {
      customCatalog[String(libraryID)] = merged;
      saveConfigs();
    }
    const local = customCatalog[String(libraryID)] || [];
    return [...new Set([...fromZotero, ...local].map(normalize).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  function usableItem(item) {
    if (!item) return null;
    if (item.isRegularItem && item.isRegularItem()) return item;
    if (item.parentID) {
      const parent = Zotero.Items.get(item.parentID);
      if (parent && parent.isRegularItem && parent.isRegularItem()) return parent;
    }
    return null;
  }
  function selection(win, libraryID) {
    const pane = win.ZoteroPane || Zotero.getActiveZoteroPane();
    const arr = pane.getSelectedItems() || [];
    const items = arr.map(usableItem).filter(x => x && x.libraryID === libraryID);
    return [...new Map(items.map(x => [x.id, x])).values()];
  }

  // Zotero 10 allows multiple collection/library selections and removed the
  // single-selection getSelectedLibraryID() API. Never silently edit a random
  // library if the selection spans multiple libraries.
  function resolveLibraryContext(win) {
    const pane = win.ZoteroPane || Zotero.getActiveZoteroPane();
    const selectedItems = (pane.getSelectedItems() || []).map(usableItem).filter(Boolean);
    const itemLibraryIDs = [...new Set(selectedItems.map(item => item.libraryID))];
    const selectedLibraryIDs = pane.getSelectedLibraryIDs?.() || [];
    if (itemLibraryIDs.length > 1) {
      throw new Error('当前选中论文属于多个文库。请只选择同一个文库中的论文，再打开标签工作台。');
    }
    if (itemLibraryIDs.length === 1) {
      return { libraryID: itemLibraryIDs[0] };
    }
    if (selectedLibraryIDs.length > 1) {
      throw new Error('当前同时选择了多个文库/分类。请先在左侧只选中一个文库或分类。');
    }
    return { libraryID: selectedLibraryIDs[0] || Zotero.Libraries.userLibraryID };
  }

  async function start() {
    columnID = await Zotero.ItemTreeManager.registerColumn({
      dataKey: "tagStudioTags", label: "彩色标签", pluginID,
      enabledTreeIDs: ["main"], width: "340", minWidth: 120,
      flex: 0, showInColumnPicker: true,
      zoteroPersist: ["width", "hidden"],
      dataProvider(item) {
        try {
          let names = (item.getTags() || []).map(t => t.tag).filter(Boolean);
          if (onlyHashtag) names = names.filter(n => n.startsWith("#"));
          return JSON.stringify(names);
        } catch (_) { return "[]"; }
      },
      renderCell(index, data, column, isFirstColumn, doc) {
        const cell = doc.createElement("span");
        cell.className = `cell ${column.className}`;
        cell.style.cssText = "display:flex;gap:5px;align-items:center;overflow:hidden;white-space:nowrap;min-width:0;";
        try {
          const tags = JSON.parse(data || "[]");
          for (const tag of tags) {
            const chip = doc.createElement("span");
            const color = colorFor(tag);
            chip.textContent = labelFor(tag);
            chip.title = tag;
            chip.style.cssText = "display:inline-block;flex:0 0 auto;padding:2px 6px;border-radius:4px;font-size:11px;line-height:17px;max-width:175px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            chip.style.backgroundColor = color;
            chip.style.color = foreground(color);
            cell.appendChild(chip);
          }
        } catch (_) {}
        return cell;
      },
    });
    if (typeof TagStudioQuick !== 'undefined') {
      quick = TagStudioQuick.create({Zotero, Services, pluginID, rootURI, html, loadNames, commonNames, colorFor, foreground, labelFor, usableItem, open, selection, resolveLibraryContext, refreshColumn});
      quick.start();
    }
  }
  async function stop() {
    quick?.stop();
    for (const win of [...windows]) unmount(win);
    if (columnID !== null) {
      try { await Zotero.ItemTreeManager.unregisterColumn(columnID); } catch (e) { Zotero.logError(e); }
      columnID = null;
    }
  }
  function mount(win) {
    if (!win || windows.has(win)) return;
    windows.add(win);
    const d = win.document;
    const toolsMenu = d.querySelector("#menu_ToolsPopup");
    if (toolsMenu) {
      const entry = d.createXULElement("menuitem");
      entry.id = "tagstudio-tools-menu";
      entry.setAttribute("label", "标签工作台");
      entry.addEventListener("command", () => open(win).catch(e => notifyError(win, e)));
      toolsMenu.appendChild(entry);
    }
    quick?.mount(win);
    win.MozXULElement?.insertFTLIfNeeded('tagstudio.ftl');
  }
  function unmount(win) {
    if (!win) return;
    const d = win.document;
    d.getElementById("tagstudio-tools-menu")?.remove();
    d.getElementById("tagstudio-item-menu")?.remove();
    overlayClosers.get(win)?.();
    windows.delete(win);
  }

  const css = `
#tagstudio-root {position:fixed;inset:0;z-index:2147483000;background:rgba(16,24,40,.38);display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif;color:#222b3d;font-size:13px}
#tagstudio-root * {box-sizing:border-box}
#tagstudio-root .ts-panel {width:min(970px,94vw);height:min(740px,88vh);background:#fff;border-radius:15px;box-shadow:0 24px 90px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden}
#tagstudio-root .ts-header {padding:20px 24px 14px;border-bottom:1px solid #edf0f3;display:flex;align-items:center;justify-content:space-between}
#tagstudio-root .ts-title {font-size:19px;font-weight:750;letter-spacing:-.3px}
#tagstudio-root .ts-muted {color:#768094;font-size:12px;margin-top:5px}
#tagstudio-root .ts-x {border:0;background:transparent;font-size:25px;color:#7c879a;cursor:pointer}
#tagstudio-root .ts-tabs {padding:12px 22px;display:flex;gap:10px;border-bottom:1px solid #edf0f3}
#tagstudio-root .ts-tab {padding:9px 16px;border:1px solid transparent;border-radius:9px;background:#f4f5f8;color:#475569;font-weight:600;cursor:pointer}
#tagstudio-root .ts-tab.active {background:#e9f0ff;border-color:#cbdcfb;color:#245ab5}
#tagstudio-root .ts-tools {padding:12px 22px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#tagstudio-root input[type=search], #tagstudio-root input[type=text] {min-width:120px;border:1px solid #d9deea;background:#fff;border-radius:8px;padding:10px 11px;color:#20293a;outline:none;font:inherit}
#tagstudio-root #ts-search {flex:1;min-width:240px}
#tagstudio-root button {font:inherit;cursor:pointer}
#tagstudio-root .ts-btn {border:1px solid #dce2eb;border-radius:8px;background:#fff;padding:9px 12px;color:#38465a}
#tagstudio-root .ts-btn.primary {background:#316bd0;border-color:#316bd0;color:white;font-weight:600}
#tagstudio-root .ts-btn.danger {color:#b54447}
#tagstudio-root .ts-btn:disabled {opacity:.48;cursor:not-allowed}
#tagstudio-root .ts-body {min-height:0;overflow:auto;flex:1;padding:0 22px}
#tagstudio-root .ts-tagrow {min-height:49px;border-bottom:1px solid #edf0f3;display:flex;align-items:center;gap:12px;padding:7px 3px}
#tagstudio-root .ts-tagrow:hover {background:#f8fafc}
#tagstudio-root .ts-name {flex:1;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#tagstudio-root .ts-count {color:#8a94a6;font-size:12px;min-width:50px;text-align:right}
#tagstudio-root .ts-pill {display:inline-block;border-radius:5px;padding:5px 10px;font-size:12px;white-space:nowrap;max-width:260px;text-overflow:ellipsis;overflow:hidden}
#tagstudio-root .ts-color {height:30px;width:44px;padding:2px;border:1px solid #dce2e8;border-radius:7px;background:white;cursor:pointer}
#tagstudio-root select {padding:7px;border-radius:7px;border:1px solid #dce2eb;background:white;color:#475569;max-width:150px}
#tagstudio-root .ts-footer {padding:14px 22px;border-top:1px solid #edf0f3;display:flex;align-items:center;gap:12px;justify-content:space-between}
#tagstudio-root .ts-tip {font-size:12px;color:#738095;line-height:1.65}
#tagstudio-root .ts-status {font-size:12px;color:#267048}
#tagstudio-root .ts-checkbox {width:17px;height:17px;accent-color:#326bc8;cursor:pointer;flex:0 0 auto}
#tagstudio-root .ts-empty {text-align:center;color:#8793a7;padding:56px 10px}
#tagstudio-root .ts-note {padding:0 22px 6px;color:#6f7b8f;font-size:12px}
#tagstudio-root {color-scheme:light}
#tagstudio-root button,#tagstudio-root input,#tagstudio-root select {font-family:inherit;line-height:1.3;margin:0;vertical-align:middle}
#tagstudio-root button:focus-visible,#tagstudio-root input:focus-visible,#tagstudio-root select:focus-visible {outline:2px solid #316bd0;outline-offset:2px}
#tagstudio-root .ts-panel {width:min(1000px,94vw);height:min(760px,90vh);border-radius:12px}
#tagstudio-root .ts-header {padding:18px 22px}
#tagstudio-root .ts-title {font-size:20px;font-weight:650;letter-spacing:0}
#tagstudio-root .ts-muted,#tagstudio-root .ts-tip,#tagstudio-root .ts-note {color:#586577}
#tagstudio-root .ts-tabs {padding:10px 22px;gap:6px}
#tagstudio-root .ts-tab {height:34px;padding:0 14px;border-radius:6px;font-weight:600}
#tagstudio-root .ts-tools {gap:8px;padding:12px 22px}
#tagstudio-root input[type=search],#tagstudio-root input[type=text],#tagstudio-root .ts-btn,#tagstudio-root select {height:32px;padding:0 10px;border-radius:5px}
#tagstudio-root .ts-x {width:32px;height:32px;display:grid;place-items:center;padding:0}
#tagstudio-root .ts-btn:hover:not(:disabled) {background:#f0f3f8}
#tagstudio-root .ts-btn.primary:hover:not(:disabled) {background:#255bbb}
#tagstudio-root .ts-selected-area {padding:4px 22px 14px;border-bottom:1px solid #e7ebf0;max-height:150px;overflow:auto}
#tagstudio-root .ts-create-bar {display:flex;align-items:center;gap:8px;padding:12px 22px;background:#fafbfd;border-bottom:1px solid #e7ebf0}
#tagstudio-root .ts-create-bar label {font-size:13px;font-weight:600;white-space:nowrap}
#tagstudio-root .ts-create-bar input {flex:1;min-width:100px}
#tagstudio-root .ts-create-bar button {color:#245ab5;border-color:#c5d7f8;white-space:nowrap}
#tagstudio-root .ts-section-label {font-size:12px;color:#586577;font-weight:600;margin:8px 0}
#tagstudio-root .ts-chip-grid {display:flex;flex-wrap:wrap;gap:6px}
#tagstudio-root .ts-pill {padding:4px 8px;max-width:100%;line-height:20px;font-size:13px}
#tagstudio-root .ts-pill small {font-size:11px;opacity:.8}
#tagstudio-root .ts-body {padding:16px 22px;align-content:start}
#tagstudio-root .ts-apply-grid {display:flex;flex-wrap:wrap;gap:8px}
#tagstudio-root .ts-apply-grid .ts-tagrow {padding:5px 8px;min-height:36px;border:1px solid #dce2eb;border-radius:6px;gap:7px;max-width:100%;cursor:pointer}
#tagstudio-root .ts-apply-grid .ts-name {min-width:0;flex:initial}
#tagstudio-root .ts-apply-grid .is-selected {border-color:#316bd0;background:#edf3ff}
#tagstudio-root .ts-checkbox {width:15px;height:15px;margin:0}
#tagstudio-root .ts-manage-grid {display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));grid-auto-rows:max-content;gap:12px}
#tagstudio-root .ts-manage-grid .ts-tagrow {display:flex;flex-direction:column;align-items:stretch;gap:9px;min-width:0;border:1px solid #e1e6ee;border-radius:6px;padding:12px;background:#fafbfd}
#tagstudio-root .ts-manage-grid .ts-pill {align-self:flex-start;flex-shrink:0}
#tagstudio-root .ts-card-controls {display:flex;align-items:center;gap:5px;flex-wrap:wrap}
#tagstudio-root .ts-card-controls select {width:88px;font-size:12px;padding:0 5px}
#tagstudio-root .ts-card-controls .ts-btn {font-size:12px;padding:0 7px}
#tagstudio-root .ts-color {width:30px;height:32px;border-radius:5px;padding:2px;flex:none}
#tagstudio-root .ts-favorite[aria-pressed=true] {color:#245ab5;background:#edf3ff;border-color:#c5d7f8}
#tagstudio-root .ts-footer {gap:12px;flex-wrap:wrap;padding:12px 22px;background:#fafbfd}
#tagstudio-root .ts-footer .ts-tip {max-width:420px}
#tagstudio-root .ts-empty {width:100%;grid-column:1/-1;padding:30px 10px}
@media(max-width:680px){#tagstudio-root .ts-panel {width:96vw;height:94vh}#tagstudio-root .ts-header,#tagstudio-root .ts-tools,#tagstudio-root .ts-tabs,#tagstudio-root .ts-footer {padding-left:14px;padding-right:14px}#tagstudio-root .ts-body,#tagstudio-root .ts-selected-area {padding-left:14px;padding-right:14px}#tagstudio-root #ts-search {min-width:160px}#tagstudio-root .ts-manage-grid {grid-template-columns:1fr}}
`;

  async function open(win, targetItems) {
    let previous = win.document.getElementById("tagstudio-root");
    if (previous && !targetItems) { previous.querySelector("#ts-search")?.focus(); return; }
    if (previous) overlayClosers.get(win)?.();
    const libraryID = targetItems?.[0]?.libraryID || resolveLibraryContext(win).libraryID;
    const items = targetItems || selection(win, libraryID);
    const names = await loadNames(libraryID);
    const state = { win, libraryID, items, names, tab: items.length ? "apply" : "manage", query: "", onlyHashtag:false, busy: false };
    build(win, state);
  }

  function build(win, state) {
    const d = win.document;
    const root = html(d, "div", {id: "tagstudio-root"});
    const style = html(d, "style"); style.textContent = css; root.appendChild(style);
    const panel = html(d, "div", {className: "ts-panel"}); root.appendChild(panel);
    const header = html(d, "header", {className: "ts-header"}); panel.appendChild(header);
    const heading = html(d, "div"); header.appendChild(heading);
    heading.appendChild(html(d, "div", {className: "ts-title"}, "标签工作台"));
    heading.appendChild(html(d, "div", {className: "ts-muted"}, `${state.names.length} 个标签 · ${state.items.length} 篇选中论文`));
    const x = html(d, "button", {className: "ts-x", title:"关闭标签工作台"}, "×"); header.appendChild(x);
    const tabs = html(d, "div", {className: "ts-tabs"}); panel.appendChild(tabs);
    const applyTab = html(d, "button", {className:"ts-tab", type:"button"}, "快速打标签");
    const manageTab = html(d, "button", {className:"ts-tab", type:"button"}, "标签库与颜色管理");
    tabs.append(applyTab, manageTab);
    const tools = html(d, "div", {className: "ts-tools"}); panel.appendChild(tools);
    const search = html(d, "input", {id:"ts-search", type:"search", placeholder:"搜索标签名称（支持中英文）"}); tools.appendChild(search);
    const tagFilter = html(d, "label", {style:"display:flex;align-items:center;gap:5px;white-space:nowrap;cursor:pointer;"});
    const filterCheck = html(d,"input",{type:"checkbox"});
    tagFilter.append(filterCheck,html(d,"span",{},"仅看 # 标签"));
    tools.appendChild(tagFilter);
    filterCheck.addEventListener("change", () => { state.onlyHashtag = filterCheck.checked; renderList(); });
    const note = html(d, "div", {className:"ts-note"}); panel.appendChild(note);
    const selectedArea = html(d, 'div', {className:'ts-selected-area'}); panel.appendChild(selectedArea);
    const createBar=html(d,'form',{className:'ts-create-bar'});panel.appendChild(createBar);
    const createLabel=html(d,'label',{for:'ts-new-tag'},'新建标签');createBar.appendChild(createLabel);
    const newInput=html(d,'input',{id:'ts-new-tag',type:'text',placeholder:'输入新标签名称，例如 #信任', 'aria-label':'新标签名称'});createBar.appendChild(newInput);
    const newTag=html(d,'button',{className:'ts-btn',type:'submit'},state.items.length?'创建并添加':'创建标签');createBar.appendChild(newTag);
    const body = html(d, "div", {className:"ts-body"}); panel.appendChild(body);
    const footer = html(d, "footer", {className:"ts-footer"}); panel.appendChild(footer);
    const msg = html(d, "div", {className:"ts-tip"}); footer.appendChild(msg);
    const buttons = html(d, "div", {style:"display:flex;align-items:center;gap:9px;"}); footer.appendChild(buttons);
    const status = html(d, "div", {className:"ts-status"});
    const close = () => {
      d.removeEventListener("keydown", onEsc);
      if (root.parentNode) root.parentNode.removeChild(root);
      overlayClosers.delete(win);
    };
    root.addEventListener("click", e => { if (e.target === root) close(); });
    x.addEventListener("click", close);
    const onEsc = e => { if (e.key === "Escape") close(); };
    d.addEventListener("keydown", onEsc);
    overlayClosers.set(win, close);
    d.documentElement.appendChild(root);
    search.focus();

    async function updateNames() { state.names = await loadNames(state.libraryID); heading.lastChild.textContent = `${state.names.length} 个标签 · ${state.items.length} 篇选中论文`; }
    function renderSelected() {
      selectedArea.replaceChildren();
      const existing = [...new Set(state.items.flatMap(i=>i.getTags().map(t=>t.tag)))];
      selectedArea.appendChild(html(d,'div',{className:'ts-section-label'},'论文已添加的标签'));
      const chips=html(d,'div',{className:'ts-chip-grid'});selectedArea.appendChild(chips);
      if(!existing.length)chips.appendChild(html(d,'span',{className:'ts-tip'},state.items.length?'尚未添加标签':'选中论文后可查看已添加标签'));
      for(const tag of existing) {
        const chip=pill(tag);const count=state.items.filter(i=>i.hasTag(tag)).length;
        if(count<state.items.length)chip.appendChild(html(d,'small',{},` ${count}/${state.items.length}`));
        chips.appendChild(chip);
      }
    }
    function setStatus(s) { status.textContent = s || ""; }
    function setBusy(v) {
      state.busy = v;
      newTag.disabled=newInput.disabled=v || (state.items.length>0 && !quick.editable(state.items));
      for (const control of body.querySelectorAll('input,button,select')) {
        control.disabled=v || (state.tab==='apply' && !quick.editable(state.items));
      }
    }
    async function operation(fn) {
      if (state.busy) return;
      setBusy(true); setStatus("");
      try { await fn(); }
      catch (err) { notifyError(win, err); }
      finally { renderList(); setBusy(false); }
    }
    function pill(name) {
      const col = colorFor(name);
      const p = html(d, "span", {className: "ts-pill", title:name}, labelFor(name));
      p.style.backgroundColor = col; p.style.color = foreground(col);
      return p;
    }
    function filterNames() {
      return state.names.filter(t => (!state.onlyHashtag || t.startsWith("#")) && t.toLowerCase().includes(state.query.toLowerCase()));
    }
    function row(tag) {
      const r = html(d, "div", {className:"ts-tagrow"});
      if (state.tab === "apply") {
        const check = html(d, "input", {className:"ts-checkbox", type:"checkbox"});
        const assigned = quick.tagState(state.items,tag);
        check.checked = assigned === 'all';
        check.indeterminate = assigned === 'mixed';
        check.disabled = state.busy || !quick.editable(state.items);
        check.setAttribute('aria-label',tag);
        check.addEventListener("change", () => operation(async () => {
          const remove = quick.tagState(state.items,tag) === 'all';
          await quick.toggle(state.items,tag);
          await updateNames();
          setStatus(`已${remove?'移除':'添加'}「${labelFor(tag)}」`);
        }));
        r.classList.toggle('is-selected',assigned !== 'none');
        r.appendChild(check);
        const n = html(d, "div", {className:"ts-name"}); n.appendChild(pill(tag)); r.appendChild(n);
        r.addEventListener("click", e => { if (check.disabled || e.target === check || e.target.closest("input")) return; check.click(); });
        r.setAttribute('title',tag+' · '+groupFor(tag));
      } else {
        const p = pill(tag); r.appendChild(p);
        const controls=html(d,'div',{className:'ts-card-controls'});r.appendChild(controls);
        const cat = html(d, "select", {title:"标签分类"});
        for (const g of GROUPS) { const opt = html(d,"option",{value:g},g); if (g === groupFor(tag)) opt.selected=true; cat.appendChild(opt); }
        cat.addEventListener("change", () => { categories[tag] = cat.value; saveConfigs(); setStatus("分类已保存"); });
        controls.appendChild(cat);
        const color = html(d, "input", {type:"color", className:"ts-color", title:`修改 ${tag} 的颜色`});
        color.value = colorFor(tag);
        color.addEventListener("change", () => { palette[tag] = color.value; saveConfigs(); renderList(); setStatus("颜色已保存；可在『彩色标签』列查看"); refreshColumn(); });
        controls.appendChild(color);
        const rename = html(d, "button", {className:"ts-btn", title:"在当前文库重命名这个标签", type:"button"}, "改名");
        rename.addEventListener("click", async () => operation(async () => {
          const output = {value: tag};
          if (!Services.prompt.prompt(win, "重命名标签", `把「${tag}」改为：`, output, null, {})) return;
          const next = normalize(output.value);
          if (!next || next === tag) return;
          if (state.names.includes(next) && !Services.prompt.confirm(win,"合并标签",`「${next}」已经存在。继续可能把两个标签合并，确定吗？`)) return;
          // New catalogue entries may not yet exist on any item.
          const actual = (await Zotero.Tags.getAll(state.libraryID) || [])
            .some(t => (typeof t === "string" ? t : (t.tag || t.name)) === tag);
          if (actual) await Zotero.Tags.rename(state.libraryID, tag, next);
          const extras = new Set(customCatalog[String(state.libraryID)] || []);
          extras.delete(tag); extras.add(next);
          customCatalog[String(state.libraryID)] = [...extras];
          // Keep old-name colors: the old tag may still exist in other libraries.
          if (palette[tag]) palette[next] = palette[tag];
          if (categories[tag]) categories[next] = categories[tag];
          const pinned=favorites[String(state.libraryID)] || [];
          favorites[String(state.libraryID)]=[...new Set(pinned.map(t=>t===tag?next:t))];
          store('favorites',JSON.stringify(favorites));
          saveConfigs(); await updateNames(); renderList(); refreshColumn(); setStatus("已重命名：" + next);
        }));
        controls.appendChild(rename);
        const pinned=favorites[String(state.libraryID)] || [];
        const favorite=html(d,'button',{className:'ts-btn ts-favorite',type:'button','aria-pressed':pinned.includes(tag)},pinned.includes(tag)?'已常用':'设为常用');
        favorite.addEventListener('click',()=>{
          const next=new Set(favorites[String(state.libraryID)] || []);
          if(next.has(tag))next.delete(tag);else next.add(tag);
          favorites[String(state.libraryID)]=[...next];store('favorites',JSON.stringify(favorites));
          renderList();setStatus('常用标签已保存');
        });controls.appendChild(favorite);
      }
      return r;
    }
    function renderList() {
      const previousScroll = body.scrollTop;
      body.replaceChildren();
      body.classList.toggle('ts-manage-grid',state.tab==='manage');
      body.classList.toggle('ts-apply-grid',state.tab==='apply');
      const names = filterNames();
      if (!names.length) body.appendChild(html(d,"div",{className:"ts-empty"},"没有匹配的标签，可在上方输入名称并创建。"));
      else {
        // Grouping is for management only; keep assignment a flat searchable list.
        const sorted = state.tab === "manage"
          ? [...names].sort((a,b) => GROUPS.indexOf(groupFor(a))-GROUPS.indexOf(groupFor(b)) || a.localeCompare(b,"zh-CN"))
          : names;
        for (const name of sorted) body.appendChild(row(name));
      }
      body.scrollTop = previousScroll;
      renderSelected();
      updateFooter();
    }
    function updateFooter() {
      buttons.replaceChildren();
      msg.replaceChildren();
      if (state.tab === "apply") {
        msg.textContent = state.items.length
          ? `对 ${state.items.length} 篇论文即时保存；勾选表示已添加，横线表示部分论文已添加。`
          : '请先在 Zotero 选中论文';
      } else {
        msg.textContent = `管理当前文库的全部标签；色彩、分类按标签名称统一保存。颜色不受 Zotero 原生 9 个的限制。`;
        const toggle = html(d,"label",{style:"display:flex;gap:8px;align-items:center;cursor:pointer;"});
        const cb = html(d,"input",{type:"checkbox",className:"ts-checkbox"}); cb.checked = onlyHashtag;
        toggle.append(cb, html(d,"span",{},"彩色标签列仅显示 # 标签"));
        cb.addEventListener("change", () => { onlyHashtag=cb.checked; store("onlyHashtag",onlyHashtag); refreshColumn(); setStatus("显示规则已保存"); });
        buttons.appendChild(toggle);
      }
      buttons.appendChild(status);
    }
    async function create() {
      const tag = normalize(newInput.value);
      if (!tag || tag === "#") {setStatus('请输入完整标签名称');newInput.focus();return;}
      const exists = state.names.includes(tag);
      if(state.items.length) {
        if(!quick.editable(state.items))throw new Error('当前文库只读，无法修改标签。');
        await Zotero.DB.executeTransaction(async()=>{
          for(const item of state.items)if(!item.hasTag(tag)){item.addTag(tag);await item.save();}
        });
      }
      const extras = new Set(customCatalog[String(state.libraryID)] || []);
      extras.add(tag); customCatalog[String(state.libraryID)] = [...extras];
      if(!exists)categories[tag] = "其他"; saveConfigs();
      await updateNames(); search.value = ""; state.query = "";newInput.value='';
      refreshColumn();setStatus(state.items.length ? `已${exists?'添加已有标签':'创建并添加'}「${labelFor(tag)}」` : exists?'此标签已存在':'已创建标签');
    }
    function switchTab(next) {
      state.tab = next;
      applyTab.classList.toggle("active", next === "apply");
      manageTab.classList.toggle("active", next === "manage");
      note.textContent = next === "apply" ? "点击标签即可添加或移除，修改即时保存；可同时操作多篇论文。" : "直接选择颜色修改；「改名」会同步修改当前文库中使用该标签的论文。";
      renderList();
      setBusy(state.busy);
    }
    search.addEventListener("input", () => { state.query=search.value.trim(); renderList(); });
    applyTab.addEventListener("click", () => switchTab("apply"));
    manageTab.addEventListener("click", () => switchTab("manage"));
    createBar.addEventListener('submit',e=>{e.preventDefault();operation(create);});
    switchTab(state.tab);
  }

  return {start, stop, mount, unmount, open};
})();

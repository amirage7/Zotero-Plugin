/* Tag Studio bootstrap for Zotero 10.x (experimental). */
var tagStudioScope;

function install() {}
function uninstall() {}

async function startup({id, version, rootURI}) {
  tagStudioScope = { Zotero, Services, pluginID: id, rootURI };
  Services.scriptloader.loadSubScript(rootURI + "quick-tags.js", tagStudioScope);
  Services.scriptloader.loadSubScript(rootURI + "app.js", tagStudioScope);
  await tagStudioScope.TagStudio.start();
  // Plugins can start after the main Zotero window is already open.
  // Mount on existing windows as well as windows opened in the future.
  for (const window of Zotero.getMainWindows()) {
    tagStudioScope.TagStudio.mount(window);
  }
}

async function shutdown() {
  if (!tagStudioScope) return;
  try {
    await tagStudioScope.TagStudio.stop();
  } finally {
    tagStudioScope = null;
  }
}

function onMainWindowLoad({window}) {
  if (tagStudioScope) tagStudioScope.TagStudio.mount(window);
}

function onMainWindowUnload({window}) {
  if (tagStudioScope) tagStudioScope.TagStudio.unmount(window);
}

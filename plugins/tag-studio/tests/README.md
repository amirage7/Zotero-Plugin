# 构建和测试

## 离线回归

需要 Node.js，无需安装 npm 依赖。在插件目录 `plugins/tag-studio/` 执行：

```powershell
node tests/manifest.cjs
node tests/smoke.cjs
node tests/quick.cjs
node tests/zotero10.cjs
node tests/list-mode.cjs
```

## 生成安装包

在插件目录 `plugins/tag-studio/` 的 Windows PowerShell 中执行：

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

生成的 XPI 位于插件目录，版本号读取自 manifest.json。
插件的 dist/ 目录提供当前 v0.3.5 的可安装包。

`node tests/list-mode.cjs` 验证逐篇自适应行高、短标签与空行、调整列宽、顶部行保持、模式保存和禁用恢复。
`node tests/overflow-ui.cjs` 使用 Playwright 与本地 Edge 验证延迟插入的单元格、一行/两行排版、剩余数量和调整列宽。可通过 `TAGSTUDIO_PLAYWRIGHT` 指定 Playwright 模块路径。
实际 Zotero 测试还检查两行标签没有裁切、真实行高与虚拟滚动行高一致，以及重新打开工作台后的模式记忆。
`node tests/grouped-ui.cjs` 同样使用 Playwright 与本地 Edge，验证工作台分类分区、修改分类后立即移动和搜索过滤。

## 实际 Zotero 安装测试

需要 Windows、Python 3 和 Zotero 10.0.x。先构建 XPI，然后执行：

```powershell
$testProfile = python tests/setup-desktop.py
Start-Process 'C:\Program Files\Zotero\zotero.exe' -ArgumentList @('-no-remote','-profile',('"' + $testProfile.Trim() + '"')) -WindowStyle Hidden
```

若 Zotero 安装在其他目录，请修改可执行文件路径。
每次运行生成独立的空白 profile 和数据目录，避免使用个人文献库。
准备脚本自动写入当前仓库路径和插件版本，无需修改测试源码。

测试实例自动安装插件，检查工作台即时增删、新建标签、颜色、快捷菜单状态、PDF 阅读侧栏和禁用清理，完成后自动退出。
结果写入 tests/desktop/result.json；passed 为 true 表示通过，error 字段记录失败信息。
apply.png、manage.png、reader.png 为测试截图。生成的全部数据被 .gitignore 排除。

# 构建和测试

## 离线回归

需要 Node.js，无需安装 npm 依赖。在仓库根目录执行：

```powershell
node tests/manifest.cjs
node tests/smoke.cjs
node tests/quick.cjs
node tests/zotero10.cjs
```

## 生成安装包

在 Windows PowerShell 中执行：

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

生成的 XPI 位于仓库根目录，版本号读取自 manifest.json。
仓库 dist/ 目录提供当前 v0.3.1 的可安装包。

## 实际 Zotero 安装测试

需要 Windows、Python 3 和 Zotero 10.0.x。先构建 XPI，然后执行：

```powershell
$testProfile = python tests/setup-desktop.py
Start-Process 'C:\Program Files\Zotero\zotero.exe' -ArgumentList '-no-remote','-headless','-profile',('"' + $testProfile.Trim() + '"') -WindowStyle Hidden
```

若 Zotero 安装在其他目录，请修改可执行文件路径。
每次运行生成独立的空白 profile 和数据目录，避免使用个人文献库。
准备脚本自动写入当前仓库路径和插件版本，无需修改测试源码。

测试实例自动安装插件，检查工作台即时增删、新建标签、颜色、快捷菜单状态、PDF 阅读侧栏和禁用清理，完成后自动退出。
结果写入 tests/desktop/result.json；passed 为 true 表示通过，error 字段记录失败信息。
apply.png、manage.png、reader.png 为测试截图。生成的全部数据被 .gitignore 排除。

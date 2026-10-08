# Zotero Plugin Collection

这里集中维护我的 Zotero 插件。每个插件都有独立的源码、使用说明、安装包和测试，可分别安装和开发。

## 插件目录

| 插件 | 功能 | 版本 | Zotero 兼容版本 | 下载 |
| --- | --- | --- | --- | --- |
| [Tag Studio · 标签工作台](plugins/tag-studio/README.md) | 分类标签列、自适应行高、快捷勾选和 PDF 阅读侧栏 | 0.3.5 | 10.0.x | [XPI 安装包](plugins/tag-studio/dist/TagStudio-Zotero10-v0.3.5.xpi) |

后续插件会继续加入此目录，各插件的兼容版本和使用方法以自己的 README 为准。

## 仓库结构

```text
Zotero-Plugin/
├── README.md                 # 插件目录与仓库说明
├── .gitignore                # 各插件的临时文件排除规则
└── plugins/
    └── tag-studio/
        ├── README.md         # 插件使用与安装说明
        ├── manifest.json     # 插件版本与兼容声明
        ├── bootstrap.js
        ├── app.js
        ├── quick-tags.js
        ├── tag.svg
        ├── build.ps1         # 独立构建脚本
        ├── locale/           # 本地化文件
        ├── tests/            # 测试代码与测试说明
        ├── docs/             # 插件开发文档
        └── dist/             # 可安装的发行包
```

## 安装插件

1. 在上方插件目录选择插件，下载对应的 `.xpi` 文件，不要解压。
2. 在 Zotero 打开「工具 → 插件」，点击齿轮菜单中的「从文件安装插件」，选择 `.xpi`。
3. 使用方法和更新说明见该插件目录内的 README。

## 开发与新增插件

在 `plugins/<插件名称>/` 下维护每个插件，目录名称使用小写英文和连字符，例如 `tag-studio`。每个插件独立管理版本、兼容范围、构建脚本、测试和发行包；新增后在上方表格添加说明与下载链接。

进入对应插件目录后运行它的构建和测试命令。Tag Studio 的例子：

```powershell
cd plugins/tag-studio
powershell -ExecutionPolicy Bypass -File build.ps1
node tests/manifest.cjs
node tests/smoke.cjs
node tests/quick.cjs
node tests/zotero10.cjs
node tests/list-mode.cjs
```

实际 Zotero 安装测试步骤见 [Tag Studio 测试说明](plugins/tag-studio/tests/README.md)。

本地测试生成的 Zotero 数据库、个人配置、缓存和日志不提交到仓库。插件安装包保存在各插件自己的 `dist/` 目录。

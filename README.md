# Revision Studio

Revision Studio 是一个面向 IGCSE 的复习网站，也是 Computer Science 课程的 PBL 项目。它把考纲转成逐条复习卡片，并支持导入试题截图或 PDF，用 DeepSeek 生成答案、解析和考纲知识点关联。

## 项目目标

- 内置 Cambridge IGCSE Computer Science 0478：10 个主题、24 个章节、102 个考点。
- 用户可以上传 PDF、TXT、Markdown 或直接粘贴考纲，让模型定位正文、提取考点并生成复习卡片。
- 卡片包含原文重点词、笔记、结构化图示、复习进度和长考点分页。
- 用户可以导入题目与 MarkScheme，获得英文答案、中文解析、得分点、易错点和关联考点。
- 用户科目、进度、题目解析保存在当前浏览器；不需要服务器数据库。

## 快速开始

### 复习内置资料

直接打开：

```text
Review-studio/revision-studio.html
```

内置资料和页面脚本都在这个文件中。无需安装依赖，但公式和 PDF 读取需要联网加载 CDN 组件。

### 使用 DeepSeek

进入 `Review-studio` 后运行：

```powershell
$env:DEEPSEEK_API_KEY = "你的 Key"
python -B serve.py
```

打开 `http://localhost:8787/revision-studio.html`，在页面的“接口与模型”中选择“本地代理”。

也可以直接在网页里填写 Key。`serve.py` 只使用 Python 标准库，负责提供页面、转发模型请求和缓存完整响应，不包含本地大模型。

`-B` 会阻止 Python 在项目内生成 `__pycache__`。运行代理需要本机已安装 Python 3；若系统找不到 `python` 命令，可以尝试 `py -B serve.py`，或先安装 Python 并加入 PATH。

直接双击 HTML 时，浏览器可能拦截模型请求，因此 AI 功能推荐通过 `serve.py` 使用。

## 数据与隐私

- 科目、复习进度、配置和试题文字保存在浏览器 `localStorage`，键名为 `revstudio-proto-v1`。
- 题目原图单独保存在 IndexedDB `revstudio-originals`，不写入普通科目备份。
- 学习数据与浏览器、页面地址绑定。更换浏览器、文件地址或本地端口后可能看不到原数据。
- 建议使用页面“更多 → 备份全部”定期备份。备份不包含 API Key。
- 考纲文本、试题和必要上下文会发送到用户选择的模型接口。
- `serve.py` 会在 `Review-studio/.cache/` 缓存成功的模型响应；该目录可删除，不是用户存档。
- AI 测试的截图、临时 PDF 和日志统一放在根目录 `.ai-tmp/`，该目录被 Git 忽略。

## 使用流程

考纲复习：

```text
PDF/TXT/Markdown
  → PDF.js 或文本分页
  → AI 定位正文
  → 分段提取考点
  → 合并去重与原文编号核对
  → 补读缺失条目
  → 用户确认
  → 分批生成卡片
  → localStorage 保存并渲染
```

试题解析：

```text
题目与可选 MarkScheme
  → 图片/PDF 识别
  → 用户核对题号、公式和答案
  → 关联完整考纲考点
  → 生成答案、解析、得分点和易错点
  → 保存历史；原图单独写入 IndexedDB
```

## 运行文件与源码

`Review-studio/revision-studio.html` 是唯一运行入口，已经包含页面样式、脚本和内置资料。`serve.py` 只负责在本机提供这个页面并代理模型请求。

`Review-studio/src/` 是源码快照，按 HTML、CSS、JavaScript 和清单组织，不参与网页运行。项目原有的构建工具已经移除，因此修改 `src/` 不会自动更新最终 HTML；日常访问无需使用这个目录。

如需重新从源码构建，应以 Git 历史中的清理前版本为准，并避免覆盖当前运行文件。

## 已知限制

- PDF.js 只读取文字层，不支持扫描件 OCR；扫描 PDF 应改用清晰截图或粘贴文本。
- KaTeX 和 PDF.js 从 CDN 加载，离线时公式和 PDF 读取可能不可用。
- AI 补全的考点会标记“AI 补全”，仍应以官方考纲为准。
- 模型识别、答案和知识点匹配可能出错，重要公式与考试答案需要人工核对。
- 构建和自动化测试工具已移除；当前版本没有命令行回归测试。
- `localStorage` 有容量上限，大量科目或试题时应定期备份并清理不需要的数据。

## 安全约定

- 不要把 API Key、`api.txt`、备份文件或浏览器缓存提交到 Git。
- 不要将真实用户考纲、原题和解析放入 `.ai-tmp/` 后提交或公开。
- 分享码和备份不应包含 Key；原题图片不应写入 `localStorage`。

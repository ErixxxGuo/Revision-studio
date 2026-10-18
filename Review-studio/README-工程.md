# Revision Studio 工程说明

IGCSE 考纲复习网站，也是 PBL Assignment 项目。内置 Computer Science 0478 的 10 个主题、24 个章节、102 个考点；支持上传 PDF、TXT、Markdown、粘贴考纲，调用 DeepSeek 识别、核对考点并生成复习卡片。
现已增加试题截图/PDF 与 MarkScheme 导入、逐题解析、历史文件夹、考纲知识点跳转。导航栏顶部提供两种导入弹窗；题目按小题使用左右卡片与底部圆点切换，支持得分对齐、高光和原题图片预览；历史记录可在侧栏展开。原题图片单独保存在浏览器 IndexedDB，JSON 备份只包含文字与解析。使用与请求说明见 `试题功能说明.md`。

## 使用与维护

直接打开 `revision-studio.html` 可复习内置资料。AI 推荐运行 `python serve.py`，打开 `http://localhost:8787/revision-studio.html`，选择“本地代理”。API Key 可用 `DEEPSEEK_API_KEY` 环境变量提供。Python 仅使用标准库，不运行模型本身。

资料、进度、配置保存在浏览器 localStorage。考纲文本及必要上下文会发送到配置的模型接口。PDF.js、KaTeX 按需从 CDN 加载；不支持扫描 PDF OCR。更换浏览器、网址或端口前应备份。

在本目录运行：

```text
python -B build.py
python -B check.py
```

修改构建、清单、检查或恢复工具时加跑 `python -B tools/verify_structure.py`。`build.py --check` 只比对不写盘；`--against baseline/revision-studio.html` 用于纯结构整理；`--out 文件.html` 输出到指定位置，工作路径必须在本文件夹内。

## 目录与唯一来源

```text
Review-studio/
├── AGENTS.md                  AI 工作规则
├── README-工程.md             使用、维护与任务导航
├── 架构分析.md                当前架构与限制
├── revision-studio.html        交付产物，禁止手改
├── build.py                   清单驱动的字节拼接构建
├── check.py                   结构、自检、浏览器冒烟
├── serve.py                   页面服务、AI 代理、响应缓存
├── src/
│   ├── manifest.json           文件库存、顺序、历史区块映射
│   ├── head.html               head 开头、style 开始标签
│   ├── markup/                app.html、dialogs.html、wizard.html
│   ├── css/                   7 个样式文件、README-顺序.md
│   └── js/                    19 个功能文件（含 papers.js）
├── data/builtin.json           内置资料
├── baseline/revision-studio.html  原始基准，禁止日常修改
├── tools/
│   ├── split.py               显式恢复 baseline
│   └── verify_structure.py    8 项构建门禁与恢复验证
└── .cache/                    代理缓存，不是源码
```

31 个拼接源码 = head 1 + CSS 7 + HTML 3 + JS 19 + 数据 1。manifest 是额外构建配置，不计入上述数量。源码在 src/data，产物仍在原路径，保证用户打开方式及代理页面选择不变。

## 按任务定位

| 任务 | 位置（src/js/ 内省略前缀） |
|---|---|
| 主布局、卡片、首页、侧栏容器 | `src/markup/app.html` |
| 帮助、分享、导入弹窗 | `src/markup/dialogs.html` |
| 考纲/题目导入弹窗、上传与 PDF 读取 | `src/markup/wizard.html`、`wizard.js`、`papers.js` |
| 状态、存储、迁移、科目访问 | `state.js` |
| 接口、请求、重试、费用 | `api.js` |
| 五个提示词 | `prompts.js` |
| 本地大纲解析、原文索引、科目创建 | `outline.js` |
| 定位、提取、合并、核对、补读 | `identify.js` |
| 生成、补全、停止、续传 | `generate.js` |
| 首页、侧栏、科目操作 | `library.js` |
| 卡片、复习标记、快捷键 | `card.js` |
| 测量与分页 | `paging.js` |
| 分享、导入、备份 | `transfer.js` |
| 公共弹窗、更多菜单 | `overlays.js` |
| Markdown、公式、转义修复 | `markdown.js` |
| 重点词和内容格式 | `content.js` |
| 图标和结构化图示 | `visuals.js` |
| 外部数据清洗 | `schema.js` |
| 基础工具、启动 | `util.js`、`main.js` |
| 试题导入、识别、解析、历史、考纲关联 | `papers.js`、`src/css/papers.css` |
| 内置 Computer Science 资料 | `data/builtin.json` |

## 维护约定

1. 构建顺序只取 `src/manifest.json`，不按文件名排序。新增、重命名或删除源码须更新清单；未登记、缺失、重复文件会被拒绝。
2. 合并文件内的旧编号注释保留，检查器验证区块顺序；新增区块同步清单。
3. 提示词保持原 JS 字符串格式，注意换行和 LaTeX 反斜杠转义。修改后检查并人工核对。
4. HTML 仍是拼接片段。app 包含主布局；dialogs 打开公共 modal 外层，wizard 在末尾关闭它。
5. JS 仍拼为一个普通 script，共享全局作用域；不要直接加入 import/export。相关依赖见 AGENTS.md。
6. 不读取或复制 API Key 到文档、日志、产物。缓存及浏览器存储可能含用户资料，不能作为公开示例。

## 检查范围

试题功能当前交互、英文答案与中文解析、历史菜单、知识点匹配和重点词兼容规则见 `试题功能说明.md`。卡片底部元素与导入按钮由 `papers.css` 控制；侧栏父子间距在 `review.css`。本次未新增或拆分源码文件，manifest 顺序保持不变。

试题解析关联考纲时发送全部已识别小知识点的 ID 与完整原文；不发送生成笔记。`papers.js` 内负责旧公式显示修复及双卡分隔条（`S.paperSplit`）；普通复习卡片的 Markdown 渲染保持原实现。

检查文件库存、区块顺序、提示词、JSON、ID 及 DOM 引用、CSS/JS 括号和引号、产物一致性、代理页面选择。安装 Node 后自动执行 `node --check`。

默认使用本机 Edge/Chrome 无头模式确认首页和内置科目侧栏渲染。临时配置目录在项目内，结束后清理；`--no-browser` 可跳过。跳过、浏览器启动失败或缺少 Node 必须查看提示，不能当作验证通过。

真实 AI 接口、完整交互、手机视觉、内容学术准确性不在自动检查范围内。纯文件整理通过字节一致性证明运行代码和数据保持原样。

## 历史恢复

`python -B tools/split.py` 默认拒绝覆盖已有源码。当前清单含试题新区块，baseline 不含该功能，因此即使指定 `--force` 也会在写盘前拒绝恢复。禁止靠删除清单区块绕过保护。旧基准仅用于历史比较。

## 2026-10-10 整理记录

54 → 29，减少 25 个，约 46%。原运行代码、提示词、资料、CSS 顺序、存储键及代理实现保持原样。成品仍为 428774 字节，SHA256：

`21CCFEE209F728E707011EE02272ED1A103D6BAA6EA6CEB2A242E42FA0225AD9`

构建、静态检查、Edge 首页/侧栏冒烟及 8 项门禁/恢复验证通过。命令环境未找到 Node；真实 DeepSeek 请求未执行。
以上是整理时的历史记录。新增试题功能后，Node 已可用，整段脚本语法检查及 Edge 集成测试通过；HTML 已包含新功能，不再要求与旧 baseline 相同。当前测试与限制见 `试题功能说明.md`。

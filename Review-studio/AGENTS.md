# AI 工作规则

先读 `README-工程.md`，按任务查 `src/manifest.json` 和相关源码；样式任务读 `src/css/README-顺序.md`，架构任务读 `架构分析.md`。
试题功能任务阅读 `试题功能说明.md`。`papers.js` 包含导入弹窗、双卡片、清洗、提示词、识别、解析、历史和考纲链接；`papers.css` 负责这些界面与侧栏导入入口，复用原卡片和向导样式。
小题以整题下可选 `parts` 存储，旧记录按明确编号分页并保留整题解析；不静默覆盖旧答案。原题 JPEG 单独存 IndexedDB `revstudio-originals`，不得塞入 localStorage 或含 Key 的备份。高光只处理安全文本节点；不修改公式 HTML。

试题关联考纲时发送全部 `items` 的实际 ID 与完整考点原文，不筛选或截断，不发送生成笔记。试题专用 `paperMathText` / `paperMd` 仅修复显示中的旧公式，不改存储原文或普通卡片渲染；高光排除公式及泛词。左右卡片分隔条比例保存在 `S.paperSplit`，860px 及以下隐藏；改动需验证拖拽、键盘、复位、刷新及窄屏。

## 文件管理

- 只在用户指定的本文件夹内操作，测试临时文件也必须在项目内并清理。
- 修改 `src/`、`data/`，再构建；不手改 `revision-studio.html`，不修改 baseline。
- 文件库存与顺序唯一来源是 `src/manifest.json`。文件内部旧编号注释是历史区块标识，不是当前文件名。
- 复杂业务保持独立；小文件仅有独立职责时拆分，禁止纯按行数拆分。
- 不读取父目录 `api.txt`、真实用户资料或缓存来获取测试数据，不输出密钥。不擅自调用付费 AI。
- 不顺手修改范围外问题；事实与推测分开报告。

## 实现约束

这是共享全局作用域的原生 JS 单页应用，构建只做字节拼接。不得直接加入 import/export，或擅自更换框架、存储键、数据格式、接口协议。

`main.js` 绑定事件并启动；`state.js` 提供 S、保存及科目访问；`api.js` 读取 S.cfg，调用模型并统计费用。

`identify.js` 使用 prompts、outline、api 和 wizard UI 函数；`generate.js` 使用 prompts、api、schema，更新科目并触发渲染与保存。移动函数前查全部引用。

`wizard.js` 包含原 wizard 与 PDF 模块；`library.js` 包含侧栏与首页；`transfer.js` 包含分享与导入。`card.js` 汇总渲染，分页依赖 DOM 测量。

HTML 是拼接片段：主布局与解析结果容器在 `app.html`；`dialogs.html` 打开公共 modal 外层，`wizard.html` 包含 `bPaper` 和 `bNew` 并在末尾关闭它。弹窗面板统一用 `showBox` 切换。`PAPER.folders` 仅保存会话内目录展开状态，不修改历史数据格式。修改边界必须核对最终 HTML。

## 验证与汇报

日常运行 `python -B build.py` → `python -B check.py`。
试题变更加跑 `node tools/verify_papers.cjs`，开发依赖安装与测试边界见试题说明。模拟接口验证不能写成真实 DeepSeek 已验证。

修改构建、清单、检查或恢复工具时，加跑 `python -B tools/verify_structure.py`。

纯文件整理必须证明前后产物逐字节一致。功能修改以源码与新产物一致为准。不要运行 `tools/split.py --force` 来解决构建问题，它会覆盖源码并恢复旧版本。

如检查跳过，应明确报告。浏览器冒烟只证明首页和侧栏启动，不证明完整功能或视觉效果。

中文汇报，首行完成状态；短句要点，说明改动、验证与未验证范围。路径和命令保持原文。

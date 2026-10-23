# AI 工作规则

先读根目录 `README.md`。运行入口是 `revision-studio.html`；`src/` 和 `data/` 是源码快照。

## 文件与数据

- 只操作用户指定的工作文件夹。AI 临时文件统一放在根目录 `.ai-tmp/`，完成后清理。
- 不读取或输出 API Key、真实用户考纲、浏览器备份或缓存内容。不擅自调用付费 AI。
- 不修改浏览器 `localStorage`、IndexedDB 或用户备份；不要用真实用户档案做测试。
- 项目已移除构建和自动测试工具。修改 `src/` 不会自动更新 `revision-studio.html`。
- 修改最终 HTML 前必须有当前版本备份或 Git 提交。不要用旧 baseline 覆盖当前功能。
- 不顺手修改范围外问题；事实与推测分开报告。

## 实现约束

这是共享全局作用域的原生 JS 单页应用。不要直接加入 `import/export`，不要擅自更换框架、存储键、数据格式或接口协议。

`main.js` 绑定事件并启动；`state.js` 提供 `S`、保存和科目访问；`api.js` 调用模型并统计费用；`identify.js`、`generate.js`、`papers.js` 是三条主要业务流程。

原题图片只存 IndexedDB `revstudio-originals`，不得放入 localStorage 或含 Key 的备份。试题高光只处理安全文本节点，不修改公式 HTML。小题使用 `parts`，不得静默覆盖旧答案。

修改 `revision-studio.html` 时同步检查对应 `src/` 文件，或明确说明两者已不再自动同步。

## 验证与汇报

- 至少校验运行文件和用户数据未被意外改变。
- 可用 Node 对相关脚本做语法检查；临时脚本、截图和测试文件放在 `.ai-tmp/`。
- 没有自动化回归测试时明确写出“未验证”，不能把静态检查写成完整功能验证。
- 中文汇报，首行完成状态，说明改动、验证和未验证范围。

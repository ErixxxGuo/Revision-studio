# CSS 顺序与职责

样式顺序由 `src/manifest.json` 的 css 数组决定，不按文件名排序。原 11 个区块合并为 6 个文件，内部注释、字节和层叠顺序不变。
目前另有第 7 个文件 `papers.css`（区块 12-papers），在原样式之后加载，负责题目导入弹窗、核对、双卡片解析、历史目录与移动端布局。复用原 `panel`、`block`、`navr`、`d` 和向导 `stp`、`panes`、`btns`，通过局部选择器调整尺寸。

| 顺序 | 当前文件 | 原区块 | 职责 |
|---|---|---|---|
| 1 | content.css | 01-content | 内置手写资料 |
| 2 | base.css | 02-base | 变量、重置、全局元素 |
| 3 | review.css | 03-sidebar → 04-card → 05-notes → 06-genbar | 复习界面、导航、笔记、生成进度 |
| 4 | overlays.css | 07-modal | 公共弹窗、表单、按钮 |
| 5 | responsive.css | 08-responsive | 原移动端规则 |
| 6 | workspace.css | 09-wizard → 10-home → 11-share | 向导、首页、分享导入 |

responsive 仍在 workspace 之前，保留原样式效果。后续规则可能覆盖媒体查询；不能仅因“响应式文件应最后”就移动它。

在对应职责和历史区块内修改。新增或移动文件同步清单；旧编号注释用于区块检查，不决定当前文件名。运行 `python -B build.py`、`python -B check.py`；样式变更还需桌面与手机宽度视觉检查。

题目原图预览位于左卡底部，原评分标准位于右卡底部；侧栏历史记录使用可展开的行内操作菜单，避免滚动容器裁切浮层。顶部导入按钮的加号也由 `papers.css` 控制；章节及子项间距在 `review.css` 内原区块调整，保持层级间距有区别。

本文不进入产物。只有清单登记的 CSS 被拼接。

试题双卡使用三列 grid：左卡、20px 分隔条、右卡，列比例由 `papers.js` 写 CSS 变量。`papers.css` 控制分隔条拖拽外观，860px 及以下隐藏并恢复上下布局；不修改普通复习卡片的列定义。

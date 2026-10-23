<div align="center">

# Revision Studio

一个用于 IGCSE 考纲复习和试题解析的网页工具。

[![Single HTML](https://img.shields.io/badge/Runtime-single%20HTML-E34F26?style=flat-square)](#打开网站)
[![DeepSeek](https://img.shields.io/badge/AI-DeepSeek-4D6BFE?style=flat-square)](#启用-ai-功能)
[![Local storage](https://img.shields.io/badge/Data-local%20storage-2E7D32?style=flat-square)](#学习记录与备份)

</div>

Revision Studio 会把考纲整理成一张张复习卡片，标出原文重点，并为考点补充笔记和图示。你也可以导入试题和评分标准，查看英文答案、中文解析、得分点，以及题目对应的考纲知识点。

项目自带 Cambridge IGCSE Computer Science 0478，共 10 个主题、24 个章节、102 个考点。没有 API Key 也能直接复习这些内容；上传自己的考纲和解析试题需要连接 DeepSeek。

## 开始之前

| 使用方式 | 需要准备 |
|---|---|
| 只用内置的 Computer Science 资料 | Chrome 或 Edge |
| 上传考纲、生成卡片、解析试题 | 浏览器、Python 3、DeepSeek API Key、网络 |

下载项目并解压后，根目录最重要的文件是：

- `revision-studio.html`：网站入口。
- `serve.py`：连接 AI 时使用的本地服务。
- `README.md`：本文档。

## 打开网站

如果只想先体验内置资料：

1. 在 GitHub 页面点击 **Code → Download ZIP**。
2. 解压下载的文件。
3. 双击根目录中的 `revision-studio.html`。
4. 从左侧选择科目和章节，即可开始复习。

内置资料无需安装软件。公式显示和 PDF 读取需要联网加载对应组件。

## 启用 AI 功能

AI 功能需要 DeepSeek API Key，并会产生少量接口费用。可以先从内置资料开始，确认网站适合自己后再配置。

### 1. 获取 API Key

访问 [DeepSeek 开放平台](https://platform.deepseek.com/) 创建 API Key。

API Key 相当于账户密码，不要发给别人，也不要写进项目文件或上传到 GitHub。

### 2. 启动本地页面

在解压后的项目根目录中打开 PowerShell：

1. 打开文件资源管理器。
2. 点击窗口顶部的地址栏。
3. 输入 `powershell`，按回车。
4. 输入下面的命令：

```powershell
python -B serve.py
```

正常启动后，浏览器会打开：

```text
http://localhost:8787/revision-studio.html
```

如果没有自动打开，可以把上面的地址复制到 Chrome 或 Edge。使用结束后，在 PowerShell 窗口按 `Ctrl+C` 停止服务。

<details>
<summary><b>提示：系统找不到 python</b></summary>

安装 [Python 3](https://www.python.org/downloads/) 时勾选 **Add Python to PATH**，重新打开 PowerShell 后再运行。

Windows 也可以尝试：

```powershell
py -B serve.py
```

macOS 或 Linux 通常使用：

```bash
python3 -B serve.py
```

</details>

### 3. 连接 DeepSeek

1. 点击左侧的“导入考纲”。
2. 展开“接口与模型”。
3. 接口选择“本地代理”。
4. 模型填写 `deepseek-flash`。
5. 粘贴 API Key。
6. 点击“测试连接”。

连接成功后即可继续导入资料。

## 导入自己的考纲

1. 点击“导入考纲”。
2. 填写科目名称和简码；不确定时可以留空。
3. 上传 PDF、TXT、Markdown，或者直接粘贴考纲文字。
4. 如果知道正文页码范围，可以填写，减少等待时间和接口费用。
5. 点击“开始识别”。
6. 检查章节数、考点数和提取内容是否正确。
7. 确认无误后开始生成卡片。

AI 会帮助定位正文和整理结构，但卡片中的考点原文会保留。重要词汇会在原文中突出显示；模型补全的内容也会单独标注。

> PDF 需要带可选文字层。拍照或扫描版 PDF 无法直接读取时，请粘贴考纲文字。

## 解析试题

1. 点击“导入题目”。
2. 上传题目截图或 PDF。
3. 有评分标准时一起上传；没有也可以解析。
4. 检查识别出的题号、公式和答案是否对应。
5. 开始解析，然后逐题查看答案、步骤、得分点和关联考点。

解析过程中可以停止，之后继续。关联了考纲的题目，可以直接跳到对应复习卡片。

## 学习记录与备份

科目、复习进度和试题文字保存在当前浏览器中，项目没有额外的云端数据库。使用 AI 时，考纲、题目和必要上下文会发送到你选择的模型接口。

记录与浏览器和页面地址绑定。换浏览器、换端口或清除网站数据后，旧记录可能无法显示。长期使用建议每次结束前备份：

1. 点击左下角“更多”。
2. 选择“备份全部”。
3. 把文件保存到云盘或其他安全位置。

备份不含 API Key。题目原图保存在浏览器中，重要原题建议另外保留一份。

> 如果你一直通过 `http://localhost:8787` 使用网站，新版仍使用同一端口，浏览器中的学习记录仍在原来的本地存储中。不要随意更换端口。

## 常见问题

| 现象 | 处理方式 |
|---|---|
| 提示 `401` | API Key 不正确，重新复制或重新创建 |
| 提示 `402` | DeepSeek 账户余额不足 |
| 提示 `429` | 请求过于频繁，稍后再试 |
| 提示 `Failed to fetch` | 确认 `serve.py` 正在运行，并选择“本地代理” |
| PDF 没有提取到文字 | 文件可能是扫描件，粘贴文字后再试 |
| 以前的科目不见了 | 确认浏览器和访问地址没有变化，然后恢复备份 |
| 端口 8787 已被占用 | 关闭占用端口的程序；更换端口前先备份全部资料 |

## 注意事项

- AI 生成的笔记、答案和知识点关联可能出错，重要内容请对照官方考纲与评分标准。
- KaTeX 公式渲染和 PDF.js 文件读取需要联网。
- 当前不支持扫描件 OCR。
- 项目不会把学习记录写入服务器数据库，但调用 AI 时相关内容会发送到所选接口。

## 开发与维护

项目采用单文件运行方式，修改和维护前请阅读 [技术说明](workspace/TECHNICAL.md) 与 [AI 工作规则](workspace/AGENTS.md)。

`workspace/` 中保存源码和内置资料。它不是网页运行必需的目录，修改那里的文件也不会自动更新根目录的 `revision-studio.html`。

---

项目最初作为 Computer Science PBL Assignment 开发，目前继续用于日常复习和功能迭代。

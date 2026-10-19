# -*- coding: utf-8 -*-
"""
一次性工具：把 revision-studio.html 拆成 src/ 下的散件。

用法（在工作区根目录，也就是 revision-studio.html 所在目录，执行）：
    python tools/split.py
    python tools/split.py --force     src/ 里已经有散件时，强行用金标准重新生成

设计要点
--------
· 只读 baseline/revision-studio.html（金标准备份）。
  产物 revision-studio.html 一个字都不动。
· src/ 或 data/ 里已经有文件时拒绝执行：**这个脚本会覆盖散件，你在散件里的修改会丢**，
  确实要重来请显式加 --force。
· 每个切点都先用「锚点字符串出现次数 == 1」做断言，任何一处对不上就整体报错退出，
  一个文件也不写，绝不留下半成品。
· 纯字节切片：每个散件都是原文件里一段连续的字节，
  所以按同一顺序拼回去必然逐字节相同（脚本末尾会先自证一遍）。
· 内置数据单独拆成 data/builtin.json；提示词单独拆成 src/js/11-prompts/ 下的 6 个文件。
"""

import json
import os
import re
import sys

for _stream in (sys.stdout, sys.stderr):                 # Windows 控制台可能是老编码，宁可显示替代字符也不要中途报错
    try:
        _stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASELINE = os.path.join(ROOT, 'baseline', 'revision-studio.html')
SRC = os.path.join(ROOT, 'src')
DATA = os.path.join(ROOT, 'data')


def die(msg):
    sys.stderr.write('拆分失败：%s\n' % msg)
    sys.exit(1)


def guard():
    """src/ 或 data/ 里已经有东西时拒绝执行：本脚本会用金标准覆盖它们，
    也就是说你在散件里做过的修改会被丢掉，必须先显式加 --force。"""
    for d in (SRC, DATA):
        if os.path.isdir(d) and any(os.scandir(d)):
            if '--force' not in sys.argv[1:]:
                die('%s 里已经有文件了。本脚本会用金标准重新生成散件，'
                    '你在散件里做过的修改会全部丢失。确实要重来，请加 --force。' % os.path.relpath(d, ROOT))
    return


def once(text, anchor, where):
    """锚点在 text 里必须恰好出现 1 次，返回它的起始下标。"""
    n = text.count(anchor)
    if n != 1:
        die('%s 的锚点 %r 出现 %d 次（要求恰好 1 次）' % (where, anchor, n))
    return text.index(anchor)


def line_start(text, idx):
    return text.rfind('\n', 0, idx) + 1


def cut(text, points, where):
    """按一组升序切点把 text 切成 len(points)+1 段（points 是相对于 text 的下标）。"""
    out = []
    prev = 0
    for p in list(points) + [len(text)]:
        if p <= prev:
            die('%s 的切点不是严格递增（%d 紧随 %d）' % (where, p, prev))
        out.append(text[prev:p])
        prev = p
    return out


# ---------------------------------------------------------------- 读取金标准
guard()

if not os.path.isfile(BASELINE):
    die('找不到金标准备份 %s' % BASELINE)

with open(BASELINE, 'rb') as f:
    raw = f.read()
try:
    text = raw.decode('utf-8')
except UnicodeDecodeError as e:
    die('金标准不是合法 UTF-8：%s' % e)

if text != raw.decode('utf-8'):
    die('内部错误：往返解码不一致')

# ---------------------------------------------------------------- 顶层切分
i_style = once(text, '<style>', '全文')
i_css = i_style + len('<style>')

i_mid = once(text, '</style></head><body>', '全文')
i_body = i_mid + len('</style></head><body>')

i_script = once(text, '<script>', '全文')
i_js = i_script + len('<script>')

i_tail = once(text, '</script></body></html>', '全文')

head = text[:i_css]
css_region = text[i_css:i_mid]
body_region = text[i_body:i_script]
js_region = text[i_js:i_tail]
tail = text[i_tail:]

if tail != '</script></body></html>\n':
    die('文件结尾不是预期的 </script></body></html> + 换行，实际为 %r' % tail)

# ---------------------------------------------------------------- CSS：11 个模块
CSS_HEAD = re.compile(r'(?m)^/\*\*\n \* (\d\d) · \S+\.css ')
heads = [(m.start(), m.group(1)) for m in CSS_HEAD.finditer(css_region)]
if len(heads) != 11:
    die('CSS 模块头识别到 %d 个（要求 11 个）' % len(heads))
if [h[1] for h in heads] != ['%02d' % n for n in range(1, 12)]:
    die('CSS 模块编号不是连续的 01..11：%s' % [h[1] for h in heads])
if heads[0][0] != 2:
    die('第一个 CSS 模块头不在 css 区域第 2 个字节处（前面应当是空行）')
css_parts = cut(css_region, [h[0] for h in heads[1:]], 'CSS')

CSS_NAMES = ['01-content', '02-base', '03-sidebar', '04-card', '05-notes', '06-genbar',
             '07-modal', '08-responsive', '09-wizard', '10-home', '11-share']

# ---------------------------------------------------------------- 页面结构：11 个分块
# 每个锚点都是某个顶层元素的开头，必须是它在本区域里唯一一次出现
MARKUP_ANCHORS = [
    ('01-logo', '<svg width="0" height="0"'),
    ('02-sidebar', '<div id="shell">'),
    ('03-header', '<div id="content">'),
    ('04-card', '<main>'),
    ('05-footer', '<footer>'),
    ('06-home', '<section id="home"'),
    ('07-overlay', '<div id="scrim">'),
    ('08-share', '<div class="box" id="bShare"'),
    ('09-import', '<div class="box" id="bImp"'),
    ('10-newsheet', '<div class="box" id="bNew"'),
    ('11-newpanes', '<div class="panes" id="panes">'),
]
mp = []
for name, anchor in MARKUP_ANCHORS:
    mp.append(once(body_region, anchor, '页面结构中的 %s' % name))
if mp != sorted(mp) or mp[0] != 1:
    die('页面结构锚点顺序不对，或第一个锚点不在开头那个换行之后：%s' % mp)
markup_parts = cut(body_region, mp[1:], '页面结构')

# ---------------------------------------------------------------- JS：25 个模块
JS_HEAD = re.compile(r'(?m)^/\* =+ (\d\d-[0-9A-Za-z\-]+\.js) =+ \*/$')
marks = [(m.start(), m.group(1)) for m in JS_HEAD.finditer(js_region)]
if len(marks) != 25:
    die('JS 模块头识别到 %d 个（要求 25 个）' % len(marks))
expect_js = ['01-util', '02-markdown', '03-state', '04-content', '05-icons', '06-visuals',
             '07-schema', '08-paging', '09-cost', '10-api', '11-prompts', '12-outline',
             '13-source', '14-identify', '15-generate', '16-modal', '17-menu', '18-share',
             '19-import', '20-sidebar', '21-home', '22-card', '23-wizard', '24-pdf', '99-main']
got_js = [m[1][:-3] for m in marks]
if got_js != expect_js:
    die('JS 模块清单与预期不符：\n  实际 %s\n  预期 %s' % (got_js, expect_js))

# 内置数据在 01-util.js 之前，形式固定为 换行 + "var BUILTIN=" + JSON + ";\n\n"
builtin_block = js_region[:marks[0][0]]
PRE = '\nvar BUILTIN='
POST = ';\n\n'
if not builtin_block.startswith(PRE) or not builtin_block.endswith(POST):
    die('内置数据片段的前后缀与预期不符（开头 %r，结尾 %r）' %
        (builtin_block[:len(PRE) + 8], builtin_block[-8:]))
builtin_json = builtin_block[len(PRE):len(builtin_block) - len(POST)]
try:
    json.loads(builtin_json)
except ValueError as e:
    die('内置数据不是合法 JSON：%s' % e)

js_parts = cut(js_region[marks[0][0]:], [m[0] - marks[0][0] for m in marks[1:]], 'JS')
js_by_name = {name: js_parts[i] for i, name in enumerate(got_js)}

# 11-prompts.js 再拆成 6 个文件：模块头 + 5 个提示词
PR_ANCHORS = ['/* 生成提示词', '/* 第 1 步', '/* 第 2 步', '/* 核对后补读', '/* 生成阶段补全']
pr_text = js_by_name['11-prompts']
pr = []
for a in PR_ANCHORS:
    if pr_text.count(a) != 1:
        die('提示词切点 %r 在 11-prompts.js 里出现 %d 次' % (a, pr_text.count(a)))
    pr.append(line_start(pr_text, pr_text.index(a)))
if pr != sorted(pr) or pr[0] == 0:
    die('提示词切点顺序不对：%s' % pr)
pr_parts = cut(pr_text, pr, '提示词')
PR_NAMES = ['00-head', '10-sys', '20-loc', '30-ext', '40-repair', '50-fill']

# ---------------------------------------------------------------- 写盘
def w(path, s):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(s.encode('utf-8'))
    return len(s.encode('utf-8'))

n = 0
n += w(os.path.join(SRC, 'head.html'), head)
for name, part in zip(CSS_NAMES, css_parts):
    n += w(os.path.join(SRC, 'css', name + '.css'), part)
for (name, _), part in zip(MARKUP_ANCHORS, markup_parts):
    n += w(os.path.join(SRC, 'markup', name + '.html'), part)
for name in got_js:
    if name == '11-prompts':
        for pn, part in zip(PR_NAMES, pr_parts):
            n += w(os.path.join(SRC, 'js', '11-prompts', pn + '.js'), part)
    else:
        n += w(os.path.join(SRC, 'js', name + '.js'), js_by_name[name])
n += w(os.path.join(DATA, 'builtin.json'), builtin_json)

# ---------------------------------------------------------------- 自证：内存里拼回去
rebuilt = (head
           + ''.join(css_parts)
           + '</style></head><body>'
           + ''.join(markup_parts)
           + '<script>'
           + PRE + builtin_json + POST
           + ''.join(js_by_name[name] if name != '11-prompts' else ''.join(pr_parts) for name in got_js)
           + '</script></body></html>\n')
if rebuilt.encode('utf-8') != raw:
    die('自检失败：拼回去与金标准不一致（这是脚本自身的 bug，请勿采信任何产出）')

files = len(CSS_NAMES) + len(MARKUP_ANCHORS) + len(got_js) - 1 + len(PR_NAMES) + 2
print('拆分完成：%d 个散件，共 %d 字节，自检与金标准逐字节一致。' % (files, n))
print('  金标准   %s' % os.path.relpath(BASELINE, ROOT))
print('  散件目录 %s' % os.path.relpath(SRC, ROOT))
print('  内置数据 %s' % os.path.relpath(os.path.join(DATA, 'builtin.json'), ROOT))

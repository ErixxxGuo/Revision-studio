# -*- coding: utf-8 -*-
"""
自检脚本：装订结果对不对、散件有没有缺失、页面结构有没有被改坏、文案有没有跑偏。

用法（在本文件所在目录执行）：
    python check.py

退出码：0 = 全部通过（可能有提示）；1 = 有不通过项，必须修。

检查内容
--------
1 装订一致性   src/ 装订出的内容与 revision-studio.html 是否逐字节相同
2 源码清单     manifest.json 的文件库存、拼接顺序、历史区块与提示词
3 页面静态检查 重复 id、$('…') 引用是否有对应 id、<use href="#…"> 是否有对应图形
4 脚本语法     括号与引号配对；如果本机装了 node，再用 node --check 做权威语法检查
5 文案体检     半角标点紧邻汉字、直角引号、警告符号；与金标准对比，只报新增
6 渲染冒烟     用本机 Edge/Chrome 无头模式打开产物，确认首页与侧栏真的渲染出来了
               （默认执行；加 --no-browser 可跳过。用临时配置目录，不碰你的浏览器数据）
7 本地代理     serve.py 会不会提供当前这个成品（不会真的启动服务）
"""

import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True           # 别在目录里留 __pycache__

import build as B

HERE = os.path.dirname(os.path.abspath(__file__))
PRODUCT = os.path.join(HERE, 'revision-studio.html')
BASELINE = os.path.join(HERE, 'baseline', 'revision-studio.html')

FAIL = []
WARN = []
INFO = []


def fail(msg):
    FAIL.append(msg)


def warn(msg):
    WARN.append(msg)


def info(msg):
    INFO.append(msg)


def ok(msg):
    INFO.append('OK  ' + msg)


# ================================================================ 散件读取
def read(p):
    with open(p, 'rb') as f:
        return f.read()


def text(p):
    return read(p).decode('utf-8')


MANIFEST = B.source_manifest()
MARKUP_FILES = B.source_files('markup', MANIFEST)
CSS_FILES = B.source_files('css', MANIFEST)
JS_FILES = B.source_files('js', MANIFEST)
PROMPT_FILES = [os.path.join(HERE, 'src', 'js', 'prompts.js')]

MARKUP = ''.join(text(p) for p in MARKUP_FILES)
JS = ''.join(text(p) for p in JS_FILES)
CSS = ''.join(text(p) for p in CSS_FILES)


# ================================================================ 1 装订一致性
def check_build():
    try:
        blob = B.assemble()
        B.sanity(blob)
    except SystemExit:
        fail('装订失败：src/ 拼不出完整页面（细节见上面的报错）')
        return None
    if not os.path.isfile(PRODUCT):
        fail('找不到产物 %s' % os.path.relpath(PRODUCT, HERE))
        return None
    have = read(PRODUCT)
    if have == blob:
        ok('src/ 装订结果与 revision-studio.html 逐字节相同（%d 字节）' % len(blob))
    elif len(have) != len(blob):
        fail('产物与 src/ 不一致：产物 %d 字节，src/ 装订出 %d 字节。'
             '多半是改了 src/ 没重新装订，或手改了产物。' % (len(have), len(blob)))
    else:
        pos = next(i for i in range(len(blob)) if blob[i] != have[i])
        fail('产物与 src/ 不一致（长度相同，内容不同），第一处在第 %d 行。'
             % (have[:pos].count(b'\n') + 1))
    return blob


# ================================================================ 2 散件清单
def check_tree():
    B.source_manifest()
    for group, files in (('css', CSS_FILES), ('markup', MARKUP_FILES), ('js', JS_FILES)):
        ok('%s 源码 %d 个，库存与 manifest.json 一致' % (group, len(files)))
        if group == 'markup':
            continue
        for entry, path in zip(MANIFEST[group], files):
            src = text(path)
            if group == 'css':
                got = re.findall(r'^/\*\*\n \* (\d\d) · (\S+\.css) ', src, re.M)
                got = [number + '-' + name[:-4] for number, name in got]
            else:
                got = re.findall(r'^/\* =+ (\d\d-[0-9A-Za-z\-]+)\.js =+ \*/$', src, re.M)
            if got != entry['sections']:
                fail('%s 区块顺序不符：实际 %s；清单 %s' % (entry['file'], got, entry['sections']))
    for name in ('SYS', 'LOC', 'EXT_SYS', 'REPAIR_SYS', 'FILL_SYS'):
        if len(re.findall(r'\bvar\s+' + name + r'\s*=', text(PROMPT_FILES[0]))) != 1:
            fail('提示词 %s 缺失或重复' % name)
    ok('历史区块顺序与提示词检查已执行')
    try:
        json.loads(text(os.path.join(HERE, 'data', 'builtin.json')))
        ok('data/builtin.json 是合法 JSON')
    except ValueError as e:
        fail('data/builtin.json 不是合法 JSON：%s' % e)
    info('体量：CSS %d 字节 / 页面结构 %d 字节 / JS %d 字节 / 内置数据 %d 字节（共 %d 个源码文件）'
         % (len(CSS.encode()), len(MARKUP.encode()), len(JS.encode()),
            os.path.getsize(os.path.join(HERE, 'data', 'builtin.json')),
            len(CSS_FILES) + len(MARKUP_FILES) + len(JS_FILES) + 2))


# ================================================================ 3 页面静态检查
def check_dom():
    ids = re.findall(r'\bid="([^"]+)"', MARKUP)
    # JS 里用字符串拼出来的标记也算
    ids += re.findall(r'\bid="([^"]+)"', JS)
    ids += re.findall(r'\bid=\\"([^"\\]+)\\"', JS)

    dup = sorted({x for x in ids if ids.count(x) > 1})
    if dup:
        fail('id 重复：%s' % '、'.join(dup))
    else:
        ok('id 无重复（共 %d 个）' % len(ids))

    declared = set(ids)
    refs = set(re.findall(r'\$\(\'([^\']+)\'\)', JS)) | set(re.findall(r'getElementById\(\'([^\']+)\'\)', JS))
    refs |= set(re.findall(r'\$\(\'([^\']+)\'\)', MARKUP))
    missing = sorted(r for r in refs if r not in declared)
    if missing:
        fail('$(\'…\') 引用了不存在的 id：%s' % '、'.join(missing))
    else:
        ok('$(\'…\') 引用全部能找到对应 id（%d 处引用 / %d 个 id）' % (len(refs), len(declared)))

    # 标签的 for / aria-labelledby / aria-controls 指向的元素必须存在
    bad = []
    for attr in ('for', 'aria-labelledby', 'aria-controls'):
        for m in re.finditer(r'\b%s="([^"]+)"' % attr, MARKUP):
            for t in m.group(1).split():
                if t not in declared:
                    bad.append('%s="%s"' % (attr, t))
    if bad:
        fail('这些属性指向不存在的 id：%s' % '、'.join(sorted(set(bad))))
    else:
        ok('for / aria-labelledby / aria-controls 指向的 id 都存在')

    syms = set(re.findall(r'<symbol[^>]*\bid="([^"]+)"', MARKUP))
    use_all = re.findall(r'<use\s+href="#([^"]+)"', MARKUP) + re.findall(r'<use\s+href="#([^"]+)"', JS)
    uses = set(use_all)
    missing = sorted(u for u in uses if u not in syms)
    if missing:
        fail('<use href="#…"> 引用了不存在的图形：%s' % '、'.join(missing))
    else:
        ok('<use href="#…"> 引用的图形都在（%d 处引用，%d 个不同图形）' % (len(use_all), len(uses)))

    if CSS.count('{') != CSS.count('}'):
        fail('CSS 花括号不配对（{ %d 个，} %d 个）' % (CSS.count('{'), CSS.count('}')))
    else:
        ok('CSS 花括号配对（{ 共 %d 个，其中 @media 块 %d 个）'
           % (CSS.count('{'), CSS.count('@media')))


# ================================================================ 4 脚本语法
KEYWORDS_BEFORE_RE = {
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'case',
    'do', 'else', 'yield', 'await', 'throw',
}
REGEX_OK_BEFORE = set('(,=:[!&|?{};+-*%~^<>')


def scan_js(src, label):
    """扫 JS：报告括号/引号问题，并收集字符串字面量。
    返回 (issues, strings)；issues 是 (行, 列, 说明)，strings 是 (行, 值)。"""
    issues, strings = [], []
    stack = []
    i, n = 0, len(src)
    line, bol = 1, 0
    prev = ''          # 上一个有意义的字符
    word = ''          # 上一个标识符

    def loc(k):
        return line, k - bol + 1

    def note(k, msg):
        ln, col = loc(k)
        issues.append((ln, col, msg))

    while i < n:
        c = src[i]
        if c == '\n':
            line += 1
            bol = i + 1
            i += 1
            continue
        if c in ' \t\r':
            i += 1
            continue
        if src.startswith('//', i):
            j = src.find('\n', i)
            i = n if j < 0 else j + 1
            continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2)
            if j < 0:
                note(i, '块注释没有闭合')
                break
            line += src.count('\n', i, j)
            if src.count('\n', i, j):
                bol = src.rfind('\n', i, j) + 1
            i = j + 2
            continue
        if c in '\'"':
            q, j, closed = c, i + 1, False
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '\n':
                    break
                if src[j] == q:
                    closed = True
                    break
                j += 1
            if not closed:
                note(i, '字符串没有闭合')
                break
            strings.append((line, src[i + 1:j]))
            if src.count('\n', i, j):
                line += src.count('\n', i, j)
                bol = src.rfind('\n', i, j) + 1
            i = j + 1
            prev, word = q, ''
            continue
        if c == '`':
            j = i + 1
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '`':
                    break
                j += 1
            if j >= n:
                note(i, '反引号字符串没有闭合')
                break
            strings.append((line, src[i + 1:j]))
            if src.count('\n', i, j):
                line += src.count('\n', i, j)
                bol = src.rfind('\n', i, j) + 1
            i = j + 1
            prev, word = '`', ''
            continue
        if c == '/' and (prev == '' or prev in REGEX_OK_BEFORE or word in KEYWORDS_BEFORE_RE):
            j, in_class = i + 1, False
            while j < n:
                ch = src[j]
                if ch == '\\':
                    j += 2
                    continue
                if ch == '\n':
                    break
                if in_class:
                    if ch == ']':
                        in_class = False
                elif ch == '[':
                    in_class = True
                elif ch == '/':
                    break
                j += 1
            if j >= n or src[j] != '/':
                note(i, '正则字面量没有闭合')
                break
            j += 1
            while j < n and src[j].isalpha():
                j += 1
            i = j
            prev, word = '/', ''
            continue

        if not (c.isalnum() or c in '_$'):
            word = ''
        if c in '([{':
            stack.append((c, line, i - bol + 1))       # 位置要当场记下来：越到后面 bol 已经变了
        elif c in ')]}':
            pair = {')': '(', ']': '[', '}': '{'}[c]
            if not stack:
                note(i, '多出一个 %s（括号不配对）' % c)
            elif stack[-1][0] != pair:
                note(i, '这里的 %s 和第 %d 行的 %s 不配对' % (c, stack[-1][1], stack[-1][0]))
                stack.pop()
            else:
                stack.pop()
        elif c.isalpha() or c in '_$':
            word = (word + c) if word else c
        prev = c
        i += 1

    for ch, ln, col in stack:
        issues.append((ln, col, '%s 一直没有闭合（括号不配对）' % ch))
    if issues:
        info('（脚本扫描文件：%s）' % label)
    return issues, strings


def check_js():
    all_issues, all_strings = [], []
    for p in JS_FILES:
        iss, st = scan_js(text(p), os.path.relpath(p, HERE))
        rel = os.path.relpath(p, HERE)
        all_issues += [(rel, a, b, c) for a, b, c in iss]
        all_strings += st
    if all_issues:
        for rel, ln, col, msg in all_issues[:20]:
            fail('%s:%d:%d %s' % (rel, ln, col, msg))
        if len(all_issues) > 20:
            fail('……还有 %d 处脚本问题' % (len(all_issues) - 20))
    else:
        ok('括号与引号配对正常（%d 个 JS 文件：%d 个其他文件 + %d 个提示词文件）'
           % (len(JS_FILES), len(JS_FILES) - len(PROMPT_FILES), len(PROMPT_FILES)))

    # node 在的话做一次权威语法检查（原生 JS 引擎，比上面的扫描权威）
    try:
        subprocess.run(['node', '--version'], capture_output=True, check=True)
        has_node = True
    except (OSError, subprocess.CalledProcessError):
        has_node = False
    if not has_node:
        info('提示：本机没有 node，跳过 node --check（权威语法检查）；'
             '上面的括号扫描仍然有效，但查不出例如 "let x = ;" 这类语法错。')
        return all_strings

    fd, tmp = tempfile.mkstemp(suffix='.js', dir=HERE)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
            f.write(JS)
        r = subprocess.run(['node', '--check', tmp], capture_output=True)
        if r.returncode == 0:
            ok('node --check 通过（整段脚本语法正确）')
        else:
            lines = r.stderr.decode('utf-8', 'replace').strip().splitlines()
            fail('node --check 报错：%s' % (lines[-1] if lines else '(无输出)'))
    finally:
        os.remove(tmp)
    return all_strings


# ================================================================ 5 文案体检
LINT_RULES = [
    ('直角引号', re.compile(r'[「」『』]')),
    ('半角标点紧邻汉字', re.compile(r'[\u4e00-\u9fff][,;:!?]|[,;:!?][\u4e00-\u9fff]')),
    ('半角括号紧邻汉字', re.compile(r'[\u4e00-\u9fff]\(|\)[\u4e00-\u9fff]')),
    ('警告符号或 emoji', re.compile(r'[\u26a0\u203b\u2605\u2606\u2757\u2753\u2714\u274c]'
                                     r'|[\U0001F300-\U0001FAFF]')),
]


def lint_texts(markup, js_strings):
    """返回 [(规则, 片段)]；markup 是页面标记，js_strings 是 JS 字符串字面量。"""
    bodies = []
    plain = re.sub(r'<!--.*?-->', ' ', markup, flags=re.S)
    bodies += [t for t in re.split(r'<[^>]*>', plain) if t.strip()]
    for attr in ('title', 'aria-label', 'placeholder', 'alt'):
        bodies += re.findall(r'\b%s="([^"]*)"' % attr, plain)
    bodies += [s for _, s in js_strings if s.strip()]

    hits = []
    for body in bodies:
        for name, rx in LINT_RULES:
            for m in rx.finditer(body):
                a = max(0, m.start() - 14)
                hits.append((name, body[a:m.end() + 14].replace('\n', ' ')))
    return hits


def check_copy(js_strings):
    cur = lint_texts(MARKUP, js_strings)
    base_hits = set()
    if os.path.isfile(BASELINE):
        btxt = text(BASELINE)
        a = btxt.index('</style></head><body>') + len('</style></head><body>')
        b = btxt.index('<script>')
        c = btxt.index('</script></body></html>')
        bstrings = scan_js(btxt[b + len('<script>'):c], 'baseline/js')[1]
        base_hits = set(lint_texts(btxt[a:b], bstrings))
    new = [h for h in cur if h not in base_hits]
    if new:
        warn('文案体检发现 %d 处新问题（金标准里已有 %d 处，已忽略）：'
             % (len(new), len(base_hits)))
        for name, snippet in new[:12]:
            warn('  [%s] …%s…' % (name, snippet))
        if len(new) > 12:
            warn('  ……还有 %d 处' % (len(new) - 12))
    else:
        ok('文案体检没有新增问题（金标准里已有的 %d 处未计入）' % len(base_hits))


# ================================================================ 主流程
def check_serve():
    """确认 serve.py 找到的页面就是当前这个成品（只载入模块，不启动服务）。"""
    p = os.path.join(HERE, 'serve.py')
    if not os.path.isfile(p):
        info('提示：没有 serve.py，跳过本地代理检查。')
        return
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('rs_serve_for_check', p)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
    except Exception as e:
        warn('serve.py 没能载入（%s）；这不代表页面有问题。' % e)
        return
    want = os.path.basename(PRODUCT)
    if m.PAGE.name == want:
        ok('serve.py 提供的是当前成品（%s）' % want)
    else:
        fail('serve.py 会提供 %r，而不是 %r；在浏览器里打开的就不是当前这个文件。'
             % (m.PAGE.name, want))


BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]


def find_browser():
    for p in BROWSERS:
        if os.path.isfile(p):
            return p
    return None


def check_render(skip):
    """用无头浏览器打开产物，确认脚本真的跑起来并把界面渲染出来。
    只看「有没有渲染」这一件事，不判断样式，也不碰你的浏览器配置（用临时目录）。"""
    if skip:
        info('按要求跳过渲染冒烟测试（--no-browser）')
        return
    exe = find_browser()
    if not exe:
        info('提示：没找到 Edge/Chrome，跳过渲染冒烟测试。')
        return

    profile = tempfile.mkdtemp(prefix='rs-render-', dir=HERE)
    try:
        cmd = [exe, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
               '--virtual-time-budget=8000', '--user-data-dir=' + profile, '--dump-dom',
               pathlib.Path(PRODUCT).as_uri()]
        r = subprocess.run(cmd, capture_output=True, timeout=45)
    except (OSError, subprocess.TimeoutExpired) as e:
        warn('渲染冒烟测试没能执行（%s）；这不代表页面有问题。' % e)
        return
    finally:
        shutil.rmtree(profile, ignore_errors=True)

    dom = r.stdout.decode('utf-8', 'ignore')
    name = os.path.basename(exe)
    if r.returncode != 0 or not dom:
        fail('用 %s 打开产物失败（退出码 %s），页面没渲染出来。' % (name, r.returncode))
        return

    # 首页内容在源码里是空的（<div class="hm" id="hmBody"></div>），
    # 有内容就说明 homeRender() 真的跑过了；侧栏有科目行说明 side() 跑过了。
    m = re.search(r'<div class="hm" id="hmBody">(.*?)</div>\s*</section>', dom, re.S)
    if not m or 'hm-act' not in m.group(1):
        fail('首页没渲染出来（#hmBody 是空的），说明页面脚本启动时出错了。')
        return
    nav = re.search(r'<nav id="list"[^>]*>(.*?)</nav>', dom, re.S)
    if not nav or 'Computer Science' not in nav.group(1):
        fail('侧栏科目列表没渲染出来，说明页面脚本启动时出错了。')
        return
    ok('渲染冒烟通过（%s 无头打开：首页有内容、侧栏列出内置科目，DOM %d 字节）'
       % (name, len(dom.encode('utf-8'))))


def main():
    skip_browser = '--no-browser' in sys.argv[1:]
    print('=' * 72)
    print('Revision Studio 自检')
    print('=' * 72)

    check_build()
    check_tree()
    check_dom()
    strings = check_js()
    check_copy(strings)
    check_render(skip_browser)
    check_serve()

    for m in INFO:
        print('  ' + m)
    if WARN:
        print('-' * 72)
        for m in WARN:
            print('  提示  ' + m)
    if FAIL:
        print('-' * 72)
        for m in FAIL:
            print('  不通过  ' + m)
        print('=' * 72)
        print('结果：不通过 %d 项，请修完再提交。' % len(FAIL))
        return 1
    print('=' * 72)
    print('结果：全部通过%s。' % ('（有 %d 条提示）' % len(WARN) if WARN else ''))
    return 0


if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    sys.exit(main())

# -*- coding: utf-8 -*-
"""
装订脚本：把 src/ 下的散件拼回一份完整的 revision-studio.html。

用法（在本文件所在目录执行）：
    python build.py                        装订并覆盖 revision-studio.html
    python build.py --check                只检查：src/ 拼出来的内容和现有产物是否逐字节一致
    python build.py --against <文件>       和指定文件逐字节比对（验证拆分无损时用）
    python build.py --out <文件>           装订到别的路径（不碰产物）

顺序规则（不要改）
------------------
* CSS 与页面结构、JS 模块都按文件名排序拼接，文件名前缀 01..11 / 01..99 就是顺序。
  CSS 的顺序就是这个项目的层叠顺序，改了文件名等于改了样式优先级。
* 内置数据 data/builtin.json 固定插在 <script> 之后，包成 var BUILTIN=…;
* src/js/11-prompts/ 是目录，展开成 00-head.js、10-sys.js、20-loc.js、
  30-ext.js、40-repair.js、50-fill.js 依次拼接，合成提示词模块 11-prompts.js。

全过程只做字节拼接：不解析、不格式化、不改换行，所以「装订结果 == 拆分前的文件」
是可以逐字节证明的。
"""

import glob
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PRODUCT = os.path.join(HERE, 'revision-studio.html')
SRC = os.path.join(HERE, 'src')
BUILTIN = os.path.join(HERE, 'data', 'builtin.json')

GLUE_AFTER_CSS = b'</style></head><body>'
GLUE_BEFORE_JS = b'<script>'
GLUE_BUILTIN_PRE = b'\nvar BUILTIN='
GLUE_BUILTIN_POST = b';\n\n'
GLUE_TAIL = b'</script></body></html>\n'

EXPECT_CSS = 11
EXPECT_MARKUP = 11
EXPECT_JS = ['01-util.js', '02-markdown.js', '03-state.js', '04-content.js', '05-icons.js',
             '06-visuals.js', '07-schema.js', '08-paging.js', '09-cost.js', '10-api.js',
             '11-prompts', '12-outline.js', '13-source.js', '14-identify.js', '15-generate.js',
             '16-modal.js', '17-menu.js', '18-share.js', '19-import.js', '20-sidebar.js',
             '21-home.js', '22-card.js', '23-wizard.js', '24-pdf.js', '99-main.js']
EXPECT_PROMPTS = ['00-head.js', '10-sys.js', '20-loc.js', '30-ext.js', '40-repair.js', '50-fill.js']


def die(msg):
    sys.stderr.write('装订失败：%s\n' % msg)
    sys.exit(1)


def read(path):
    try:
        with open(path, 'rb') as f:
            return f.read()
    except OSError as e:
        die('读不到 %s（%s）' % (os.path.relpath(path, HERE), e))


def listdir(path):
    try:
        return sorted(os.listdir(path))
    except OSError as e:
        die('读不到目录 %s（%s）' % (os.path.relpath(path, HERE), e))


def js_entries():
    """src/js 下的顶层条目，按文件名排序（目录也算一个条目，如 11-prompts）。"""
    base = os.path.join(SRC, 'js')
    return [n for n in listdir(base) if n.endswith('.js') or os.path.isdir(os.path.join(base, n))]


def js_order():
    """按拼接顺序列出所有 JS 文件；目录（目前只有 11-prompts）展开成里面的文件。"""
    out = []
    base = os.path.join(SRC, 'js')
    for name in js_entries():
        p = os.path.join(base, name)
        if os.path.isdir(p):
            out.extend(os.path.join(p, sub) for sub in listdir(p) if sub.endswith('.js'))
        else:
            out.append(p)
    return out


def assemble():
    css = sorted(glob.glob(os.path.join(SRC, 'css', '*.css')))
    markup = sorted(glob.glob(os.path.join(SRC, 'markup', '*.html')))
    js = js_order()
    entries = js_entries()

    if len(css) != EXPECT_CSS:
        die('src/css 下有 %d 个文件，要求 %d 个' % (len(css), EXPECT_CSS))
    if len(markup) != EXPECT_MARKUP:
        die('src/markup 下有 %d 个文件，要求 %d 个' % (len(markup), EXPECT_MARKUP))

    if entries != EXPECT_JS:
        die('JS 模块清单与预期不符：\n  实际 %s\n  预期 %s' % (entries, EXPECT_JS))
    prompts = [os.path.basename(p) for p in js if os.path.basename(os.path.dirname(p)) == '11-prompts']
    if prompts != EXPECT_PROMPTS:
        die('提示词清单与预期不符：%s' % prompts)

    builtin = read(BUILTIN)
    try:
        json.loads(builtin.decode('utf-8'))
    except (UnicodeDecodeError, ValueError) as e:
        die('data/builtin.json 不是合法 JSON：%s' % e)

    out = b''
    out += read(os.path.join(SRC, 'head.html'))
    out += b''.join(read(p) for p in css)
    out += GLUE_AFTER_CSS
    out += b''.join(read(p) for p in markup)
    out += GLUE_BEFORE_JS
    out += GLUE_BUILTIN_PRE + builtin + GLUE_BUILTIN_POST
    out += b''.join(read(p) for p in js)
    out += GLUE_TAIL
    return out


def sanity(blob):
    """最基本的完整性门禁：宁可拒绝装订，也不要把半成品写成产物。"""
    checks = [
        (blob.startswith(b'<!DOCTYPE html>'), '开头不是 <!DOCTYPE html>'),
        (blob.endswith(b'</script></body></html>\n'), '结尾不是 </script></body></html>'),
        (blob.count(b'<style>') == 1 and blob.count(b'</style>') == 1, '<style> 数量不对'),
        (blob.count(b'<script>') == 1 and blob.count(b'</script>') == 1, '<script> 数量不对'),
        (blob.count(b'\nvar BUILTIN=') == 1, '内置数据锚点数量不对'),
        (b'main();' in blob, '找不到 main(); 启动调用'),
        (len(blob) > 300000, '整体太小，疑似散件缺失（当前 %d 字节）' % len(blob)),
    ]
    for ok, why in checks:
        if not ok:
            die('完整性检查未通过：%s' % why)


def main(argv):
    mode_check = '--check' in argv
    against = None
    out_path = PRODUCT
    if '--against' in argv:
        i = argv.index('--against')
        if i + 1 >= len(argv):
            die('--against 后面要跟一个文件路径')
        against = os.path.abspath(argv[i + 1])
    if '--out' in argv:
        i = argv.index('--out')
        if i + 1 >= len(argv):
            die('--out 后面要跟一个文件路径')
        out_path = os.path.abspath(argv[i + 1])

    blob = assemble()
    sanity(blob)

    if mode_check or against:
        target = against or PRODUCT
        if not os.path.isfile(target):
            die('找不到要比对的文件 %s' % target)
        have = read(target)
        name = os.path.relpath(target, HERE)
        if have == blob:
            print('一致：src/ 装订出的内容与 %s 逐字节相同（%d 字节）。' % (name, len(blob)))
            return 0
        if len(have) != len(blob):
            print('不一致：%s 有 %d 字节，src/ 装订出 %d 字节，相差 %d。'
                  % (name, len(have), len(blob), len(blob) - len(have)))
        else:
            pos = next(i for i in range(len(blob)) if blob[i] != have[i])
            line = have[:pos].count(b'\n') + 1
            print('不一致：%s 与 src/ 装订结果长度相同但内容不同，第一处在第 %d 行（第 %d 字节）。'
                  % (name, line, pos))
        return 1

    if os.path.isfile(out_path) and read(out_path) == blob:
        print('产物已是当前内容，无需改写：%s（%d 字节）' % (os.path.relpath(out_path, HERE), len(blob)))
        return 0

    d = os.path.dirname(out_path) or '.'
    fd, tmp = tempfile.mkstemp(prefix='.build-', dir=d)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(blob)
        os.replace(tmp, out_path)                     # 原子替换，不会留下写了一半的文件
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    print('已装订：%s（%d 字节）' % (os.path.relpath(out_path, HERE), len(blob)))
    return 0


if __name__ == '__main__':
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    sys.exit(main(sys.argv[1:]))

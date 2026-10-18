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
* src/manifest.json 是文件与拼接顺序的唯一来源，不按文件名排序。
  sections 记录文件内保留的历史区块，供检查和 baseline 恢复工具使用。
* 内置数据 data/builtin.json 固定插在 <script> 之后，包成 var BUILTIN=…;
* 五个提示词与原模块头统一保存在 src/js/prompts.js。

全过程只做字节拼接：不解析、不格式化、不改换行，所以「装订结果 == 拆分前的文件」
是可以逐字节证明的。
"""

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

MANIFEST = os.path.join(SRC, 'manifest.json')


def die(msg):
    sys.stderr.write('装订失败：%s\n' % msg)
    sys.exit(1)


def read(path):
    try:
        with open(path, 'rb') as f:
            return f.read()
    except OSError as e:
        die('读不到 %s（%s）' % (os.path.relpath(path, HERE), e))


def source_manifest():
    """检查清单和源码库存，防止新增文件未进入产物或旧文件被重复使用。"""
    try:
        manifest = json.loads(read(MANIFEST).decode('utf-8'))
    except (UnicodeDecodeError, ValueError) as e:
        die('src/manifest.json 不是合法 JSON：%s' % e)
    if not isinstance(manifest, dict) or manifest.get('version') != 1:
        die('源码清单版本无效')
    for group, ext in (('css', '.css'), ('markup', '.html'), ('js', '.js')):
        entries = manifest.get(group)
        if not isinstance(entries, list) or not entries:
            die('%s 清单为空或格式有误' % group)
        names, sections = [], []
        for entry in entries:
            if not isinstance(entry, dict):
                die('%s 清单条目格式有误' % group)
            name, blocks = entry.get('file'), entry.get('sections')
            if (not isinstance(name, str) or not name.endswith(ext)
                    or '/' in name or '\\' in name or ':' in name or name.startswith('.')):
                die('%s 清单文件名无效：%r' % (group, name))
            if not isinstance(blocks, list) or not blocks or any(not isinstance(b, str) or not b for b in blocks):
                die('%s 的历史区块清单无效' % name)
            names.append(name)
            sections.extend(blocks)
        if len(set(names)) != len(names) or len(set(sections)) != len(sections):
            die('%s 清单有重复文件或区块' % group)
        base = os.path.join(SRC, group)
        actual = []
        for folder, _, files in os.walk(base):
            actual.extend(os.path.relpath(os.path.join(folder, n), base).replace(os.sep, '/')
                          for n in files if n.endswith(ext))
        if sorted(actual) != sorted(names):
            die('%s 源码库存与清单不符：缺失 %s；未登记 %s' %
                (group, sorted(set(names) - set(actual)), sorted(set(actual) - set(names))))
    return manifest


def source_files(group, manifest=None):
    manifest = manifest if manifest is not None else source_manifest()
    return [os.path.join(SRC, group, e['file']) for e in manifest[group]]


def js_order():
    return source_files('js')


def assemble():
    manifest = source_manifest()
    css = source_files('css', manifest)
    markup = source_files('markup', manifest)
    js = source_files('js', manifest)

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

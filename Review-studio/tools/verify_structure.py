"""验证构建门禁与 baseline 恢复；所有测试副本、浏览器配置均在项目目录内。"""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
for stream in (sys.stdout, sys.stderr):
    stream.reconfigure(encoding='utf-8', errors='replace')
ROOT = Path(__file__).resolve().parents[1]


def run(folder, script, *args, success=True):
    result = subprocess.run([sys.executable, '-B', script, *args], cwd=folder,
                            capture_output=True, timeout=45)
    if (result.returncode == 0) != success:
        raise AssertionError(result.stdout.decode('utf-8', 'replace')
                             + result.stderr.decode('utf-8', 'replace'))


def main():
    with tempfile.TemporaryDirectory(prefix='.verify-', dir=ROOT) as tmp:
        folder = Path(tmp)
        for name in ('src', 'data', 'baseline'):
            shutil.copytree(ROOT / name, folder / name)
        (folder / 'tools').mkdir()
        shutil.copy2(ROOT / 'tools/split.py', folder / 'tools/split.py')
        for name in ('build.py', 'check.py', 'serve.py', 'revision-studio.html'):
            shutil.copy2(ROOT / name, folder / name)
        run(folder, 'check.py', '--no-browser')
        print('PASS: 正常清单及静态自检')

        path = folder / 'src/js/util.js'
        original = path.read_bytes()
        path.unlink()
        run(folder, 'build.py', '--check', success=False)
        path.write_bytes(original)
        print('PASS: 缺失源码被拦截')

        extra = folder / 'src/js/unregistered.js'
        extra.write_text('var unused = 1;', encoding='utf-8')
        run(folder, 'build.py', '--check', success=False)
        extra.unlink()
        print('PASS: 未登记源码被拦截')

        path = folder / 'src/manifest.json'
        original = path.read_bytes()
        manifest = json.loads(original)
        manifest['js'][0], manifest['js'][1] = manifest['js'][1], manifest['js'][0]
        path.write_text(json.dumps(manifest), encoding='utf-8')
        run(folder, 'build.py', '--check', success=False)
        path.write_bytes(original)
        print('PASS: 拼接顺序漂移被拦截')

        manifest = json.loads(original)
        manifest['js'][0]['file'] = '../outside.js'
        path.write_text(json.dumps(manifest), encoding='utf-8')
        run(folder, 'build.py', '--check', success=False)
        path.write_bytes(original)
        print('PASS: 清单越界路径被拦截')

        path = folder / 'src/js/prompts.js'
        original = path.read_bytes()
        path.write_bytes(original.replace(b'var FILL_SYS', b'var MISSING_SYS', 1))
        run(folder, 'build.py')
        run(folder, 'check.py', '--no-browser', success=False)
        path.write_bytes(original)
        run(folder, 'build.py')
        print('PASS: 重新构建后仍能发现提示词缺失')

        path = folder / 'src/js/util.js'
        original = path.read_bytes()
        path.write_bytes(original + b'\nfunction broken() {\n')
        run(folder, 'build.py')
        run(folder, 'check.py', '--no-browser', success=False)
        path.write_bytes(original)
        run(folder, 'build.py')
        print('PASS: 重新构建后仍能发现 JS 括号损坏')

        run(folder, 'tools/split.py', success=False)
        before = {str(p.relative_to(folder)): p.read_bytes() for p in (folder / 'src').rglob('*') if p.is_file()}
        run(folder, 'tools/split.py', '--force', success=False)
        after = {str(p.relative_to(folder)): p.read_bytes() for p in (folder / 'src').rglob('*') if p.is_file()}
        assert before == after, 'baseline 不兼容时恢复工具修改了源码'
        print('PASS: 旧 baseline 不含新试题区块，显式恢复被拒绝且源码不变')
    print('结果：8 项通过，测试副本已清理。')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Revision Studio 本地服务（只用标准库，仅监听 127.0.0.1）。

用法:  python serve.py        (Mac/Linux 也可以 python3 serve.py)
启动后会自动打开浏览器；接口选「本地代理」。

页面和 /api/* 同源，所以不会有浏览器跨域问题；/api/xxx 会被转发到 UPSTREAM/xxx。

磁盘缓存：完全相同的请求（同一个模型、同样的提示词和内容）第二次直接读本地文件，
不再调用 AI，也不再收费，响应头带 X-Cache: HIT。只缓存「正常结束、内容是合法 JSON」的响应，
被截断的、坏掉的结果不会缓存，所以重试不会一直拿到同一份坏数据。
页面上的「重新生成」「重新识别」会带 X-No-Cache 头，跳过读取缓存并用新结果覆盖。
缓存放在脚本旁边的 .cache 文件夹里，不想要可以直接删掉这个文件夹。

安全：只接受来自 localhost / 127.0.0.1 页面的请求。别的网站（即使你同时开着）无法借这个代理调用你的 Key，
也无法通过 DNS 重绑定读取这里的内容。只提供页面本身，不提供脚本所在目录里的其它文件。

环境变量（都可选）:
  UPSTREAM          上游地址，默认 https://api.deepseek.com（用 Ollama 可设为 http://localhost:11434/v1）
  DEEPSEEK_API_KEY  页面没填 Key 时由这里补上，Key 就不必存进浏览器
  PORT              端口，默认 8787。注意：换端口后浏览器会把它当成另一个网站，之前保存的科目看不到，
                    换之前请先在页面里「备份全部」。
  NO_BROWSER        设为 1 则不自动打开浏览器
  NO_CACHE          设为 1 则关闭磁盘缓存
"""
import base64, glob, gzip, hashlib, json, os, sys, threading
import urllib.error, urllib.parse, urllib.request, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# build.py --pack 打包时把页面（gzip + base64）写在下一行；开发时为 None，页面从磁盘上找
EMBEDDED_PAGE = None

# ---------------------------------------------------------------- 配置
UPSTREAM = os.environ.get('UPSTREAM', 'https://api.deepseek.com').rstrip('/')
API_KEY = os.environ.get('DEEPSEEK_API_KEY', '').strip()
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_BODY = 4 * 1024 * 1024       # 单次请求体上限，足够放下一批大纲
UPSTREAM_TIMEOUT = 600           # 秒。思考模式或一次读很长的考纲时，上游可能要几分钟
USE_CACHE = os.environ.get('NO_CACHE') != '1'
CACHE_DIR = os.path.join(HERE, '.cache')
CACHE_MAX = 4000                 # 最多保留的缓存文件数，超出时删最旧的
LOCAL_HOSTS = ('localhost', '127.0.0.1')
PAGE_NAME = 'revision-studio.html'


# ---------------------------------------------------------------- 页面
class Page:
    """要提供的页面：打包版从内嵌数据读取；开发时在脚本旁（或 dist/）找 revision-studio*.html，每次请求都重新读磁盘。"""

    def __init__(self):
        self._embedded = gzip.decompress(base64.b64decode(EMBEDDED_PAGE)) if EMBEDDED_PAGE else None
        self.path = None if self._embedded else self._find()
        self.name = PAGE_NAME if self._embedded else (os.path.basename(self.path) if self.path else '')

    @staticmethod
    def _find():
        """下载的文件可能叫 revision-studio (1).html，取最短的那个名字。"""
        for folder in (HERE, os.path.join(HERE, 'dist')):
            names = sorted(glob.glob(os.path.join(folder, 'revision-studio*.html')), key=len)
            if names:
                return names[0]
        names = sorted(glob.glob(os.path.join(HERE, '*.html')))
        return names[0] if names else None

    def read(self):
        if self._embedded is not None:
            return self._embedded
        with open(self.path, 'rb') as f:
            return f.read()


# ---------------------------------------------------------------- 磁盘缓存
class DiskCache:
    """键 = 上游地址 + 接口路径 + 请求体（不含 Authorization，所以换 Key 不影响命中）。"""

    def __init__(self, folder, limit):
        self.folder, self.limit, self._lock = folder, limit, threading.Lock()

    @staticmethod
    def key(path, body):
        h = hashlib.sha256()                 # 必须与旧版逐字节一致，否则用户已有的 .cache 全部失效（请求体后面没有分隔符）
        h.update(UPSTREAM.encode())
        h.update(b'\0')
        h.update(path.encode())
        h.update(b'\0')
        h.update(body)
        return h.hexdigest()

    def get(self, key):
        try:
            with open(os.path.join(self.folder, key + '.json'), 'rb') as f:
                return f.read()
        except OSError:
            return None

    def put(self, key, data):
        try:
            os.makedirs(self.folder, exist_ok=True)
            tmp = os.path.join(self.folder, '%s.%d.tmp' % (key, threading.get_ident()))
            with open(tmp, 'wb') as f:
                f.write(data)
            os.replace(tmp, os.path.join(self.folder, key + '.json'))   # 原子替换，不会读到写了一半的文件
            self._trim()
        except OSError as e:
            sys.stderr.write('  (缓存写入失败：%s)\n' % e)

    def _trim(self):
        with self._lock:
            names = [n for n in os.listdir(self.folder) if n.endswith('.json')]
            if len(names) <= self.limit:
                return
            names.sort(key=lambda n: os.path.getmtime(os.path.join(self.folder, n)))
            for n in names[:len(names) - self.limit + 200]:
                try:
                    os.remove(os.path.join(self.folder, n))
                except OSError:
                    pass


def is_cacheable(request_body, response_data):
    """只有「正常结束 + 有内容 + （JSON 模式下）内容真是合法 JSON」的响应才值得缓存。"""
    try:
        choice = (json.loads(response_data).get('choices') or [None])[0]
        if not choice or choice.get('finish_reason') == 'length':
            return False
        content = (choice.get('message') or {}).get('content')
        if not isinstance(content, str) or not content.strip():
            return False
        try:
            wants_json = (json.loads(request_body).get('response_format') or {}).get('type') == 'json_object'
        except Exception:
            wants_json = False
        if wants_json:
            json.loads(content)              # 不是合法 JSON 就抛异常，不缓存
        elif '{' not in content:             # 思考模式没有 JSON 模式，至少要像是 JSON
            return False
        return True
    except Exception:
        return False


def usage_line(data):
    try:
        u = json.loads(data).get('usage') or {}
        hit = u.get('prompt_cache_hit_tokens') or 0
        return '输入 %s%s · 输出 %s tokens' % (u.get('prompt_tokens', '?'), '（缓存命中 %s）' % hit if hit else '', u.get('completion_tokens', '?'))
    except Exception:
        return ''


# ---------------------------------------------------------------- HTTP
PAGE = Page()
CACHE = DiskCache(CACHE_DIR, CACHE_MAX) if USE_CACHE else None


def json_bytes(obj):
    return json.dumps(obj, ensure_ascii=False).encode()


class Handler(BaseHTTPRequestHandler):
    # ---- 基础
    def log_message(self, fmt, *args):
        msg = fmt % args                     # 只打印接口请求和错误，静态文件不刷屏
        if '/api/' in msg or ' 4' in msg or ' 5' in msg:
            sys.stderr.write('  %s\n' % msg)

    def _local_only(self):
        """Host 必须是本机（防 DNS 重绑定）；带 Origin 的请求，Origin 也必须是本机（防别的网站跨站调用）。
        没有 Origin 的请求（curl、脚本）放行。"""
        if (self.headers.get('Host') or '').split(':')[0].lower() not in LOCAL_HOSTS:
            return False
        origin = self.headers.get('Origin')
        if origin is None:
            return True
        try:
            return (urllib.parse.urlsplit(origin).hostname or '').lower() in LOCAL_HOSTS
        except ValueError:
            return False

    def _reply(self, code, data, content_type='application/json; charset=utf-8', headers=None):
        try:
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            for k, v in (headers or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass                             # 页面已关闭或点了「停止」，忽略

    # ---- 页面
    def do_GET(self):
        if not self._local_only():
            return self.send_error(403)
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if not PAGE.name:
            return self.send_error(404)
        if path in ('/', ''):                # 直接访问 http://localhost:端口/ 时跳到页面
            return self._reply(302, b'', 'text/plain', {'Location': '/' + urllib.parse.quote(PAGE.name), 'Cache-Control': 'no-store'})
        if path == '/' + PAGE.name:
            return self._reply(200, PAGE.read(), 'text/html; charset=utf-8', {'Cache-Control': 'no-store'})   # 页面更新后浏览器不要用旧缓存
        return self.send_error(404)

    # ---- 接口代理
    def do_POST(self):
        if not self.path.startswith('/api/'):
            return self.send_error(404)
        if not self._local_only() or (self.headers.get('Content-Type') or '').split(';')[0].strip().lower() != 'application/json':
            # 非 JSON 的请求是浏览器不做跨域预检的「简单请求」，正是跨站滥用的入口
            return self._reply(403, json_bytes({'error': '只接受来自本机页面的 JSON 请求'}))
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = -1
        if length < 0:
            return self._reply(400, json_bytes({'error': 'Content-Length 无效'}))
        if length > MAX_BODY:
            self._drain(length)              # 先把数据读掉再回复，否则浏览器会看到「网络错误」而不是这条提示
            self.close_connection = True
            return self._reply(413, json_bytes({'error': '请求太大（超过 4MB），请在页面里填页码范围缩小'}))
        self._proxy(self.path[4:], self.rfile.read(length))

    def _drain(self, length):
        left = min(length, 64 * 1024 * 1024)
        while left > 0:
            chunk = self.rfile.read(min(65536, left))
            if not chunk:
                break
            left -= len(chunk)

    def _proxy(self, sub, body):
        fresh = self.headers.get('X-No-Cache') == '1'
        key = CACHE.key(sub, body) if CACHE else None
        if key and not fresh:
            data = CACHE.get(key)
            if data is not None:
                sys.stderr.write('  POST %s → 命中本地缓存（免费）\n' % sub)
                return self._reply(200, data, headers={'X-Cache': 'HIT'})
        auth = self.headers.get('Authorization') or ('Bearer ' + API_KEY if API_KEY else '')
        headers = {'Content-Type': 'application/json'}
        if auth:
            headers['Authorization'] = auth
        try:
            r = urllib.request.urlopen(urllib.request.Request(UPSTREAM + sub, body, headers), timeout=UPSTREAM_TIMEOUT)
            code, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, data = e.code, e.read()
        except Exception as e:
            code, data = 502, json_bytes({'error': '代理无法连接上游 %s: %s' % (UPSTREAM, e)})
        stored = False
        if code == 200:
            stored = bool(key) and is_cacheable(body, data)
            if stored:
                CACHE.put(key, data)
            sys.stderr.write('  POST %s → 200 · %s%s\n' % (sub, usage_line(data), '' if stored or not key else ' · 结果不完整，未缓存'))
        self._reply(code, data, headers={'X-Cache': 'MISS'} if key else None)


# ---------------------------------------------------------------- 启动
def main():
    for stream in (sys.stdout, sys.stderr):                 # Windows 旧控制台可能不是 UTF-8：宁可显示问号也不要报错退出
        try:
            stream.reconfigure(errors='replace')
        except Exception:
            pass
    try:
        port = int(os.environ.get('PORT', '8787'))
    except ValueError:
        sys.exit('PORT 必须是数字。')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    except OSError:
        print('端口 %d 被占用。如果程序已经在另一个窗口运行，直接打开浏览器即可；' % port)
        print('否则可以换端口，例如 Mac/Linux: PORT=8800 python3 serve.py   Windows: set PORT=8800 && python serve.py')
        print('注意：换端口后之前保存的科目看不到，请先用原端口打开页面「备份全部」。')
        sys.exit(1)
    server.daemon_threads = True
    url = 'http://localhost:%d/%s' % (port, urllib.parse.quote(PAGE.name))
    if not PAGE.name:
        print('提示：没有在 %s 找到 .html 页面，请把 revision-studio.html 放在 serve.py 同一个文件夹。' % HERE)
    print('打开 %s' % url)
    print('上游：%s   Key：%s   缓存：%s' % (UPSTREAM, '已从环境变量读取' if API_KEY else '使用页面里填写的 Key', '开（%s）' % CACHE_DIR if CACHE else '关'))
    print('按 Ctrl+C 停止')
    if PAGE.name and os.environ.get('NO_BROWSER') != '1':
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')


if __name__ == '__main__':
    main()

/* ======== 18-share.js ======== */
/**
 * 18 · share.js — 分享 / 备份：分享码、文件、系统分享
 */

/* ================= import / export / backup ================= */
function dlText(name, text) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
}

function dl(name, obj) { dlText(name, JSON.stringify(obj)); } /* 紧凑 JSON:不缩进,文件更小,方便传输 */

function fname(t) {
  return String(t).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'subject';
}

/* 分享:点侧栏里科目右侧的分享图标 → 面板里选「发送… / 复制分享码 / 保存为文件」,不会直接下载。
   文件和分享码内容相同,都不含复习进度和 API Key。分享码 = “RS1:” + base64url(gzip(JSON));浏览器不支持压缩流时用 “RS0:”(不压缩) */
function packSub(s) {
  var c = JSON.parse(JSON.stringify(s));
  delete c.builtin;
  delete c.rich;
  delete c.id;
  c.items.forEach(function (x) {
    delete x.detail;
    delete x.svg;
  });
  return { app: 'revstudio-subject', v: 3, date: new Date().toISOString(), subject: c };
}

/* ---- 分享码:编码 / 解码 ---- */
function toB64u(u) {
  var s = '';
  for (var i = 0; i < u.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(t) {
  t = t.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) {
    t += '=';
  }
  var s = atob(t);
  var u = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) {
    u[i] = s.charCodeAt(i);
  }
  return u;
}

/* 压缩 / 解压;解压后超过 30 MB 就中止,防止一小段恶意数据撑爆内存 */
async function pipeBytes(u, T) {
  var rd = new Blob([u]).stream().pipeThrough(T).getReader();
  var parts = [];
  var n = 0;
  for (;;) {
    var r = await rd.read();
    if (r.done) {
      break;
    }
    n += r.value.length;
    if (n > 3e7) {
      rd.cancel();
      throw new Error('big');
    }
    parts.push(r.value);
  }
  var o = new Uint8Array(n);
  var p = 0;
  parts.forEach(function (x) {
    o.set(x, p);
    p += x.length;
  });
  return o;
}

async function encodeCode(json) {
  var raw = new TextEncoder().encode(json);
  var u = raw;
  var pre = 'RS0:';
  if (window.CompressionStream) {
    try {
      u = await pipeBytes(raw, new CompressionStream('gzip'));
      pre = 'RS1:';
    }
    catch {
      u = raw;
    }
  }
  return pre + toB64u(u);
}

async function decodeCode(txt) {
  var m = /^RS([01]):([A-Za-z0-9_-]+)$/.exec(String(txt).replace(/\s+/g, ''));
  if (!m) {
    throw new Error('bad');
  }
  var u = fromB64u(m[2]);
  if (m[1] === '1') {
    if (!window.DecompressionStream) {
      throw new Error('nodecomp');
    }
    u = await pipeBytes(u, new DecompressionStream('gzip'));
  }
  return new TextDecoder().decode(u);
}

function legacyCopy(t) {
  var a = document.createElement('textarea');
  a.value = t;
  a.setAttribute('readonly', '');
  a.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.appendChild(a);
  a.select();
  a.setSelectionRange(0, t.length);
  var ok = false;
  try {
    ok = document.execCommand('copy');
  }
  catch { }
  a.remove();
  return ok;
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacyCopy(t); });
  }
  return Promise.resolve(legacyCopy(t));
}

function kbOf(n) { return Math.max(1, Math.round(n / 1024)); }

/* ---- 分享面板 ---- */
var SH = null;

async function openShare(id) {
  var s = byId(id);
  if (!s) {
    return;
  }
  if (s.builtin) {
    toast('内置科目已包含在页面中，无需分享。');
    return;
  }
  var json = JSON.stringify(packSub(s));
  var name = fname(s.title) + '.revision.json';
  var code = '';
  var file = null;
  try {
    code = await encodeCode(json);
  }
  catch { }
  if (!code) {
    toast('无法生成分享内容。');
    return;
  }
  try {
    file = new File([json], name, { type: 'application/json' });
  }
  catch { }
  var sys = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] }));
  var pn = s.items.filter(function (x) { return x.pend; }).length;
  var ck = kbOf(code.length);
  var fk = kbOf(new Blob([json]).size);
  SH = { title: s.title, json: json, name: name, code: code, file: file, ck: ck, fk: fk };
  $('shT').textContent = '分享“' + s.title + '”';
  $('shS').textContent = s.items.length + ' 个考点' + (pn ? '（' + pn + ' 条尚未生成）' : '');
  $('shCodeS').textContent = '约 ' + ck + ' KB 的文本' + (ck > 4 ? '。聊天软件有长度限制时，请使用文件。' : '');
  $('shFileS').textContent = '约 ' + fk + ' KB 的 .json 文件';
  $('shSys').style.display = sys ? '' : 'none';
  var first = null;
  ['shSys', 'shCode', 'shFile'].forEach(function (k) {
    var b = $(k);
    b.classList.remove('p');
    if (!first && b.style.display !== 'none') {
      first = b;
    }
  });
  first.classList.add('p');
  showBox('bShare');
  setTimeout(function () { first.focus(); }, 50);
}

function backupAll() {
  dl('revision-studio-backup-' + new Date().toISOString().slice(0, 10) + '.json', { app: 'revstudio-backup', v: 2, date: new Date().toISOString(), subs: S.subs, prog: S.prog });
  toast('已备份全部科目（不含 API Key）');
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindShare() {
  $('shSys').onclick = function () {
    var h = SH;
    if (!h || !h.file) {
      return;
    } /* 必须在点击当下同步调用,否则浏览器会拒绝 */
    navigator.share({ files: [h.file], title: h.title }).then(function () { closeM(); }, function (e) { if (!e || e.name !== 'AbortError') {
      toast('无法调用系统分享。请改用其他方式。');
    } });
  };
  $('shCode').onclick = function () {
    var h = SH;
    if (!h) {
      return;
    }
    copyText(h.code).then(function (ok) {
      if (ok) {
        closeM();
        toast('已复制分享码 · ' + h.ck + ' KB');
      }
      else {
        toast('无法复制。请改用文件。');
      }
    });
  };
  $('shFile').onclick = function () {
    var h = SH;
    if (!h) {
      return;
    }
    dlText(h.name, h.json);
    closeM();
    toast('已保存“' + h.name + '” · ' + h.fk + ' KB');
  };
  $('shX').onclick = function () { closeM(); };
  $('bak').onclick = function () {
    menuOpen(false);
    backupAll();
  };
}


/* ======== 24-pdf.js ======== */
/**
 * 24 · pdf.js — PDF / 文本读取与拖入
 */

/* ---- PDF 读取:只做最原始的文字提取,不判断版面 ---- */
var PDFV = ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/', 'https://unpkg.com/pdfjs-dist@3.11.174/build/'];

function loadPdf() {
  if (window.pdfjsLib) {
    return Promise.resolve();
  }
  var i = 0;
  return new Promise(function (ok, no) {
    (function next() {
      if (i >= PDFV.length) {
        return no(new Error('无法加载 PDF 组件。请检查网络，或改为粘贴文本。'));
      }
      var base = PDFV[i++];
      var s = document.createElement('script');
      s.src = base + 'pdf.min.js';
      s.onload = function () {
        if (!window.pdfjsLib) {
          s.remove();
          return next();
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
        ok();
      };
      s.onerror = function () {
        s.remove();
        next();
      };
      document.head.appendChild(s);
    })();
  });
}

/* 同一高度的文字拼成一行;横向间隔很大的地方放一个「 | 」(表格的两栏),其余顺序保持 PDF 里的原样 */
function pdfItemsToLines(items) {
  var out = [];
  var cur = '';
  var pe = null;
  function push() {
    var l = cur.replace(/\s+/g, ' ').trim();
    if (l) {
      out.push(l);
    }
    cur = '';
  }
  items.forEach(function (t) {
    if (typeof t.str !== 'string') {
      return;
    }
    var x = t.transform[4];
    var y = t.transform[5];
    var h = Math.abs(t.height || t.transform[3] || 10) || 10;
    if (pe && Math.abs(y - pe.y) <= h * .45) {
      var gap = x - (pe.x + pe.w);
      cur += gap > Math.max(18, h * 1.8) ? ' | ' : (gap > h * .12 && !/\s$/.test(cur) && !/^\s/.test(t.str) ? ' ' : '');
    }
    else {
      push();
    }
    cur += t.str;
    pe = { x: x, y: y, w: t.width || 0 };
    if (t.hasEOL) {
      push();
      pe = null;
    }
  });
  push();
  return out;
}

/* 页眉页脚:只看每页最前和最后两行,在很多页重复出现才删。Core / Supplement / 栏目标题这类行永远保留 */
var KEEPL = /supplement|core|candidates should|notes and guidance/i;

function hkey(l) { return l.replace(/\d+/g, '#'); } /* 页脚常带页码:数字换成 # 再比较,「…igcse 7」「…igcse 8」算同一行 */

function dropRepeated(pg) {
  var N = pg.length;
  if (N < 4) {
    return pg;
  }
  var cnt = {};
  pg.forEach(function (ls) {
    var u = {};
    ls.slice(0, 2).concat(ls.slice(-2)).forEach(function (l) {
      var k = hkey(l);
      if (l.length < 140 && !KEEPL.test(l) && !u[k]) {
        u[k] = 1;
        cnt[k] = (cnt[k] || 0) + 1;
      }
    });
  });
  var th = Math.max(3, Math.ceil(N * .35));
  return pg.map(function (ls) {
    var n = ls.length;
    return ls.filter(function (l, i) { return !((i < 2 || i >= n - 2) && cnt[hkey(l)] >= th); });
  });
}

async function readPdf(f, onp) {
  await loadPdf();
  var d;
  try {
    d = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
  }
  catch (e) {
    throw new Error(e && e.name === 'PasswordException' ? '此 PDF 已加密，请先解除保护。' : '无法读取此 PDF（' + (e && e.message || e) + '）。');
  }
  var pg = [];
  for (var p = 1; p <= d.numPages; p++) {
    var c = await (await d.getPage(p)).getTextContent();
    pg.push(pdfItemsToLines(c.items));
    if (onp) {
      onp(p, d.numPages);
    }
  }
  return dropRepeated(pg).map(function (ls, i) { return { n: i + 1, t: ls.join('\n') }; });
}

var PH = $('fText').placeholder;

async function takeFile(f) {
  if (!f || IDENT || BUSYF) {
    return;
  }
  var pdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
  if ($('fText').value.trim() && !confirm('替换文本框中的现有内容？')) {
    return;
  }
  setStep(pdf ? 2 : 3, 1);
  st('');
  BUSYF = true;
  syncBtns();
  try {
    if (pdf) {
      st('正在读取 PDF…', 'run');
      bar(.02);
      var pages = await readPdf(f, function (i, n) { bar(.02 + .9 * i / n); });
      var chars = pages.reduce(function (a, p) { return a + p.t.length; }, 0);
      if (chars < 200) {
        throw new Error('未提取到文字。不支持扫描件，请改为粘贴文本。');
      }
      SRC = { name: f.name, pages: pages, chars: chars, tok: tokOf(pages) };
      RAWIDX = idxOf(pages.map(function (p) { return p.t; }));
      RAW = '';
      UNDO = null;
      OUT = null;
      EXT = null;
      $('fText').value = '';
      $('pgA').value = '';
      $('pgB').value = '';
      var T = $('fTitle');
      if (!T.value.trim() || T.dataset.auto) {
        T.value = f.name.replace(/\.\w+$/, '');
        T.dataset.auto = '1';
      }
      srcUI();
      st('已读取 ' + pages.length + ' 页。');
    }
    else {
      var t = await f.text();
      SRC = null;
      RAWIDX = null;
      RAW = '';
      UNDO = null;
      OUT = null;
      EXT = null;
      $('fText').value = t;
      srcUI();
      var T2 = $('fTitle');
      if (!T2.value.trim()) {
        T2.value = f.name.replace(/\.\w+$/, '');
        T2.dataset.auto = '1';
      }
    }
    info(1);
  }
  catch (e) {
    st('无法读取：' + (e && e.message || e), 'err');
  }
  finally {
    BUSYF = false;
    bar(null);
    syncBtns();
  }
}


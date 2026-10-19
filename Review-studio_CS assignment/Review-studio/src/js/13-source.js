/* ======== 13-source.js ======== */
/**
 * 13 · source.js — 考纲文本：切页、与原文比对
 */

/* ================= 原文核对:词和相邻词对是否真的出现在 PDF 文字里 ================= */
/* 不要求整句逐字相同:PDF 两栏被压平后,换行处的相邻词会被隔开,所以允许少量词对缺失 */
function toks(s) {
  return String(s || '').toLowerCase().match(/[a-z]+|[0-9]+|[一-鿿]/g) || [];
} /* 字母和数字拆开:化学式 6CO2 和 PDF 里被拆开的上下标算同一回事 */

function idxOf(texts) {
  var W = new Set();
  var B = new Set();
  texts.forEach(function (t) {
    var a = toks(t);
    for (var i = 0; i < a.length; i++) {
      W.add(a[i]);
      if (i) {
        B.add(a[i - 1] + ' ' + a[i]);
      }
    }
  });
  return { W: W, B: B };
}

function fits(s, ix) {
  var a = toks(s);
  if (!ix || !a.length) {
    return true;
  }
  var w = 0;
  var b = 0;
  var nb = a.length - 1;
  for (var i = 0; i < a.length; i++) {
    if (ix.W.has(a[i])) {
      w++;
    }
    if (i && ix.B.has(a[i - 1] + ' ' + a[i])) {
      b++;
    }
  }
  if (a.length < 4) {
    return w === a.length;
  }
  return w / a.length >= .96 && (nb < 1 || b / nb >= .7);
}

/* ================= PDF / 文本 → 页 ================= */
function pageTxt(p) { return '=== PAGE ' + p.n + ' ===\n' + p.t; }

function tokOf(pages) {
  var c = 0;
  var k = 0;
  pages.forEach(function (p) {
    var s = p.t;
    var z = (s.match(/[一-鿿]/g) || []).length;
    k += z;
    c += s.length - z;
  });
  return Math.ceil(c / 3.6 + k * .7);
}

/* 粘贴的文本没有页:每约 3000 字切一段当作一页(换页符 \f 优先) */
function splitPages(t) {
  t = String(t || '').replace(/\r\n?/g, '\n');
  var pages = [];
  var parts = t.indexOf('\f') > -1 ? t.split('\f') : null;
  if (parts) {
    parts.forEach(function (p) { if (p.trim()) {
      pages.push(p.trim());
    } });
  }
  else {
    var cur = [];
    var len = 0;
    t.split('\n').forEach(function (l) {
      cur.push(l);
      len += l.length + 1;
      if (len >= 3000) {
        pages.push(cur.join('\n'));
        cur = [];
        len = 0;
      }
    });
    if (cur.join('').trim()) {
      pages.push(cur.join('\n'));
    }
  }
  return pages.map(function (p, i) { return { n: i + 1, t: p }; });
}


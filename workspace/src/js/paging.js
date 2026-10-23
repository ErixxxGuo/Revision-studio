/* ======== 08-paging.js ======== */
/**
 * 08 · paging.js — 长考点分页：按真实排版高度测量，动态规划配平
 */

/* ================= 长考点分页 =================
   不靠字数估计:在隐藏的测量元素里按真实字号、真实宽度排一遍,量出每一块的高度。
   整段高度超过可用高度的 62%(MAXFILL)才考虑分页;拆开后每页不超过 72%(PAGEMAX),所以每页至少留出 28% 的空白;
   分几页取「刚好放得下」的最少页数,再用动态规划把各页高度配平,每页的留白因此落在同一个范围里。
   优先在 (a)(b)(c) 小点之间切;没有小点就在分号、句号处切;最后才按词切。 */
var MAXFILL = .62;
var PAGEMAX = .72;
var MAXFLAT = .8;
var MAXPG = 4;
var PGC = {};
var PART = 0;
var PGN = 1;
var PARTREQ = null;
var lastObjKey = '';
var ROM = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];

function objTier(t) {
  var n = String(t).length;
  return n <= 110 ? 'ot1' : n <= 230 ? 'ot2' : 'ot3';
}

function trimSub(t) {
  return String(t).replace(/\s+/g, ' ').replace(/\s*[;,]\s*(?:and|or)?\s*$/i, '').replace(/\s+(?:and|or)\s*$/i, '').trim();
}

/* 识别 (a)(b)(c)… 或 (i)(ii)(iii)…:必须从 (a) / (i) 开始,至少两项,字母依次递增才算 */
function parseSubs(text) {
  text = String(text);
  var re = /(^|[\s;:,.])\(([a-z]{1,4})\)\s+(?=\S)/g;
  var ms = [];
  var m;
  while ((m = re.exec(text))) {
    ms.push({ i: m.index + m[1].length, e: re.lastIndex, l: m[2] });
  }
  for (var s0 = 0; s0 < ms.length; s0++) {
    var f = ms[s0].l;
    var kind = f === 'a' ? 'a' : f === 'i' ? 'r' : null;
    if (!kind) {
      continue;
    }
    var ch = [ms[s0]];
    for (var k = s0 + 1; k < ms.length; k++) {
      var pv = ch[ch.length - 1].l;
      var want = kind === 'a' ? String.fromCharCode(pv.charCodeAt(0) + 1) : ROM[ROM.indexOf(pv) + 1];
      if (ms[k].l === want) {
        ch.push(ms[k]);
      }
    }
    if (ch.length < 2) {
      continue;
    }
    var subs = ch.map(function (c, j) {
      return { l: '(' + c.l + ')', t: trimSub(text.slice(c.e, j + 1 < ch.length ? ch[j + 1].i : text.length)) };
    });
    if (subs.some(function (x) { return !x.t; })) {
      continue;
    }
    return { stem: text.slice(0, ch[0].i).replace(/\s+/g, ' ').trim(), subs: subs };
  }
  return null;
}

function unitHTML(po, k, keys) {
  var h = '';
  if (k === 0 && po.stem) {
    h += '<span class="o-stem">' + segs(po.stem, keys) + '</span>';
  }
  var sb = po.subs[k];
  return h + '<span class="o-sub"><span class="o-l">' + esc(sb.l) + '</span><span class="o-t">' + segs(sb.t, keys) + '</span></span>';
}

function listHTML(po, keys, a, b) {
  var h = '';
  for (var k = a; k < b; k++) {
    h += unitHTML(po, k, keys);
  }
  return h;
}

/* 把 h(各块高度)切成 n 段:穷举所有切法(小点最多几十个,几千种以内),先取「最高的一页最矮」,再取「各页高度差最小」,这样每页的留白才均匀 */
function bestCuts(h, n) {
  var m = h.length;
  var P = [0];
  var best = null;
  var cur = [];
  h.forEach(function (x) { P.push(P[P.length - 1] + x); });
  (function rec(start, k) {
    if (k === n - 1) {
      var c = [0].concat(cur, [m]);
      var mx = 0;
      var ss = 0;
      for (var i = 0; i < n; i++) {
        var v = P[c[i + 1]] - P[c[i]];
        if (v > mx) {
          mx = v;
        }
        ss += v * v;
      }
      if (!best || mx < best.max - .5 || (Math.abs(mx - best.max) <= .5 && ss < best.ss)) {
        best = { cuts: cur.slice(), max: mx, ss: ss };
      }
      return;
    }
    for (var i = start; i <= m - (n - 1 - k); i++) {
      cur.push(i);
      rec(i + 1, k + 1);
      cur.pop();
    }
  })(1, 0);
  return best;
}

/* 没有 (a)(b) 小点(或某一小点自己就超高)时:按分子句切,每页字数大致相等 */
function flatPages(text, keys, lim, measure) {
  var cl = text.split(/(?<=[;.])\s+/).filter(Boolean);
  if (cl.length < 2) {
    cl = text.split(/(?<=,)\s+/).filter(Boolean);
  }
  if (cl.length < 2) {
    var w = text.split(/\s+/);
    var g = [];
    for (var q = 0; q < w.length; q += 4) {
      g.push(w.slice(q, q + 4).join(' '));
    }
    cl = g;
  }
  var B = [0];
  cl.forEach(function (x) { B.push(B[B.length - 1] + x.length + 1); });
  var T = B[B.length - 1];
  var nmax = Math.min(MAXPG + 2, cl.length);
  var htmls = [segs(text, keys)];
  for (var n = Math.min(2, nmax); n <= nmax; n++) {
    var cuts = [];
    var prev = 0;
    for (var k = 1; k < n; k++) {
      var bi = -1;
      var bd = Infinity;
      for (var i = prev + 1; i <= cl.length - (n - k); i++) {
        var d = Math.abs(B[i] - T * k / n);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      cuts.push(bi);
      prev = bi;
    }
    var parts = [];
    var a = 0;
    cuts.concat([cl.length]).forEach(function (c) {
      parts.push(cl.slice(a, c).join(' '));
      a = c;
    });
    htmls = parts.map(function (p) { return segs(p, keys); });
    if (htmls.every(function (h) { return measure(h) <= lim; })) {
      break;
    }
  }
  return htmls;
}

function buildPages(it, cap, measure) {
  var keys = it.keys || []; /* 是否拆:有小点,文字占满卡片超过 62% 就拆;连续长句不适合硬拆,超过 80% 才拆 */
  var text = String(it.text);
  var po = parseSubs(text);
  var whole = po ? listHTML(po, keys, 0, po.subs.length) : segs(text, keys);
  var H0 = measure(whole);
  var thr = (po ? MAXFILL : MAXFLAT) * cap;
  if (H0 <= thr) {
    return [whole];
  }
  var lim = (po ? PAGEMAX : MAXFLAT) * cap * 1.03; /* 拆开后:每页不超过 72%(至少留 28% 空白),略放 3% 容差抵消取整误差 */
  if (po) {
    var hs = po.subs.map(function (x, k) {
      return measure((k ? '<span hidden></span>' : '') + unitHTML(po, k, keys));
    });
    if (hs.every(function (h) { return h <= lim; })) {
      var nmax = Math.min(MAXPG, po.subs.length);
      for (var n = 2; n <= nmax; n++) {
        var bc = bestCuts(hs, n);
        var parts = [];
        var a = 0;
        bc.cuts.concat([po.subs.length]).forEach(function (c) {
          parts.push(listHTML(po, keys, a, c));
          a = c;
        });
        if (n === nmax || parts.every(function (h) { return measure(h) <= lim; })) {
          return parts;
        }
      }
    }
  }
  return flatPages(text, keys, lim, measure);
}

/* 左侧卡片里留给考点文字的高度:电脑上是面板剩余空间;手机上是按屏幕高度定的固定值 */
function capH() {
  var o = $('objw');
  if (matchMedia('(max-width:860px)').matches) {
    var h = Math.max(240, Math.min(520, Math.round(innerHeight * .46 / 40) * 40));
    o.style.flex = 'none';
    o.style.height = h + 'px';
    return h - 10;
  } /* 手机上卡片高度跟着内容走:给考点区一个确定的高度,分页才稳定 */
  o.style.flex = '';
  o.style.height = '';
  return Math.floor(o.clientHeight - 10);
}

function pagesOf(s, it) {
  var M = $('meas');
  var cap = capH();
  M.className = 'objm ' + objTier(it.text);
  var W = M.clientWidth;
  var key = [s.id, it.id, String(it.text).length, (it.keys || []).join('').length, W, cap].join('|');
  if (PGC[key]) {
    return PGC[key];
  }
  var meas = function (h) {
    M.innerHTML = h;
    return M.offsetHeight;
  };
  var res;
  try {
    res = (cap > 140 && W > 120) ? buildPages(it, cap, meas) : [segs(it.text, it.keys)];
  }
  catch {
    res = [segs(it.text, it.keys)];
  }
  M.innerHTML = '';
  if (Object.keys(PGC).length > 300) {
    PGC = {};
  }
  PGC[key] = res;
  return res;
}


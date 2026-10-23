/* ======== 14-identify.js ======== */
/**
 * 14 · identify.js — 识别流水线：定位正文 → 分段提取 → 合并 → 核对 → 补读
 */

function rngOf(x) {
  var a;
  var b;
  if (Array.isArray(x)) {
    a = pint(x[0]);
    b = pint(x[1]);
  }
  else if (x && typeof x === 'object') {
    a = pint(x.from != null ? x.from : x.start != null ? x.start : x.first);
    b = pint(x.to != null ? x.to : x.end != null ? x.end : x.last);
  }
  return (a >= 1 && b >= 1) ? [Math.min(a, b), Math.max(a, b)] : null;
}

function mergeRanges(r, N, pad) {
  var a = r.map(function (x) {
    return [Math.max(1, Math.min(N, x[0] - pad)), Math.max(1, Math.min(N, x[1] + pad))];
  }).sort(function (p, q) { return p[0] - q[0]; });
  var out = [];
  a.forEach(function (x) {
    var l = out[out.length - 1];
    if (l && x[0] <= l[1] + 1) {
      l[1] = Math.max(l[1], x[1]);
    }
    else {
      out.push(x);
    }
  });
  return out;
}

function fmtR(r) {
  return r.map(function (x) { return x[0] === x[1] ? '第 ' + x[0] + ' 页' : '第 ' + x[0] + '–' + x[1] + ' 页'; }).join('、');
}

function parseHeading(h) {
  var tp = '';
  var ti;
  var pg;
  var c = null;
  var dg = function (v) { return /^\d+$/.test(String(v).trim()); };
  if (Array.isArray(h)) {
    var L = h.length;
    if (L >= 4) {
      tp = h[0];
      ti = h[1];
      pg = h[2];
      c = h[3];
    }
    else if (L === 3) {
      if (dg(h[2]) && !dg(h[1])) {
        tp = h[0];
        ti = h[1];
        pg = h[2];
      }
      else {
        ti = h[0];
        pg = h[1];
        c = h[2];
      }
    }
    else if (L === 2) {
      ti = h[0];
      pg = h[1];
    }
    else {
      return null;
    }
  }
  else if (h && typeof h === 'object') {
    tp = h.topic;
    ti = h.title;
    pg = h.page;
    c = h.count;
  }
  else {
    return null;
  }
  ti = cleanH(ti);
  if (!ti) {
    return null;
  }
  pg = pint(pg);
  c = pint(c);
  return { topic: cleanH(tp), title: ti, page: isFinite(pg) ? pg : 0, count: isFinite(c) && c >= 0 ? c : null };
}

async function locate(pages, signal) {
  var N = pages.length;
  var r = await retry(function (t) {
    return ask(LOC, pages.map(pageTxt).join('\n'), signal, 8000, { temp: 0, fresh: t > 1 });
  }, signal);
  var ct = Array.isArray(r.content) ? r.content : [];
  if (ct.length === 2 && typeof ct[0] !== 'object') {
    ct = [ct];
  }
  var rg = ct.map(rngOf).filter(Boolean).filter(function (x) { return x[0] <= N; });
  if (!rg.length) {
    throw new Error('未能定位正文页');
  }
  var core = mergeRanges(rg, N, 0);
  var counts = {};
  var cn = 0;
  rg = mergeRanges(rg, N, 1);
  var hs = (Array.isArray(r.headings) ? r.headings : []).map(parseHeading).filter(Boolean).slice(0, 300);
  hs.forEach(function (h) {
    var k = numKey(h.title);
    if (k && h.count != null && counts[k] == null) {
      counts[k] = h.count;
      cn += h.count;
    }
  });
  var sk = (Array.isArray(r.skip) ? r.skip : []).map(function (x) {
    var g = rngOf(x);
    var w = Array.isArray(x) ? x[2] : x && (x.why || x.reason);
    return g ? { r: g, why: S_(w, 50) } : null;
  }).filter(Boolean).slice(0, 12);
  var tot = pint(r.total);
  return { title: S_(r.title, 80), code: S_(r.code, 8), ranges: rg, core: core, headings: hs, counts: Object.keys(counts).length ?
      counts : null, total: Object.keys(counts).length ? cn : (isFinite(tot) ? tot : null), aiTotal: isFinite(tot) ? tot : null, skip: sk };
}

var WIN = 9000;

/* 按页分段,每段约 WIN 字;相邻两段重叠 1 页,避免跨页的 objective 被切断(重复的之后会合并掉) */
function buildWins(pages, rg) {
  var idx = [];
  rg.forEach(function (r) { for (var p = r[0]; p <= r[1]; p++) {
    if (idx.indexOf(p) < 0) {
      idx.push(p);
    }
  } });
  idx.sort(function (a, b) { return a - b; });
  var wins = [];
  var cur = [];
  var len = 0;
  var fresh = 0;
  idx.forEach(function (p, i) {
    var l = pages[p - 1].t.length + 24;
    if (fresh > 0 && len + l > WIN) {
      wins.push(cur);
      var pv = idx[i - 1];
      var lead = pv === p - 1 ? [pv] : [];
      cur = lead.slice();
      len = lead.length ? pages[pv - 1].t.length + 24 : 0;
      fresh = 0;
    }
    cur.push(p);
    len += l;
    fresh++;
  });
  if (fresh > 0) {
    wins.push(cur);
  }
  return wins.map(function (w) { return { pages: w, res: null, err: null }; });
}

function winMsg(E, pg) {
  var a = pg[0];
  var b = pg[pg.length - 1];
  var m = E.meta || {};
  var hs = (m.headings || []).filter(function (h) { return h.page >= a - 1 && h.page <= b; }).slice(0, 40);
  return (m.title ? 'Subject: ' + m.title + '\n' : '') + 'This text covers PDF pages ' + a + (b > a ? '–' + b : '') +
      '.\n' +
    (hs.length ? 'Section headings known to occur nearby (reference only, copy headings from the text itself):\n' + hs.map(function (h) {
      return '- p' + h.page + ': ' + (h.topic ? h.topic + ' > ' : '') + h.title + (h.count != null ? ' (' + h.count +
          ' objectives)' : '');
    }).join('\n') + '\n' : '') +
    '\n' + pg.map(function (n) { return pageTxt(E.pages[n - 1]); }).join('\n');
}

function cleanT(s) {
  return S_(s, 1200).replace(/\s*\n\s*/g, ' ').replace(/^[\s\-*•▪◦·–>#]+/, '').trim();
}

function cleanH(s) { return S_(s, 160).replace(/\s+continued\s*$/i, '').trim(); }

function nOf(v) {
  if (v == null || v === '') {
    return null;
  }
  var k = pint(String(v).indexOf('.') > -1 ? String(v).split('.').pop() : v);
  return k >= 1 && k <= 999 ? k : null;
}

var PIDN = 0;

function normRes(r) {
  var pid = ++PIDN;
  var a = Array.isArray(r && r.sections) ? r.sections : (Array.isArray(r && r.items) && r.items.length &&
      r.items[0] && r.items[0].t != null ? [{ title: '', items: r.items }] : []);
  return a.filter(function (x) { return x && typeof x === 'object'; }).map(function (sc) {
    var items = [];
    (Array.isArray(sc.items) ? sc.items : []).forEach(function (x) {
      if (!x || typeof x !== 'object') {
        return;
      }
      var t = cleanT(x.t != null ? x.t : x.text);
      if (!t) {
        return;
      }
      items.push({ n: nOf(x.n), t: t, g: arrS(x.g != null ? x.g : x.guide, 20, 500).map(function (z) {
          return z.replace(/^[>•\-*\s]+/, '').replace(/\s*\n\s*/g, ' ');
        }).filter(Boolean) });
    });
    return { topic: cleanH(sc.topic), title: cleanH(sc.title), items: items, pid: pid };
  });
}

async function extractWin(E, pg, signal, depth) {
  try {
    var r = await retry(function (t) {
      return ask(EXT_SYS, winMsg(E, pg), signal, C().kind === 'local' ? 8000 : 16000, { temp: 0, fresh: t > 1 });
    }, signal);
    return normRes(r);
  }
  catch (e) {
    if (e.trunc && pg.length > 1 && (depth || 0) < 3) {
      var h = Math.ceil(pg.length / 2);
      var ov = pg.length >= 4 ? 1 : 0;
      var A = await extractWin(E, pg.slice(0, h + ov), signal, (depth || 0) + 1);
      var B = await extractWin(E, pg.slice(h), signal, (depth || 0) + 1);
      return A.concat(B);
    }
    throw e;
  }
}

function secKey(t) {
  var m = String(t).match(/^\s*(\d+(?:\.\d+)*)(?![\d.]*\w)/);
  return m ? 'n' + m[1] : 't' + normT(t);
}

function mergeG(y, x) {
  x.g.forEach(function (z) {
    var q = normT(z);
    if (!q) {
      return;
    }
    for (var i = 0; i < y.g.length; i++) {
      var p = normT(y.g[i]);
      if (p === q || p.indexOf(q) > -1) {
        return;
      }
      if (q.indexOf(p) > -1) {
        y.g[i] = z;
        return;
      }
    }
    y.g.push(z);
  });
}

/* 是不是同一条的不同版本:被切断的残片是完整文字的子串;loose 时再允许措辞略有出入(词重合 ≥ 80%)。相邻章节的 objective 句式常常很像,所以跨章节匹配绝不放宽 */
function simil(a, b, loose) {
  if (a.indexOf(b) > -1 || b.indexOf(a) > -1) {
    return true;
  }
  if (!loose) {
    return false;
  }
  var A = a.split(' ');
  var B = b.split(' ');
  var s = {};
  var c = 0;
  A.forEach(function (w) { s[w] = 1; });
  B.forEach(function (w) { if (s[w]) {
    c++;
  } });
  return c / Math.max(A.length, B.length) >= .8;
}

/* 合并各段结果(和补读结果):
   同一章节按编号合并;同一个编号的条目只留完整的那条(窗口重叠、被切断的残片会自动并掉);
   窗口开头还没看到标题的条目,先在最近几个章节里按内容去重,匹配不上才并入上一章节;
   最后每个章节按考纲原编号排序(Core 和 Supplement 交错出现时也能排回 1,2,3…) */
function mergeAll(E, ix) {
  var secs = [];
  var map = {};
  var lastS = null;
  var bad = [];
  var dropG = 0;
  var all = E.wins.concat(E.repairs || []);
  all.forEach(function (w) {
    (w.res || []).forEach(function (sc) {
      var S0;
      if (!sc.title) {
        S0 = lastS;
        if (!S0) {
          S0 = map['t'] = { topic: '', title: '未分组', items: [] };
          secs.push(S0);
        }
      }
      else {
        var k = secKey(sc.title);
        S0 = map[k];
        if (!S0) {
          S0 = map[k] = { topic: sc.topic, title: sc.title, items: [] };
          secs.push(S0);
        }
        else if (!S0.topic && sc.topic) {
          S0.topic = sc.topic;
        }
      }
      lastS = S0;
      var pools = sc.title ? [S0.items] : [S0.items].concat(secs.slice(-4).map(function (z) { return z.items; }));
      sc.items.forEach(function (x) {
        var q = normT(x.t);
        if (!q) {
          return;
        }
        x._q = q;
        x._p = sc.pid;
        var hit = false;
        for (var pi = 0; pi < pools.length && !hit; pi++) {
          var L = pools[pi];
          for (var i = 0; i < L.length && !hit; i++) {
            var y = L[i];
            if (y._q === q) {
              mergeG(y, x);
              if (y.n == null) {
                y.n = x.n;
              }
              hit = true;
            }
            else if (x.n != null && y.n === x.n && simil(y._q, q, pi === 0 && !!sc.title)) {
              if (q.length > y._q.length) {
                mergeG(x, y);
                L[i] = x;
              }
              else {
                mergeG(y, x);
              }
              hit = true;
            }
            else if (y._p !== sc.pid && q.length > y._q.length && q.indexOf(y._q) > -1) {
              mergeG(x, y);
              if (x.n == null) {
                x.n = y.n;
              }
              L[i] = x;
              hit = true;
            }
            else if (y._p !== sc.pid && y._q.length > q.length && y._q.indexOf(q) > -1) {
              mergeG(y, x);
              if (y.n == null) {
                y.n = x.n;
              }
              hit = true;
            }
          }
        }
        if (!hit) {
          S0.items.push(x);
        }
      });
    });
  });
  /* 上级主题:缺的按章节编号的第一段数字,从别处出现过的主题标题里补 */
  var tb = {};
  (E.meta.headings || []).forEach(function (h) {
    var m = h.topic && h.topic.match(/^\s*(\d+)\b/);
    if (m && !tb[m[1]]) {
      tb[m[1]] = h.topic;
    }
  });
  secs.forEach(function (s) {
    var m = s.topic && s.topic.match(/^\s*(\d+)\b/);
    if (m && !tb[m[1]]) {
      tb[m[1]] = s.topic;
    }
  });
  secs.forEach(function (s) {
    if (!s.topic) {
      var m = s.title.match(/^\s*(\d+)\b/);
      if (m && tb[m[1]]) {
        s.topic = tb[m[1]];
      }
    }
  });
  secs = secs.filter(function (s) { return s.items.length; });
  if (secs.length > 1 && secs.every(function (s) { return /^n\d/.test(secKey(s.title)); })) {
    secs.sort(function (a, b) {
      return cmpKey(secKey(a.title).slice(1), secKey(b.title).slice(1));
    });
  }
  secs.forEach(function (s) {
    var ns = s.items.map(function (x) { return x.n; });
    if (ns.every(function (v, k) { return v != null && ns.indexOf(v) === k; })) {
      s.items.sort(function (a, b) { return a.n - b.n; });
    }
  });
  secs.forEach(function (s) {
    s.items.forEach(function (x) {
      if (ix && !fits(x.t, ix)) {
        bad.push(x.t);
      }
      var g0 = x.g.length;
      x.g = x.g.filter(function (z) { return !ix || fits(z, ix); });
      dropG += g0 - x.g.length;
    });
  });
  return { secs: secs, bad: bad, dropG: dropG };
}

/* ================= 核对:AI 先数的 / 原文编号扫描 / 提取到的,三方对账 ================= */
/* 原文编号扫描:不拆分、不改写任何文字,只记下每个章节标题下面「行首是数字+单词」的编号。
   「6 H」「12 O」这类被拆开的化学式上下标不算(要求数字后面是至少 3 个字母的单词) */
function rawScan(E) {
  var cur = null;
  var nums = {};
  var pgs = {};
  var titles = {};
  var list = [];
  (E.meta.core || E.ranges).forEach(function (r) {
    for (var p = r[0]; p <= r[1]; p++) {
      if (list.indexOf(p) < 0) {
        list.push(p);
      }
    }
  });
  list.sort(function (a, b) { return a - b; }); /* 只数 AI 判定的正文页:提取时前后各多读的 1 页可能以「5 What else…」这样的标题开头,不能当作编号 */
  function mark(k, p) { (pgs[k] = pgs[k] || {})[p] = 1; }
  list.forEach(function (p) {
    var L = E.pages[p - 1].t.split('\n');
    L.forEach(function (l, i) {
      l = l.trim();
      var h = l.match(/^(\d{1,2}\.\d{1,2})\s+\S/);
      if (h && l.length < 120 && !/[.;:,]$/.test(l)) {
        cur = h[1];
        mark(cur, p);
        if (!titles[cur]) {
          titles[cur] = cleanH(l);
        }
        return;
      }
      var m = l.match(/^(\d{1,3})\s+[A-Z][a-z]{2,}/);
      if (m && cur) {
        var nh = (L[i + 1] || '').trim().match(/^(\d{1,2})\.\d{1,2}\s+\S/);
        if (nh && nh[1] === m[1]) {
          return;
        } /* 主题标题:下一行是以同一个数字开头的小节(8 Transport… 后面是 8.1)。章节最后一条 objective 后面也可能紧跟下一个小节标题,但编号对不上,不能漏数 */
        (nums[cur] = nums[cur] || {})[+m[1]] = 1;
        mark(cur, p);
      }
    });
    if (cur) {
      mark(cur, p);
    }
  });
  return { nums: nums, pgs: pgs, titles: titles };
}

function reconcile(E, m, raw) {
  var rows = [];
  var gaps = [];
  var tot = { ai: E.meta.total, raw: 0, found: 0 };
  m.secs.forEach(function (s) {
    var key = numKey(s.title);
    var F = {};
    var mx = 0;
    s.items.forEach(function (x) { if (x.n != null) {
      F[x.n] = 1;
      if (x.n > mx) {
        mx = x.n;
      }
    } });
    var rawK = key && raw.nums[key] ? contig(raw.nums[key]) : 0;
    var aiC = key && E.meta.counts && E.meta.counts[key] != null ? E.meta.counts[key] : null;
    var T = Math.max(rawK, mx);
    var miss = [];
    var st = 'ok';
    var note = '';
    for (var k = 1; k <= T; k++) {
      if (!F[k]) {
        miss.push(k);
      }
    }
    if (!miss.length && aiC != null && aiC > T) {
      if (rawK > 0) {
        st = 'note';
        note = 'AI 统计 ' + aiC + ' 条，原文编号到 ' + T + '，以原文为准';
      }
      else {
        for (var j = T + 1; j <= aiC; j++) {
          miss.push(j);
        }
      }
    }
    if (miss.length) {
      st = 'gap';
    }
    else if (!key && mx === 0) {
      st = 'na';
    }
    tot.raw += rawK;
    tot.found += s.items.length;
    var r = { key: key, title: s.title, found: s.items.length, expect: Math.max(T, aiC != null && st === 'gap' ? aiC :
        0) || T, aiC: aiC, rawK: rawK, missing: miss, status: st, note: note, pages: key && raw.pgs[key] ?
        Object.keys(raw.pgs[key]).map(Number).sort(function (a, b) { return a - b; }) : [] };
    rows.push(r);
    if (st === 'gap') {
      gaps.push(r);
    }
  });
  /* 整个章节都没提取到:原文编号扫描或 AI 的标题表里有它,结果里却没有。按「全部缺失」处理,同样会补读、补全 */
  var seen = {};
  rows.forEach(function (r) { if (r.key) {
    seen[r.key] = 1;
  } });
  var hk = {};
  (E.meta.headings || []).forEach(function (h) {
    var k = numKey(h.title);
    if (k && !hk[k]) {
      hk[k] = h;
    }
  });
  var ks = Object.keys(raw.nums).concat(Object.keys(E.meta.counts ||
      {})).filter(function (k, i, a) { return a.indexOf(k) === i && /^\d+\.\d+$/.test(k) && !seen[k]; }).sort(cmpKey);
  ks.forEach(function (k) {
    var rawK = raw.nums[k] ? contig(raw.nums[k]) : 0;
    var aiC = E.meta.counts && E.meta.counts[k] != null ? E.meta.counts[k] : 0;
    if (!rawK && !(raw.pgs[k] && aiC)) {
      return;
    } /* 只有 AI 说有、原文里又看不到这个章节标题,不信 */
    var T = Math.max(rawK, aiC);
    var miss = [];
    for (var j = 1; j <= T; j++) {
      miss.push(j);
    }
    if (!miss.length) {
      return;
    }
    var r = { key: k, title: hk[k] ? hk[k].title : (raw.titles[k] || k), found: 0, expect: T, aiC: aiC ||
        null, rawK: rawK, missing: miss, status: 'gap', note: '', pages: raw.pgs[k] ?
        Object.keys(raw.pgs[k]).map(Number).sort(function (a, b) { return a - b; }) : [] };
    rows.push(r);
    gaps.push(r);
    tot.raw += rawK;
  });
  return { rows: rows, gaps: gaps, tot: tot };
}

/* 缺口补读:对编号有缺口的章节,把该章节所在的页再发给 AI,只要缺的那几个编号 */
async function repairGaps(E, rc, signal, onp) {
  E.repairs = E.repairs || [];
  E.repDone = E.repDone || {};
  var todo = rc.gaps.filter(function (r) { return r.key && r.pages.length && !E.repDone[r.key]; }).slice(0, 24);
  var q = todo.slice();
  var fatalE = null;
  var done = 0;
  async function worker() {
    while (q.length && !signal.aborted && !fatalE) {
      var r = q.shift();
      try {
        var pg = r.pages.slice(0, 6);
        var msg = 'Section: ' + r.title + '\nMissing numbers: ' + r.missing.join(', ') + '\n\n' + pg.map(function (n) { return pageTxt(E.pages[n - 1]); }).join('\n');
        var res = await retry(function (t) { return ask(REPAIR_SYS, msg, signal, 8000, { temp: 0, fresh: t > 1 }); }, signal);
        E.repairs.push({ res: normRes({ sections: [{ topic: '', title: r.title, items: Array.isArray(res.items) ?
            res.items : [] }] }) });
        E.repDone[r.key] = 1;
      }
      catch (e) {
        if (e.name === 'AbortError' || signal.aborted) {
          return;
        }
        if (/HTTP 40[0-4]/.test(e.message)) {
          fatalE = e;
          return;
        }
        E.repDone[r.key] = 1;
      }
      done++;
      if (onp) {
        onp(done, todo.length);
      }
    }
  }
  var W = C().kind === 'local' ? 1 : 3;
  var ws = [];
  for (var i = 0; i < W; i++) {
    ws.push(worker());
  }
  await Promise.all(ws);
  if (fatalE) {
    throw fatalE;
  }
  if (signal.aborted) {
    throw abortErr();
  }
  return todo.length;
}

/* 完整性检查:正文页里的词有多少进了结果。很低的页可能有漏项(也可能本来就是说明文字) */
function lowPages(E, m) {
  var ox = new Set();
  var seen = {};
  var low = [];
  var cr = E.meta.core || E.ranges;
  function inCore(n) { return cr.some(function (r) { return n >= r[0] && n <= r[1]; }); }
  m.secs.forEach(function (s) {
    s.items.forEach(function (x) {
      toks(x.t).forEach(function (w) { ox.add(w); });
      x.g.forEach(function (g) { toks(g).forEach(function (w) { ox.add(w); }); });
    });
  });
  E.wins.forEach(function (w) {
    w.pages.forEach(function (n) {
      if (seen[n] || !inCore(n)) {
        return;
      }
      seen[n] = 1;
      var u = {};
      toks(E.pages[n - 1].t).forEach(function (t) { if (t.length >= 4 && !/^\d+$/.test(t)) {
        u[t] = 1;
      } });
      var ws = Object.keys(u);
      if (ws.length < 25) {
        return;
      }
      var hit = ws.filter(function (t) { return ox.has(t); }).length;
      if (hit / ws.length < .5) {
        low.push(n);
      }
    });
  });
  return low;
}

/* ---- 核对结果的展示 ---- */
/* 原文页 → 补全用的原文片段(最多 3 页、9000 字):缺口所在章节的页 */
function srcOf(E, r) {
  return (r.pages || []).slice(0, 3).map(function (n) { return E.pages[n - 1] ? pageTxt(E.pages[n - 1]) : ''; }).join('\n').slice(0, 9000);
}

function ckHTML(rc, n, g0, notes) {
  var bad = rc.gaps.length;
  var p = [];
  if (rc.tot.ai != null) {
    p.push('AI 统计 <b>' + rc.tot.ai + '</b> 条');
  }
  if (rc.tot.raw) {
    p.push('原文编号 <b>' + rc.tot.raw + '</b> 条');
  }
  p.push('已提取 <b>' + n + '</b> 条');
  var rows = rc.rows.map(function (r) {
    var gap = r.status === 'gap';
    var txt = gap ? (r.found ? '缺第 ' + r.missing.join('、') + ' 条' : '整章未提取') : r.status === 'note' ? r.found + ' 条（' +
        r.note + '）' : r.status === 'na' ? r.found + ' 条（无编号，无法核对）' : r.found + ' / ' + r.found;
    return '<div class="ckr' + (gap ? ' bad' : '') + '"><span>' + esc(r.title) + '</span><i>' + esc(txt) + '</i></div>';
  }).join('');
  return '<details class="ckd"><summary>核对详情' + (bad ? ' · ' + bad + ' 处待补全' : '') + '</summary><div class="ck-s">' +
      p.join(' · ') + (g0 ? ' · 已自动补读 ' + g0 + ' 处' : '') + '</div><div class="ckt">' + rows + '</div>' + (notes || '') + '</details>';
}

/* ---- 识别:定位正文 → 分段提取 → 核对 → 合并成大纲放进文本框 ---- */
async function identify(fresh) {
  var c = readCfg();
  if (!cfgOk(c)) {
    st('请在“接口与模型”中填写接口地址、模型和 API Key。', 'err');
    $('adv').open = true;
    return;
  }
  var rawT = SRC ? '' : (RAW || $('fText').value);
  if (!SRC && !rawT.trim()) {
    st('请先上传 PDF 或粘贴大纲。', 'err');
    return;
  }
  var pages = SRC ? SRC.pages : splitPages(rawT);
  var N = pages.length;
  if (!N) {
    st('没有可读取的文字。', 'err');
    return;
  }
  var a = pint($('pgA').value) || 0;
  var b = pint($('pgB').value) || 0;
  var manual = !!(a || b);
  if (manual) {
    a = Math.max(1, Math.min(a || 1, N));
    b = Math.max(1, Math.min(b || N, N));
    if (a > b) {
      var z = a;
      a = b;
      b = z;
    }
  }
  var sig = curSig();
  var full = tokOf(pages);
  var sel = manual ? tokOf(pages.slice(a - 1, b)) : full;
  var est1 = manual ? sel * 1.2 : full * 1.5;
  if (!(EXT && EXT.sig === sig && !fresh) && est1 > 150000 && !confirm('此文件约 ' + kfmt(full) + ' tokens，预计输入约 ' +
      kfmt(est1) + ' tokens。建议先填写页码范围。仍要继续？')) {
    return;
  }
  if (c.kind === 'proxy' && sel * 3.6 > 3.6e6) {
    st('内容超过本地代理 4 MB 的上限，请缩小页码范围。', 'err');
    return;
  }
  S.cfg = c;
  save();
  if (!SRC) {
    RAW = rawT;
    RAWIDX = idxOf(pages.map(function (p) { return p.t; }));
  }
  var u0 = useSnap();
  var sg;
  IDENT = new AbortController();
  sg = IDENT.signal;
  lock(true);
  bar(.02);
  try {
    if (fresh || !EXT || EXT.sig !== sig) {
      EXT = { sig: sig, pages: pages, wins: null, meta: {}, ranges: null };
    }
    var E = EXT;
    if (!E.wins) {
      var rg;
      var meta = {};
      if (manual) {
        rg = [[a, b]];
        meta.manual = 1;
      }
      else if (full <= 4500 || N <= 2) {
        rg = [[1, N]];
      }
      else {
        st('正在定位正文（1/2）…', 'run');
        bar(.06);
        try {
          meta = await locate(pages, sg);
          rg = meta.ranges;
        }
        catch (e) {
          if (!/格式有误|未能定位/.test(e.message)) {
            throw e;
          }
          meta = { note: '未能定位正文，已改为读取全部页面，用量会增加。' };
          rg = [[1, N]];
        }
      }
      E.meta = meta;
      E.ranges = rg;
      E.wins = buildWins(pages, rg);
      var T = $('fTitle');
      if (meta.title && (!T.value.trim() || T.dataset.auto)) {
        T.value = (meta.title + ' ' + (meta.code || '')).trim();
        T.dataset.auto = '1';
      }
      if (meta.code && !$('fCode').value.trim()) {
        $('fCode').value = meta.code.slice(0, 6);
      }
    }
    var q = E.wins.filter(function (w) { return !w.res; });
    var tot = E.wins.length;
    var fatalE = null;
    function prog() {
      var d = tot - E.wins.filter(function (w) { return !w.res; }).length;
      st('正在提取考点' + (E.meta.ranges ? '（2/2）' : '') + ' · ' + d + ' / ' + tot, 'run');
      bar(.1 + .85 * d / tot);
    }
    prog();
    async function worker() {
      while (q.length && !sg.aborted && !fatalE) {
        var w = q.shift();
        try {
          w.res = await extractWin(E, w.pages, sg);
          w.err = null;
        }
        catch (e) {
          if (e.name === 'AbortError' || sg.aborted) {
            break;
          }
          if (/HTTP 40[0-4]/.test(e.message)) {
            fatalE = e;
            break;
          }
          w.err = e.message;
        }
        prog();
      }
    }
    var W = c.kind === 'local' ? 1 : 3;
    var ws = [];
    for (var i = 0; i < W; i++) {
      ws.push(worker());
    }
    await Promise.all(ws);
    var left = E.wins.filter(function (w) { return !w.res; });
    if (sg.aborted) {
      st('已停止（' + (tot - left.length) + ' / ' + tot + '）。点击“继续识别”可从中断处继续。' + (useStr(u0) ? '\n' + useStr(u0) : ''));
      return;
    }
    if (fatalE) {
      st('识别已中断：' + fatalE.message.slice(0, 100) + hint(fatalE), 'err');
      return;
    }
    if (left.length) {
      st(left.length + ' 段未成功（' + fmtR(left.map(function (w) { return [w.pages[0], w.pages[w.pages.length - 1]]; })) +
          '）：' + String(left[0].err || '').slice(0, 80) + '。点击“继续识别”重试。', 'err');
      return;
    }
    var m = mergeAll(E, RAWIDX);
    if (!m.secs.length) {
      EXT = null;
      throw new Error('未识别到任何考点。请指定页码范围后重试，并确认文件是考纲。');
    }
    var raw = rawScan(E);
    var rc = reconcile(E, m, raw);
    var g0 = rc.gaps.length;
    if (g0) {
      st('正在补读缺失内容（' + g0 + '）…', 'run');
      bar(.96);
      await repairGaps(E, rc, sg, function (d, n) { st('正在补读 · ' + d + ' / ' + n, 'run'); });
      m = mergeAll(E, RAWIDX);
      rc = reconcile(E, m, raw);
    }
    var ol = buildOutline(m);
    var ta = $('fText');
    var o = ol.o;
    var low = (E.meta.core || E.meta.manual) ? lowPages(E, m) : [];
    UNDO = SRC ? '' : rawT;
    ta.value = ol.text;
    OUT = { text: ta.value.trim(), o: o, rc: { gaps: rc.gaps.map(function (r) { return r.title + '（缺 ' +
        r.missing.join('、') + '）'; }), fills: rc.gaps.map(function (r) {
          return { k: r.key || '', title: r.title, whole: !r.found, miss: r.missing.slice(0, 40), src: srcOf(E, r) };
        }) } };
    var miss = rc.gaps.reduce(function (a, r) { return a + r.missing.length; }, 0);
    var sk = (E.meta.skip || []).slice(0, 4).map(function (x) { return fmtR([x.r]) + (x.why ? '（' + x.why + '）' : ''); }).join('、');
    var rl = E.meta.ranges && !E.meta.note ? '正文：<b>' + esc(fmtR(E.meta.core || E.ranges)) + '</b>' + (sk ?
        ' · 已跳过：' + esc(sk) : '') : E.meta.manual ? '已读取：<b>' + esc(fmtR(E.ranges)) + '</b>' : '';
    var nt = '';
    var us = useStr(u0);
    var h = '<div class="res"><div class="sum"><div><b>' + o.sections.length + '</b><span>章节</span></div><div><b>' +
        o.n + '</b><span>考点</span></div>' +
      (miss ? '<div class="fix"><b>' + miss + '</b><span>缺失，生成时补全</span></div>' :
          '<div class="ok"><b>✓</b><span>与原文一致</span></div>') + '</div>';
    if (m.dropG) {
      nt += '<div class="ck-w">' + m.dropG + ' 条注释在原文中找不到，已移除。</div>';
    }
    if (low.length) {
      nt += '<div class="ck-s">第 ' + low.slice(0, 8).join('、') + (low.length > 8 ? ' 等' : '') + ' 页几乎没有内容进入结果。可能是说明文字，也可能有遗漏。</div>';
    }
    if (rl) {
      h += '<div class="res-l">' + rl + '</div>';
    }
    if (E.meta.note) {
      h += '<div class="res-l">' + esc(E.meta.note) + '</div>';
    }
    if (m.bad.length) {
      h += '<div class="res-w">' + m.bad.length + ' 条与原文略有出入，将在卡片上标注。</div>';
    }
    h += ckHTML(rc, o.n, g0, nt) + '<div class="res-u">' + (us ? '<span>' + esc(us) + '</span>' : '') + '<button class="chip" id="undoT" type="button">撤销</button></div></div>';
    st(h, '', 1);
    $('undoT').onclick = function () {
      ta.value = UNDO || '';
      OUT = null;
      if (!SRC) {
        RAW = '';
      }
      info(1);
      st('已撤销。');
    };
    $('status').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    EXT = null;
    if (c.auto && !m.bad.length && !low.length) {
      setTimeout(function () {
        if (!IDENT && $('modal').classList.contains('on') && STEP === 3) {
          setStep(4, 1);
          $('go').click();
        }
      }, 400);
    }
  }
  catch (e) {
    if (e.name === 'AbortError') {
      st('已停止。' + (EXT && pendWins() ? '点击“继续识别”可从中断处继续。' : ''));
    }
    else {
      st('识别失败：' + e.message + hint(e), 'err');
    }
  }
  finally {
    IDENT = null;
    lock(false);
    bar(null);
    info(1);
  }
}


/* ======== 12-outline.js ======== */
/**
 * 12 · outline.js — 大纲：本地解析、建科目、缺口占位
 */

/* ================= outline parsing (local, verbatim) ================= */
/* 规整的大纲由程序直接解析:章节、objective、大纲注释都逐字来自用户文本,AI 不需要也没有机会改写 */
function normT(t) {
  return String(t || '').toLowerCase().replace(/^[\d.\s]+/, '').replace(/[^a-z0-9一-鿿]+/g, ' ').trim();
}

function parseOutline(t) {
  t = String(t || '').replace(/\r\n?/g, '\n');
  var two = /^[ \t]*(##|＃＃)(?![#＃])\s*\S/m.test(t);
  var topics = [];
  var secs = [];
  var cur = null;
  var last = null;
  var lk = '';
  var n = 0;
  var g = 0;
  var H = false;
  function sec() {
    if (!cur) {
      cur = { title: '', topic: two && topics.length ? topics.length - 1 : null, items: [], bul: null };
      secs.push(cur);
    }
    return cur;
  }
  t.split('\n').forEach(function (raw) {
    if (!raw.trim()) {
      return;
    }
    var ind = /^(\t| {2,})/.test(raw);
    var l = raw.trim();
    var m = l.match(/^([#＃]{1,6})\s*(.+)$/);
    if (m) {
      H = true;
      if (two && m[1].length === 1) {
        topics.push(m[2].trim());
        cur = null;
      }
      else {
        cur = { title: m[2].trim(), topic: two && topics.length ? topics.length - 1 : null, items: [], bul: null };
        secs.push(cur);
      }
      last = null;
      lk = '';
      return;
    }
    var bm = l.match(/^[-*•▪◦·–>]\s*(.*)$/);
    var body = (bm ? bm[1] : l).trim();
    if (!body) {
      return;
    }
    var cont = !bm && /^[a-z(]/.test(body);
    if (last && lk === 'g' && cont) {
      last.guide[last.guide.length - 1] += ' ' + body;
      return;
    }
    if (last && lk === 'o' && cont && !ind) {
      last.text += ' ' + body;
      return;
    }
    if (last && (ind || l[0] === '>' || (bm && sec().bul === false))) {
      last.guide.push(body);
      g++;
      lk = 'g';
      return;
    }
    var s = sec();
    if (s.bul === null) {
      s.bul = !!bm;
    }
    var num = null;
    var nm = body.match(/^(\d{1,3})[.)]?\s+(?=\S)/);
    if (nm) {
      num = +nm[1];
      body = body.slice(nm[0].length);
    }
    else {
      body = body.replace(/^(?:\(?\d+(?:\.\d+)+[.)]?|\(?[a-z][.)])\s+(?=\S)/, '');
    }
    if (!body) {
      return;
    }
    last = { text: body, guide: [], n: num };
    s.items.push(last);
    n++;
    lk = 'o';
  });
  secs = secs.filter(function (s) { return s.items.length; });
  return { two: two, topics: topics, sections: secs, n: n, g: g, structured: H && n > 0 };
}

/* 识别时没找回的条目:在对应位置放一个「待补全」占位,同时把原文页存进 s.fill,生成时先补全再出卡片 */
function holder(sid, n) {
  return { id: sid + '.' + n, section: sid, text: '待补全：第 ' + n + ' 条', keys: [], notes: [], visual: null, chk: 1, pend: 1, gap: 1 };
}

function fillFor(F, title) {
  var k = numKey(title);
  return F.filter(function (f) { return f.k ? k === f.k : normT(f.title) === normT(title); })[0];
}

function buildSubject(title, code, o, rawIdx, fills) {
  var used = {};
  var tu = {};
  var F = (fills || []).map(function (f) { return Object.assign({}, f); });
  var blocks = [];
  var fo = [];
  function idFrom(t, u, fb) {
    var m = String(t).match(/^(\d+(?:\.\d+)*)\.?\s+(\S.*)$/);
    if (m && !u[m[1]]) {
      u[m[1]] = 1;
      return [m[1], m[2]];
    }
    var i = fb;
    while (u[String(i)]) {
      i++;
    }
    u[String(i)] = 1;
    return [String(i), String(t)];
  }
  var tps = o.two ? o.topics.map(function (t, i) {
    var r = idFrom(t, tu, i + 1);
    return { id: r[0], title: r[1], accent: PAL[i % PAL.length] };
  }) : null;
  o.sections.forEach(function (sc, i) {
    var r = idFrom(sc.title || '未分组', used, i + 1);
    var x = { id: r[0], title: r[1] };
    if (tps && sc.topic != null && tps[sc.topic]) {
      x.topic = tps[sc.topic].id;
    }
    var ns = sc.items.map(function (it) { return it.n; }); /* 编号齐全且不重复才沿用考纲原编号,卡片 ID 才能和「见 2.1.1」这类引用对上 */
    var useN = ns.every(function (v, k) { return v > 0 && ns.indexOf(v) === k; });
    var its = [];
    sc.items.forEach(function (it, j) {
      var n = useN ? it.n : j + 1;
      var y = { id: x.id + '.' + n, section: x.id, text: it.text, keys: [], notes: [], visual: null, chk: rawIdx ?
          (fits(it.text, rawIdx) ? 1 : 0) : 1, pend: 1 };
      if (it.guide.length) {
        y.guide = it.guide.slice();
      }
      its.push({ n: n, y: y });
    });
    var f = useN ? fillFor(F, sc.title) : null;
    if (f) {
      f.used = 1;
      var have = {};
      ns.forEach(function (v) { have[v] = 1; });
      var ms = f.miss.filter(function (n) { return !have[n]; });
      if (ms.length) {
        ms.forEach(function (n) { its.push({ n: n, y: holder(x.id, n) }); });
        its.sort(function (a, b) { return a.n - b.n; });
        fo.push({ k: f.k, sid: x.id, title: sc.title || x.title, miss: ms, src: f.src || '' });
      }
    }
    blocks.push({ x: x, items: its.map(function (z) { return z.y; }) });
  });
  /* 整个章节都没提取到:新建章节,放在编号对应的位置 */
  F.forEach(function (f) {
    if (!f.whole || f.used) {
      return;
    }
    var r = idFrom(f.title || f.k, used, blocks.length + 1);
    var x = { id: r[0], title: r[1] };
    var top = f.k ? String(f.k).split('.')[0] : '';
    var ms = f.miss.slice().sort(function (a, b) { return a - b; });
    var pos = blocks.length;
    if (!ms.length) {
      return;
    }
    if (tps) {
      var tp = tps.filter(function (t) { return t.id === top; })[0];
      if (tp) {
        x.topic = tp.id;
      }
    }
    for (var q = 0; q < blocks.length; q++) {
      if (cmpKey(blocks[q].x.id, x.id) > 0) {
        pos = q;
        break;
      }
    }
    blocks.splice(pos, 0, { x: x, items: ms.map(function (n) { return holder(x.id, n); }) });
    fo.push({ k: f.k, sid: x.id, title: f.title || x.title, miss: ms, src: f.src || '' });
  });
  var sections = blocks.map(function (b) { return b.x; });
  var items = [].concat.apply([], blocks.map(function (b) { return b.items; }));
  if (tps) {
    tps = tps.filter(function (t) { return sections.some(function (s) { return s.topic === t.id; }); });
  }
  var s = { id: 'g' + Date.now().toString(36), code: (code ||
      title.slice(0, 4)).toUpperCase(), title: title, accent: PAL[(S.subs.length + 1) % PAL.length], topics: tps &&
      tps.length ? tps : undefined, sections: sections, items: items };
  if (fo.length) {
    s.fill = fo;
  }
  return s;
}

/* 第 4 步用:对照当前文本框里的大纲,算出还缺哪些编号(用户自己补上的、删掉的都会考虑) */
function pendingFills(o) {
  var F = (OUT && OUT.rc && OUT.rc.fills) || [];
  var out = [];
  if (!o || !F.length) {
    return out;
  }
  F.forEach(function (f) {
    var sc = null;
    var k;
    o.sections.forEach(function (x) {
      if (sc) {
        return;
      }
      k = numKey(x.title);
      if (f.k ? k === f.k : normT(x.title) === normT(f.title)) {
        sc = x;
      }
    });
    var miss;
    if (sc) {
      var have = {};
      var ok = true;
      sc.items.forEach(function (it) { if (it.n == null || have[it.n]) {
        ok = false;
      }
      else {
        have[it.n] = 1;
      } });
      if (!ok) {
        return;
      }
      miss = f.miss.filter(function (n) { return !have[n]; });
    }
    else if (f.whole) {
      miss = f.miss.slice();
    }
    else {
      return;
    }
    if (miss.length) {
      out.push({ k: f.k, title: f.title, miss: miss, src: f.src || '' });
    }
  });
  return out;
}

function numKey(t) {
  var m = String(t || '').match(/^\s*(\d+(?:\.\d+)*)(?=\s|$)/);
  return m ? m[1] : null;
}

/* 把合并结果变成「# 主题 / ## 章节 / 编号 objective / - 注释」文本,同时给出等价的结构对象(免得再解析一次) */
function buildOutline(m) {
  var any = m.secs.some(function (s) { return s.topic; });
  var lines = [];
  var lt = null;
  var topics = [];
  var o = { two: any, topics: topics, sections: [], n: 0, g: 0, structured: true };
  m.secs.forEach(function (s) {
    var tp = any ? (s.topic || 'Other') : null;
    if (any && tp !== lt) {
      lines.push('# ' + tp);
      lt = tp;
      if (topics.indexOf(tp) < 0) {
        topics.push(tp);
      }
    }
    lines.push((any ? '## ' : '# ') + s.title);
    var sc = { title: s.title, topic: any ? topics.indexOf(tp) : null, items: [], bul: null };
    s.items.forEach(function (x) {
      lines.push((x.n != null ? x.n + ' ' : '') + x.t);
      x.g.forEach(function (z) { lines.push('  - ' + z); });
      sc.items.push({ text: x.t, guide: x.g.slice(), n: x.n });
      o.n++;
      o.g += x.g.length;
    });
    o.sections.push(sc);
    lines.push('');
  });
  return { text: lines.join('\n').trim(), o: o };
}

function cmpKey(a, b) {
  var A = String(a).split('.').map(Number);
  var B = String(b).split('.').map(Number);
  for (var i = 0; i < Math.max(A.length, B.length); i++) {
    var d = (A[i] || 0) - (B[i] || 0);
    if (d) {
      return d;
    }
  }
  return 0;
}

function contig(o) {
  var k = 0;
  while (o && o[k + 1]) {
    k++;
  }
  return k;
}

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


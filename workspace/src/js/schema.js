/* ======== 07-schema.js ======== */
/**
 * 07 · schema.js — 外部数据清洗：模型输出、导入文件一律先过这里
 */

function cleanVis(v) {
  var a = Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : []);
  var out = [];
  var dg = 0;
  a.forEach(function (x) {
    if (!x || typeof x !== 'object') {
      return;
    }
    var t = String(x.type || '').toLowerCase();
    var o = null;
    var title = S_(x.title, 90);
    if (t === 'table' && Array.isArray(x.headers) && Array.isArray(x.rows)) {
      var hs = arrS(x.headers, 6, 80);
      var w = hs.length || 6;
      var rows = x.rows.filter(function (r) { return r != null; }).slice(0, 12).map(function (r) {
        var c = [].concat(r).slice(0, w).map(function (z) { return S_(z, 180); });
        while (hs.length && c.length < w) {
          c.push('');
        }
        return c;
      });
      if (rows.length) {
        o = { type: t, headers: hs, rows: rows };
      }
    }
    else if (t === 'flow') {
      var st = arrS(x.steps, 9, 100);
      if (st.length >= 2) {
        o = { type: t, steps: st };
      }
    }
    else if (t === 'cycle') {
      st = arrS(x.steps, 6, 70);
      if (st.length >= 3) {
        o = { type: t, steps: st };
      }
    }
    else if (t === 'tree') {
      var ch = (Array.isArray(x.children) ? x.children : []).filter(function (c) { return c &&
          (typeof c !== 'object' || c.label); }).slice(0, 5).map(function (c) {
        return typeof c === 'object' ? { label: S_(c.label, 60), items: arrS(c.items, 4, 70) } : { label: S_(c, 60), items: [] };
      });
      if (ch.length >= 2 && x.root) {
        o = { type: t, root: S_(x.root, 60), children: ch };
      }
    }
    else if (t === 'layers') {
      var ls = arrS(x.layers, 6, 70);
      if (ls.length >= 2) {
        o = { type: t, layers: ls };
      }
    }
    else if (t === 'venn') {
      var L = arrS(x.leftOnly, 4, 60);
      var B = arrS(x.both, 4, 60);
      var R = arrS(x.rightOnly, 4, 60);
      if (x.left && x.right && (L.length + B.length + R.length)) {
        o = { type: t, left: S_(x.left, 40), right: S_(x.right, 40), leftOnly: L, both: B, rightOnly: R };
      }
    }
    if (!o) {
      return;
    }
    if (DIAG[t]) {
      if (dg) {
        return;
      }
      dg = 1;
      o = plainDeep(o);
    }
    o.title = title;
    out.push(o);
  });
  return out.length ? out.slice(0, 3) : null;
}

/* 导入的数据一律清洗:颜色、id、结构都校验,防止坏文件或恶意文件弄坏页面 */
function cleanFill(a) {
  if (!Array.isArray(a)) {
    return undefined;
  }
  var out = a.filter(function (f) {
    return f && typeof f === 'object' && f.sid != null && Array.isArray(f.miss);
  }).slice(0, 20).map(function (f) {
    return { k: S_(f.k, 20), sid: String(f.sid), title: S_(f.title, 160), miss: f.miss.map(pint).filter(function (n) { return n > 0 &&
        n < 1000; }).slice(0, 40), src: S_(f.src, 10000) };
  }).filter(function (f) { return f.miss.length; });
  return out.length ? out : undefined;
}

function cleanSub(o, keep) {
  if (!o || typeof o !== 'object' || !o.title || !Array.isArray(o.sections) || !Array.isArray(o.items)) {
    return null;
  }
  var tps = (Array.isArray(o.topics) ? o.topics : []).filter(function (t) { return t && t.id != null; }).map(function (t, i) {
    return { id: String(t.id), title: S_(t.title, 120), accent: safeC(t.accent, PAL[i % PAL.length]) };
  });
  var sec = o.sections.filter(function (x) { return x && x.id != null; }).map(function (x) {
    var r = { id: String(x.id), title: S_(x.title, 160) };
    if (x.topic != null && tps.length) {
      r.topic = String(x.topic);
    }
    return r;
  });
  var its = o.items.filter(function (x) { return x && x.id != null && x.section != null && x.text; }).map(function (x) {
    var r = { id: String(x.id), section: String(x.section), text: S_(x.text, 1200), keys: arrS(x.keys, 8, 200), notes: arrS(x.notes, 8, 400), visual: cleanVis(x.visual) };
    if (Array.isArray(x.leads)) {
      r.leads = arrS(x.leads, 4, 30);
    }
    var g = arrS(x.guide, 20, 500);
    if (g.length) {
      r.guide = g;
    }
    if (x.chk === 0 || x.chk === 1) {
      r.chk = x.chk;
    }
    if (x.pend) {
      r.pend = 1;
    }
    if (x.gap) {
      r.gap = 1;
      r.pend = 1;
    }
    if (x.ai) {
      r.ai = 1;
    }
    return r;
  });
  var fill = cleanFill(o.fill);
  its = its.filter(function (x) {
    return !x.gap || (fill && fill.some(function (f) { return f.sid === x.section; }));
  }); /* 没有对应补全信息的占位没有意义,丢掉 */
  if (!its.length) {
    return null;
  }
  var seenI = {};
  its = its.filter(function (x) {
    if (seenI[x.id]) {
      return false;
    }
    return seenI[x.id] = 1;
  });
  its.forEach(function (x) {
    if (!sec.some(function (c) { return c.id === x.section; })) {
      sec.push({ id: x.section, title: x.section });
    }
  });
  var id = keep && /^[\w-]{1,40}$/.test(String(o.id)) && o.id !== BUILTIN.id ? String(o.id) : 'g' +
      Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { id: id, code: S_(o.code ||
      o.title, 6), title: S_(o.title, 80), accent: safeC(o.accent, PAL[(S.subs.length +
      1) % PAL.length]), partial: o.partial ? S_(o.partial, 60) : '', topics: tps.length ? tps : undefined, sections: sec, items: its, fill: fill };
}


/* ======== 06-visuals.js ======== */
/**
 * 06 · visuals.js — 表格 / 流程 / 图示：模型只给结构化数据，SVG 由程序绘制
 */

/* ================= visuals: table / flow / diagrams ================= */
/* 模型只给结构化数据,SVG 由程序画:不会出现错位、乱码或注入的标签,深浅色模式也一致 */
var DIAG = { cycle: 1, tree: 1, layers: 1, venn: 1 };

function visual(v) {
  return (cleanVis(v) || []).map(function (x) {
    var h = '<div class="vis">' + (x.title ? '<div class="vis-t">' + esc(x.title) + '</div>' : '');
    var b = '';
    if (x.type === 'table') {
      b = '<table>' + (x.headers.length ? '<tr>' + x.headers.map(function (c) { return '<th>' + md(c) +
          '</th>'; }).join('') + '</tr>' : '') + x.rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td>' + md(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</table>';
    }
    else if (x.type === 'flow') {
      b = '<div class="flow">' + x.steps.map(function (s, i) { return '<span><em>' + (i + 1) + '</em>' + md(s) +
          '</span>'; }).join('<b>' + IC.arr + '</b>') + '</div>';
    }
    else {
      b = ({ cycle: dCycle, tree: dTree, layers: dLayers, venn: dVenn })[x.type](x);
    }
    return h + b + '</div>';
  }).join('');
}

function tw(s, fs) {
  var w = 0;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    w += c > 0x2e7f ? fs : c === 32 ? fs * .3 : (c > 64 && c < 91 ? fs * .66 : fs * .56);
  }
  return w;
}

function wrapT(s, maxW, fs, maxL) {
  var toks = String(s || '').trim().match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) || [];
  var lines = [];
  var cur = '';
  toks.forEach(function (t) {
    if (/^\s+$/.test(t)) {
      if (cur) {
        cur += ' ';
      }
      return;
    }
    var nx = cur + t;
    if (cur.trim() && tw(nx.trim(), fs) > maxW) {
      lines.push(cur.trim());
      cur = t;
    }
    else {
      cur = nx;
    }
  });
  if (cur.trim()) {
    lines.push(cur.trim());
  }
  maxL = maxL || 3;
  if (lines.length > maxL) {
    lines = lines.slice(0, maxL);
    lines[maxL - 1] += '…';
  }
  return lines;
}

function tx(x, y, lines, cls, lh, anc) {
  return '<text x="' + x + '" y="' + y + '" class="' + (cls || '') + '" text-anchor="' + (anc || 'middle') + '">' + lines.map(function (l, i) {
    return '<tspan x="' + x + '" dy="' + (i ? lh : 0) + '">' + esc(l) + '</tspan>';
  }).join('') + '</text>';
}

var MKID = 0;

function mk() {
  var id = 'dgA' + (++MKID);
  return { id: id, def: '<defs><marker id="' + id + '" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.5L9 5L1 8.5z" class="acc"/></marker></defs>' };
}

function svgW(h, body, label) {
  return '<svg class="dg" viewBox="0 0 380 ' + Math.ceil(h) + '" role="img" aria-label="' + esc(label || '') + '">' +
      body + '</svg>';
}

function clip(cx, cy, hw, hh, dx, dy, gap) {
  var t = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9);
  var L = Math.hypot(dx, dy) || 1;
  return [cx + dx * t + dx / L * gap, cy + dy * t + dy / L * gap];
}

function vmid(y, h, n, lh) { return (y + h / 2 - (n - 1) * lh / 2 + 4.2).toFixed(1); }

/* 画布宽 380:和右栏实际宽度接近,字号基本 1:1,不会缩成小字 */
function dCycle(v) {
  var st = v.steps;
  var n = st.length;
  var bw = n > 5 ? 86 : n > 4 ? 98 : 112;
  var L = st.map(function (s) { return wrapT(s, bw - 16, 12, 3); });
  var bh = Math.max.apply(0, L.map(function (l) { return l.length; })) * 15 + 16;
  var rx = Math.min(142, 186 - bw / 2);
  var ry = bh + (n > 4 ? 34 : 30);
  var cx = 190;
  var m = mk();
  var P = st.map(function (s, i) {
    var a = (-90 + i * 360 / n) * Math.PI / 180;
    return [cx + rx * Math.cos(a), ry * Math.sin(a)];
  });
  var off = 10 - (Math.min.apply(0, P.map(function (p) { return p[1]; })) - bh / 2);
  P.forEach(function (p) { p[1] += off; });
  var cy = off;
  var H = Math.max.apply(0, P.map(function (p) { return p[1]; })) + bh / 2 + 10;
  var o = m.def;
  P.forEach(function (p, i) {
    var q = P[(i + 1) % n];
    var dx = q[0] - p[0];
    var dy = q[1] - p[1];
    var a = clip(p[0], p[1], bw / 2, bh / 2, dx, dy, 4);
    var b = clip(q[0], q[1], bw / 2, bh / 2, -dx, -dy, 6);
    var mx = (a[0] + b[0]) / 2;
    var my = (a[1] + b[1]) / 2;
    var ox = mx - cx;
    var oy = my - cy;
    var ol = Math.hypot(ox, oy) || 1;
    o += '<path d="M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + 'Q' + (mx + ox / ol * 12).toFixed(1) + ' ' + (my +
        oy / ol * 12).toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + '" class="lna" marker-end="url(#' + m.id + ')"/>';
  });
  P.forEach(function (p, i) {
    o += '<rect x="' + (p[0] - bw / 2).toFixed(1) + '" y="' + (p[1] - bh / 2).toFixed(1) + '" width="' + bw +
        '" height="' + bh + '" rx="10" class="' + (i ? 'bx' : 'bxa') + '"/>' +
        tx(p[0].toFixed(1), vmid(p[1] - bh / 2, bh, L[i].length, 15), L[i], i ? '' : 'lbl', 15);
  });
  return svgW(H, o, v.title);
}

function dTree(v) {
  var ch = v.children;
  var n = ch.length;
  var RL = wrapT(v.root, 200, 12.5, 2);
  var rh = RL.length * 15 + 16;
  var rw = Math.min(240, Math.max.apply(0, RL.map(function (l) { return tw(l, 12.5); })) + 36);
  var o = '';
  var H;
  if (n <= 3) {
    var colW = 372 / n;
    var cy = rh + 38;
    var LB = ch.map(function (c) { return wrapT(c.label, colW - 20, 12, 3); });
    var chH = Math.max.apply(0, LB.map(function (l) { return l.length; })) * 15 + 14;
    var cs = ch.map(function (c, i) { return 4 + colW * i + colW / 2; });
    var mid = rh + 22;
    H = cy + chH;
    o += '<rect x="' + (190 - rw / 2) + '" y="4" width="' + rw + '" height="' + rh + '" rx="10" class="bxa"/>' + tx(190, vmid(4, rh, RL.length, 15), RL, 'lbl', 15);
    o += '<path d="M190 ' + (rh + 4) + 'V' + mid + 'M' + cs[0] + ' ' + mid + 'H' + cs[n - 1] +
        cs.map(function (x) { return 'M' + x + ' ' + mid + 'V' + cy; }).join('') + '" class="ln"/>';
    ch.forEach(function (c, i) {
      var x0 = 4 + colW * i + 4;
      var w = colW - 8;
      var y = cy + chH + 17;
      o += '<rect x="' + x0 + '" y="' + cy + '" width="' + w + '" height="' + chH + '" rx="9" class="bx"/>' + tx(cs[i], vmid(cy, chH, LB[i].length, 15), LB[i], 'lbl', 15);
      c.items.forEach(function (it) {
        var l = wrapT(it, w - 18, 11.5, 3);
        o += '<circle cx="' + (x0 + 6) + '" cy="' + (y - 4) + '" r="2" class="acc"/>' + tx(x0 + 14, y, l, 'sm', 14.5, 'start');
        y += l.length * 14.5 + 5;
      });
      H = Math.max(H, y);
    });
  }
  else { /* 4-5 个分支:改成大纲式,每个分支一行,避免挤成窄列 */
    o += '<rect x="4" y="4" width="' + rw + '" height="' + rh + '" rx="10" class="bxa"/>' + tx(4 + rw / 2, vmid(4, rh, RL.length, 15), RL, 'lbl', 15);
    var y = rh + 16;
    var lw = 118;
    var last = 0;
    ch.forEach(function (c) {
      var LB = wrapT(c.label, lw - 18, 12, 2);
      var IT = c.items.length ? wrapT(c.items.join(' · '), 380 - lw - 44, 11.5, 3) : [];
      var h = Math.max(LB.length * 15 + 14, IT.length * 14.5 + 12);
      o += '<path d="M22 ' + (y + h / 2) + 'H34" class="ln"/><rect x="34" y="' + y + '" width="' + lw + '" height="' +
          h + '" rx="9" class="bx"/>' + tx(34 + lw / 2, vmid(y, h, LB.length, 15), LB, 'lbl', 15);
      if (IT.length) {
        o += tx(34 + lw + 12, vmid(y, h, IT.length, 14.5), IT, 'sm', 14.5, 'start');
      }
      last = y + h / 2;
      y += h + 8;
    });
    o = '<path d="M22 ' + (rh + 4) + 'V' + last + '" class="ln"/>' + o;
    H = y - 4;
  }
  return svgW(H + 4, o, v.title);
}

function dLayers(v) {
  var ls = v.layers;
  var n = ls.length;
  var y = 4;
  var o = '';
  ls.forEach(function (s, i) {
    var w = n > 1 ? 250 + 120 * i / (n - 1) : 370;
    var l = wrapT(s, w - 24, 12, 2);
    var h = l.length * 15 + 18;
    o += '<rect x="' + (190 - w / 2) + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="9" class="' + (i ?
        'bx' : 'bxa') + '"/>' + tx(190, vmid(y, h, l.length, 15), l, i ? '' : 'lbl', 15);
    y += h + 5;
  });
  return svgW(y, o, v.title);
}

function dVenn(v) {
  var r = 94;
  var xl = 146;
  var xr = 234;
  var cy = r + 28;
  var o = '<circle cx="' + xl + '" cy="' + cy + '" r="' + r + '" class="va"/><circle cx="' + xr + '" cy="' + cy +
      '" r="' + r + '" class="vb"/>';
  o += tx(xl - 30, 16, wrapT(v.left, 150, 12, 1), 'lbl acc', 15) + tx(xr + 30, 16, wrapT(v.right, 150, 12, 1), 'lbl', 15);
  [[v.leftOnly, xl - 46, 76], [v.both, 190, 74], [v.rightOnly, xr + 46, 76]].forEach(function (g) {
    var Ls = g[0].map(function (s) { return wrapT(s, g[2], 11, 3); });
    var tot = Ls.reduce(function (a, l) { return a + l.length * 14 + 6; }, -6);
    var y = cy - tot / 2 + 10;
    Ls.forEach(function (l) {
      o += tx(g[1], y, l, 'sm', 14);
      y += l.length * 14 + 6;
    });
  });
  return svgW(cy + r + 6, o, v.title);
}


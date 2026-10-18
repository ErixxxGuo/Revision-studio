/* ======== 20-sidebar.js ======== */
/**
 * 20 · sidebar.js — 侧栏：科目与章节列表、重命名、抽屉、拖动调宽
 */

var RENAME = null;
var RNLOCK = 0;

function side() {
  var lt = null;
  var ri = $('rnI');
  var keep = RENAME && ri ?
      { v: ri.value, a: ri.selectionStart, b: ri.selectionEnd, f: document.activeElement === ri } : null;
  if (RENAME) {
    var rs = byId(RENAME);
    if (!rs || rs.builtin) {
      RENAME = null;
    }
  }
  RNLOCK = 1;
  $('list').innerHTML = all().map(function (s) {
    var n = s.items.filter(function (i) { return rev(s, i.id); }).length;
    var cur = (V === 'subject' && s.id === S.cur) || (V === 'papers' && PAPER.scope === s.id);
    var fd = !!S.fold[s.id];
    var on = cur && !fd;
    var h;
    if (RENAME === s.id) {
      h = '<div class="sub-row edit' + (cur ? ' cur' : '') + '"><span class="rn-r">' +
          ring(n / s.items.length, ac(s.accent)) + '</span><input id="rnI" class="rn-in" maxlength="80" value="' +
          esc(s.title) +
          '" aria-label="科目名称" spellcheck="false" autocomplete="off"><button class="sa ok" type="button" data-rnok="1" title="保存（Enter）" aria-label="保存名称">' +
          IC.ck + '</button></div>';
    }
    else {
      h = '<div class="sub-row' + (cur ? ' cur' : '') + (cur && fd ? ' fold' : '') + (s.builtin ? '' : ' ha') +
          '"><button class="sub-main" type="button" title="' + (cur ? '展开或收起章节' : '打开此科目') + '" aria-expanded="' + on +
          '" data-s="' + esc(s.id) + '">' + IC.chev + ring(n / s.items.length, ac(s.accent)) + '<span class="nm">' +
          esc(s.title) + '</span><span class="n">' + n + '/' + s.items.length + '</span></button>' +
        (s.builtin ? '' : '<span class="sub-acts"><button class="sa" type="button" data-ren="' + esc(s.id) +
            '" title="重命名" aria-label="重命名科目">' + ICP + '</button><button class="sa" type="button" data-shr="' + esc(s.id) +
            '" title="分享" aria-label="分享科目">' + ICS + '</button><button class="sa del" type="button" data-del="' + esc(s.id) +
            '" title="删除" aria-label="删除科目">' + ICT + '</button></span>') + '</div>';
    }
    if (on) {
      h += '<div class="secs">' + s.sections.map(function (sc) {
        var tH = '';
        var tp = topicOf(s, sc.id);
        if (tp && tp.id !== lt) {
          lt = tp.id;
          tH = '<div class="tp" style="--a:' + ac(tp.accent) + '"><i></i>' + esc(tp.id + ' ' + tp.title) + '</div>';
        }
        var its = secItems(s, sc.id);
        var d = its.filter(function (i) { return rev(s, i.id); }).length;
        var c = its.indexOf(s.items[S.idx]) > -1;
        var full = its.length && d === its.length;
        var pd = its.length && its.every(function (i) { return i.pend; });
        return tH + '<button class="sec-row' + (c ? ' cur' : '') + (full ? ' done' : '') + (pd ? ' pend' : '') +
            '" style="--a:' + ac(tp ? tp.accent : s.accent) + '" data-secsub="' + esc(s.id) + '" data-sec="' + esc(sc.id) + '"' + (pd ? ' title="尚未生成笔记"' : '') +
            '><span>' + esc(sc.id) + ' ' + esc(sc.title) + '</span><i>' + (full ? IC.ck : d + '/' + its.length) + '</i></button>';
      }).join('') + '</div>';
    }
    return h + paperFolder(s.id);
  }).join('') + paperFolder('');
  RNLOCK = 0;
  if (keep) {
    var n2 = $('rnI');
    if (n2) {
      n2.value = keep.v;
      if (keep.f) {
        n2.focus();
        try {
          n2.setSelectionRange(keep.a, keep.b);
        }
        catch { }
      }
    }
  } /* 生成过程中会不停刷新侧栏:别把正在输入的名字冲掉 */
}

function startRename(id) {
  var s = byId(id);
  if (!s || s.builtin) {
    return;
  }
  RENAME = id;
  side();
  var i = $('rnI');
  if (i) {
    i.focus();
    i.select();
  }
}

var RNT = 0;

/* defer:因为点了别处而失去焦点时,先只保存名字、不立刻重画侧栏——鼠标按下的那个元素在抬起前被换掉,这一下点击就丢了;
   点击会自己触发重绘,没有点击(比如按 Tab 离开)时 350ms 后补一次 */
function endRename(ok, defer) {
  if (!RENAME) {
    return;
  }
  var id = RENAME;
  var i = $('rnI');
  var v = i ? i.value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  var s = byId(id);
  RENAME = null;
  var changed = !!(ok && s && !s.builtin && v && v !== s.title);
  if (changed) {
    s.title = v;
    save();
  }
  clearTimeout(RNT);
  if (defer) {
    if (changed && S.cur === id) {
      $('title').textContent = v;
    }
    RNT = setTimeout(function () {
      if (RENAME) {
        return;
      }
      if (S.cur === id && byId(id)) {
        render();
      }
      else {
        side();
      }
      genbar();
    }, 350);
  }
  else {
    if (S.cur === id) {
      render();
    }
    else {
      side();
    }
    genbar();
  }
  if (changed) {
    toast('已重命名为“' + v + '”');
  }
}

function drawer(o) {
  $('sidebar').classList.toggle('open', o);
  $('scrim').classList.toggle('on', o);
}

/* ================= 侧栏宽度:拖动、键盘、双击恢复 ================= */
var SBW_MIN = 256; /* 256:再窄品牌名就会被截断 */
var SBW_MAX = 440;
var SBW_DEF = 288;

function sbClamp(w) {
  var mx = Math.min(SBW_MAX, Math.max(SBW_MIN, innerWidth - 520));
  return Math.max(SBW_MIN, Math.min(mx, Math.round(+w || SBW_DEF)));
}

function sbApply(w, keep) {
  w = sbClamp(w);
  document.documentElement.style.setProperty('--sbw', w + 'px');
  $('sbR').setAttribute('aria-valuenow', w);
  if (keep) {
    S.sbw = w;
    save();
  }
  return w;
}

function bindResizeHandle() {
  var h = $('sbR');
  var x0 = 0;
  var w0 = 0;
  var on = false;
  h.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) {
      return;
    }
    on = true;
    x0 = e.clientX;
    w0 = $('sidebar').getBoundingClientRect().width;
    try {
      h.setPointerCapture(e.pointerId);
    }
    catch { }
    document.body.classList.add('rs');
    e.preventDefault();
  });
  h.addEventListener('pointermove', function (e) { if (on) {
    sbApply(w0 + e.clientX - x0, false);
  } });
  function end(e) {
    if (!on) {
      return;
    }
    on = false;
    document.body.classList.remove('rs');
    try {
      h.releasePointerCapture(e.pointerId);
    }
    catch { }
    S.sbw = Math.round($('sidebar').getBoundingClientRect().width);
    save();
  }
  h.addEventListener('pointerup', end);
  h.addEventListener('pointercancel', end);
  h.addEventListener('dblclick', function () { sbApply(SBW_DEF, true); });
  h.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home') {
      e.stopPropagation();
    }
    var w = Math.round($('sidebar').getBoundingClientRect().width);
    var d = e.shiftKey ? 48 : 16;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      sbApply(w - d, true);
    }
    else if (e.key === 'ArrowRight') {
      e.preventDefault();
      sbApply(w + d, true);
    }
    else if (e.key === 'Home') {
      e.preventDefault();
      sbApply(SBW_DEF, true);
    }
  });
  addEventListener('resize', function () { sbApply(S.sbw || SBW_DEF, false); });
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindSidebar() {
  $('list').onclick = function (e) {
    var exported = e.target.closest('[data-psaveexport]');
    if (exported) { paperExport(exported.dataset.psaveexport); exported.closest('details').open = false; return; }
    var removed = e.target.closest('[data-psavedelete]');
    if (removed) { paperDelete(removed.dataset.psavedelete); return; }
    var pf = e.target.closest('[data-pfolder]');
    if (pf) {
      PAPER.folders[pf.dataset.pfolder] = !PAPER.folders[pf.dataset.pfolder];
      side();
      var folder = Array.from($('list').querySelectorAll('[data-pfolder]')).find(function (b) { return b.dataset.pfolder === pf.dataset.pfolder; });
      if (folder) { folder.focus(); }
      return;
    }
    var saved = e.target.closest('[data-psaved]');
    if (saved) {
      showPaper(saved.dataset.psaved);
      return;
    }
    var rn = e.target.closest('[data-ren]');
    if (rn) {
      startRename(rn.dataset.ren);
      return;
    }
    var sh = e.target.closest('[data-shr]');
    if (sh) {
      openShare(sh.dataset.shr);
      return;
    }
    if (e.target.closest('[data-rnok]')) {
      endRename(true);
      return;
    }
    var d = e.target.closest('[data-del]');
    if (d) {
      var id = d.dataset.del;
      var t = (byId(id) || {}).title;
      if (confirm('删除“' + t + '”？\n此科目及其复习进度将被删除，无法撤销。')) {
        if (JOB && JOB.sub === id) {
          stopJob();
        }
        S.subs = S.subs.filter(function (x) { return x.id !== id; });
        delete S.prog[id];
        delete S.fold[id];
        delete S.pos[id];
        if (S.cur === id) {
          S.cur = BUILTIN.id;
          S.idx = 0;
        }
        render();
      }
      return;
    }
    var r = e.target.closest('[data-s]');
    if (r) {
      var sid = r.dataset.s;
      if (V === 'subject' && sid === S.cur) {
        S.fold[S.cur] = !S.fold[S.cur];
        side();
        save();
      }
      else {
        openSubject(sid);
      }
      return;
    }
    var c = e.target.closest('[data-sec]');
    if (c) {
      var s = byId(c.dataset.secsub) || sub();
      openSubject(s.id, s.items.indexOf(secItems(s, c.dataset.sec)[0]));
    }
  };
  $('list').addEventListener('keydown', function (e) {
    if (e.target.id !== 'rnI') {
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      endRename(true);
    }
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endRename(false);
    }
  });
  $('list').addEventListener('focusout', function (e) {
    if (e.target.id === 'rnI' && !RNLOCK && RENAME) {
      endRename(true, true);
    }
  });
  $('sbToggle').onclick = function () { drawer(!$('sidebar').classList.contains('open')); };
  $('scrim').onclick = function () { drawer(false); };
  bindResizeHandle();
}

/* ======== 21-home.js ======== */
/**
 * 21 · home.js — 视图切换与首页
 */

/* ================= 视图:首页 / 科目 ================= */
var V = 'home';

function setView(v) {
  V = v;
  document.body.classList.toggle('home', v === 'home');
  document.body.classList.toggle('papers', v === 'papers');
}

function openSubject(id, idx) {
  var s = byId(id) || BUILTIN;
  S.cur = s.id;
  S.fold[s.id] = false;
  S.idx = idx != null ? idx : (S.pos[s.id] || 0);
  PARTREQ = 0;
  setView('subject');
  drawer(false);
  render();
}

function goHome() {
  if (V === 'home') {
    drawer(false);
    return;
  }
  setView('home');
  drawer(false);
  render();
  $('home').scrollTop = 0;
}

function hmCard(s) {
  var n = s.items.filter(function (i) { return rev(s, i.id); }).length;
  var t = s.items.length;
  var pn = s.items.filter(function (x) { return x.pend; }).length;
  var showCode = s.code && s.title.toLowerCase().indexOf(String(s.code).toLowerCase()) < 0;
  return '<button class="hm-card" type="button" data-hs="' + esc(s.id) + '" style="--a:' + ac(s.accent) +
      '"><span class="t"><b>' + esc(s.title) + '</b>' + (showCode ? '<i>' + esc(s.code) + '</i>' : '') +
      '</span><span class="hm-bar"><i style="width:' + (t ? (n / t * 100).toFixed(1) : 0) +
      '%"></i></span><span class="m"><span>已复习 ' + n + ' / ' + t + '</span><span>' + (pn ? '待生成 ' + pn : Math.round(t ?
      n / t * 100 : 0) + '%') + '</span></span></button>';
}

function homeRender() {
  document.documentElement.style.setProperty('--accent', ac(BUILTIN.accent));
  var subs = all();
  var h = '';
  var started = S.subs.length > 0 || subs.some(function (s) { return s.items.some(function (i) { return rev(s, i.id); }); });
  if (!started) {
    h = '<svg class="hm-logo" aria-hidden="true"><use href="#lg"/></svg><p class="hm-eye">欢迎使用</p><h1>Revision Studio</h1><p class="hm-sub">把考纲变成可逐条复习的卡片。</p>' +
      '<ol class="hm-steps"><li><span class="n">1</span><h3>上传考纲</h3><p>PDF 或文本。</p></li><li><span class="n">2</span><h3>识别考点</h3><p>提取并与原文核对。</p></li><li><span class="n">3</span><h3>生成卡片</h3><p>每个考点一张笔记。</p></li></ol>' +
      '<div class="hm-act"><button class="btn p" type="button" data-hm="new">新建科目</button><button class="btn" type="button" data-hm="sample">查看示例</button><button class="lnk" type="button" data-hm="import">导入…</button></div>';
  }
  else {
    var c = sub();
    var idx = Math.max(0, Math.min(S.idx, c.items.length - 1));
    var it = c.items[idx];
    var sec = c.sections.filter(function (x) { return x.id === it.section; })[0] || { id: it.section, title: '' };
    var n = c.items.filter(function (i) { return rev(c, i.id); }).length;
    var col = ac((topicOf(c, it.section) || c).accent);
    h = '<h1>欢迎回来</h1><div class="hm-cont" style="--a:' + col + '">' + ring(n / c.items.length, col) +
        '<div class="ct"><small>继续复习</small><h2>' + esc(c.title) + '</h2><p>' + esc((sec.id + ' ' + sec.title).trim()) +
        ' · 已复习 ' + n + ' / ' + c.items.length +
        '</p></div><button class="btn p" type="button" data-hm="continue">继续</button></div>' +
      '<div class="hm-sec"><span>全部科目</span></div><div class="hm-grid">' + subs.map(hmCard).join('') +
          '<button class="hm-card add" type="button" data-hm="new"><b>新建科目</b><span>从考纲生成卡片</span></button></div>' +
      '<div class="hm-foot"><button class="lnk" type="button" data-hm="import">导入…</button></div>';
  }
  h += '<div class="hm-paper"><div><h2>题目解析</h2><p>上传题目或试卷，可附评分标准。查看解题步骤和相关考点。</p></div><button class="btn p" type="button" data-hm="paper">导入题目</button><button class="btn" type="button" data-hm="paper-history">历史题目</button></div>';
  $('hmBody').innerHTML = h;
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindHome() {
  $('hmBody').onclick = function (e) {
    var b = e.target.closest('[data-hm],[data-hs]');
    if (!b) {
      return;
    }
    if (b.dataset.hs) {
      openSubject(b.dataset.hs);
      return;
    }
    var a = b.dataset.hm;
    if (a === 'paper') {
      openPaperImport();
    }
    else if (a === 'paper-history') {
      openPaperHistory(null);
    }
    else if (a === 'new') {
      openM();
    }
    else if (a === 'import') {
      openImport();
    }
    else if (a === 'sample') {
      openSubject(BUILTIN.id, 0);
    }
    else if (a === 'continue') {
      openSubject(S.cur, S.idx);
    }
  };
  $('hmBtn').onclick = goHome;
  $('hmToggle').onclick = function () { drawer(!$('sidebar').classList.contains('open')); };
}

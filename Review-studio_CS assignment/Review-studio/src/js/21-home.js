/* ======== 21-home.js ======== */
/**
 * 21 · home.js — 视图切换与首页
 */

/* ================= 视图:首页 / 科目 ================= */
var V = 'home';

function setView(v) {
  V = v;
  document.body.classList.toggle('home', v === 'home');
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
    if (a === 'new') {
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


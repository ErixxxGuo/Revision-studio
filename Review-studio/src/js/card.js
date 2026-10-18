/* ======== 22-card.js ======== */
/**
 * 22 · card.js — 复习卡片：渲染、翻页、标记已复习、键盘
 */

/* 卡片右下角的线稿:点阵 + 同心轨道,按章节取不同的参数,同一章节保持一致 */
var lastMotif = '';
var lastCard = '';

/* ================= render ================= */
function render() {
  if (V === 'papers') {
    paperRender();
    side();
    saveSoon();
    return;
  }
  if (V === 'home') {
    homeRender();
    side();
    saveSoon();
    return;
  }
  var s = sub();
  if (!s.items || !s.items.length) {
    S.cur = BUILTIN.id;
    s = BUILTIN;
  }
  if (!(S.idx >= 0 && S.idx < s.items.length)) {
    S.idx = 0;
  }
  var it = s.items[S.idx];
  var tp = topicOf(s, it.section);
  var sec = s.sections.filter(function (x) { return x.id === it.section; })[0] || { id: it.section, title: '' };
  S.pos[s.id] = S.idx;
  document.documentElement.style.setProperty('--accent', ac((tp || s).accent));
  $('code').textContent = s.code || '';
  $('title').textContent = s.title;
  var sl = (sec.id + ' ' + sec.title).trim();
  var tl = tp ? (tp.id + ' ' + tp.title).trim() : '';
  $('crumb').textContent = tl && tl !== sl ? tl + ' — ' + sl : sl;
  $('ref').innerHTML = '<b>' + esc(it.id) + '</b>' + (it.ai ?
      '<span class="aib" title="此条由 AI 根据上下文补全，请以官方考纲为准">AI 补全</span>' : '');
  drawObj();
  var mkey = s.id + '|' + it.section;
  if (mkey !== lastMotif) {
    lastMotif = mkey;
    $('motif').innerHTML = motif(mkey);
  }
  var r = rev(s, it.id);
  $('rv').classList.toggle('done', r);
  $('rv').setAttribute('aria-pressed', String(r));
  $('rvl').textContent = r ? 'Reviewed' : 'Mark reviewed';
  var here = secItems(s, it.section);
  $('counter').innerHTML = '<b>' + (here.indexOf(it) + 1) + '</b> / ' + here.length + '<span class="cl"> in this section</span>';
  $('dots').innerHTML = here.map(function (x) {
    var g = s.items.indexOf(x);
    return '<button class="d' + (rev(s, x.id) ? ' r' : '') + (g === S.idx ? ' c' : '') + '" data-i="' + g +
        '" title="' + esc(x.id) + '" aria-label="第 ' + esc(x.id) + ' 条"></button>';
  }).join('');
  var dn = s.items.filter(function (x) { return rev(s, x.id); }).length;
  $('trackFill').style.width = (dn / s.items.length * 100) + '%';
  $('track').title = '已复习 ' + dn + ' / ' + s.items.length;
  renderAid();
  var ck = s.id + '|' + it.id;
  if (ck !== lastCard) {
    lastCard = ck;
    var ad = document.querySelector('.aid');
    var mn = document.querySelector('main');
    if (ad) {
      ad.scrollTop = 0;
    }
    if (mn) {
      mn.scrollTop = 0;
    }
  } /* 换了一条才回到顶部(手机上滚动的是 main,桌面上是 .aid);生成、标记已复习等后台刷新不动滚动位置 */
  side();
  saveSoon();
}

function renderAid() {
  var s = sub();
  var it = s.items[S.idx];
  if (!it) {
    return;
  }
  if (s.rich) {
    $('nd').innerHTML = (it.svg || '') + markTerms(it.detail || '', it);
    $('notes').innerHTML = (it.notes || []).map(function (n) { return '<li>' + bn(n, it) + '</li>'; }).join('');
    ['aitag', 'guide', 'vis', 'pend'].forEach(function (k) { $(k).innerHTML = ''; });
    return;
  }
  $('nd').innerHTML = '';
  var g = it.guide || [];
  $('guide').innerHTML = g.length ? '<div class="guide"><div class="guide-t">考纲注释</div><ul>' +
      g.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
  $('vis').innerHTML = it.pend ? '' : visual(it.visual);
  $('notes').innerHTML = it.pend ? '' : (it.notes || []).map(function (n) { return '<li>' + md(n) + '</li>'; }).join('');
  typeset($('notes'));
  typeset($('vis'));
  var pn = s.items.filter(function (x) { return x.pend; }).length;
  var busy = !!(JOB && JOB.sub === s.id);
  var tag = '';
  if (s.partial) {
    tag += '<span>仅含' + esc(s.partial) + '</span>';
  }
  if (it.ai) {
    tag += '<span class="aib" title="此条由 AI 根据上下文补全，请以官方考纲为准">AI 补全</span>';
  }
  if (it.chk === 0) {
    tag += '<span class="warn">与考纲原文略有出入</span>';
  }
  if (pn && !busy) {
    tag += '<button class="chip p" data-act="resume" title="从中断处继续，已生成的不会重复">继续生成（剩余 ' + pn + ' 条）</button>';
  }
  if (!it.pend) {
    tag += '<button class="chip" data-act="regen" title="重新生成当前这一条">重新生成</button>';
  }
  $('aitag').innerHTML = tag;
  $('pend').innerHTML = it.pend ? '<div class="pending">' + IC.art + '<div>' + (it.gap ? (busy ? '正在补全此考点，完成后自动显示。' :
      '此考点尚未补全。') : (busy ? '正在生成，完成后自动显示。' : '尚未生成笔记。')) + '</div>' + (busy ? '' : '<button class="chip p" data-act="' +
      (it.gap ? 'resume' : 'regen') + '">' + (it.gap ? '继续补全' : '生成') + '</button>') + '</div>' : '';
}

function go(i, part) {
  var s = sub();
  S.idx = Math.max(0, Math.min(i, s.items.length - 1));
  PARTREQ = part == null ? 0 : part;
  render();
}

function navUI() {
  var s = sub();
  $('prev').disabled = S.idx === 0 && PART === 0;
  $('next').disabled = S.idx === s.items.length - 1 && PART >= PGN - 1;
}

function drawObj() {
  var s = sub();
  var it = s.items && s.items[S.idx];
  if (!it) {
    return;
  }
  var key = s.id + '|' + it.id;
  if (key !== lastObjKey) {
    lastObjKey = key;
    if (PARTREQ == null) {
      PART = 0;
    }
  }
  var pg = pagesOf(s, it);
  PGN = pg.length;
  if (PARTREQ != null) {
    PART = PARTREQ === 'last' ? PGN - 1 : (+PARTREQ || 0);
    PARTREQ = null;
  }
  PART = Math.max(0, Math.min(PART, PGN - 1));
  var o = $('obj');
  o.className = objTier(it.text);
  o.innerHTML = pg[PART];
  var pr = $('pager');
  pr.hidden = PGN < 2;
  if (PGN > 1) {
    $('pgN').innerHTML = 'Part <b>' + (PART + 1) + '</b> / ' + PGN;
    $('pgD').innerHTML = pg.map(function (x, i) { return '<i' + (i === PART ? ' class="on"' : '') + '></i>'; }).join('');
    $('pgPrev').disabled = PART === 0;
    $('pgNext').disabled = PART === PGN - 1;
  }
  navUI();
}

/* 先翻完本条的各页,再进下一条;往回翻时落在上一条的最后一页 */
function step(d) {
  var s = sub();
  if (d > 0) {
    if (PART < PGN - 1) {
      PARTREQ = PART + 1;
      drawObj();
      return;
    }
    if (S.idx < s.items.length - 1) {
      go(S.idx + 1, 0);
    }
  }
  else {
    if (PART > 0) {
      PARTREQ = PART - 1;
      drawObj();
      return;
    }
    if (S.idx > 0) {
      go(S.idx - 1, 'last');
    }
  }
}

function toggle() {
  var s = sub();
  var id = s.items[S.idx].id;
  S.prog[s.id] = S.prog[s.id] || {};
  S.prog[s.id][id] = !S.prog[s.id][id];
  render();
}

/* 面板大小变了(拖动窗口、手机转屏、顶部出现进度条、侧栏开合)就按新的可用高度重新分页;本条停留的页码保持不变 */
var roT = 0;

function relayout() {
  clearTimeout(roT);
  roT = setTimeout(function () { if (sub().items) {
    drawObj();
  } }, 90);
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindCard() {
  DM.addEventListener && DM.addEventListener('change', function () {
    lastMotif = '';
    render();
  });
  $('dots').onclick = function (e) {
    var b = e.target.closest('[data-i]');
    if (b) {
      go(+b.dataset.i);
    }
  };
  $('prev').onclick = function () { step(-1); };
  $('next').onclick = function () { step(1); };
  $('rv').onclick = toggle;
  /* ================= keyboard ================= */
  document.addEventListener('keydown', function (e) {
    if ($('modal').classList.contains('on')) {
      if (e.key === 'Escape') {
        closeM();
      }
      return;
    }
    if (!$('menu').hidden) {
      menuKey(e);
      return;
    }
    if (e.key === 'Escape') {
      drawer(false);
      return;
    }
    if (V !== 'subject' && V !== 'papers') {
      return;
    }
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    if (e.key === 'Enter' && (t === 'BUTTON' || t === 'A' || t === 'SUMMARY')) {
      return;
    }
    if (V === 'papers') {
      if (PAPER.selected && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault(); paperGo(PAPER.index + (e.key === 'ArrowRight' ? 1 : -1));
      }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault();
      step(1);
    }
    else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    }
    else if (e.key === 'r' || e.key === 'R') {
      toggle();
    }
  });
  /* ================= 分页器、窗口变化 ================= */
  $('pgPrev').onclick = function () { if (PART > 0) {
    PARTREQ = PART - 1;
    drawObj();
  } };
  $('pgNext').onclick = function () { if (PART < PGN - 1) {
    PARTREQ = PART + 1;
    drawObj();
  } };
}

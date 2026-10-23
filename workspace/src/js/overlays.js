/* ======== 16-modal.js ======== */
/**
 * 16 · modal.js — 弹窗：同一时刻只显示一个面板；使用指南
 */

function showBox(id) {
  ['bNew', 'bHelp', 'bShare', 'bImp', 'bPaper'].forEach(function (k) { $(k).style.display = k === id ? '' : 'none'; });
  $('modal').classList.add('on');
}

function closeM() {
  if (IDENT || paperImportOpen() && (PAPER.ctl || PAPER.reading)) {
    return;
  }
  $('modal').classList.remove('on');
  if ($('bPaper').style.display !== 'none') { $('paperNav').focus(); }
}

function openHelp() {
  showBox('bHelp');
  setTimeout(function () { $('hOk').focus(); }, 50);
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindModal() {
  $('hp').onclick = openHelp;
  $('hOk').onclick = function () { closeM(); };
  $('modal').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') { return; }
    var controls = Array.from(this.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')).filter(function (el) {
      return !el.disabled && el.tabIndex >= 0 && el.getClientRects().length;
    });
    if (!controls.length) { return; }
    var first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ======== 17-menu.js ======== */
/**
 * 17 · menu.js — “更多”菜单
 */

/* ================= 更多菜单 ================= */
function menuSync() {
  var s = sub();
  var inS = V === 'subject';
  $('rst').disabled = !inS;
  $('rstL').textContent = inS ? '重置“' + s.title + '”的进度…' : '重置进度…';
}

function menuOpen(on) {
  var m = $('menu');
  if (on === !m.hidden) {
    return;
  }
  m.hidden = !on;
  $('mnB').setAttribute('aria-expanded', String(on));
  if (on) {
    menuSync();
    var f = m.querySelector('.mi:not([disabled])');
    if (f) {
      f.focus();
    }
  }
}

function menuKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    menuOpen(false);
    $('mnB').focus();
    return;
  }
  if (e.key === 'Tab') {
    menuOpen(false);
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    var its = [].slice.call($('menu').querySelectorAll('.mi:not([disabled])'));
    var i = its.indexOf(document.activeElement);
    if (!its.length) {
      return;
    }
    i = e.key === 'ArrowDown' ? (i + 1) % its.length : (i - 1 + its.length) % its.length;
    its[i].focus();
  }
}

function resetProgress() {
  var s = sub();
  if (confirm('重置“' + s.title + '”的复习进度？\n已标记为“已复习”的记录将被清除。')) {
    delete S.prog[s.id];
    render();
  }
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindMenu() {
  $('mnB').onclick = function () { menuOpen($('menu').hidden); };
  document.addEventListener('mousedown', function (e) {
    if (!$('menu').hidden && !e.target.closest('#menu,#mnB')) {
      menuOpen(false);
    }
  });
  $('rst').onclick = function () {
    menuOpen(false);
    resetProgress();
  };
}

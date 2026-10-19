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


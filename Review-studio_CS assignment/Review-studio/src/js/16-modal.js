/* ======== 16-modal.js ======== */
/**
 * 16 · modal.js — 弹窗：同一时刻只显示一个面板；使用指南
 */

function showBox(id) {
  ['bNew', 'bHelp', 'bShare', 'bImp'].forEach(function (k) { $(k).style.display = k === id ? '' : 'none'; });
  $('modal').classList.add('on');
}

function closeM() {
  if (IDENT) {
    return;
  }
  $('modal').classList.remove('on');
}

function openHelp() {
  $('bNew').style.display = 'none';
  $('bShare').style.display = 'none';
  $('bImp').style.display = 'none';
  $('bHelp').style.display = '';
  $('modal').classList.add('on');
  setTimeout(function () { $('hOk').focus(); }, 50);
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindModal() {
  $('hp').onclick = openHelp;
  $('hOk').onclick = function () { closeM(); };
}


/* ======== 99-main.js ======== */
/**
 * 99 · main.js — 启动入口。
 */

function main() {
  // 1. 绑定所有静态事件（各模块的 bindXxx，互相独立，顺序无关）
  bindState();
  bindGenerate();
  bindModal();
  bindMenu();
  bindShare();
  bindImport();
  bindSidebar();
  bindHome();
  bindCard();
  bindWizard();
  // 2. 载入本机数据，进入首页
  /* ================= init ================= */
  load();
  mig();
  try {
    navigator.storage && navigator.storage.persist && navigator.storage.persist();
  }
  catch { }
  if (!byId(S.cur)) {
    S.cur = BUILTIN.id;
  }
  sbApply(S.sbw || SBW_DEF, false);
  setView('home');
  render();
  if (!S.seen) {
    S.seen = 1;
    save();
  }
  if (hasMath()) {
    loadKatex().catch(function () { });
  }
  // 3. 卡片面板尺寸变化（拖动窗口、侧栏开合）时重新分页。放在首次渲染之后
  if (window.ResizeObserver) {
    new ResizeObserver(relayout).observe(document.querySelector('.panel'));
  }
  else {
    addEventListener('resize', relayout);
  }
}

main();

/* ======== 03-state.js ======== */
/**
 * 03 · state.js — 全局状态 S、本机存储、提示条、科目访问器
 */

var PAL = ['#D94801', '#B8860B', '#4C8B2B', '#00897B', '#007FA8', '#3366CC', '#7B4FB8', '#C2185B'];
/* ================= state & storage ================= */
var S = { subs: [], cur: 'cs0478', idx: 0, prog: {}, fold: {}, pos: {}, cfg: { key: '', model: 'deepseek-flash' } };
var KEY = 'revstudio-proto-v1';

function load() {
  try {
    var o = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (var k in o) {
      S[k] = o[k];
    }
  }
  catch { }
  if (!Array.isArray(S.subs)) {
    S.subs = [];
  }
  ['prog', 'fold', 'cfg', 'pos'].forEach(function (k) { if (!S[k] || typeof S[k] !== 'object') {
    S[k] = {};
  } });
  S.sbw = +S.sbw > 0 ? +S.sbw : 0;
  if (S.cfg.model === 'deepseek-v4-flash') {
    S.cfg.model = 'deepseek-flash';
  }
  if (S.use && typeof S.use === 'object' && S.use.cur !== 'cny') {
    S.use.c = Math.round((+S.use.c || 0) * 6.67 * 1e4) / 1e4;
    S.use.cur = 'cny';
  }
} /* 旧版累计费用按美元记,换算成人民币(旧价格表 = 官方人民币价 ÷ 6.67) */

function sv(n) {
  var e = $('sv');
  if (!e) {
    return;
  }
  e.className = 'sv' + (n < 0 ? ' err' : '');
  e.innerHTML = '<span>' + (n < 0 ? '无法保存，请先备份全部科目' : '已保存在此浏览器 · ' + Math.max(1, Math.round(n / 1024)) + ' KB' +
      (n > 3.5e6 ? ' · 空间将满' : '')) + '</span>';
  e.title = '数据保存在此浏览器和此网址下。更换浏览器或清除网站数据后将无法找到，请定期备份。';
}

function save() {
  try {
    var j = JSON.stringify(S);
    localStorage.setItem(KEY, j);
    sv(j.length);
  }
  catch {
    sv(-1);
    if (!save.w) {
      save.w = 1;
      toast('存储空间已满。请先备份，再删除不需要的科目。');
    }
  }
}

function toast(m) {
  var t = $('toast');
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(function () { t.style.display = 'none'; }, 5200);
}

function topicOf(s, id) {
  if (!s.topics) {
    return null;
  }
  var sc = s.sections.filter(function (x) { return x.id === id; })[0];
  return sc && s.topics.filter(function (t) { return t.id === sc.topic; })[0] || null;
}

function mig() {
  if (S.prog.cs0478) {
    return;
  }
  try {
    var o = JSON.parse(localStorage.getItem('igcse0478-full-v1') || 'null');
    if (o && o.reviewed && Object.keys(o.reviewed).some(function (k) { return o.reviewed[k]; })) {
      S.prog.cs0478 = o.reviewed;
      if (S.cur === 'cs0478') {
        S.idx = Math.min(Math.max(+o.index || 0, 0), BUILTIN.items.length - 1);
      }
      toast('已导入原 0478 页面的复习进度');
    }
  }
  catch { }
}

function all() { return [BUILTIN].concat(S.subs); }

function byId(id) { return all().filter(function (s) { return s.id === id; })[0]; }

function sub() { return byId(S.cur) || BUILTIN; }

function rev(s, id) { return !!(S.prog[s.id] && S.prog[s.id][id]); }

function secItems(s, sid) { return s.items.filter(function (i) { return i.section === sid; }); }

/* ================= render ================= */
/* 渲染时不必每次都写一遍 localStorage(科目大了每次翻页都序列化几百 KB);延迟 350ms 合并,关页面/切后台时立即写 */
var saveT = 0;

function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(function () {
    saveT = 0;
    save();
  }, 350);
}

function flushSave() { if (saveT) {
  clearTimeout(saveT);
  saveT = 0;
  save();
} }

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindState() {
  addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (document.hidden) {
    flushSave();
  } });
}


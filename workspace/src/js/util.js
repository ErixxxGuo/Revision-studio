/* ======== 01-util.js ======== */
/**
 * 01 · util.js — 通用工具：DOM 速记、转义、字符串/数组清洗、哈希、主题色
 */

function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

var DM = matchMedia('(prefers-color-scheme:dark)');

function lift(h) {
  var n = parseInt(h.slice(1), 16);
  return '#' + [16, 8, 0].map(function (s) {
    var c = n >> s & 255;
    return ('0' + Math.round(c + (255 - c) * .3).toString(16)).slice(-2);
  }).join('');
}

function $(i) { return document.getElementById(i); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function safeC(c, fb) {
  return /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c) : (fb || '#86868B');
}

function ac(c) {
  c = safeC(c);
  return DM.matches ? lift(c) : c;
}

function S_(x, n) { return String(x == null ? '' : x).trim().slice(0, n || 120); }

function arrS(a, max, len) {
  return (Array.isArray(a) ? a : (a != null && a !== '' ? [a] : [])).filter(function (x) { return x != null &&
      typeof x !== 'object' && String(x).trim(); }).slice(0, max).map(function (x) { return S_(x, len); });
}

function hash(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function kfmt(n) {
  n = Math.round(n || 0);
  return n >= 1e4 ? Math.round(n / 1000) + 'k' : n >= 1e3 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

/* ================= 识别:第 1 步定位 → 第 2 步分段提取 → 合并 ================= */
function pint(x) {
  var n = parseInt(x, 10);
  return isFinite(n) ? n : NaN;
}


/* ======== 09-cost.js ======== */
/**
 * 09 · cost.js — 用量与费用（人民币）：价格表、计费、估算
 */

/* ================= 用量与费用 =================
   价格直接取自 DeepSeek 官方「模型 & 价格」页的人民币标价(api-docs.deepseek.com/zh-cn/quick_start/pricing,2026-10 核对),元 / 百万 tokens,不做汇率换算。
   每档 [空闲, 高峰]:高峰为北京时间周一至周五 9:00–12:00、14:00–18:00(即 UTC 01:00–04:00、06:00–10:00),其余时间及中国法定节假日全天为空闲(页面无法判断节假日,按高峰算偏保守)。
   命中缓存的输入只按约 1/50 计价;输出最贵,所以提示词重点压的是输出。 */
var PRICE = { flash: { h: [.02, .04], m: [1, 2], o: [4, 8] }, pro: { h: [.15, .3], m: [4.5, 9], o: [13.5, 27] } };
var USE = { n: 0, i: 0, o: 0, h: 0, free: 0, c: 0 };

function peakNow(d) {
  d = d || new Date();
  var w = d.getUTCDay();
  var h = d.getUTCHours();
  return w >= 1 && w <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
}

function pricing() {
  var c = wizOpen() ? readCfg() : C();
  if (!(c.kind === 'ds' || (c.kind === 'proxy' && /deepseek/i.test(c.model)))) {
    return null;
  }
  var P = PRICE[/pro/i.test(c.model) ? 'pro' : 'flash'];
  var i = peakNow() ? 1 : 0;
  return { h: P.h[i], m: P.m[i], o: P.o[i], peak: !!i, hi: { h: P.h[1], m: P.m[1], o: P.o[1] } };
}

function yuan(x) {
  x = +x || 0;
  return x <= 0 ? '¥0' : x < .01 ? '<¥0.01' : '¥' + (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x)));
}

function callCost(u) {
  var p = pricing();
  if (!p || !u) {
    return 0;
  }
  var h = u.prompt_cache_hit_tokens || 0;
  var m = u.prompt_cache_miss_tokens != null ? u.prompt_cache_miss_tokens : Math.max(0, (u.prompt_tokens || 0) - h);
  return (h * p.h + m * p.m + (u.completion_tokens || 0) * p.o) / 1e6;
}

function useAdd(j, hit) {
  if (hit) {
    USE.free++;
    return;
  }
  USE.n++;
  var u = j && j.usage;
  if (!u) {
    return;
  }
  var c = callCost(u);
  USE.i += u.prompt_tokens || 0;
  USE.o += u.completion_tokens || 0;
  USE.h += u.prompt_cache_hit_tokens || 0;
  USE.c += c;
  var t = S.use = S.use && typeof S.use === 'object' ? S.use : { n: 0, i: 0, o: 0, c: 0, cur: 'cny' };
  t.n = (t.n || 0) + 1;
  t.i = (t.i || 0) + (u.prompt_tokens || 0);
  t.o = (t.o || 0) + (u.completion_tokens || 0);
  t.c = (t.c || 0) + c;
}

function useSnap() {
  return { n: USE.n, i: USE.i, o: USE.o, h: USE.h, free: USE.free, c: USE.c };
}

function useStr(a) {
  var n = USE.n - a.n;
  var i = USE.i - a.i;
  var o = USE.o - a.o;
  var f = USE.free - a.free;
  var c = USE.c - a.c;
  return n || f ? '本次 ' + n + ' 次调用 · 输入 ' + kfmt(i) + (USE.h - a.h > 0 ? '（缓存命中 ' + kfmt(USE.h - a.h) + '）' : '') +
      ' · 输出 ' + kfmt(o) + ' tokens' + (c > 0 ? ' · 约 ' + yuan(c) : '') + (f ? ' · ' + f + ' 次命中本地缓存（免费）' : '') : '';
}

function tkS(s) { return tokOf([{ t: String(s || '') }]); }

/* 生成费用估算:每批的输入 = 提示词 + 本章上下文 + 本批 objective;输出按每条 170–320 tokens(新提示词限制了篇幅)。
   乐观:提示词和章节上下文 70% 命中缓存、按当前时段计价;保守:完全不命中缓存、按高峰价。思考模式的输出按 3–6 倍算(推理 tokens 也计输出价) */
function genEst(o, think) {
  var items = [].concat.apply([], o.sections.map(function (s, si) {
    return s.items.map(function (x) { return { section: s.title + '#' + si, text: x.text, guide: x.guide }; });
  }));
  var q = plan(items);
  var sys = tkS(SYS) + 30;
  var by = {};
  items.forEach(function (x) { (by[x.section] = by[x.section] || []).push(x); });
  var inT = 0;
  var pre = 0;
  q.forEach(function (b) {
    var all = by[b[0].section];
    var ctx = all.slice(0, 30).reduce(function (a, x) { return a + tkS(x.text) + 4; }, 0);
    var mine = b.reduce(function (a, x) { return a + tkS(x.text) + tkS((x.guide || []).join(' ')) + 22; }, 0);
    pre += sys + ctx + 40;
    inT += sys + ctx + 40 + mine;
  });
  var F = pendingFills(o);
  var fx = F.reduce(function (a, f) { return a + f.miss.length; }, 0);
  inT += F.reduce(function (a, f) { return a + tkS(f.src) + tkS(FILL_SYS) + 500; }, 0);
  var n = items.length + fx;
  var oLo = n * 170 * (think ? 3 : 1) + F.length * 40 + fx * 90;
  var oHi = n * 320 * (think ? 6 : 1) + F.length * 60 + fx * 160;
  var p = pricing();
  var r = { n: n, fx: fx, calls: q.length + F.length + (fx ? Math.ceil(fx / 4) : 0), inT: inT, oLo: oLo, oHi: oHi, lo: null, hi: null, p: p };
  if (p) {
    r.lo = ((inT - pre * .7) * p.m + pre * .7 * p.h + oLo * p.o) / 1e6;
    r.hi = (inT * p.hi.m + oHi * p.hi.o) / 1e6;
  }
  return r;
}

/* ======== 10-api.js ======== */
/**
 * 10 · api.js — OpenAI 兼容接口：配置、请求、JSON 解析、重试
 */

/* ================= API ================= */
var PRE = { ds: 'https://api.deepseek.com', proxy: '/api', local: 'http://localhost:11434/v1', custom: '' };
var KIND = { ds: 'DeepSeek 官方', proxy: '本地代理', local: '本地模型', custom: '自定义接口' };

function C() {
  var c = S.cfg || {};
  var k = PRE.hasOwnProperty(c.kind) ? c.kind : 'ds';
  return { key: c.key || '', model: c.model || 'deepseek-flash', kind: k, base: (c.base ? c.base : PRE[k]), think: !!c.think, auto: !!c.auto };
}

function readCfg() {
  return { key: $('fKey').value.trim(), model: $('fModel').value.trim(), kind: $('fKind').value, base: $('fBase').value.trim(), think: $('fThink').checked, auto: $('fAuto').checked };
}

function cfgOk(c) {
  return !!(c.model && c.base && (c.key || c.kind === 'local' || c.kind === 'proxy'));
}

function hint(e) {
  var m = e && e.message || '';
  return /Failed to fetch|NetworkError|Load failed/i.test(m) ? '（网络不通，或被浏览器拦截。建议改用“本地代理”，并检查接口地址）' :
      /HTTP 401/.test(m) ? '（Key 无效或未填写）' : /HTTP 402/.test(m) ? '（账户余额不足）' : /HTTP 429/.test(m) ? '（请求过于频繁，请稍后重试）' :
      /HTTP 404/.test(m) ? '（接口地址或模型名有误）' : /HTTP 400/.test(m) ? '（请求被拒绝。请检查模型名；非 DeepSeek 接口请选择“自定义”）' :
      /HTTP 5\d\d/.test(m) ? '（服务暂时不可用，请稍后点击“继续生成”）' : '';
}

function abortErr() {
  var e = new Error('已停止');
  e.name = 'AbortError';
  return e;
}

/* DeepSeek 官方 / 代理才带 response_format 与 thinking:V4 默认开启思考,结构化抽取不需要,默认显式关闭 */
async function post(msgs, max, signal, opt) {
  opt = opt || {};
  var c = opt.cfg || C();
  var ds = c.kind === 'ds' || c.kind === 'proxy';
  var b = { model: c.model, max_tokens: (ds && c.think && !opt.reasoningCap) ? Math.max(max, 32000) : max, temperature: opt.temp != null ?
      opt.temp : 0.3, messages: msgs };
  var hd = { 'Content-Type': 'application/json' };
  /* 思考模式开关:关(默认)= thinking 显式关闭 + JSON 模式;开 = thinking 显式开启,思考 tokens 计入 max_tokens,所以上限放大;提示词本身要求只输出 JSON */
  if (ds) {
    if (c.think) {
      b.thinking = { type: 'enabled' };
    }
    else {
      b.response_format = { type: 'json_object' };
      b.thinking = { type: 'disabled' };
    }
  }
  if (c.key) {
    hd.Authorization = 'Bearer ' + c.key;
  }
  if (opt.fresh) {
    hd['X-No-Cache'] = '1';
  }
  var res = await fetch(c.base.replace(/\/+$/, '') + '/chat/completions', { method: 'POST', headers: hd, body: JSON.stringify(b), signal: signal });
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  }
  var j = await res.json();
  useAdd(j, res.headers.get('X-Cache') === 'HIT');
  return j;
}

function parseJ(t) {
  t = String(t || '').replace(/^```(?:json)?|```$/gm, '').trim();
  function tr(s) {
    try {
      return JSON.parse(s);
    }
    catch {
      return JSON.parse(fixEsc(s));
    }
  }
  try {
    return tr(t);
  }
  catch {
    var a = t.indexOf('{');
    var b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        return tr(t.slice(a, b + 1));
      }
      catch { }
    }
    throw new Error('返回内容格式有误');
  }
}

async function ask(sys, user, signal, max, opt) {
  var j = await post([{ role: 'system', content: sys }, { role: 'user', content: user }], max || 8000, signal, opt);
  var c = j && j.choices && j.choices[0];
  var m = c && c.message && c.message.content;
  if (c && c.finish_reason === 'length') {
    var e = new Error('输出被截断');
    e.trunc = 1;
    throw e;
  }
  if (!m) {
    throw new Error('模型未返回内容');
  }
  return parseJ(m);
}

function fatal(e) {
  return e.name === 'AbortError' || e.trunc || /HTTP 40[0-4]/.test(e.message);
}

function sleep(ms, signal) {
  return new Promise(function (ok, no) {
    if (signal && signal.aborted) {
      return no(abortErr());
    }
    var h = setTimeout(ok, ms);
    signal && signal.addEventListener('abort', function () {
      clearTimeout(h);
      no(abortErr());
    }, { once: true });
  });
}

/* 网络抖动 / 5xx / JSON 坏掉:最多 3 次,429 等久一点;401-404 和截断不重试(截断由调用方拆小) */
async function retry(fn, signal) {
  for (var t = 1;; t++) {
    try {
      return await fn(t);
    }
    catch (e) {
      if (signal && signal.aborted) {
        throw abortErr();
      }
      if (fatal(e) || t >= 3) {
        throw e;
      }
      await sleep(/HTTP 429/.test(e.message) ? 4000 * t : 1500 * t, signal);
    }
  }
}

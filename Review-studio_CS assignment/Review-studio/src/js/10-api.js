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
  var c = C();
  var ds = c.kind === 'ds' || c.kind === 'proxy';
  var b = { model: c.model, max_tokens: (ds && c.think) ? Math.max(max, 32000) : max, temperature: opt.temp != null ?
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


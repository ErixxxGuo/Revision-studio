/* ======== 15-generate.js ======== */
/**
 * 15 · generate.js — 卡片生成：分批并行、补全缺失考点、进度条
 */

var JOB = null;

/* ================= enrichment: small batches, parallel, saved per batch ================= */
function plan(items) {
  var by = {};
  var order = [];
  var q = [];
  items.forEach(function (x) {
    if (!by[x.section]) {
      by[x.section] = [];
      order.push(x.section);
    }
    by[x.section].push(x);
  });
  order.forEach(function (sid) {
    var b = [];
    var len = 0;
    by[sid].forEach(function (x) {
      var l = x.text.length + (x.guide || []).join(' ').length;
      if (b.length && (b.length >= 5 || len + l > 2400)) {
        q.push(b);
        b = [];
        len = 0;
      }
      b.push(x);
      len += l;
    });
    if (b.length) {
      q.push(b);
    }
  });
  return q;
}

async function enrich(s, items, signal, fresh) {
  var sid = items[0].section;
  var sec = s.sections.filter(function (x) { return x.id === sid; })[0] || { title: '' };
  var tp = topicOf(s, sid);
  var al = secItems(s, sid).filter(function (x) { return !x.gap; });
  var i0 = al.indexOf(items[0]);
  var i1 = al.indexOf(items[items.length - 1]);
  var ctx = al.length > 30 ? al.slice(Math.max(0, i0 - 10), i1 + 11) : al;
  /* 顺序固定:不变的在前(提示词 → 科目/章节/本章全部 objective),每批不同的在最后。前缀越稳定,命中缓存越多,输入按约 1/50 计价 */
  var u = 'Subject: ' + s.title + '\n' + (tp ? 'Topic: ' + tp.title + '\n' : '') + 'Section: ' + (sec.title ||
      '(none)') + '\n\nAll objectives in this section (context only, do not write cards for the others):\n' +
      ctx.map(function (x) { return '- ' + x.text; }).join('\n') +
    '\n\nWrite cards for these objectives:\n' + JSON.stringify(items.map(function (x) {
    var o = { id: x.id, objective: x.text };
    if (x.guide && x.guide.length) {
      o.official_guidance = x.guide;
    }
    return o;
  }));
  /* 输出上限:每条约 700 tokens 封顶,防止模型跑偏时一直写下去(超出会被截断,由调用方拆小重试) */
  var r = await ask(SYS, u, signal, 600 + 700 * items.length, { fresh: fresh, temp: .2 });
  var arr = Array.isArray(r.i) ? r.i : Array.isArray(r.items) ? r.items : Array.isArray(r) ? r : [];
  var out = {};
  if (items.length === 1 && arr.length === 1 && arr[0] && String(arr[0].id) !== items[0].id) {
    arr[0].id = items[0].id;
  }
  arr.forEach(function (y) {
    if (!y || y.id == null) {
      return;
    }
    var x = items.filter(function (z) { return z.id === String(y.id); })[0];
    if (!x) {
      return;
    }
    var low = x.text.toLowerCase();
    var res = { keys: arrS(y.k || y.key ||
        y.keys, 4, 160).filter(function (k) { return low.indexOf(k.toLowerCase()) > -1; }), notes: arrS(fixDeep(y.n ||
        y.notes), 5, 300), visual: cleanVis(fixDeep(y.v || y.visual)) };
    if (res.notes.length || res.visual) {
      out[x.id] = res;
    }
  });
  return out;
}

function apply(it, r) {
  it.keys = r.keys;
  it.notes = r.notes;
  it.visual = r.visual;
  delete it.pend;
}

function stopJob() {
  if (!JOB) {
    return;
  }
  JOB.stop = 1;
  JOB.ctl.abort();
  genbar();
}

/* 生成进度条:放在页面顶部、不遮挡任何按钮;百分比、粗进度条、已完成数、花费和剩余时间一目了然 */
var gbOn = false;

function genbar() {
  var on = !!JOB;
  document.body.classList.toggle('gen', on);
  if (on !== gbOn) {
    gbOn = on;
    setTimeout(function () { if (sub().items) {
      drawObj();
    } }, 40);
  }
  if (!on) {
    return;
  }
  var s = byId(JOB.sub);
  var pct = JOB.total ? Math.min(100, Math.round(JOB.done / JOB.total * 100)) : 0;
  var el = (Date.now() - JOB.t0) / 1000;
  var eta = '';
  if (JOB.done >= 3 && JOB.done < JOB.total && !JOB.stop) {
    var rm = el / JOB.done * (JOB.total - JOB.done);
    eta = ' · 剩余约 ' + (rm < 90 ? Math.max(10, Math.round(rm / 10) * 10) + ' 秒' : Math.round(rm / 60) + ' 分钟');
  }
  var pr = pricing();
  var cost = USE.c - (JOB.c0 || 0);
  var fl = JOB.phase === 'fill';
  $('gTitle').textContent = JOB.stop ? '正在停止…' : fl ? '正在补全考点' : '正在生成卡片';
  $('gSub').textContent = s ? s.title : '';
  $('gPct').innerHTML = fl ? '<b class="gp-s">补全中</b>' : '<b>' + pct + '</b><i>%</i>';
  $('gFill').style.width = fl ? '' : pct + '%';
  $('gFill').parentNode.classList.toggle('ind', fl); /* 补全阶段没有可靠的百分比:显示不定长的滑动条 */
  $('gTxt').innerHTML = fl ? '正在补全 <b>' + (s ? s.items.filter(function (x) { return x.gap; }).length : 0) +
      '</b> 个考点…' : '已完成 <b>' + JOB.done + '</b> / ' + JOB.total + ' 条' + (JOB.fail ? ' · <span class="w">' + JOB.fail +
      ' 条失败</span>' : '') + (pr && cost > 0 ? ' · 已花费约 <b>' + yuan(cost) + '</b>' : '') + eta;
  $('gTxt').title = '已用 ' + kfmt(USE.i + USE.o - (JOB.k0 || 0)) + ' tokens';
  $('gStop').disabled = !!JOB.stop;
}

/* ---- 生成前的补全阶段 ---- */
function numOfId(id) { return +String(id).split('.').pop(); }

function dropFill(s, f) {
  s.fill = (s.fill || []).filter(function (g) { return g !== f; });
  if (!s.fill.length) {
    delete s.fill;
  }
}

function fillMsg(s, f, phs) {
  var have = s.items.filter(function (x) { return x.section === f.sid &&
      !x.gap; }).slice(0, 40).map(function (x) { return '- ' + numOfId(x.id) + '. ' + S_(x.text, 200); });
  return 'Section: ' + f.title + '\nMissing numbers: ' +
      phs.map(function (x) { return numOfId(x.id); }).sort(function (a, b) { return a - b; }).join(', ') + '\n' +
      (have.length ? 'Already extracted in this section:\n' + have.join('\n') + '\n' : '') + '\n' + (f.src || '(no source pages available)');
}

/* 把 AI 补回的条目写进占位;没补回的占位直接删掉(不留空卡片)。返回 {ok, ai, gone} */
function applyFill(s, f, phs, res) {
  var got = {};
  var ix = f.src ? idxOf([f.src]) : null;
  var keep = S.cur === s.id ? s.items[S.idx] : null;
  var gone = [];
  var r0 = { ok: 0, ai: 0, gone: 0 };
  /* 推断只允许发生在编号中间的空洞:编号比本章已有的最大编号还大(末尾缺项),或整个章节都没有(没有上下文可参照)时,没有依据可推断,丢弃 */
  var mx = 0;
  s.items.forEach(function (x) {
    if (x.section === f.sid && !x.gap) {
      var k = numOfId(x.id);
      if (k > mx) {
        mx = k;
      }
    }
  });
  (Array.isArray(res && res.items) ? res.items : []).forEach(function (r) {
    if (!r || typeof r !== 'object') {
      return;
    }
    var n = pint(r.n);
    var t = cleanT(r.t != null ? r.t : r.text);
    var inf = r.s === 'inferred';
    if (n > 0 && t.length >= 6 && !got[n] && !(inf && n > mx)) {
      got[n] = { t: t, g: arrS(r.g, 20, 500), inf: inf };
    }
  });
  phs.forEach(function (x) {
    var r = got[numOfId(x.id)];
    if (!r) {
      gone.push(x);
      return;
    }
    var ver = !r.inf && !!ix && fits(r.t, ix);
    x.text = r.t;
    var g = r.g.filter(function (z) { return !ix || fits(z, ix); });
    if (g.length) {
      x.guide = g;
    }
    x.chk = 1;
    if (ver) {
      delete x.ai;
    }
    else {
      x.ai = 1;
      r0.ai++;
    }
    delete x.gap;
    r0.ok++;
  });
  if (gone.length) {
    s.items = s.items.filter(function (x) { return gone.indexOf(x) < 0; });
    r0.gone = gone.length;
  }
  if (keep) {
    var i = s.items.indexOf(keep);
    S.idx = i > -1 ? i : Math.max(0, Math.min(S.idx, s.items.length - 1));
  }
  return r0;
}

async function fillGaps(s, J, alive) {
  var q = (s.fill || []).slice();
  J.fOk = J.fOk || 0;
  J.fAi = J.fAi || 0;
  J.fGone = J.fGone || 0;
  async function worker() {
    while (q.length && alive()) {
      var f = q.shift();
      var phs = s.items.filter(function (x) { return x.gap && x.section === f.sid; });
      if (!phs.length) {
        dropFill(s, f);
        continue;
      }
      var res;
      try {
        res = await retry(function (t) {
          return ask(FILL_SYS, fillMsg(s, f, phs), J.ctl.signal, 4000, { temp: 0, fresh: t > 1 });
        }, J.ctl.signal);
      }
      catch (e) {
        if (!alive() || e.name === 'AbortError') {
          return;
        }
        if (/HTTP 40[0-4]/.test(e.message)) {
          J.err = e;
          J.stop = 1;
          J.ctl.abort();
          return;
        }
        J.last = e;
        continue;
      } /* 暂时失败:留着,点「继续生成」会重试 */
      if (!alive()) {
        return;
      }
      var r = applyFill(s, f, phs, res);
      J.fOk += r.ok;
      J.fAi += r.ai;
      J.fGone += r.gone;
      dropFill(s, f);
      save();
      genbar();
      if (S.cur === s.id) {
        render();
      }
    }
  }
  var W = C().kind === 'local' ? 1 : 3;
  var ws = [];
  for (var i = 0; i < Math.min(W, q.length); i++) {
    ws.push(worker());
  }
  await Promise.all(ws);
}

async function runJob(id) {
  var s = byId(id);
  if (JOB || !s || s.builtin) {
    return;
  }
  var wf = !!(s.fill && s.fill.length);
  var todo = s.items.filter(function (x) { return x.pend && !x.gap; });
  if (!todo.length && !wf) {
    return;
  }
  if (!cfgOk(C())) {
    toast('请先设置接口与 API Key。');
    return;
  }
  var q = [];
  var J = JOB = { sub: id, total: s.items.filter(function (x) { return x.pend; }).length, done: 0, fail: 0, stop: 0, ctl: new AbortController(), err: null, t0: Date.now(), c0: USE.c, k0: USE.i +
      USE.o, phase: wf ? 'fill' : 'gen' };
  genbar();
  renderAid();
  function alive() { return !J.stop && S.subs.indexOf(s) > -1; }
  if (wf) {
    await fillGaps(s, J, alive);
    J.phase = 'gen';
    J.t0 = Date.now();
    save();
  }
  todo = s.items.filter(function (x) { return x.pend && !x.gap; });
  J.total = todo.length;
  q = plan(todo);
  genbar();
  if (S.cur === id) {
    render();
  }
  async function worker() {
    while (q.length && alive()) {
      var b = q.shift();
      try {
        var res = await retry(function (t) { return enrich(s, b, J.ctl.signal, t > 1); }, J.ctl.signal);
        if (!alive()) {
          break;
        }
        var miss = [];
        b.forEach(function (x) {
          if (res[x.id]) {
            apply(x, res[x.id]);
            J.done++;
          }
          else {
            miss.push(x);
          }
        });
        if (miss.length) {
          if (b.length > 1) {
            miss.forEach(function (x) { q.push([x]); });
          }
          else {
            J.fail++;
          }
        }
      }
      catch (e) {
        if (!alive() || e.name === 'AbortError') {
          break;
        }
        if (e.trunc && b.length > 1) {
          var h = Math.ceil(b.length / 2);
          q.unshift(b.slice(0, h), b.slice(h));
        }
        else if (/HTTP 40[0-4]/.test(e.message)) {
          J.err = e;
          J.stop = 1;
          J.ctl.abort();
          break;
        }
        else if (b.length > 1) {
          b.forEach(function (x) { q.push([x]); });
        }
        else {
          J.fail++;
          J.last = e;
        }
      }
      save();
      genbar();
      if (V === 'home') {
        render(); /* 停在首页时,科目卡片上的进度也要跟着走 */
      }
      else if (S.cur === id) {
        var it = s.items[S.idx];
        if (b.indexOf(it) > -1) {
          render();
        }
        else {
          renderAid();
        }
      }
    }
  }
  var W = C().kind === 'local' ? 1 : 3;
  var ws = [];
  for (var i = 0; i < W; i++) {
    ws.push(worker());
  }
  await Promise.all(ws);
  var left = s.items.filter(function (x) { return x.pend; }).length;
  var stopped = J.stop && !J.err;
  JOB = null;
  genbar();
  save();
  if (S.cur === id) {
    render();
  }
  if (J.err) {
    toast('生成已中断：' + J.err.message.slice(0, 80) + hint(J.err));
  }
  else if (stopped) {
    toast('已停止。已生成 ' + J.done + ' 条，剩余 ' + left + ' 条。');
  }
  else if (left) {
    toast('已完成 ' + J.done + ' 条，' + left + ' 条未成功' + (J.last ? '（' + J.last.message.slice(0, 40) + '）' : '') + '。点击“继续生成”重试。');
  }
  else {
    var bad = s.items.filter(function (x) { return x.chk === 0; }).length;
    toast('“' + s.title + '”已全部生成' + (J.fOk ? ' · 补全 ' + J.fOk + ' 个缺失考点' + (J.fAi ? '（' + J.fAi + ' 条由 AI 补全）' :
        '') : '') + (pricing() ? ' · 本次约 ' + yuan(USE.c - J.c0) : '') + (bad ? ' · ' + bad + ' 条与考纲原文略有出入' : ''));
  }
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindGenerate() {
  $('gStop').onclick = stopJob;
  $('gHead').onclick = function () { if (JOB && (V === 'home' || S.cur !== JOB.sub)) {
    openSubject(JOB.sub);
  } };
  window.addEventListener('beforeunload', function (e) { if (JOB || IDENT) {
    e.preventDefault();
    e.returnValue = '';
  } });
  document.querySelector('.aid').onclick = async function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) {
      return;
    }
    var s = sub();
    var it = s.items[S.idx];
    if (!cfgOk(C())) {
      toast('请先设置接口与 API Key。');
      openM();
      return;
    }
    if (b.dataset.act === 'resume' || it.gap) {
      runJob(s.id);
      return;
    }
    b.disabled = true;
    b.textContent = '生成中…';
    try {
      var r = await retry(function () { return enrich(s, [it], undefined, 1); });
      if (!r[it.id]) {
        throw new Error('没有收到结果');
      }
      apply(it, r[it.id]);
      if (sub() === s && s.items[S.idx] === it) {
        render();
      }
      else {
        save();
      }
      toast('已生成 ' + it.id);
    }
    catch (err) {
      toast('生成失败：' + err.message.slice(0, 80) + hint(err));
      if (sub() === s) {
        renderAid();
      }
    }
  };
}


/* ======== 23-wizard.js ======== */
/**
 * 23 · wizard.js — 新建科目向导（4 步）
 */

/* 只有 DeepSeek 才有价格;本地模型不花钱;其他服务商的价格这里不知道 */
function wizOpen() {
  return $('modal').classList.contains('on') && $('bNew').style.display !== 'none';
}

/* ================= new-subject sheet ================= */
/* SRC = 已读取的 PDF {name,pages,chars,tok};RAW = 粘贴的原始文本(识别后文本框里换成了大纲,原文留在这里用于核对/撤销)
   EXT = 识别进度(可断点续传);OUT = 程序生成的大纲及其结构(用户没改过就不用再解析一遍) */
var SRC = null;
var EXT = null;
var OUT = null;
var UNDO = null;
var RAW = '';
var RAWIDX = null;
var IDENT = null;
var infoT;
var STEP = 1;
/* ================= 新建科目向导:4 步 =================
   STEP 1 命名科目 → STEP 2 上传考纲 → STEP 3 AI 识别(并核对条数)→ STEP 4 确认费用、开始生成 */
var STEPS = ['命名科目', '上传考纲', '识别考点', '生成卡片'];
var STIDS = { 1: 'st1', 2: 'st2', 3: 'status', 4: 'st4' };
var BUSYF = false;

function st(msg, cls, html) {
  var e = $(STIDS[STEP] || 'status');
  e.className = 'st' + (cls ? ' ' + cls : '');
  if (html) {
    e.innerHTML = msg;
  }
  else {
    e.textContent = msg;
  }
} /* cls: 'err' 红色 · 'run' 带跳动圆点的进行中 */

function stClear() {
  ['st1', 'st2', 'status', 'st4'].forEach(function (k) {
    var e = $(k);
    e.className = 'st';
    e.textContent = '';
  });
}

/* 进度条:粗、带百分比,放在按钮栏正上方,任何一步滚动都看得见 */
function bar(p) {
  var w = $('barW');
  w.classList.toggle('on', p != null);
  if (p != null) {
    var v = Math.max(0, Math.min(1, p));
    $('mBarI').style.width = (v * 100) + '%';
    $('mPct').textContent = Math.round(v * 100) + '%';
  }
}

function setStep(n, q) {
  STEP = n;
  $('bNew').dataset.step = n;
  $('stN').textContent = n;
  $('nT').textContent = STEPS[n - 1];
  Array.prototype.forEach.call($('stL').children, function (li, i) {
    li.className = i + 1 < n ? 'done' : i + 1 === n ? 'cur' : '';
    li.firstChild.setAttribute('aria-current', i + 1 === n ? 'step' : 'false');
  });
  if (n === 3 && !cfgOk(readCfg())) {
    $('adv').open = true;
  }
  if (n === 4) {
    renderStep4();
  }
  info(1);
  syncBtns();
  $('panes').scrollTop = 0;
  if (!q) {
    setTimeout(focusStep, 40);
  }
}

function focusStep() {
  if (!$('modal').classList.contains('on') || $('bNew').style.display === 'none' || IDENT) {
    return;
  }
  var e = $({ 1: 'fTitle', 2: SRC ? 'go' : 'drop', 3: 'go', 4: 'go' }[STEP]);
  if (e && !e.disabled) {
    e.focus();
  }
}

function canStep(n) {
  var t = $('fText').value.trim();
  var o = t ? outlineOf(t) : null;
  if (n <= 2) {
    return true;
  }
  if (n === 3) {
    return !!(SRC || t);
  }
  return !!(o && o.structured);
}

function fixStep() {
  var n = STEP;
  while (n > 1 && !canStep(n)) {
    n--;
  }
  return n;
}

/* 按钮:随步骤和当前状态变化 */
function syncBtns() {
  var t = $('fText').value.trim();
  var o = t ? outlineOf(t) : null;
  var str = !!(o && o.structured);
  var pend = pendWins() > 0 && !!EXT && EXT.sig === curSig();
  var busy = !!IDENT || BUSYF;
  $('back').style.display = STEP > 1 ? '' : 'none';
  $('redo').style.display = (STEP === 3 && str && (SRC || RAW)) ? '' : 'none';
  var nCards = o && o.n ? o.n + (STEP === 4 ? pendingFills(o).reduce(function (a, f) { return a +
      f.miss.length; }, 0) : 0) : 0;
  $('go').textContent = STEP === 3 ? (str ? '下一步' : (pend ? '继续识别' : '开始识别')) : STEP === 4 ? '生成' + (nCards ? ' ' +
      nCards + ' 张卡片' : '卡片') : '下一步';
  $('go').disabled = busy || (STEP === 2 && !SRC && !t);
  $('back').disabled = busy;
  $('redo').disabled = busy;
  $('mClose').disabled = !!IDENT;
  $('cancel').textContent = IDENT ? '停止' : '取消';
  $('cancel').classList.toggle('stop', !!IDENT);
}

function lock(on) {
  ['go', 'redo', 'test', 'srcX', 'drop', 'back', 'mClose'].forEach(function (k) { $(k).disabled = on; });
  $('cancel').textContent = on ? '停止' : '取消';
  $('cancel').classList.toggle('stop', !!on);
  if (!on) {
    syncBtns();
  }
}

function advSum() {
  var c = readCfg();
  $('advS').textContent = '· ' + KIND[c.kind] + ' · ' + (c.model || '未填写模型') + (cfgOk(c) ? '' : ' · 未完成');
  var u = S.use;
  $('useL').innerHTML = u && u.n ? '累计调用 <b>' + u.n + '</b> 次 · 输入 ' + kfmt(u.i) + ' · 输出 ' + kfmt(u.o) + ' tokens' +
      (u.c > 0 ? ' · 约 <b>' + yuan(u.c) + '</b>' : '') + ' <button class="chip" id="useX" type="button">清零</button>' : '暂无用量记录。';
}

function openM() {
  var c = C();
  $('fKind').value = c.kind;
  $('fBase').value = c.base;
  $('fKey').value = c.key;
  $('fModel').value = c.model;
  $('fThink').checked = c.think;
  $('fThink2').checked = c.think;
  $('fAuto').checked = !!c.auto;
  $('bNew').style.display = '';
  $('bHelp').style.display = 'none';
  $('bShare').style.display = 'none';
  $('bImp').style.display = 'none';
  drawer(false);
  if (!IDENT && !SRC && !OUT && !EXT) {
    stClear();
    bar(null);
  }
  if (!SRC && !$('fText').value.trim()) {
    RAW = '';
    OUT = null;
    EXT = null;
  }
  $('adv').open = !cfgOk(c);
  advSum();
  srcUI();
  $('modal').classList.add('on');
  STEP = fixStep();
  setStep(STEP);
}

function resetSheet() {
  SRC = null;
  RAW = '';
  RAWIDX = null;
  EXT = null;
  OUT = null;
  UNDO = null;
  ['fText', 'fTitle', 'fCode', 'pgA', 'pgB'].forEach(function (k) { $(k).value = ''; });
  delete $('fTitle').dataset.auto;
  stClear();
  STEP = 1;
  srcUI();
  info(1);
}

/* 第 3 步底部的提示 + 文本框:有 PDF 且还没识别时,文本框先收起来,免得一大块空白 */
function info(now) {
  clearTimeout(infoT);
  infoT = setTimeout(function () {
    var t = $('fText').value;
    var e = $('pInfo');
    var o = t.trim() ? outlineOf(t) : null;
    var h = '';
    if (o && o.structured) {
      h = '<b>' + o.sections.length + '</b> 个章节 · <b>' + o.n + '</b> 个考点' + (o.g ? ' · ' + o.g + ' 条注释' : '') +
          (o.two ? ' · ' + o.topics.length + ' 个主题' : '');
    }
    else if (t.trim()) {
      h = '<span class="warn">尚未整理为大纲。</span>点击“开始识别”。';
    }
    var same = !!(OUT && OUT.text === t.trim() && $('status').querySelector('.res')); /* 文本没改过:上面的数字块已经说了同样的话 */
    e.innerHTML = h && !same ? '<span>' + h + '</span>' : '';
    $('taWrap').style.display = (SRC && !t.trim()) ? 'none' : '';
    $('estL').style.display = (o && o.structured) ? 'none' : '';
    $('p3lead').innerHTML = (o && o.structured) ? '检查<b class="k">大纲</b>，必要时直接修改。' : SRC ?
        '识别考纲中的<b class="k">考点</b>。' : '粘贴<b class="k">大纲</b>。符合格式的文本将直接使用。';
    syncBtns();
  }, now ? 0 : 180);
}

function est() {
  var E = $('estL');
  if (!SRC) {
    E.innerHTML = '';
    E.title = '';
    return;
  }
  var a = pint($('pgA').value) || 0;
  var b = pint($('pgB').value) || 0;
  var N = SRC.pages.length;
  var t;
  var iT;
  var oT;
  var tip;
  if (a || b) {
    a = Math.max(1, Math.min(a || 1, N));
    b = Math.max(1, Math.min(b || N, N));
    if (a > b) {
      var z = a;
      a = b;
      b = z;
    }
    t = tokOf(SRC.pages.slice(a - 1, b));
    iT = t * 1.2;
    oT = t * .5;
    tip = '仅读取第 ' + a + '–' + b + ' 页，无需通读整份文件';
  }
  else {
    t = SRC.tok;
    iT = t * 1.5;
    oT = t * .4;
    tip = '先通读整份文件定位正文，再提取考点';
  }
  var p = pricing();
  var h = '<span class="eh">预计</span><span>输入 <b>' + kfmt(iT) + '</b> · 输出 <b>' + kfmt(oT) + '</b> tokens</span>' +
      (p ? '<span class="cny">≈ ' + yuan((iT * p.m + oT * p.o) / 1e6) + '</span>' : '');
  if (t > 150000) {
    h += '<span class="warn">文件较大，建议填写页码范围。</span>';
  }
  if ($('fThink').checked) {
    h += '<span class="warn">已开启思考模式，输出量和耗时会大幅增加。</span>';
  }
  E.title = tip;
  E.innerHTML = h;
}

function srcUI() {
  var on = !!SRC;
  $('drop').style.display = on ? 'none' : '';
  $('src').style.display = on ? '' : 'none';
  $('pasteL').style.display = on ? 'none' : '';
  $('fText').placeholder = on ? '识别结果会显示在这里。' : PH;
  if (on) {
    $('srcName').textContent = SRC.name;
    $('srcMeta').textContent = SRC.pages.length + ' 页 · 约 ' + kfmt(SRC.tok) + ' tokens';
  }
  est();
}

/* ---- 第 4 步:确认规模和费用 ---- */
function renderStep4() {
  var t = $('fText').value.trim();
  var o = t ? outlineOf(t) : null;
  var box = $('s4');
  if (!(o && o.structured)) {
    box.innerHTML = '';
    return;
  }
  var th = $('fThink').checked;
  var e = genEst(o, th);
  var p = e.p;
  var title = $('fTitle').value.trim();
  var k = readCfg().kind;
  var fx = e.fx;
  var h = '';
  h += '<div class="sum"><div><b>' + o.sections.length + '</b><span>章节</span></div><div><b>' + e.n +
      '</b><span>考点</span></div><div><b>' + e.calls + '</b><span>次调用</span></div></div>';
  h += '<div class="subj"><span>科目</span><b>' + (title ? esc(title) : '<em>未命名</em>') +
      '</b><button class="chip" type="button" data-go="1">' + (title ? '修改' : '命名') + '</button></div>';
  if (fx) {
    h += '<div class="autof">' + AUTOI + '<span><b>' + fx + '</b> 个缺失的考点将在生成时<b class="k">自动补全</b></span></div>';
  }
  if (p) {
    var det = '输入约 ' + kfmt(e.inT) + ' tokens（提示词和章节上下文每批都会重复，命中缓存后约按 1/50 计费），输出约 ' + kfmt(e.oLo) + '–' +
        kfmt(e.oHi) + ' tokens。DeepSeek 分高峰与空闲两档：北京时间工作日 9–12 点、14–18 点为高峰，价格是空闲时段的 2 倍，法定节假日全天空闲。' + (th ?
        '思考模式的推理过程也按输出计费，已按 3–6 倍估算。' : '');
    h += '<div class="cost"><div class="cost-k">预计费用</div><div class="cost-v">' + yuan(e.lo) + ' – ' + yuan(e.hi) +
        '</div><div class="cost-s">估算，以平台账单为准 · 当前为<b>' + (p.peak ? '高峰' : '空闲') + '</b>时段' + (th ?
        ' · <span class="w">思考模式已开启</span>' : '') + '</div><details class="ckd"><summary>计费说明</summary><div class="ck-s">' +
        esc(det) + '</div></details></div>';
  }
  else if (k === 'local') {
    h += '<div class="cost"><div class="cost-k">费用</div><div class="cost-v">¥0</div><div class="cost-s">使用本地模型，不产生接口费用。</div></div>';
  }
  else {
    h += '<div class="cost"><div class="cost-k">费用</div><div class="cost-s">取决于所用服务商。约 <b>' + e.calls +
        '</b> 次调用，输入约 ' + kfmt(e.inT) + '，输出约 ' + kfmt(e.oLo) + '–' + kfmt(e.oHi) + ' tokens。</div></div>';
  }
  box.innerHTML = h;
}

async function startGen() {
  if (JOB) {
    st('已有生成任务正在进行。请等待完成，或先停止。', 'err');
    return;
  }
  var text = $('fText').value.trim();
  var o = text ? outlineOf(text) : null;
  if (!(o && o.structured)) {
    setStep(3);
    return;
  }
  var title = $('fTitle').value.trim();
  if (!title) {
    setStep(1);
    st('请输入科目名称。', 'err');
    $('fTitle').focus();
    return;
  }
  S.cfg = readCfg();
  if (!cfgOk(S.cfg)) {
    setStep(3);
    $('adv').open = true;
    st('请在“接口与模型”中填写接口地址、模型和 API Key。', 'err');
    return;
  }
  save();
  var s = buildSubject(title, $('fCode').value.trim(), o, (SRC || RAW) ? RAWIDX : null, (OUT && OUT.rc &&
      OUT.rc.fills) || []);
  uniqTitle(s);
  S.subs.push(s);
  S.cur = s.id;
  S.idx = 0;
  S.fold[s.id] = false;
  resetSheet();
  closeM();
  setView('subject');
  render();
  toast('已创建“' + s.title + '”，共 ' + s.items.length + ' 条。正在生成…');
  runJob(s.id);
}

/* ---- 状态:按钮文字、识别摘要 ---- */
function curSig() {
  return (SRC ? 'f' + SRC.name + '|' + SRC.chars : 't' + hash(RAW || $('fText').value)) + '|' +
      $('pgA').value.trim() + '-' + $('pgB').value.trim() + '|' + $('fModel').value.trim();
}

function outlineOf(t) {
  t = String(t || '').trim();
  return OUT && OUT.text === t ? OUT.o : parseOutline(t);
}

function pendWins() {
  return EXT && EXT.wins ? EXT.wins.filter(function (w) { return !w.res; }).length : 0;
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindWizard() {
  $('stL').onclick = function (e) {
    if (IDENT || BUSYF) {
      return;
    }
    var b = e.target.closest('[data-n]');
    if (!b) {
      return;
    }
    var n = +b.dataset.n;
    if (n === STEP) {
      return;
    }
    if (n < STEP || canStep(n)) {
      setStep(n);
    }
  };
  $('back').onclick = function () { if (!IDENT && !BUSYF && STEP > 1) {
    setStep(STEP - 1);
  } };
  $('mClose').onclick = function () { closeM(); };
  $('pasteL').onclick = function () {
    setStep(3, 1);
    setTimeout(function () { $('fText').focus(); }, 50);
  };
  $('s4').onclick = function (e) {
    var b = e.target.closest('[data-go]');
    if (b && !IDENT) {
      setStep(+b.dataset.go);
    }
  };
  ['fTitle', 'fCode'].forEach(function (k) {
    $(k).addEventListener('keydown', function (e) { if (e.key === 'Enter') {
      e.preventDefault();
      $('go').click();
    } });
  });
  /* 思考模式在「接口与模型」和第 4 步各有一个开关,保持同步;费用估算随之变化 */
  $('fThink').addEventListener('change', function () {
    $('fThink2').checked = this.checked;
    est();
    if (STEP === 4) {
      renderStep4();
    }
  });
  $('fThink2').addEventListener('change', function () {
    $('fThink').checked = this.checked;
    est();
    renderStep4();
  });
  $('go').onclick = async function () {
    if (IDENT || BUSYF) {
      return;
    }
    if (STEP === 1) {
      setStep(2);
      return;
    }
    if (STEP === 2) {
      if (!SRC && !$('fText').value.trim()) {
        st('请先上传考纲，或改为粘贴文本。', 'err');
        return;
      }
      setStep(3);
      return;
    }
    if (STEP === 3) {
      var text = $('fText').value.trim();
      var o = text ? outlineOf(text) : null;
      if (o && o.structured) {
        setStep(4);
        return;
      }
      if (SRC || text) {
        await identify(false);
        return;
      }
      st('请先上传 PDF 或粘贴大纲。', 'err');
      return;
    }
    startGen();
  };
  $('useL').onclick = function (e) {
    if (e.target.id === 'useX') {
      S.use = { n: 0, i: 0, o: 0, c: 0, cur: 'cny' };
      save();
      advSum();
    }
  };
  $('add').onclick = openM;
  $('cancel').onclick = function () {
    if (IDENT) {
      IDENT.abort();
      return;
    }
    closeM();
  };
  $('modal').addEventListener('mousedown', function (e) { if (e.target === this && !IDENT) {
    closeM();
  } });
  ['fKind', 'fKey', 'fModel', 'fBase'].forEach(function (k) { $(k).addEventListener('input', advSum); });
  $('fKind').onchange = function () {
    if (this.value !== 'custom') {
      $('fBase').value = PRE[this.value];
    }
    advSum();
  };
  $('fTitle').addEventListener('input', function () { delete this.dataset.auto; });
  $('fText').addEventListener('input', function () {
    var t = this.value.trim();
    /* 文本框被整体换成了别的内容:旧的原文/识别进度作废,避免拿旧原文去核对新内容 */
    if (!SRC && (RAW || OUT)) {
      var keep = false;
      if (OUT) {
        if (t === OUT.text) {
          keep = true;
        }
        else {
          var set = {};
          OUT.text.split('\n').forEach(function (l) { set[l] = 1; });
          var ls = t.split('\n').filter(Boolean);
          keep = ls.length > 0 && ls.filter(function (l) { return set[l]; }).length >= ls.length * .5;
        }
      }
      else {
        keep = t === RAW.trim();
      }
      if (!keep) {
        RAW = '';
        OUT = null;
        EXT = null;
        UNDO = null;
      }
    }
    info();
  });
  ['pgA', 'pgB'].forEach(function (k) { $(k).addEventListener('input', function () {
    est();
    info();
  }); });
  $('drop').onclick = function () { $('fFile').click(); };
  $('fFile').onchange = function () {
    var f = this.files[0];
    this.value = '';
    takeFile(f);
  };
  $('srcX').onclick = function () {
    if (IDENT) {
      return;
    }
    SRC = null;
    RAWIDX = null;
    EXT = null;
    OUT = null;
    RAW = '';
    $('pgA').value = '';
    $('pgB').value = '';
    st('');
    srcUI();
    info(1);
  };
  /* 把文件拖到页面任意位置:弹窗没开就先打开 */
  window.addEventListener('dragover', function (e) {
    e.preventDefault();
    document.body.classList.add('dz');
  });
  window.addEventListener('dragleave', function (e) { if (!e.relatedTarget) {
    document.body.classList.remove('dz');
  } });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    document.body.classList.remove('dz');
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && !IDENT && (!$('modal').classList.contains('on') || $('bImp').style.display !== 'none') && /\.json$/i.test(f.name)) {
      importFile(f);
      return;
    }
    if (f && !IDENT && /\.(pdf|txt|md)$/i.test(f.name)) {
      if (!$('modal').classList.contains('on') || $('bNew').style.display === 'none') {
        openM();
      }
      takeFile(f);
    }
  });
  $('redo').onclick = function () {
    if (OUT && $('fText').value.trim() !== OUT.text && !confirm('重新识别将覆盖文本框中的修改。继续？')) {
      return;
    }
    identify(true);
  };
  $('test').onclick = async function () {
    var b = this;
    S.cfg = readCfg();
    if (!cfgOk(S.cfg)) {
      st('请先填写接口地址、模型和 API Key。', 'err');
      $('adv').open = true;
      return;
    }
    b.disabled = true;
    st('测试中…', 'run');
    save();
    try {
      var j = await post([{ role: 'user', content: 'Reply with JSON: {"ok":true}' }], 300);
      var c = j.choices && j.choices[0];
      if (!c) {
        throw new Error('响应中没有 choices');
      }
      st('连接成功。模型返回：' + String(c.message && c.message.content || '（空）').slice(0, 60));
    }
    catch (e) {
      st('连接失败：' + e.message + hint(e), 'err');
    }
    b.disabled = false;
  };
}


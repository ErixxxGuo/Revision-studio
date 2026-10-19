/* ======== 19-import.js ======== */
/**
 * 19 · import.js — 导入：文件、分享码、备份恢复
 */

function uniqTitle(s) {
  var base = String(s.title).slice(0, 70);
  var n = 1;
  var names = all().map(function (x) { return x.title; });
  while (names.indexOf(s.title) > -1) {
    n++;
    s.title = base + ' (' + n + ')';
  }
}

function closeImp() {
  if ($('bImp').style.display !== 'none') {
    $('modal').classList.remove('on');
  }
}

/* 返回 true = 已导入;false = 用户取消;数据无效时抛异常 */
function importData(o) {
  if (o && o.app === 'revstudio-backup' && Array.isArray(o.subs)) {
    var subs = o.subs.map(function (x) { return cleanSub(x, true); }).filter(Boolean);
    if (!subs.length && o.subs.length) {
      throw 0;
    }
    if (!confirm('恢复备份（' + String(o.date || '').slice(0, 10) + '）？\n将恢复 ' + subs.length + ' 个科目。同一科目会被备份中的版本替换，其余保留。')) {
      return false;
    }
    subs.forEach(function (x) {
      var i = S.subs.findIndex(function (y) { return y.id === x.id; });
      if (i > -1) {
        if (JOB && JOB.sub === x.id) {
          stopJob();
        }
        S.subs[i] = x;
      }
      else {
        S.subs.push(x);
      }
    });
    var p = o.prog && typeof o.prog === 'object' ? o.prog : {};
    for (var k in p) {
      if (!p[k] || typeof p[k] !== 'object') {
        continue;
      }
      var m = {};
      for (var q in p[k]) {
        if (p[k][q] === true) {
          m[q] = true;
        }
      }
      S.prog[k] = Object.assign(S.prog[k] || {}, m);
    }
    render();
    toast('已恢复 ' + subs.length + ' 个科目');
    return true;
  }
  var s = cleanSub(o && o.app === 'revstudio-subject' && o.subject ? o.subject : o, false);
  if (!s) {
    throw 0;
  }
  uniqTitle(s);
  S.subs.push(s);
  S.cur = s.id;
  S.idx = 0;
  S.fold[s.id] = false;
  setView('subject');
  drawer(false);
  render();
  toast('已导入“' + s.title + '”');
  return true;
}

function importText(t, what) {
  try {
    var ok = importData(JSON.parse(t));
    if (ok) {
      closeImp();
    }
    return ok;
  }
  catch {
    toast('无法导入。' + what + '不是有效的科目或备份。');
    return false;
  }
}

function importFile(f) {
  if (!f) {
    return;
  }
  var r = new FileReader();
  r.onload = function () { importText(String(r.result), '文件'); };
  r.readAsText(f);
}

async function importCode(txt) {
  var t;
  try {
    t = await decodeCode(txt);
  }
  catch (e) {
    toast(e && e.message === 'nodecomp' ? '当前浏览器无法解析此分享码，请改用文件。' : '无法导入。分享码不完整或已损坏。');
    return false;
  }
  return importText(t, '分享码');
}

function openImport() {
  $('imCode').value = '';
  $('imGo').disabled = true;
  drawer(false);
  showBox('bImp');
  setTimeout(function () { $('imFile').focus(); }, 50);
}

/** 绑定本模块的事件。由 main() 在启动时调用一次。 */
function bindImport() {
  $('imp').onclick = function () {
    menuOpen(false);
    openImport();
  };
  $('imFile').onclick = function () { $('fImp').click(); };
  $('imCode').addEventListener('input', function () { $('imGo').disabled = !this.value.trim(); });
  $('imGo').onclick = async function () {
    var b = this;
    var v = $('imCode').value.trim();
    if (!v) {
      return;
    }
    b.disabled = true;
    try {
      if (v.charAt(0) === '{') {
        importText(v, '内容');
      }
      else {
        await importCode(v);
      }
    }
    finally {
      b.disabled = !$('imCode').value.trim();
    }
  };
  $('imX').onclick = function () { closeM(); };
  $('fImp').onchange = function () {
    var f = this.files[0];
    this.value = '';
    importFile(f);
  };
}


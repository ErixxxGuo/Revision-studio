/* ======== 02-markdown.js ======== */
/**
 * 02 · markdown.js — Markdown 子集 + KaTeX 公式 + 模型 JSON 里的 LaTeX 反斜杠修复
 */

/* Markdown 子集 + 公式。顺序:先把 $...$ 公式整段抽走 → 再转义 HTML → 再处理 `代码`、**粗体**、*斜体*、[[重点词]] → 最后把公式放回。
   模型给的内容永远先转义,所以不可能注入标签;公式交给 KaTeX 渲染(throwOnError 关闭,trust 关闭) */
var MX = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?![\s$])((?:[^$\n\\]|\\.)*?[^\s$\\])\$(?!\d)/g;

function md(s) {
  s = String(s == null ? '' : s).replace(/[\u0001\u0002]/g, '');
  var M = [];
  s = s.replace(MX, function (m, a, b, c, d) {
    var tex = String(a != null ? a : b != null ? b : c != null ? c : d).trim();
    var disp = a != null || b != null;
    M.push('<span class="tex' + (disp ? ' disp' : '') + '" data-t="' + esc(tex) + '" data-d="' + (disp ? 1 : 0) +
        '">' + esc(tex) + '</span>');
    return '\u0001' + (M.length - 1) + '\u0002';
  });
  s = esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?!\*)/g, '$1<em>$2</em>').replace(/\[\[(.+?)\]\]/g, '<mark>$1</mark>');
  return s.replace(/\u0001(\d+)\u0002/g, function (_, i) { return M[+i]; });
}

var KTX = null;

function loadKatex() {
  if (window.katex && window.katex.render) {
    return Promise.resolve();
  }
  if (KTX) {
    return KTX;
  }
  var B = ['https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/', 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/', 'https://unpkg.com/katex@0.16.9/dist/'];
  function js(u) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script');
      s.src = u;
      s.onload = ok;
      s.onerror = function () {
        s.remove();
        no(new Error(u));
      };
      document.head.appendChild(s);
    });
  }
  KTX = (function next(i) {
    if (i >= B.length) {
      return Promise.reject(new Error('katex'));
    }
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = B[i] + 'katex.min.css';
    document.head.appendChild(l);
    return js(B[i] + 'katex.min.js').then(function () {
      return js(B[i] + 'contrib/mhchem.min.js').catch(function () { });
    }).catch(function () {
      l.remove();
      return next(i + 1);
    });
  })(0);
  KTX.catch(function () { KTX = null; });
  return KTX;
}

/* 联网时渲染公式;离线或加载失败时保留原始 TeX(等宽字体),内容不丢 */
function typeset(root) {
  var els = root ? root.querySelectorAll('.tex:not(.ok)') : [];
  if (!els.length) {
    return;
  }
  loadKatex().then(function () {
    [].forEach.call(els, function (e) {
      if (e.classList.contains('ok')) {
        return;
      }
      try {
        katex.render(e.dataset.t, e, { displayMode: e.dataset.d === '1', throwOnError: false, strict: 'ignore', trust: false, maxExpand: 1000 });
        e.classList.add('ok');
      }
      catch {
        e.classList.add('ok', 'bad');
      }
    });
  }, function () { });
}

function hasMath() {
  return S.subs.some(function (s) {
    return s.items.some(function (x) {
      return (x.notes || []).some(function (n) {
        MX.lastIndex = 0;
        var r = MX.test(n);
        MX.lastIndex = 0;
        return r;
      });
    });
  });
}

/* 模型输出里的 LaTeX 反斜杠:\frac \theta \neq \rightarrow \beta 恰好是合法的 JSON 转义,会被悄悄变成换页符、制表符等控制字符;
   \ce \int \sqrt 等则不是合法转义,整段解析会失败。前者在解析后还原,后者在解析失败时补一个反斜杠再试 */
var CTL = { '\f': '\\f', '\b': '\\b', '\r': '\\r', '\t': '\\t', '\n': '\\n', '\v': '\\v' };

function fixDeep(x) {
  if (typeof x === 'string') {
    return x.replace(/[\f\b\r\t\n\v]/g, function (c) { return CTL[c]; });
  }
  if (Array.isArray(x)) {
    return x.map(fixDeep);
  }
  if (x && typeof x === 'object') {
    var o = {};
    for (var k in x) {
      o[k] = fixDeep(x[k]);
    }
    return o;
  }
  return x;
}

function fixEsc(t) {
  return t.replace(/\\\\|\\(?:u(?![0-9a-fA-F]{4})|[^"\\\/bfnrtu])/g, function (m) { return m === '\\\\' ? m : '\\' + m; });
}

/* 图表(SVG)里不能放公式:去掉公式标记,\ce{H2O} 转成 H₂O */
var SUBD = '₀₁₂₃₄₅₆₇₈₉';

function plainTxt(s) {
  return String(s).replace(/\\ce\{([^{}]*)\}/g, function (_, c) {
    return c.replace(/([A-Za-z)\]])(\d+)/g, function (m, a, d) { return a + d.replace(/\d/g, function (x) { return SUBD[+x]; }); }).replace(/<=>|<->/g, '⇌').replace(/->/g, '→');
  })
    .replace(/\\(?:rightarrow|to)\b/g, '→').replace(/\\leftrightarrow\b/g, '↔').replace(/\\([A-Za-z]+)/g, '$1').replace(/\$\$?|\\\(|\\\)|\\\[|\\\]/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
}

function plainDeep(x) {
  if (typeof x === 'string') {
    return plainTxt(x);
  }
  if (Array.isArray(x)) {
    return x.map(plainDeep);
  }
  if (x && typeof x === 'object') {
    var o = {};
    for (var k in x) {
      o[k] = k === 'type' ? x[k] : plainDeep(x[k]);
    }
    return o;
  }
  return x;
}


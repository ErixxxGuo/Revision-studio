/* ======== 04-content.js ======== */
/**
 * 04 · content.js — 内置科目的重点词高亮（EXAM_HL_TERMS）与卡片高光
 */

var EXAM_HL_TERMS = ["binary", "denary", "hexadecimal", "nibble", "byte", "overflow", "logical shift", "two’s complement", "ASCII", "Unicode", "sample rate", "sample resolution", "resolution", "colour depth", "compression", "lossy", "lossless", "RLE", "packet", "packet header", "payload", "trailer", "destination address", "packet number", "originator’s address", "packet switching", "serial", "parallel", "simplex", "half-duplex", "full-duplex", "USB", "parity check", "checksum", "echo check", "check digit", "ARQ", "automatic repeat query", "timeout", "positive acknowledgement", "negative acknowledgement", "acknowledgement", "interference", "data loss", "data gain", "data change", "error detection", "encryption", "symmetric", "asymmetric", "public key", "private key", "CPU", "ALU", "CU", "PC", "MAR", "MDR", "CIR", "ACC", "address bus", "data bus", "control bus", "FDE cycle", "interrupt", "embedded system", "input device", "output device", "sensor", "actuator", "RAM", "ROM", "virtual memory", "magnetic", "optical", "solid-state", "NAND", "NOR", "flash memory", "operating system", "utility software", "compiler", "interpreter", "IDE", "translator", "syntax", "logic error", "runtime", "high-level", "low-level", "machine independent", "machine dependent", "assembly language", "mnemonics", "assembler", "internet", "world wide web", "URL", "IP address", "DNS", "HTTP", "HTTPS", "web browser", "HTML", "cookie", "session cookie", "persistent cookie", "digital currency", "blockchain", "cyber security", "brute-force attack", "data interception", "DDoS", "hacking", "malware", "phishing", "pharming", "social engineering", "access levels", "firewall", "proxy server", "privacy settings", "anti-malware", "authentication", "software updates", "SSL", "automated system", "microprocessor", "robotics", "robot", "artificial intelligence", "expert system", "knowledge base", "rule base", "inference engine", "machine learning", "intelligent behaviour", "intelligent behaviours", "computer science", "mechanical structure", "electrical components", "programmable", "algorithm", "analysis", "design", "coding", "testing", "decomposition", "flowchart", "pseudocode", "linear search", "bubble sort", "totalling", "counting", "maximum", "minimum", "average", "validation", "verification", "range check", "length check", "type check", "presence check", "format check", "double entry", "normal", "abnormal", "extreme", "boundary", "trace table", "debugging", "variable", "constant", "INTEGER", "REAL", "CHAR", "STRING", "BOOLEAN", "sequence", "statements", "executed in order", "selection", "iteration", "count-controlled", "pre-condition", "post-condition", "IF", "CASE", "FOR", "WHILE", "REPEAT", "SUBSTRING", "LENGTH", "UCASE", "LCASE", "MOD", "DIV", "ROUND", "RANDOM", "procedure", "procedures", "function", "functions", "parameter", "local", "global", "meaningful identifiers", "commenting feature", "comments", "array", "1D array", "2D array", "file", "primary key", "field", "record", "SQL", "SELECT", "FROM", "WHERE", "ORDER BY", "SUM", "COUNT", "AND", "OR", "NOT", "NAND", "NOR", "XOR", "truth table", "logic circuit", "integers", "overflow error", "predefined limit", "most significant bit", "least significant bit", "zeros", "multiplied", "divided", "units specified", "1024", "bandwidth", "storage space", "transmission time", "broken down", "different route", "out of order", "reordered", "benefits", "drawbacks", "integrated circuit", "single chip", "actuator", "MAC address", "point of manufacture", "assign IP addresses", "specific destination", "application software", "machine independence", "ease of debugging", "infrastructure", "electronically", "digital ledger", "time-stamped", "scenarios", "domestic", "drones", "Decomposition", "inputs", "processes", "outputs", "largest/smallest", "user prompts", "variables", "Precision", "position zero", "Relational", "first index", "indexes", "nested iteration", "fields", "records", "validation", "SQL statement", "single input", "two inputs", "without simplification", "remotely", "locally", "samples taken per second", "bits used per sample", "8 bits in a byte", "1024 mebibytes", "router", "Extreme data", "processed by a computer", "logic gates", "registers", "trace table", "logical left shifts", "logical right shifts", "8-bit register", "255", "pixel", "packets", "arrive out of order", "digital light processing", "Application software", "services", "industry", "agriculture", "medicine", "nested", "SQL", "zero or one", "hexadecimal", "integers only", "predefined limit", "zeros are shifted in", "sampled", "units specified", "not 1000", "advantages and disadvantages", "parity byte", "parity block check", "acknowledgements", "Asymmetric", "public and private keys", "arithmetic logic unit", "control unit", "general purpose computer", "barcode scanner", "digital camera", "keyboard", "microphone", "optical mouse", "QR code scanner", "Physical servers", "manufacturer code", "serial code", "static", "dynamic", "IPv4", "IPv6", "allocated", "nested statements", "three levels", "read and write", "single items", "line of text", "expert systems", "machine learning", "line-by-line", "bookmarks", "user history", "standard logic gate symbols", "greater than", "= < <= > >= <>"];

function candidateTermsFor(item, html) {
  var text = stripTags(html);
  var out = [];
  var low = text.toLowerCase();
  function addTerm(t) {
    if (!t || String(t).trim().length < 3) {
      return;
    }
    if (/^(value|values|select|effect|effect this has|this|use|used|using)$/i.test(String(t).trim())) {
      return;
    }
    var v = String(t).trim();
    if (out.some(function (x) { return x.toLowerCase() === v.toLowerCase(); })) {
      return;
    }
    out.push(v);
  }
  // Prefer exact Cambridge/0478 technical terms first.
  EXAM_HL_TERMS.forEach(function (t) {
    var cs = (t === t.toUpperCase() && t.length <= 5 && /[A-Z]/.test(t));
    if (new RegExp('(?<![\\w-])' + escapeRegExp(t) + '(?![\\w-])', cs ? '' : 'i').test(cs ? text : low)) {
      addTerm(t);
    }
  });
  // Then split the objective's key phrases into useful teachable chunks.
  (item.keys || []).forEach(function (seg) {
    var raw = String(seg);
    raw.split(/[,;:]|\band\b|\bor\b|\bto\b|\bof\b|\bthe\b|\ba\b|\ban\b|\bfor\b|\bwith\b|\bin\b|\bon\b|\busing\b/ig).forEach(function (x) {
      var v = x.replace(/^[\s,–—-]+|[\s,–—-]+$/g, '').trim();
      if (v.length >= 5 && v.split(/\s+/).length >= 1) {
        addTerm(v);
      }
    });
  });
  return out.slice(0, 6);
}

function markTerms(html, item) {
  var wanted = candidateTermsFor(item, html);
  if (wanted.length < 2) {
    var fallback = [];
    String(stripTags(html)).split(/[,;:.!?()\-–—]+/).forEach(function (x) {
      var v = x.trim();
      if (v.length >= 6 && v.split(/\s+/).length <= 7) {
        fallback.push(v);
      }
    });
    wanted = wanted.concat(fallback.slice(0, 4));
  }
  // Avoid matches inside injected HTML by performing one combined replacement per text node.
  wanted = wanted.sort(function (a, b) { return b.length - a.length; });
  var re = null;
  if (wanted.length) {
    re = new RegExp('(?<![\\w-])(' + wanted.map(escapeRegExp).join('|') + ')(?![\\w-])', 'gi');
  }
  var parts = String(html || '').split(/(<[^>]+>)/g);
  var inSvg = 0;
  parts = parts.map(function (part) {
    if (/^<svg[\s>]/i.test(part)) {
      inSvg++;
    }
    else if (/^<\/svg>/i.test(part)) {
      inSvg = Math.max(0, inSvg - 1);
    }
    if (part.charAt(0) === '<' || !re || inSvg) {
      return part;
    }
    return part.replace(re, function (m) {
      var t = wanted.filter(function (w) { return w.toLowerCase() === m.toLowerCase(); })[0];
      if (t && t === t.toUpperCase() && t.length <= 5 && /[A-Z]/.test(t) && m !== t) {
        return m;
      }
      return '<mark class="exam-hl">' + m + '</mark>';
    });
  });
  return parts.join('');
}

function bn(n, it) {
  var s = markTerms(n, it).replace(/^<mark class="exam-hl">(Includes|Limited to)<\/mark>:/i, '$1: ');
  return s.replace(/^(Includes|Limited to):\s*/i, '<span class="note-prefix">$1</span>: ');
}

/* 高光:模型只给短语,程序在原文里逐字查找;找不到的丢弃,杜绝模型改写原文 */
function segs(text, keys) {
  var low = text.toLowerCase();
  var r = [];
  (keys || []).forEach(function (k) {
    k = String(k);
    var p = low.indexOf(k.toLowerCase());
    if (p < 0 || k.length < 2) {
      return;
    }
    if (r.every(function (q) { return p + k.length <= q[0] || p >= q[1]; })) {
      r.push([p, p + k.length]);
    }
  });
  r.sort(function (a, b) { return a[0] - b[0]; });
  var out = '';
  var c = 0;
  r.forEach(function (q) {
    out += '<span class="sc">' + esc(text.slice(c, q[0])) + '</span><span class="hl">' + esc(text.slice(q[0], q[1])) + '</span>';
    c = q[1];
  });
  return out + (r.length ? '<span class="sc">' + esc(text.slice(c)) + '</span>' : esc(text));
}


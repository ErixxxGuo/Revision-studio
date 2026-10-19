/* ======== 05-icons.js ======== */
/**
 * 05 · icons.js — 图标与装饰图形
 */

/* ================= icons & decoration ================= */
var IC = {
  chev: '<svg class="i chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
  x: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>',
  ck: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  arr: '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
  art: '<svg class="art" viewBox="0 0 64 40" aria-hidden="true"><rect x="10" y="6" width="44" height="28" rx="6" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 3"/><path d="M18 16h20M18 22h28M18 28h12" stroke="currentColor" stroke-opacity=".45" stroke-width="1.3" stroke-linecap="round"/></svg>'
};
var AUTOI = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M7 2.4l1.3 3.4 3.4 1.3-3.4 1.3L7 11.8 5.7 8.4 2.3 7.1l3.4-1.3z"/><path d="M12.4 10.2l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/></svg>';

function ring(p, c) {
  var C = 2 * Math.PI * 7;
  p = Math.max(0, Math.min(1, p || 0));
  return '<svg class="ring" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7" class="ring-bg"/>' +
      (p > 0 ? '<circle cx="9" cy="9" r="7" class="ring-fg" style="stroke:' + (c || 'var(--accent)') +
      '" stroke-dasharray="' + (C * p).toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 9 9)"/>' : '') + '</svg>';
}

function motif(seed) {
  var h = hash(seed);
  var n = 3 + h % 3;
  var o = '<svg viewBox="0 0 300 300" width="100%" height="100%"><defs><radialGradient id="mfG" cx=".83" cy=".83" r=".9"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".85"/><stop offset=".95" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="mfM"><rect width="300" height="300" fill="url(#mfG)"/></mask></defs><g mask="url(#mfM)">';
  for (var x = 15; x < 300; x += 18) {
    for (var y = 15; y < 300; y += 18) {
      o += '<circle cx="' + x + '" cy="' + y + '" r="1.1" class="dots" opacity=".55"/>';
    }
  }
  for (var k = 0; k < n; k++) {
    var r = 46 + k * 44;
    o += '<circle cx="250" cy="250" r="' + r + '" fill="none" stroke="currentColor" stroke-width="' + (k === 1 ? 1.5 :
        1.1) + '" stroke-opacity="' + (0.85 - k * 0.12).toFixed(2) + '"' + ((h >> k) & 1 ? ' stroke-dasharray="2 6"' : '') + '/>';
  }
  [[1, (h >> 5) % 80 + 185, 4.5, 1], [n - 1, (h >> 11) % 70 + 190, 3.5, 0]].forEach(function (m) {
    var r = 46 + m[0] * 44;
    var a = m[1] * Math.PI / 180;
    var cx = 250 + r * Math.cos(a);
    var cy = 250 + r * Math.sin(a);
    o += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + m[2] + '" ' + (m[3] ?
        'fill="currentColor"' : 'fill="var(--card)" stroke="currentColor" stroke-width="1.3"') + '/>';
  });
  return o + '</g></svg>';
}

var ICP = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.9l2.5 2.5-7.5 7.5-3.2.7.7-3.2z"/><path d="M9.2 4.3l2.5 2.5"/></svg>';
var ICT = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.6 4.3h10.8"/><path d="M6.2 4.3V2.9h3.6v1.4"/><path d="M4.1 4.3l.6 8.4c0 .5.4.9.9.9h4.8c.5 0 .9-.4.9-.9l.6-8.4"/><path d="M6.7 7v4M9.3 7v4"/></svg>';
var ICS = '<svg class="i" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 9.8V2.6M5.4 5L8 2.4 10.6 5M5.3 7H4.4c-.5 0-.9.4-.9.9v4.7c0 .5.4.9.9.9h7.2c.5 0 .9-.4.9-.9V7.9c0-.5-.4-.9-.9-.9h-.9"/></svg>';


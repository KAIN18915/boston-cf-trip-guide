/* ボスキャリ2026 旅行プラン：プラン作成・宿一覧・宿の詳細・比較・ガイド。データは data/*.json を実行時に読む。
   保存先は localStorage（プラン・比較・予約前チェック・確認済みの注意）。予約・ログイン・在庫照会はしない。 */
(function () {
'use strict';
var META = window.SITE_META || {local_photos: {}}, ROOT = META.root || './', PAGE = META.page || 'planner';
var DB = [], BY = {}, TRIP = null, FL = [], FBY = {}, RTQ = [];
var MAXN = 6, MAXSAVE = 4, STALE_DAYS = 14, SCHEMA = 1;
var LS = {derived: 'bcf26.derived', shide: 'bcf26.savedHidden', ipf: 'bcf26.idealFilters', ipsel: 'bcf26.idealSel', plan: 'bcf26.plan', saved: 'bcf26.saved', check: 'bcf26.check', ack: 'bcf26.ack', filt: 'bcf26.filters', target: 'bcf26.target'};
var CONF = {date: '確認済み', est: '概算', from: '〜から', unv: '要確認'};
var BASIS = {cheapest: '最安', refundable: 'キャンセル可の最安', breakfast: '朝食付き最安', nomember: '会員料金を除く'};
/* 宿の種類。lodging_db.json の12種類に、seed の旧い種類名を同じ表示名で寄せる */
var TYPES = {
  hotel: ['ホテル', 'hotel'], extended_stay_apartment_hotel: ['長期滞在型ホテル', 'hotel'], motel: ['モーテル', 'hotel'],
  guesthouse_bnb_inn: ['ゲストハウス・B&B', 'bed-double'], guesthouse: ['ゲストハウス・B&B', 'bed-double'], inn: ['ゲストハウス・B&B', 'bed-double'],
  hostel: ['ホステル', 'bed-double'], capsule_pod_hotel: ['カプセル', 'bed'], capsule: ['カプセル', 'bed'], pod: ['カプセル', 'bed'],
  homestay: ['ホームステイ', 'bed-double'], private_room_rental: ['民泊・個室', 'house'], airbnb_room: ['民泊・個室', 'house'],
  vacation_rental: ['民泊・1棟', 'house'], airbnb_entire: ['民泊・1棟', 'house'], vrbo_entire: ['民泊・1棟', 'house'], apartment: ['民泊・1棟', 'house'],
  club_hotel: ['クラブのゲストルーム', 'hotel'], community_guest_room: ['団体のゲストルーム', 'bed-double'],
  university_dorm: ['学生寮', 'bed-double'], dorm: ['学生寮', 'bed-double']
};
var FEATS = {
  late: ['深夜チェックイン', /深夜|24時間|24h|セルフチェックイン|self.?check|late.?check/i],
  kitchen: ['キッチン', /キッチン|kitchen/i],
  breakfast: ['朝食', /朝食|breakfast/i],
  refund: ['無料キャンセル', null],
  privbath: ['専用バス', /バス付き|専用バス|private bath|バス1/i]
};
var VLBL = {ok: 'OK', chk: '要確認', no: '時間が足りない'};
var WD = ['日', '月', '火', '水', '木', '金', '土'];
/* 説明（ツールチップ）。30〜80字 */
var TIPS = {
  pp: '航空券＋宿代÷人数＋空港移動＋市内交通。不明な項目は0にせず「未確認」。',
  fit: '定員と必要な部屋数で判定。定員不明でもその人数の料金があれば入る扱い。空室は別。',
  taxe: '税抜きの宿代＋宿泊税（Boston 14.95%／Back Bay・会場周辺 16.45%）の概算。地域不明は14.95%。',
  avail: '空室は未確認。確認日に掲載があったかだけで、予約可の保証ではない。',
  verdict: '便の時刻・会場の受付時間・宿泊日の突き合わせ（遅延は考慮外）。',
  cmp: '同じ日程・人数・部屋タイプの料金。確認日から14日超は要再確認。',
  delta: '今のプランとの差額（1人あたり）。料金不明があると出さない。',
  check: '予約直前の確認項目。プラン変更で関係する項目のチェックは外れる。'
};
function balTip(w) { return '参加できる1時間を$' + w + '・会場まで1km＝$5を足して小さい順・距離不明は10km扱い'; }

/* ---------- 小物 ---------- */
function $(s, el) { return (el || document).querySelector(s); }
function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
function ic(n, c) { return '<svg class="' + (c || 'ic sm') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(v) { return '$' + (Math.round(v * 100) / 100).toLocaleString('en-US', {maximumFractionDigits: v % 1 ? 2 : 0}); }
function range(lo, hi) { return Math.round(lo) === Math.round(hi) ? money(Math.round(lo)) : money(Math.round(lo)) + '〜' + money(Math.round(hi)); }
function dobj(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
function dstr(d) { return d.toISOString().slice(0, 10); }
function addD(s, n) { var d = dobj(s); d.setUTCDate(d.getUTCDate() + n); return dstr(d); }
function diffD(a, b) { return Math.round((dobj(b) - dobj(a)) / 864e5); }
function md(s) { return +s.slice(5, 7) + '/' + +s.slice(8, 10); }
function mdw(s) { return md(s) + '（' + WD[dobj(s).getUTCDay()] + '）'; }
function wd(s) { return WD[dobj(s).getUTCDay()]; }
function nightsOf(a, b) { var o = []; for (var d = a; d < b; d = addD(d, 1)) o.push(d); return o; }
function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v && typeof v === 'object') { for (var k of ['amount', 'total', 'price']) if (typeof v[k] === 'number') return v[k]; }
  return null;
}
function hm(min) { var m = ((min % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
var T0 = '2026-11-19';
function tmin(dt) { if (!dt) return null; var d = dt.slice(0, 10), t = dt.slice(11, 16); var m = diffD(T0, d) * 1440; if (t) { var p = t.split(':'); m += +p[0] * 60 + +p[1]; } return m; }
function confKey(c, note) {
  c = String(c || '').toLowerCase();
  if (/^(listed|listed_before_fees|confirmed|high|date|date_confirmed|date_specific|exact|verified)$/.test(c) || c === '日付指定で確認' || c === '手動確認') return 'date';
  if (/^(from|starting|starting_at|starting_from)$/.test(c) || c === '〜から') return 'from';
  if (c === 'reference' && /〜\s*$|〜（|〜$/.test(note || '')) return 'from';
  if (/^(estimate|estimated|approx|medium|reference)$/.test(c) || c === '概算') return 'est';
  return 'unv';
}
function lbl(k) { return '<span class="lbl c-' + k + '">' + CONF[k] + '</span>'; }
function taxTxt(t) { return t === true ? '税・手数料込み' : t === false ? '税・手数料別' : '税込か未確認'; }
function taxOf(set) {
  var a = Array.from(set);
  if (!a.length) return '';
  if (a.length === 1) return taxTxt(a[0]);
  return a.indexOf(false) >= 0 ? '税・手数料別を含む' : '税込か未確認を含む';
}
function typeOf(p) { var t = String(p.type || '').toLowerCase(); return TYPES[t] || TYPES[t.split('_')[0]] || [p.type || '宿', 'hotel']; }
function singleUnit(p) { return /airbnb|vrbo|entire|homestay|apartment|vacation_rental|private_room/i.test(p.type || ''); }
/* 空室メモ（確認日時点の表示。今の空室ではない）。nights を渡すと、その泊にかかるときだけ返す */
function availOf(p, nights) {
  var a = p && p.avail; if (!a) return null;
  if (nights && a.nights && !nights.some(function (d) { return a.nights.indexOf(d) >= 0; })) return null;
  return a;
}
/* 最低泊数：泊数を超える部屋、または最低泊数が不明な部屋（Homestay.com）は false */
function minOK(r, nights) { if (r.min_nights_unknown) return false; return !(r.min_nights > nights.length); }
function minBadge(p) { return p && p.min_stay ? '<span class="lbl c-min">' + ic('calendar-x') + '最低泊数に注意</span>' : ''; }
function availLbl(a) { return a ? a.label + '（' + md(a.seen) + '時点' + (a.nights ? '・' + a.nights.map(md).join('・') + '泊' : '') + '）' : ''; }
function km(p) {
  if (!p || p.lat == null || p.lon == null) return null;
  var v = TRIP.venue, R = 6371, r = Math.PI / 180;
  var a = Math.sin((p.lat - v.lat) * r / 2) ** 2 + Math.cos(v.lat * r) * Math.cos(p.lat * r) * Math.sin((p.lon - v.lon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function areaOf(p) { return String(p.area || '不明').split(/[／（(]/)[0].trim() || '不明'; }
function feats(p) {
  var txt = [].concat(p.features || [], p.note || '', (p.rooms || []).map(function (r) { return r.beds || ''; })).join(' ');
  var o = {};
  Object.keys(FEATS).forEach(function (k) { if (FEATS[k][1] && FEATS[k][1].test(txt)) o[k] = 1; });
  var c = String(p.cancellation || '');
  if (/返金可|無料キャンセル|free cancel|refundable/i.test(c) && !/返金不可|non.?refundable/i.test(c)) o.refund = 1;
  (p.rooms || []).forEach(function (r) { (r.offers || []).forEach(function (of) { if (of.refundable === true) o.refund = 1; if (of.breakfast === true) o.breakfast = 1; }); });
  return o;
}
function excluded(p) { return ((p.planner || {}).groups || []).indexOf('excluded') >= 0; }
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境では何もしない */ } }
function tip(t) { return '<span class="tipw"><button type="button" class="tip" data-act="tip" aria-expanded="false" aria-label="説明">' + ic('info') + '</button><span class="tip-b" role="tooltip" data-tip>' + esc(t) + '</span></span>'; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function stayURL(id) { return ROOT + 'stays/' + (/^[A-Za-z0-9_\-]+$/.test(id) ? encodeURIComponent(id) + '/' : '?q=' + encodeURIComponent((BY[id] || {}).name || id)); }
function daysOld(s) { if (!s) return null; return Math.floor((Date.now() - dobj(s).getTime()) / 864e5); }
function stale(s) { var d = daysOld(s); return d != null && d > STALE_DAYS; }
function fitLen(s, lo, hi, pad) { if (s.length < lo && pad) s += pad; if (s.length > hi) s = s.slice(0, hi - 1) + '…'; return s; }
function dlt(v) { if (v == null) return '差額不明'; var r = Math.round(v); return (r > 0 ? '+' : r < 0 ? '−' : '±') + '$' + Math.abs(r) + '/人'; }

/* ---------- 料金 ---------- */
/* 部屋の料金エントリ（キー＝1泊の日付 または 期間 "A/B"）を料金基準で集める。occ：1部屋あたりの人数（人数条件つきの料金の照合用） */
function entries(r, basis, occ) {
  var out = [], offers = Array.isArray(r.offers) ? r.offers : [], known = true, matched = 0;
  function ok(o) {
    if (o.guests != null && r.pricing !== 'per_bed' && occ != null && +o.guests !== occ) return false;
    if (basis === 'refundable') return o.refundable === true;
    if (basis === 'breakfast') return o.breakfast === true;
    if (basis === 'nomember') return o.member_rate !== true;
    return true;
  }
  offers.forEach(function (o) {
    if (!ok(o) || (o.currency && o.currency !== 'USD')) return;
    matched++;
    var m = {seen: o.price_seen_date || null, tax: o.taxes_fees_included == null ? null : !!o.taxes_fees_included,
      conf: confKey(o.confidence), src: o.channel || '', plan: o.rate_plan || '', url: o.url || ''};
    Object.keys(o.price_per_night || {}).forEach(function (d) { var a = num(o.price_per_night[d]); if (a != null) out.push(Object.assign({key: d, amt: a}, m)); });
    var sd = o.stay_dates, t = num(o.total_for_stay);
    if (t != null && sd) { var k = Array.isArray(sd) ? sd[0] + '/' + sd[1] : (sd.checkin ? sd.checkin + '/' + sd.checkout : String(sd)); if (/\//.test(k)) out.push(Object.assign({key: k, amt: t}, m)); }
  });
  if (basis === 'cheapest' || !offers.length) {
    if (basis !== 'cheapest') known = false;
    /* 人数つきの料金が合ったら、人数の分からない「日付ごとの最安」は足さない（2人の料金で4人を数えないため） */
    if (!(matched > 0 && occ != null && offers.some(function (o) { return o.guests != null; }))) out = out.concat(baseEntries(r));
  }
  return {list: out, known: known, nomatch: basis !== 'cheapest' && offers.length > 0 && !matched};
}
function baseTax(r) { return r.taxes_fees_included != null ? !!r.taxes_fees_included : (r.price_confidence === 'listed_before_fees' ? false : null); }
function baseEntries(r) {
  var m2 = {seen: r.price_seen_date || null, tax: baseTax(r), conf: confKey(r.price_confidence, r.price_note), src: r.price_source || '', plan: '', url: ''};
  var out = [];
  Object.keys(r.prices || {}).forEach(function (k) { var a = num(r.prices[k]); if (a != null) out.push(Object.assign({key: k, amt: a}, m2)); });
  return out;
}
/* 連続した泊 nights の合計。未確認の泊を最少に、その中で最安。未確認の泊は 0 として数えず unk に返す */
function blockPrice(list, nights) {
  var n = nights.length, best = new Array(n + 1).fill(null);
  best[0] = {amt: 0, parts: [], unk: []};
  function better(c, o) { return !o || c.unk.length < o.unk.length || (c.unk.length === o.unk.length && c.amt < o.amt); }
  for (var i = 0; i < n; i++) {
    if (!best[i]) continue;
    var skip = {amt: best[i].amt, parts: best[i].parts, unk: best[i].unk.concat([nights[i]])};
    if (better(skip, best[i + 1])) best[i + 1] = skip;
    list.forEach(function (e) {
      var j = -1;
      if (e.key.indexOf('/') >= 0) { var ab = e.key.split('/'); if (ab[0] === nights[i]) j = i + diffD(ab[0], ab[1]); }
      else if (e.key === nights[i]) j = i + 1;
      if (j <= i || j > n) return;
      var c = {amt: best[i].amt + e.amt, parts: best[i].parts.concat([e]), unk: best[i].unk};
      if (better(c, best[j])) best[j] = c;
    });
  }
  return best[n];
}
function roomUnits(p, r, n) {
  var mo = r.max_occupancy != null ? r.max_occupancy : r.occ_seen;
  var occ = mo == null ? null : Math.max(1, mo), perBed = r.pricing === 'per_bed';
  var units = perBed ? n : (occ ? Math.ceil(n / occ) : 1);
  var limit = r.available_units != null ? r.available_units : (singleUnit(p) ? 1 : Infinity);
  return {occ: occ, perBed: perBed, units: units, limit: limit, fits: occ == null ? null : units <= limit, per: perBed ? 1 : (occ ? Math.min(n, occ) : null)};
}
function roomQuote(p, r, ri, nights, n, basis) {
  var u = roomUnits(p, r, n);
  var e = entries(r, basis, u.per), b = blockPrice(e.list, nights);
  return {room: r, ri: ri, units: u.units, perBed: u.perBed, occ: u.occ, fits: u.fits, limit: u.limit,
    total: b.unk.length ? null : b.amt * u.units, partial: b.amt * u.units, unk: b.unk, parts: b.parts, known: e.known, nomatch: e.nomatch};
}
function lodgingQuote(p, nights, n, basis, ri) {
  var rooms = p.rooms || [];
  if (!rooms.length) return {p: p, room: null, total: null, partial: 0, unk: nights.slice(), fits: null, parts: [], known: true, units: 0};
  var qs = rooms.map(function (r, i) { return roomQuote(p, r, i, nights, n, basis); });
  var q;
  if (ri != null && qs[ri]) q = qs[ri];
  else {
    var fp = qs.filter(function (x) { return x.fits && x.total != null; });
    var fpart = qs.filter(function (x) { return x.fits && x.parts.length; });
    if (fp.length) q = fp.sort(function (a, b) { return a.total - b.total; })[0];
    else if (fpart.length) q = fpart.sort(function (a, b) { return a.unk.length - b.unk.length || a.partial - b.partial; })[0];
    else { var f = qs.filter(function (x) { return x.fits; }); q = (f.length ? f : qs).slice().sort(function (a, b) { return (b.occ || 0) - (a.occ || 0); })[0]; }
  }
  q.p = p; return q;
}
function partsMeta(parts) {
  var seen = new Set(), tax = new Set(), conf = new Set(), src = new Set();
  parts.forEach(function (e) { if (e.seen) seen.add(e.seen); tax.add(e.tax); conf.add(e.conf); if (e.src) src.add(e.src + (e.plan ? '・' + e.plan : '')); });
  var order = ['unv', 'from', 'est', 'date'], worst = 'unv';
  for (var k of order) if (conf.has(k)) { worst = k; break; }
  return {seen: Array.from(seen).sort(), tax: tax, conf: parts.length ? worst : 'unv', src: Array.from(src)};
}
function seenTxt(m) { return m.seen.length ? m.seen.map(md).join('・') + '時点' : '確認日不明'; }
function staleLbl(seen) { return seen.some(stale) ? '<span class="lbl c-old">要再確認</span>' : ''; }
function priceFoot(m) { return '<small class="pf">' + esc(seenTxt(m)) + '・' + esc(taxOf(m.tax) || '税込か未確認') + (m.src.length ? '・' + esc(m.src.join('／')) : '') + '</small>' + staleLbl(m.seen); }

/* ---------- 状態 ---------- */
var st = {};
function normNo(x) { return String(x || '').replace(/\s+/g, '').toUpperCase(); }
function findFl(dir, no, date) {
  var n = normNo(no); if (!n) return null;
  var c = FL.filter(function (f) { return f.direction === dir && (f.flight_numbers || []).map(normNo).join('+') === n; });
  return c.find(function (f) { return !date || f.date === date; }) || null;
}
/* 既定の便。古いURL・保存プランの便ID（例：AS460）は便名で読み替え、11/22に無い便（AS306など）は既定の便にする */
function defFlight(dir, pref) {
  if (FBY[pref] && FBY[pref].direction === dir) return pref;
  var D = (TRIP.default_flights || {})[dir] || {}, date = D.date || (dir === 'outbound' ? TRIP.dates.default_in : TRIP.dates.default_out);
  var f = findFl(dir, pref, date) || findFl(dir, D.no, date) || FL.find(function (x) { return x.direction === dir && !x.alternative; }) || FL.find(function (x) { return x.direction === dir; });
  return f ? f.id : '';
}
function flVisible(f) { return !f.alternative || st.alt || f.id === st.f || f.id === st.r; }
function defaults() {
  return {n: 1, ci: TRIP.dates.default_in, co: TRIP.dates.default_out, f: defFlight('outbound', ''), r: defFlight('return', ''), auto: 1, alt: 0, fb: '',
    ti: 'sl1', to: 'logan_express', fo: '', b: 'cheapest', c: {mode: 'same', id: BY.hi_boston ? 'hi_boston' : (DB[0] || {}).id || '', room: null},
    bud: '', oth: '', pv: 'pp', sd: 0, sk: '', sw: 20};
}
function dayStr(d) { return String(+d.slice(8, 10)); }
function fromDay(x) { var v = ('0' + x).slice(-2); return '2026-11-' + v; }
function encC(c) {
  function one(a) { return a ? encodeURIComponent(a.id) + (a.room != null ? '@' + a.room : '') : ''; }
  if (c.mode === 'same') return one(c.id ? c : null);
  return Object.keys(c.nights).sort().map(function (d) { return dayStr(d) + '.' + one(c.nights[d]); }).join('+');
}
function decOne(s) { if (!s) return null; var m = s.split('@'); var id = decodeURIComponent(m[0]); return BY[id] ? {id: id, room: m[1] != null && m[1] !== '' ? +m[1] : null} : null; }
function decC(s) {
  if (s.indexOf('.') < 0) { var o = decOne(s); return o ? {mode: 'same', id: o.id, room: o.room} : null; }
  var c = {mode: 'per', nights: {}};
  s.split('+').forEach(function (x) { var k = x.split('.'); c.nights[fromDay(k[0])] = decOne(k[1]); });
  return c;
}
function parseQ(qs) {
  var s = defaults(), q = new URLSearchParams(qs || '');
  function g(k) { return q.get(k); }
  if (g('n')) s.n = Math.min(MAXN, Math.max(1, +g('n') || 1));
  if (g('in')) s.ci = fromDay(g('in'));
  if (g('out')) s.co = fromDay(g('out'));
  if (s.ci < TRIP.dates.min || s.ci >= TRIP.dates.max) s.ci = TRIP.dates.default_in;
  if (s.co <= s.ci || s.co > TRIP.dates.max) s.co = addD(s.ci, 1);
  ['f', 'r', 'ti', 'to', 'fo', 'b', 'fb', 'bud', 'oth', 'pv', 'sk'].forEach(function (k) { if (g(k) != null) s[k] = g(k); });
  if (!FBY[s.f] || FBY[s.f].direction !== 'outbound') s.f = defFlight('outbound', s.f);
  if (!FBY[s.r] || FBY[s.r].direction !== 'return') s.r = defFlight('return', s.r);
  if (!FB[s.fb]) s.fb = '';
  if (!BASIS[s.b]) s.b = 'cheapest';
  if (s.pv !== 'grp') s.pv = 'pp';
  if (!TRIP.transfer_in.some(function (t) { return t.id === s.ti; })) s.ti = 'sl1';
  if (!TRIP.transfer_out.some(function (t) { return t.id === s.to; })) s.to = 'logan_express';
  ['auto', 'sd', 'alt'].forEach(function (k) { if (g(k) != null) s[k] = +g(k) ? 1 : 0; });
  if (g('sw') && [10, 20, 40].indexOf(+g('sw')) >= 0) s.sw = +g('sw');
  if (g('c') != null) { var c = (g('c') || '').split(',').map(decC).filter(Boolean)[0]; s.c = c || {mode: 'same', id: '', room: null}; }
  return s;
}
function toQ(s) {
  var q = [];
  function add(k, v) { q.push(k + '=' + v); }
  add('n', s.n); add('in', dayStr(s.ci)); add('out', dayStr(s.co));
  ['f', 'r', 'ti', 'to', 'b'].forEach(function (k) { add(k, encodeURIComponent(s[k])); });
  if (!s.auto) add('auto', 0);
  ['fo', 'fb', 'bud', 'oth', 'sk'].forEach(function (k) { if (s[k] !== '' && s[k] != null) add(k, encodeURIComponent(s[k])); });
  if (s.pv === 'grp') add('pv', 'grp');
  if (s.sd) add('sd', 1);
  if (s.alt) add('alt', 1);
  if (s.sw !== 20) add('sw', s.sw);
  add('c', encC(s.c));
  return q.join('&');
}
function loadPlan() {
  var h = location.hash || '';
  if (PAGE === 'planner' && h.indexOf('#/?') === 0) return parseQ(h.slice(3));
  var saved = lsGet(LS.plan, null);
  if (saved && saved.v === SCHEMA && typeof saved.q === 'string') return parseQ(saved.q);
  return defaults();
}
function persist() {
  withState(st, function () { itinerary(); });
  var q = toQ(st);
  lsSet(LS.plan, {v: SCHEMA, q: q, at: new Date().toISOString()});
  if (PAGE === 'planner') history.replaceState(null, '', '#/?' + q);
}
function withState(s, fn) { var keep = st; st = s; try { return fn(); } finally { st = keep; } }

/* ---------- 便 ---------- */
var TOD = {'': 'すべて', morning: '朝（〜9時発）', day: '昼（9〜15時発）', evening: '夕方（15〜20時発）', night: '夜（20時〜）', redeye: '夜行'};
var FB = {'': '指定なし', basic: 'Basic', main: 'Main', bags: '預け荷物込み'};
function pad(t) { var p = String(t).split(':'); return ('0' + p[0]).slice(-2) + ':' + p[1]; }
function arrDate(f) { var d = f.date; if (f.overnight || (f.arrive_time && f.depart_time && pad(f.arrive_time) < pad(f.depart_time))) d = addD(d, 1); return d; }
function flArr(f) { var d = arrDate(f); return {date: d, known: !!f.arrive_time, min: f.arrive_time ? tmin(d + 'T' + pad(f.arrive_time)) : tmin(d) + (f.overnight ? 9 * 60 : 12 * 60)}; }
function flDep(f) { return {known: !!f.depart_time, min: f.depart_time ? tmin(f.date + 'T' + pad(f.depart_time)) : tmin(f.date) + 12 * 60}; }
function todOf(f) { if (f.overnight) return 'redeye'; if (!f.depart_time) return ''; var h = +f.depart_time.split(':')[0]; return h < 9 ? 'morning' : h < 15 ? 'day' : h < 20 ? 'evening' : 'night'; }
function fareMatch(fa, fb) {
  var b = String(fa.fare_brand || '');
  if (fb === 'basic') return /basic|ベーシック|saver|light/i.test(b);
  if (fb === 'main') return /main|メイン|standard|classic/i.test(b) && !/basic/i.test(b);
  if (fb === 'bags') return fa.bags_included === true || (typeof fa.bags_included === 'number' && fa.bags_included > 0);
  return true;
}
function rtQuote(o, r, fb) { var c = RTQ.filter(function (q) { return q.outbound_id === o && q.return_id === r && fareMatch(q, fb); }); c.sort(function (a, b) { return num(a.price) - num(b.price); }); return c[0] || null; }
/* 合計に使う運賃：USD・価格あり。往復検索の最安（復路未固定）・旧い確認値・OTA は表に出すだけ */
function usable(fa) { return num(fa.price) != null && (!fa.currency || fa.currency === 'USD') && fa.one_way_or_rt !== 'rt_total' && !fa.old && !fa.ota; }
function bestFare(f, fb) { var c = ((f && f.fares) || []).filter(function (fa) { return usable(fa) && fareMatch(fa, fb); }); c.sort(function (a, b) { return num(a.price) - num(b.price); }); return c[0] || null; }
function flNo(f) { return (f.flight_numbers || []).join('・') || f.label || '便未定'; }
function flName(f) { return flNo(f) + (f.airline ? '（' + f.airline + '）' : ''); }
function flShort(f) { return flNo(f) + ' ' + wd(f.date) + (f.depart_time || '?') + '→' + (arrDate(f) !== f.date ? wd(arrDate(f)) : '') + (f.arrive_time || '?'); }
function flTime(f) { var a = arrDate(f); return md(f.date) + ' ' + (f.depart_time || '?') + '→' + (a !== f.date ? md(a) + ' ' : '') + (f.arrive_time || '?'); }
function stopsTxt(f) { return f.stops === 0 ? '直行' : f.stops > 0 ? '乗継' + f.stops + '回' : '直行か不明'; }
function fareFoot(parts) {
  if (!parts.length) return '';
  var seen = Array.from(new Set(parts.map(function (x) { return x.price_seen_date; }).filter(Boolean))).sort();
  var tax = new Set(parts.map(function (x) { return x.taxes_included == null ? null : !!x.taxes_included; }));
  var src = parts.map(function (x) { return (x.channel || '') + (x.fare_brand ? '・' + x.fare_brand : ''); });
  return '<small class="pf">' + esc((seen.length ? seen.map(md).join('・') + '時点' : '確認日不明') + '・' + (taxOf(tax) || '税込か未確認') + '・' + src.join('／')) + '</small>' + staleLbl(seen);
}
function flightCost() {
  var o = FBY[st.f], r = FBY[st.r], fo = bestFare(o, st.fb), fr = bestFare(r, st.fb);
  if (st.fo !== '' && +st.fo > 0) return {v: +st.fo, custom: true, parts: [], note: '手入力', tax: null};
  function tx(ps) { return taxOf(new Set(ps.map(function (x) { return x.taxes_included == null ? null : !!x.taxes_included; }))); }
  if (fo && fo.one_way_or_rt === 'rt') return {v: num(fo.price), parts: [fo], note: '往復運賃', conf: confKey(fo.confidence), tax: tx([fo])};
  if (!fo && fr && fr.one_way_or_rt === 'rt') return {v: num(fr.price), parts: [fr], note: '往復運賃', conf: confKey(fr.confidence), tax: tx([fr])};
  /* 往復見積もり：選んだ往路＋復路の組み合わせに往復運賃があり、片道2本より安いか同じならそれを使う */
  var q = rtQuote(st.f, st.r, st.fb), ow = fo && fr ? num(fo.price) + num(fr.price) : null;
  if (q && (ow == null || num(q.price) <= ow)) return {v: num(q.price), parts: [q], note: '往復運賃（' + (q.channel || '') + '）' + (ow != null ? '・片道2本なら' + money(ow) : ''), conf: confKey(q.confidence), tax: tx([q]), rt: q, ow: ow};
  if (fo && fr) return {v: num(fo.price) + num(fr.price), parts: [fo, fr], note: '片道＋片道' + (q ? '・往復（' + q.channel + '）なら' + money(num(q.price)) : ''), conf: [confKey(fo.confidence), confKey(fr.confidence)].sort(function (a, b) { return ['unv', 'from', 'est', 'date'].indexOf(a) - ['unv', 'from', 'est', 'date'].indexOf(b); })[0],
    unclear: fo.one_way_or_rt == null || fr.one_way_or_rt == null, tax: tx([fo, fr])};
  return {v: null, parts: [fo, fr].filter(Boolean), note: (!fo ? '往路' : '復路') + 'の運賃が未確認' + (st.fb ? '（' + FB[st.fb] + '）' : ''), tax: null};
}

/* ---------- 旅程と日程判定 ---------- */
function transferRuns(t, dateMin, atMin) {
  if (!t || !t.until) return true;
  var day = Math.floor(atMin / 1440) * 1440, fr0 = day + tmin(T0 + 'T' + (t.from || '00:00')), u = day + tmin(T0 + 'T' + t.until);
  if (u < fr0) u += 1440;
  var a = atMin; if (a < fr0 && a + 1440 <= u) a += 1440;
  return a >= fr0 && a + 30 <= u;
}
function itinerary() {
  var f = FBY[st.f], r = FBY[st.r], buf = TRIP.airport_buffer_min || 160, iss = [];
  var A = flArr(f), D = flDep(r), a = A.min, dep = D.min;
  var arrT = A.known ? a - tmin(A.date) : null;
  var firstNight = arrT != null && arrT < 300 ? addD(A.date, -1) : A.date;
  var lastNight = addD(r.date, -1);
  var late = arrT != null && (arrT >= 22 * 60 || arrT < 300), morning = arrT == null ? !!f.overnight : arrT < 12 * 60 && arrT >= 300;
  var need = firstNight <= lastNight ? nightsOf(firstNight, addD(lastNight, 1)) : [];
  if (st.auto && need.length) {
    st.ci = need[0] < TRIP.dates.min ? TRIP.dates.min : need[0];
    st.co = addD(need[need.length - 1], 1) > TRIP.dates.max ? TRIP.dates.max : addD(need[need.length - 1], 1);
    if (st.co <= st.ci) st.co = addD(st.ci, 1);
  }
  var hours = 0;
  var days = TRIP.events.map(function (e) {
    var o = tmin(e.date + 'T' + e.open), c = tmin(e.date + 'T' + e.close), en = tmin(e.date + 'T' + e.entry_until);
    var s = Math.max(o, a + 60), t = Math.min(c, dep - buf);
    var stt = (s > en || t - s < 30) ? 'no' : (s <= o && t >= c ? 'full' : 'part');
    if (stt !== 'no') hours += (t - s) / 60;
    return {e: e, st: stt, from: s, to: t};
  });
  var have = nightsOf(st.ci, st.co);
  function add(lv, key, icon, text, tgt) { iss.push({lv: lv, key: key, icon: icon, text: text, tgt: tgt || ''}); }
  if (dep <= a) add('no', 'order', 'triangle-alert', '復路の出発が往路の到着より前', 'in-r');
  var miss = need.filter(function (d) { return have.indexOf(d) < 0; }), extra = have.filter(function (d) { return need.indexOf(d) < 0; });
  if (miss.length) add('no', 'miss', 'triangle-alert', miss.map(md).join('・') + 'の夜の宿が日程にない', 'in-dates');
  if (!days.some(function (x) { return x.st !== 'no'; })) add('no', 'nodays', 'triangle-alert', '会場の受付時間に間に合う日がない', 'in-f');
  if (extra.length) add('chk', 'extra', 'info', extra.map(md).join('・') + '泊は便の日程だと使わない', 'in-dates');
  if (late) add('chk', 'late', 'moon', '深夜着（' + hm(a) + '）。宿の受付時間を確認', 'in-c');
  if (morning) add('chk', 'morning', 'luggage', '朝着。チェックインまで荷物を預ける場所が要る', 'in-c');
  if (f.overnight) add('chk', 'redeye', 'moon', '夜行便。機内泊で寝不足になりやすい', 'in-f');
  if (f.arrive_airport && f.arrive_airport !== 'BOS') add('chk', 'altair', 'plane-landing', f.arrive_airport + '着。ボストンまでの移動の時間・費用は未計算', 'in-f');
  if (r.depart_airport && r.depart_airport !== 'BOS') add('chk', 'altdep', 'plane-takeoff', r.depart_airport + '発。空港までの移動の時間・費用は未計算', 'in-r');
  if (!A.known) add('chk', 'arrunk', 'clock', '到着時刻が未確認（' + (f.overnight ? '朝' : '昼') + '着として計算）', 'in-f');
  if (!D.known) add('chk', 'depunk', 'clock', '復路の出発時刻が未確認', 'in-r');
  var lastDay = days[days.length - 1];
  if (lastDay && lastDay.st === 'part' && lastDay.to < tmin(lastDay.e.date + 'T' + lastDay.e.close)) add('chk', 'leave', 'clock', md(lastDay.e.date) + 'は' + hm(lastDay.to) + 'に会場を出る', 'in-r');
  var ti = TRIP.transfer_in.find(function (x) { return x.id === st.ti; }), to = TRIP.transfer_out.find(function (x) { return x.id === st.to; });
  if (ti && ti.until && arrT != null && !transferRuns(ti, null, a)) add('fix', 'tin', 'bus', ti.label + 'は到着時刻に動いていない（' + ti.from + '〜' + ti.until + '）', 'in-ti');
  if (to && to.until && D.known && dep - buf - 30 > tmin(r.date + 'T' + to.until)) add('fix', 'tout', 'bus', to.label + 'は' + to.until + 'まで', 'in-to');
  var notes = [];
  if (f.arrival_note && !(late && /^深夜着$/.test(f.arrival_note))) notes.push(['plane-landing', f.arrival_note]);
  if (r.arrival_note) notes.push(['plane-takeoff', r.arrival_note]);
  [[f, 'plane-landing'], [r, 'plane-takeoff']].forEach(function (x) { (Array.isArray(x[0].notes) ? x[0].notes : []).forEach(function (n) { notes.push([x[1], n]); }); });
  var car = (ti && ti.per === 'car') || (to && to.per === 'car');
  if (st.n > 4 && car) notes.push(['car', '5人以上は車2台で計算']);
  if (st.n === 4 && car) notes.push(['car', '4人で荷物が多いと大型車になることがある（料金未調査）']);
  var fc = flightCost();
  if (fc.unclear) notes.push(['plane', '運賃が片道か往復か分からないものを足している']);
  return {f: f, r: r, arr: a, dep: dep, days: days, iss: iss, notes: notes, need: need, late: late, fc: fc, hours: hours};
}
function sigOf(s) { return [s.f, s.r, s.ci, s.co, s.ti, s.to, encC(s.c)].join('|'); }
function verdict(it) {
  var ack = lsGet(LS.ack, {}), sig = sigOf(st), items = it.iss.map(function (x) { return Object.assign({acked: x.lv === 'chk' && !!ack[x.key + '|' + sig]}, x); });
  var lv = items.some(function (x) { return x.lv === 'no'; }) ? 'no' : items.some(function (x) { return x.lv === 'fix' || (x.lv === 'chk' && !x.acked); }) ? 'chk' : 'ok';
  return {lv: lv, items: items, sig: sig, open: items.filter(function (x) { return !(x.lv === 'chk' && x.acked); }).length};
}
function transferPP(list, id, n) {
  var t = list.find(function (x) { return x.id === id; });
  if (!t || !t.cost) return {t: t, lo: null, hi: null};
  var k = t.per === 'car' ? Math.ceil(n / (t.car_capacity || 4)) / n : 1;
  return {t: t, lo: t.cost[0] * k, hi: t.cost[1] * k};
}

/* ---------- プランの計算 ---------- */
function assign(c, nights) {
  return nights.map(function (d) {
    var a = c.mode === 'same' ? (c.id ? {id: c.id, room: c.room} : null) : (c.nights[d] || null);
    return a && BY[a.id] ? a : null;
  });
}
function calcPlan(it) {
  var nights = nightsOf(st.ci, st.co), as = assign(st.c, nights), blocks = [], n = st.n;
  as.forEach(function (a, i) {
    var last = blocks[blocks.length - 1], key = a ? a.id + '@' + (a.room == null ? '' : a.room) : '';
    if (last && last.key === key) last.nights.push(nights[i]);
    else blocks.push({key: key, a: a, nights: [nights[i]]});
  });
  var total = 0, unknown = [], alerts = [], notes = [], ids = new Set(), feeOpen = false, kms = [], taxAdd = 0, taxRates = new Set(), taxAssumed = false;
  blocks.forEach(function (b) {
    if (!b.a) { unknown = unknown.concat(b.nights); alerts.push({k: 'price', icon: 'circle-help', text: b.nights.map(md).join('・') + '泊の宿が未選択'}); b.q = null; return; }
    var p = BY[b.a.id]; ids.add(p.id); kms.push(km(p));
    b.q = lodgingQuote(p, b.nights, n, st.b, b.a.room);
    b.m = partsMeta(b.q.parts);
    /* 追加料金（宿の案内で金額が分かるもの）は合計に入れる */
    var base0 = b.q.total != null ? b.q.total : (b.q.partial || 0), xf = p.extra_fee, fee = 0;
    if (xf && base0) fee = xf.per_room_night ? xf.per_room_night * b.nights.length * (b.q.units || 1) : xf.pct ? base0 * xf.pct / 100 : 0;
    b.fee = fee;
    /* 税抜きの料金だけに宿泊税を足して「税込み目安」を出す（概算） */
    var pre = b.q.parts.filter(function (e) { return e.tax === false; }).reduce(function (a, e) { return a + e.amt; }, 0) * (b.q.units || 1);
    var tx = p.tax || {rate: 14.95, assumed: true};
    b.taxAdd = pre > 0 ? (pre + (xf && xf.per_room_night ? fee : 0)) * tx.rate / 100 : 0;
    if (b.taxAdd) { taxAdd += b.taxAdd; taxRates.add(tx.rate); if (tx.assumed) taxAssumed = true; }
    if (b.q.total == null) { unknown = unknown.concat(b.q.unk || b.nights); total += (b.q.partial || 0) + fee; } else total += b.q.total + fee;
  });
  var fit = blocks.some(function (b) { return b.q && b.q.fits === false; }) ? false : blocks.every(function (b) { return b.q && b.q.fits === true; }) ? true : null;
  blocks.forEach(function (b) {
    if (!b.q) return;
    var p = b.q.p, q = b.q, nm = p.name;
    if (q.fits === false) alerts.push({k: 'cap', icon: 'users', text: nm + '：' + n + '人は入らない（' + (q.occ || '?') + '人まで' + (isFinite(q.limit) ? '・' + q.limit + '室' : '') + '）'});
    if (q.fits === null) alerts.push({k: 'cap', icon: 'users', text: nm + '：定員の情報がない'});
    if (q.total == null) alerts.push({k: 'price', icon: 'circle-help', text: nm + '：' + (q.unk || b.nights).map(md).join('・') + '泊の料金が未確認' + (q.nomatch ? '（条件に合う料金なし）' : '')});
    if (b.fee) notes.push(['wallet', nm + '：' + p.extra_fee.label + ' ' + money(Math.round(b.fee)) + 'を合計に含めた']);
    if (b.taxAdd) notes.push(['receipt', nm + '：税抜きの料金。宿泊税' + (p.tax || {rate: 14.95}).rate + '%（' + ((p.tax || {}).basis || '地域不明のため仮定') + '）で税込み目安 +' + money(Math.round(b.taxAdd))]);
    if (q.total != null && b.m.tax.has(null)) notes.push(['wallet', nm + '：税込かどうか未確認（税込み目安に税を足していない）']);
    if (p.min_stay && q.room && !minOK(q.room, b.nights)) alerts.push({k: 'cap', icon: 'calendar-x', text: nm + '：最低泊数に注意（' + (q.room.min_nights ? q.room.min_nights + '泊以上' : '最低泊数が不明') + '・この部屋は' + b.nights.length + '泊）'});
    var av = availOf(p, b.nights);
    if (av) alerts.push({k: 'avail', icon: av.status === 'none' ? 'circle-x' : 'triangle-alert', text: nm + '：' + availLbl(av) + '。今の空室ではない'});
    if (!q.known) notes.push(['receipt', nm + '：「' + BASIS[st.b] + '」の料金はないので通常の料金で計算']);
    if (q.total != null && b.m.conf === 'est') notes.push(['info', nm + '：概算の料金を含む']);
    if (q.total != null && b.m.conf === 'from') notes.push(['info', nm + '：「〜から」の下限料金']);
    if (p.restrictions) { var cz = p.cautions || [], cr = cz.filter(function (c) { return c.crit; }), use = cr.length ? cr : cz;
      alerts.push({k: 'cap', icon: 'circle-x', text: nm + '：' + (use.length ? use.map(function (c) { return c.ja || c.en; }).join('。') + (use.length < cz.length ? '（ほか' + (cz.length - use.length) + '件は宿の詳細）' : '') : p.restrictions)}); }
    if (excluded(p)) notes.push(['circle-x', nm + '：ガイドでは候補から外した宿']);
  });
  var first = blocks[0] && blocks[0].q;
  if (it.late && first && !feats(first.p).late) notes.push(['moon', first.p.name + '：深夜チェックインできるか未確認']);
  if (ids.size > 1) notes.push(['luggage', '途中で宿を移る（荷物の移動あり）']);
  var fr = it.fc, tin = transferPP(TRIP.transfer_in, st.ti, n), tout = transferPP(TRIP.transfer_out, st.to, n), loc = TRIP.local_transit_pp || 0;
  var oth = +st.oth > 0 ? +st.oth : 0;
  if (fr.v != null && /別/.test(fr.tax || '')) { feeOpen = true; alerts.push({k: 'fee', icon: 'wallet', text: '航空券：税・手数料が別の運賃を含む'}); }
  var unk = [];
  if (unknown.length) unk.push('宿');
  if (fr.v == null) { unk.push('航空券'); alerts.push({k: 'price', icon: 'circle-help', text: '航空券：' + fr.note}); }
  if (tin.lo == null) unk.push('空港→市内');
  if (tout.lo == null) { unk.push('市内→空港'); alerts.push({k: 'price', icon: 'circle-help', text: '市内→空港：' + (tout.t ? tout.t.label + 'の料金は未調査' : '未選択')}); }
  var unkPrice = unk.slice();
  if (feeOpen) unk.push('税・手数料');
  var taxPP = taxAdd / n, lodPP = total / n, lo = lodPP + (fr.v || 0) + (tin.lo || 0) + (tout.lo || 0) + loc + oth, hi = lodPP + (fr.v || 0) + (tin.hi || 0) + (tout.hi || 0) + loc + oth;
  var kk = kms.filter(function (x) { return x != null; });
  return {blocks: blocks, nights: nights, total: total, unknown: unknown, lodPP: lodPP, fare: fr, tin: tin, tout: tout, loc: loc, oth: oth, lo: lo, hi: hi, mid: (lo + hi) / 2,
    taxPP: taxPP, loT: lo + taxPP, hiT: hi + taxPP, midT: (lo + hi) / 2 + taxPP, taxRates: Array.from(taxRates).sort(), taxAssumed: taxAssumed,
    unk: unk, unkPrice: unkPrice, feeOpen: feeOpen, alerts: alerts, notes: notes.concat(it.notes), fit: fit,
    km: kk.length === kms.length && kk.length ? Math.max.apply(null, kk) : null, from: blocks.some(function (b) { return b.m && b.m.conf === 'from'; })};
}
function calc(s) {
  var s2 = clone(s);
  return withState(s2, function () {
    var it = itinerary(), r = calcPlan(it);
    r.it = it; r.v = verdict(it); r.s = s2;
    r.v.items.forEach(function (x) { if (x.lv === 'no' || x.lv === 'fix') r.alerts.unshift({k: 'sched', icon: x.icon, text: x.text, tgt: x.tgt}); });
    return r;
  });
}
function deltaOf(base, other) { return base.unkPrice.length || other.unkPrice.length ? null : other.midT - base.midT; }
/* 合計。宿に税抜きの料金があるときは「税込み目安」を下に併記する（plain=true なら文字だけ） */
function totalTxt(r, grp, plain) {
  var k = grp ? r.s.n : 1;
  if (r.unkPrice.length && !r.lo) return '未確認';
  var t = range(r.lo * k, r.hi * k) + (r.from ? '〜' : '') + (r.unkPrice.length ? '＋未確認' : r.feeOpen ? '＋税・手数料' : '');
  if (!r.taxPP) return t;
  var e2 = range(r.loT * k, r.hiT * k) + (r.unkPrice.length ? '＋未確認' : '');
  return plain ? t + '（宿泊税抜き）・税込み目安 ' + e2 : t + '<small class="taxe">宿泊税抜き・税込み目安 ' + e2 + '</small>';
}
function daysTxt(it) { var d = it.days.filter(function (x) { return x.st !== 'no'; }).map(function (x) { return wd(x.e.date); }); return d.length ? d.join('') : 'なし'; }
function lodName(r) { var ids = []; r.blocks.forEach(function (b) { if (b.q && ids.indexOf(b.q.p.name) < 0) ids.push(b.q.p.name); }); return ids.join('→') || '宿未選択'; }

/* ---------- 提案（最安・時間優先・バランス） ---------- */
/* 便の絞り込み：同じ「最初の泊」（往路）・同じ日（復路）の中で、運賃も時刻も他の便に負けている便は外す（運賃不明の便も外す） */
function inRT(f) { return RTQ.some(function (q) { return q.outbound_id === f.id || q.return_id === f.id; }); }
function frontier(list, dir) {
  var g = {};
  list.forEach(function (f) {
    var b = bestFare(f, st.fb); if (!b) return;
    var t, k;
    if (dir === 'outbound') { var A = flArr(f), at = A.min - tmin(A.date); t = A.min; k = (at < 300 ? addD(A.date, -1) : A.date) + (at >= 22 * 60 || at < 300 ? 'L' : ''); }
    else { t = -flDep(f).min; k = f.date; }
    (g[k] = g[k] || []).push({f: f, p: num(b.price), t: t, s: f.stops || 0});
  });
  var out = [];
  Object.keys(g).forEach(function (k) {
    var a = g[k].sort(function (x, y) { return x.p - y.p || x.s - y.s || x.t - y.t; });
    a.forEach(function (x, i) { if (inRT(x.f) || !a.slice(0, i).some(function (y) { return y.p <= x.p && y.t <= x.t && y.s <= x.s; })) out.push(x.f); });
  });
  return out;
}
var SG_CACHE = {key: '', res: null};
function suggestions() {
  var key = [st.n, st.bud, st.sd, st.sk, st.sw, st.b, st.fb, st.ti, st.to, st.fo, st.oth, st.alt].join('|');
  if (SG_CACHE.key === key) return SG_CACHE.res;
  var outs = frontier(FL.filter(function (f) { return f.direction === 'outbound' && (!st.sd || f.stops === 0) && (!f.alternative || st.alt); }), 'outbound');
  var rets = frontier(FL.filter(function (f) { return f.direction === 'return' && (!st.sd || f.stops === 0) && (!f.alternative || st.alt); }), 'return');
  var lods = DB.filter(function (p) { if (excluded(p)) return false; if (st.sk) { var k = km(p); if (k == null || k > +st.sk) return false; } return true; });
  /* 宿の絞り込み：同じ泊の組み合わせごとに、人数が入り料金が分かる宿を税込み目安の安い順に12件と、近い順に6件だけ計算する。
     空きなし（確認日時点）の宿はその泊にかかるなら外す */
  var shortCache = {};
  function shortlist(nights) {
    var key = nights.join(',');
    if (shortCache[key]) return shortCache[key];
    var cand = [];
    lods.forEach(function (p) {
      var av = availOf(p, nights); if (av && av.status === 'none') { why.avail++; return; }
      var q = null;
      if (p.min_stay) {
        (p.rooms || []).forEach(function (r, i) { if (!minOK(r, nights)) return; var x = roomQuote(p, r, i, nights, st.n, st.b); if (x.fits === true && x.total != null && (!q || x.total < q.total)) q = x; });
        if (!q) { why.minstay++; return; }
        q.p = p;
      } else q = lodgingQuote(p, nights, st.n, st.b, null);
      if (q.fits !== true || q.total == null) { cand.push({p: p, v: null}); return; }
      var pre = q.parts.filter(function (e) { return e.tax === false; }).reduce(function (a, e) { return a + e.amt; }, 0) * (q.units || 1);
      var xf = p.extra_fee, fee = xf ? (xf.per_room_night ? xf.per_room_night * nights.length * (q.units || 1) : q.total * xf.pct / 100) : 0;
      cand.push({p: p, ri: p.min_stay ? q.ri : null, v: q.total + fee + pre * ((p.tax || {}).rate || 14.95) / 100, k: km(p)});
    });
    var priced = cand.filter(function (c) { return c.v != null; });
    var keep = new Set();
    priced.slice().sort(function (a, b) { return a.v - b.v; }).slice(0, 12).forEach(function (c) { keep.add(c); });
    priced.filter(function (c) { return c.k != null; }).sort(function (a, b) { return a.k - b.k || a.v - b.v; }).slice(0, 6).forEach(function (c) { keep.add(c); });
    why.pruned += cand.length - keep.size;
    return (shortCache[key] = Array.from(keep));
  }
  var tinOrder = TRIP.transfer_in.filter(function (t) { return t.cost; }).sort(function (a, b) { return a.cost[0] - b.cost[0]; }).map(function (t) { return t.id; });
  var toutOrder = TRIP.transfer_out.filter(function (t) { return t.cost; }).sort(function (a, b) { return a.cost[0] - b.cost[0]; }).map(function (t) { return t.id; });
  var why = {price: 0, cap: 0, time: 0, budget: 0, avail: 0, minstay: 0, pruned: 0}, ok = [], okAlt = [];
  outs.forEach(function (o) { rets.forEach(function (rt) {
    var base = clone(st); base.f = o.id; base.r = rt.id; base.auto = 1;
    var r0 = calc(Object.assign(clone(base), {c: {mode: 'same', id: '', room: null}}));
    if (r0.v.lv === 'no' && r0.v.items.some(function (x) { return x.key === 'order' || x.key === 'nodays'; })) { why.time += lods.length; return; }
    var tiFix = r0.it.iss.some(function (x) { return x.key === 'tin'; }), toFix = r0.it.iss.some(function (x) { return x.key === 'tout'; });
    if (tiFix) base.ti = tinOrder.find(function (id) { var s2 = Object.assign(clone(base), {ti: id}); return !calc(s2).it.iss.some(function (x) { return x.key === 'tin'; }); }) || base.ti;
    if (toFix) base.to = toutOrder.find(function (id) { var s2 = Object.assign(clone(base), {to: id}); return !calc(s2).it.iss.some(function (x) { return x.key === 'tout'; }); }) || base.to;
    shortlist(r0.nights).forEach(function (c) {
      var p = c.p, s = clone(base); s.c = {mode: 'same', id: p.id, room: c.ri};
      var r = calc(s);
      if (r.fit !== true) { why.cap++; return; }
      if (r.v.lv === 'no') { why.time++; return; }
      if (r.unkPrice.length) { why.price++; return; }
      if (st.bud && r.hiT > +st.bud) { why.budget++; return; }
      (p.alt_only ? okAlt : ok).push(r);
    });
  }); });
  var res = {list: [], why: why, n: ok.length, alt: okAlt.length ? okAlt.slice().sort(function (a, b) { return a.midT - b.midT; })[0] : null};
  if (ok.length) {
    var maxH = Math.max.apply(null, ok.map(function (r) { return r.it.hours; }));
    function kmv(r) { return r.km == null ? 10 : r.km; }
    function k(r) { return toQ(r.s); }
    var used = {};
    function pick(arr) { var x = arr.find(function (r) { return !used[k(r)]; }) || arr[0]; used[k(x)] = 1; return x; }
    var cheap = pick(ok.slice().sort(function (a, b) { return a.midT - b.midT; }));
    var time = pick(ok.slice().sort(function (a, b) { return b.it.hours - a.it.hours || a.midT - b.midT; }));
    var bal = pick(ok.slice().sort(function (a, b) { return (a.midT + (maxH - a.it.hours) * st.sw + kmv(a) * 5) - (b.midT + (maxH - b.it.hours) * st.sw + kmv(b) * 5); }));
    res.list = [['cheap', '最安', '費用が最も小さい', cheap], ['time', '時間優先', '会場にいられる時間が最も長い', time], ['bal', 'バランス', '費用と時間・距離を換算して比べる', bal]];
  }
  SG_CACHE = {key: key, res: res};
  return res;
}

/* ---------- 共通の描画部品 ---------- */
function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
function navCount() { var hid = lsGet(LS.shide, []), n = lsGet(LS.saved, []).filter(function (x) { return hid.indexOf(x.q) < 0; }).length + lsGet(LS.ipsel, []).length;
  $$('[data-cnt]').forEach(function (e) { e.textContent = n ? String(n) : ''; var a = e.closest('a'); if (a) { a.setAttribute('title', n ? '比較中' + n + '件' : ''); var sr = a.querySelector('.sr-cnt'); if (!sr) { sr = document.createElement('span'); sr.className = 'sr sr-cnt'; a.appendChild(sr); } sr.textContent = n ? '（比較中' + n + '件）' : ''; } }); }
function capTxt(q, n) {
  if (!q || !q.room) return '<span class="st-fit unv">人数：未確認</span>';
  var u = q.perBed ? 'ベッド' + q.units + '床' : q.units + '室';
  return '<span class="st-fit ' + (q.fits === true ? 'ok' : q.fits === false ? 'ng' : 'unv') + '">' + n + '人：' + (q.fits === true ? '適合' : q.fits === false ? '入らない' : '定員未確認') + '（' + u + '）</span>';
}
function availTxt(q, nights) {
  var a = q && q.p && availOf(q.p, nights);
  if (a) return '<span class="st-av av-' + a.status + '">' + esc(availLbl(a)) + '・今の空室ではない</span>';
  var obs = q && q.room && (q.room.offers || []).map(function (o) { return o.availability === 'observed' || o.availability === 'unavailable' ? o : null; }).filter(Boolean)[0];
  if (obs) return '<span class="st-av">' + (obs.availability === 'observed' ? md(obs.price_seen_date || '') + 'に掲載あり' : md(obs.price_seen_date || '') + 'に満室表示') + '・空室は予約サイトで確認</span>';
  return '<span class="st-av">空室：予約サイトで確認</span>';
}
function alertList(alerts) {
  if (!alerts.length) return '';
  var K = {price: '料金未確認', cap: '人数', sched: '日程', fee: '追加料金', avail: '空室メモ'};
  return '<ul class="alerts">' + alerts.map(function (a) { return '<li class="a-' + a.k + '"' + (a.tgt ? ' data-act="goto" data-tgt="' + a.tgt + '"' : '') + '>' + ic(a.icon) + '<b>' + K[a.k] + '</b><span>' + esc(a.text) + '</span></li>'; }).join('') + '</ul>';
}

/* ---------- プラン作成 ---------- */
var UI = {saveMsg: '', sheet: false, stepOpen: {}};
function lodgingOptions(sel, mk) {
  var groups = {};
  DB.forEach(function (p) { var t = typeOf(p)[0]; (groups[t] = groups[t] || []).push(p); });
  return '<option value="">（選ばない）</option>' + Object.keys(groups).map(function (g) {
    return '<optgroup label="' + esc(g) + '">' + groups[g].map(function (p) { return opt(p.id, p.name + (excluded(p) ? '（候補外）' : '') + (p.id !== sel && mk ? '　' + mk(p.id) : ''), sel); }).join('') + '</optgroup>';
  }).join('');
}
/* ---------- 4つのステップ（ウィザードではなく1ページで開閉） ---------- */
var STATE_LBL = {none: '未設定', ok: '入力済み', chk: '要確認', ng: '不適合'};
function stepStates(r) {
  var it = r.v.items, k1 = it.filter(function (x) { return !(x.lv === 'chk' && x.acked); });
  function bad(tg) { return k1.some(function (x) { return (x.lv === 'no' || x.lv === 'fix') && tg.indexOf(x.tgt) >= 0; }); }
  function chk(tg) { return k1.some(function (x) { return x.lv === 'chk' && tg.indexOf(x.tgt) >= 0; }); }
  var lod = r.unknown.length ? (r.total ? money(r.total / st.n) + '＋未確認' : '未確認') : money(r.total / st.n) + (r.from ? '〜' : '');
  var noStay = r.blocks.some(function (b) { return !b.q; });
  var tr = r.tin.lo != null && r.tout.lo != null ? range(r.tin.lo + r.tout.lo + r.loc, r.tin.hi + r.tout.hi + r.loc) : '一部未確認';
  return {
    1: {st: bad(['in-dates']) ? 'ng' : chk(['in-dates']) ? 'chk' : 'ok', sub: st.n + '人 · ' + md(st.ci) + '–' + (st.co.slice(5, 7) === st.ci.slice(5, 7) ? String(+st.co.slice(8)) : md(st.co)) + ' · ' + r.nights.length + '泊' + (st.bud ? ' · 予算' + money(+st.bud) : '')},
    2: {st: bad(['in-f', 'in-r']) ? 'ng' : r.fare.v == null || chk(['in-f', 'in-r']) ? 'chk' : 'ok', sub: r.fare.v != null ? money(r.fare.v) + '/人' : '運賃未確認'},
    3: {st: noStay ? 'none' : r.fit === false ? 'ng' : r.unknown.length || chk(['in-c']) ? 'chk' : 'ok', sub: noStay ? '宿が未選択' : lod + '/人' + (r.taxPP ? '＋税目安' + money(Math.round(r.taxPP)) : '')},
    4: {st: bad(['in-ti', 'in-to']) ? 'ng' : r.tin.lo == null || r.tout.lo == null ? 'chk' : 'ok', sub: tr + '/人'}
  };
}
function stepCard(n, title, S, body) {
  var mob = window.matchMedia && window.matchMedia('(max-width:860px)').matches;
  var open = UI.stepOpen[n] != null ? UI.stepOpen[n] : (!mob || n === 1);
  return '<details class="step st-' + S.st + '" data-step="' + n + '" id="step-' + n + '"' + (open ? ' open' : '') + '><summary><span class="st-no" aria-hidden="true">0' + n + '</span><span class="st-t">' + title + '</span>'
    + stBadge(S.st) + '<span class="st-sub">' + esc(S.sub) + '</span></summary><div class="st-b">' + body + '</div></details>';
}
function stBadge(k) { return '<span class="badge b-' + ({ok: 'ok', chk: 'warn', ng: 'ng', none: 'none'}[k]) + '">' + ic({ok: 'check', chk: 'circle-alert', ng: 'circle-x', none: 'circle-dashed'}[k] || 'info', 'ic sm') + '<span class="b-t">' + STATE_LBL[k] + '</span></span>'; }
/* 旅程のタイムライン（PC：日ごとに横並び、スマホ：縦）。空港の時刻は現地時間で PT／ET を付ける */
function tz(ap) { return /^(SEA|PDX|SFO|LAX)$/.test(ap || '') ? 'PT' : 'ET'; }
function tlHTML(r) {
  var f = FBY[st.f], b = FBY[st.r], ev = {};
  function add(d, t, txt, cls) { (ev[d] = ev[d] || []).push({t: t || '99:99', txt: txt, cls: cls || ''}); }
  if (f) { add(f.date, f.depart_time, (f.depart_airport || 'SEA') + ' ' + (f.depart_time || '?') + ' ' + tz(f.depart_airport || 'SEA') + ' 出発（' + flNo(f) + '）', 'fl'); add(arrDate(f), f.arrive_time, (f.arrive_airport || 'BOS') + ' ' + (f.arrive_time || '?') + ' ' + tz(f.arrive_airport || 'BOS') + ' 到着', 'fl'); }
  r.it.days.forEach(function (x) { add(x.e.date, x.st === 'no' ? '12:00' : hm(x.from), '会場 ' + (x.st === 'full' ? '終日 ' + x.e.open + '–' + x.e.close : x.st === 'part' ? hm(x.from) + '–' + hm(x.to) : '参加できない') + ' ET', 'ev d-' + x.st); });
  if (st.ci) add(st.ci, '15:00', 'チェックイン（' + lodName(r) + '）', 'stay');
  if (st.co) add(st.co, '11:00', 'チェックアウト', 'stay');
  if (b) { add(b.date, b.depart_time, (b.depart_airport || 'BOS') + ' ' + (b.depart_time || '?') + ' ' + tz(b.depart_airport || 'BOS') + ' 出発（' + flNo(b) + '）', 'fl'); add(arrDate(b), b.arrive_time, (b.arrive_airport || 'SEA') + ' ' + (b.arrive_time || '?') + ' ' + tz(b.arrive_airport || 'SEA') + ' 到着', 'fl'); }
  var ds = Object.keys(ev).sort();
  return '<div class="tl" aria-label="旅程（現地時間）"><p class="note tl-n">旅程・現地時間（PT＝シアトル／ET＝ボストン、差3時間）</p><ol class="tl-days">' + ds.map(function (d) {
    return '<li class="tl-day"><b class="tl-d">' + esc(mdw(d)) + '</b><ul>' + ev[d].sort(function (a, c) { return a.t < c.t ? -1 : a.t > c.t ? 1 : 0; }).map(function (x) { return '<li class="tl-e ' + x.cls + '">' + esc(x.txt) + '</li>'; }).join('') + '</ul></li>';
  }).join('') + '</ol></div>';
}
function renderPlanner() {
  var r = calc(st);
  st.ci = r.s.ci; st.co = r.s.co;
  var nN = r.nights.length;
  /* 便の候補（差額つき） */
  function fopts(dir) {
    var sel = dir === 'outbound' ? st.f : st.r, by = {};
    FL.filter(function (f) { return f.direction === dir && flVisible(f); }).forEach(function (f) { (by[f.date] = by[f.date] || []).push(f); });
    return Object.keys(by).sort().map(function (d) {
      return '<optgroup label="' + esc(mdw(d)) + '">' + by[d].map(function (f) {
        var extra = '';
        if (f.id !== sel) { var s2 = clone(st); s2[dir === 'outbound' ? 'f' : 'r'] = f.id; extra = '　' + dlt(deltaOf(r, calc(s2))); }
        return opt(f.id, flShort(f) + (f.stops > 0 ? '・乗継' : '') + (f.alternative ? '・' + (dir === 'outbound' ? f.arrive_airport + '着' : f.depart_airport + '発') : '') + extra, sel);
      }).join('') + '</optgroup>';
    }).join('');
  }
  function lodMk(night) { return function (id) { var s2 = clone(st); if (night) { s2.c.nights[night] = {id: id, room: null}; } else s2.c = {mode: 'same', id: id, room: null}; return dlt(deltaOf(r, calc(s2))); }; }
  var ns = ''; for (var i = 1; i <= MAXN; i++) ns += opt(i, i + '人', st.n);
  var dates = []; for (var d = TRIP.dates.min; d <= TRIP.dates.max; d = addD(d, 1)) dates.push(d);
  /* 01 人数・日程 */
  var s1 = '<div class="in-grid">'
    + '<label class="fld" id="in-n">人数<select data-k="n">' + ns + '</select></label>'
    + '<label class="fld" id="in-bud">予算/人<input data-k="bud" type="number" min="0" step="10" inputmode="numeric" placeholder="上限なし" value="' + esc(st.bud) + '"></label></div>'
    + '<div class="in-dates" id="in-dates">' + (st.auto ? '<span>宿泊 ' + md(st.ci) + '–' + md(st.co) + '（' + nN + '泊）</span>'
      : '<label class="fld">チェックイン<select data-k="ci">' + dates.slice(0, -1).map(function (x) { return opt(x, mdw(x), st.ci); }).join('') + '</select></label>'
      + '<label class="fld">チェックアウト<select data-k="co">' + dates.slice(1).filter(function (x) { return x > st.ci; }).map(function (x) { return opt(x, mdw(x), st.co); }).join('') + '</select></label>') + '</div>'
    + '<label class="tg" title="泊数を便の到着・出発から決める"><input type="checkbox" data-k="auto"' + (st.auto ? ' checked' : '') + '>泊数は便から自動</label>'
    + '<details class="ctl" id="in-basis"><summary>宿の料金の基準</summary><div class="db">'
    + '<div class="pl-basis" role="radiogroup" aria-label="宿の料金の基準"><span>宿の料金</span>' + Object.keys(BASIS).map(function (k) {
      return '<label class="chip"><input type="radio" name="basis" data-k="b" value="' + k + '"' + (st.b === k ? ' checked' : '') + '>' + BASIS[k] + '</label>'; }).join('') + '</div></div></details>';
  /* 02 往復航空便 */
  var s2 = '<div class="in-grid">'
    + '<label class="fld wide" id="in-f">往路<select data-k="f">' + fopts('outbound') + '</select></label>'
    + '<label class="fld wide" id="in-r">復路<select data-k="r">' + fopts('return') + '</select></label></div>'
    + tlHTML(r)
    + '<details class="ctl" id="in-fare"><summary>運賃の条件（運賃種別・手入力）</summary><div class="db"><div class="in-grid"><label class="fld">運賃種別<select data-k="fb">' + Object.keys(FB).map(function (k) { return opt(k, FB[k], st.fb); }).join('') + '</select></label>'
    + '<label class="fld">運賃を手入力（往復/人）<input data-k="fo" type="number" min="0" step="1" inputmode="numeric" placeholder="$" value="' + esc(st.fo) + '"></label></div></div></details>';
  /* 03 宿泊 */
  var h = '<div class="in-stay" id="in-c">';
  if (st.c.mode === 'same') {
    var p = BY[st.c.id];
    h += '<div class="ns-row"><span class="ns-d">' + md(st.ci) + '–' + (st.co.slice(5, 7) === st.ci.slice(5, 7) ? +st.co.slice(8) : md(st.co)) + '</span><select data-act="pick" aria-label="宿">' + lodgingOptions(st.c.id, lodMk(null)) + '</select>'
      + '<a class="btn sm" href="' + ROOT + 'stays/" data-act="find" data-night="">探す</a></div>';
    if (p && p.rooms.length > 1) h += '<div class="ns-row sub"><span class="ns-d">部屋</span><select data-act="room" aria-label="部屋">' + opt('', '自動（安い順）', st.c.room == null ? '' : st.c.room) + p.rooms.map(function (rm, k) { return opt(k, (rm.room_type || '部屋' + (k + 1)) + '（' + (rm.max_occupancy || '?') + '人まで）', st.c.room); }).join('') + '</select></div>';
  } else {
    var as = assign(st.c, r.nights);
    h += r.nights.map(function (d2, k) {
      return '<div class="ns-row"><span class="ns-d">' + mdw(d2) + '</span><select data-act="pick-night" data-d="' + d2 + '" aria-label="' + md(d2) + 'の宿">' + lodgingOptions(as[k] ? as[k].id : '', lodMk(d2)) + '</select>'
        + '<a class="btn sm" href="' + ROOT + 'stays/" data-act="find" data-night="' + d2 + '">探す</a></div>';
    }).join('');
  }
  if (nN > 1) h += '<label class="tg"><input type="checkbox" data-act="mode"' + (st.c.mode === 'per' ? ' checked' : '') + '>泊ごとに変える</label>';
  h += '</div>';
  var s3 = h;
  /* 04 現地移動 */
  var s4 = '<div class="in-grid" id="in-ti">'
    + '<label class="fld">空港→市内<select data-k="ti">' + TRIP.transfer_in.map(function (t) { return opt(t.id, t.label + (t.id !== st.ti ? '　' + dlt(deltaOf(r, calc(Object.assign(clone(st), {ti: t.id})))) : ''), st.ti); }).join('') + '</select></label>'
    + '<label class="fld" id="in-to">市内→空港<select data-k="to">' + TRIP.transfer_out.map(function (t) { return opt(t.id, t.label + (t.id !== st.to ? '　' + dlt(deltaOf(r, calc(Object.assign(clone(st), {to: t.id})))) : ''), st.to); }).join('') + '</select></label>'
    + '<label class="fld">その他/人（食費など）<input data-k="oth" type="number" min="0" step="1" inputmode="numeric" placeholder="$0" value="' + esc(st.oth) + '"></label></div>'
    + '<p class="note">市内交通 ' + money(r.loc) + '/人（目安）は合計に含む。</p>';
  var S = stepStates(r);
  /* 開閉の状態を保つ（再描画で閉じない） */
  $$('#plan-inputs details.step').forEach(function (d) { UI.stepOpen[d.dataset.step] = d.open; });
  var sg = $('#sugg'); if (sg && sg.parentElement && sg.parentElement.id === 'sugg-slot') $('.pl-main').insertBefore(sg, $('#plan-detail'));
  $('#plan-inputs').innerHTML = derivedHTML() + stepCard(1, '人数・日程', S[1], s1) + '<div id="sugg-slot"></div>' + stepCard(2, '往復航空便', S[2], s2) + stepCard(3, '宿泊', S[3], s3) + stepCard(4, '現地移動', S[4], s4);
  if (sg) $('#sugg-slot').appendChild(sg);
  var more = alertList(r.alerts);
  $('#plan-more').innerHTML = more;
  renderSugg(r);
  renderPlanDetail(r);
  renderChecklist(r);
  $('#plan-side').innerHTML = '<div class="panel sticky sum">' + summaryHTML(r) + '</div>';
  var mb = $('#mbar');
  mb.hidden = false;
  var tt = totalTxt(r), ti = tt.indexOf('<small class="taxe">');
  mb.innerHTML = '<button type="button" class="mbar-b" data-act="sheet-open" aria-haspopup="dialog" aria-controls="sheet">'
    + '<span class="mb-r1"><small>1人あたり概算</small><span class="vchip v-' + r.v.lv + '">' + VLBL[r.v.lv] + '</span></span>'
    + '<span class="mb-l mb-r2"><b>' + (ti < 0 ? tt : tt.slice(0, ti)) + '</b><span class="mb-r">' + ic('chevron-up') + '内訳を見る</span></span>'
    + (ti < 0 ? '' : '<span class="mb-r3">' + tt.slice(ti).replace('<small class="taxe">', '<small class="taxe mb-tx">') + '</span>') + '</button>';
  if (UI.sheet) fillSheet(r);
}
function summaryHTML(r) {
  var it = r.it, v = r.v, grp = st.pv === 'grp', k = grp ? st.n : 1;
  var vdH = '<details class="vd v-' + v.lv + '" open><summary><b>日程：' + VLBL[v.lv] + '</b>' + (v.open ? '<span class="vd-n">' + v.open + '件</span>' : '') + '</summary>' + tip(TIPS.verdict)
    + (v.items.length ? '<ul class="vd-l">' + v.items.map(function (x) {
      var cat = /^(order|miss|nodays)$/.test(x.key) ? '日程衝突' : /^(tin|tout|leave)$/.test(x.key) ? '接続時間不足' : '';
      return '<li class="lv-' + x.lv + (x.acked ? ' acked' : '') + '">' + ic(x.icon) + '<span>' + (cat ? '<span class="vcat">' + cat + '</span>' : '') + '<a href="#" data-act="goto" data-tgt="' + x.tgt + '">' + esc(x.text) + '</a></span>'
        + (x.lv === 'chk' ? '<button type="button" class="btn xs" data-act="ack" data-key="' + x.key + '">' + (x.acked ? '確認済み' : '確認した') + '</button>' : '') + '</li>';
    }).join('') + '</ul>' : '<p class="note">矛盾は見つからない。</p>') + '</details>';
  var dchH = '<div class="dchips">' + it.days.map(function (x) {
    return '<span class="dc d-' + x.st + '"><b>' + md(x.e.date) + '</b>' + (x.st === 'full' ? '終日' : x.st === 'part' ? hm(x.from) + '–' + hm(x.to) : '不可') + '</span>';
  }).join('') + '</div>';
  function row(lab, val, sub, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + lab + '</th><td><span class="sv">' + val + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</td></tr>'; }
  var lod = r.unknown.length ? (r.total ? money(r.total / (grp ? 1 : st.n)) + '＋未確認' : '未確認') : money(r.total / (grp ? 1 : st.n)) + (r.from ? '〜' : '');
  if (r.feeOpen && !r.unknown.length) lod += '＋税・手数料';
  var lm = partsMeta([].concat.apply([], r.blocks.map(function (b) { return b.q ? b.q.parts : []; })));
  var tblH = '<div class="pv" role="radiogroup" aria-label="表示単位"><label class="chip"><input type="radio" name="pv" data-k="pv" value="pp"' + (grp ? '' : ' checked') + '>1人あたり</label>'
    + '<label class="chip"><input type="radio" name="pv" data-k="pv" value="grp"' + (grp ? ' checked' : '') + '>' + st.n + '人の合計</label></div>'
    + '<table class="sum-t"><tbody>'
    + row('航空券', r.fare.v != null ? money(r.fare.v * k) : '未確認', r.fare.custom ? '手入力' : esc(r.fare.note) + '・' + esc(r.fare.tax || '税込か未確認'), r.fare.v == null ? 'unk' : '')
    + row('宿泊', lod, r.nights.length + '泊・' + (r.taxPP ? (lm.tax.size > 1 ? '税込と税抜きが混在' : '宿泊税抜き') + '（税は下の目安）' : esc(taxOf(lm.tax) || '税込か未確認')), r.unknown.length || r.feeOpen ? 'unk' : '')
    + row('空港→市内', r.tin.lo != null ? range(r.tin.lo * k, r.tin.hi * k) : '未確認', esc(r.tin.t ? r.tin.t.label : ''), r.tin.lo == null ? 'unk' : '')
    + row('市内→空港', r.tout.lo != null ? range(r.tout.lo * k, r.tout.hi * k) : '未確認', esc(r.tout.t ? r.tout.t.label : ''), r.tout.lo == null ? 'unk' : '')
    + (r.taxPP ? row('宿泊税（目安）' + tip(TIPS.taxe), '+' + money(Math.round(r.taxPP * k)), '税抜きの宿代に' + r.taxRates.join('・') + '%' + (r.taxAssumed ? '（一部は地域不明で仮定）' : '') + '・概算', 'est') : '')
    + row('市内交通', money(r.loc * k), '目安')
    + (r.oth ? row('その他', money(r.oth * k), '手入力') : '')
    + '</tbody></table>';
  var h = '<p class="sum-total"><small>' + (grp ? st.n + '人の合計' : '1人あたり') + tip(TIPS.pp) + '</small><b>' + totalTxt(r, grp) + '</b>'
    + (r.unk.length ? '<span class="lbl c-unv">' + r.unk.join('・') + 'が未確認</span>' : '') + '</p>';
  if (st.bud) {
    var b = +st.bud, cls, t;
    if (r.unkPrice.length) { cls = 'unv'; t = '予算 ' + money(b) + '/人：既知分で' + (b - r.hi >= 0 ? '残り ' + money(Math.round(b - r.hi)) : money(Math.round(r.hi - b)) + '超過') + '（未確認を除く）'; }
    else if (r.hiT <= b) { cls = 'ok'; t = '予算 ' + money(b) + '/人の内（税込み目安で残り ' + money(Math.round(b - r.hiT)) + (r.feeOpen ? '、税・手数料を除く' : '') + '）'; }
    else { cls = 'ng'; t = '予算 ' + money(b) + '/人を税込み目安で ' + money(Math.round(r.hiT - b)) + ' 超える'; }
    h += '<p class="bud b-' + cls + '">' + ic('wallet') + esc(t) + '</p>';
  }
  h += vdH + dchH + '<h3 class="sum-bh">内訳</h3>' + tblH;
  h += '<div class="sum-act"><button type="button" class="btn pri" data-act="save-plan">' + ic('bookmark-plus') + '比較に保存</button>'
    + '<a class="btn" href="#checklist" data-act="goto" data-tgt="checklist">' + ic('list-checks') + '予約前チェック</a></div>'
    + (UI.saveMsg ? '<p class="note save-msg" role="status">' + UI.saveMsg + '</p>' : '');
  return h;
}
function altCard(p, base) {
  if (!p) return '';
  var s = p.s, pr = p.blocks[0] && p.blocks[0].q ? p.blocks[0].q.p : null;
  return '<div class="sg-alt"><h3>' + ic('circle-help', 'ic sm') + '代替案（3件とは別枠）</h3><article class="sg sg-altc"><header><span class="sg-l">代替案</span><b class="sg-p">' + totalTxt(p) + '<small>/人</small></b></header>'
    + '<p class="card-desc">' + esc(fitLen((pr ? pr.name : '') + '・' + p.nights.length + '泊（' + md(s.ci) + '–' + md(s.co) + '）', 20, 50, '')) + '</p>'
    + '<p class="sg-m">' + esc(flShort(FBY[s.f])) + '／' + esc(flShort(FBY[s.r])) + '<br>' + minBadge(pr) + '<span class="lbl c-unv">会場までの所要時間：未確認</span><br><small>' + esc(pr && pr.alt_only ? pr.alt_only.note : '') + '</small></p>'
    + '<button type="button" class="btn" data-act="load-sg" data-i="alt">このプランにする</button></article></div>';
}
function renderSugg(r) {
  var sg = suggestions(), el = $('#sugg');
  var h = '<h2 id="sugg-h">' + ic('route', 'ic h') + 'おすすめ 3件</h2>'
    + '<div class="sg-opt"><label class="chip"><input type="checkbox" data-k="sd"' + (st.sd ? ' checked' : '') + '>直行便のみ</label>'
    + '<label class="fld inl">会場まで<select data-k="sk">' + opt('', '指定なし', st.sk) + opt('4', '4km以内', st.sk) + opt('8', '8km以内', st.sk) + '</select></label>'
    + '<label class="fld inl">参加1時間の価値<select data-k="sw">' + [10, 20, 40].map(function (v) { return opt(v, '$' + v, st.sw); }).join('') + '</select></label>' + tip(balTip(st.sw)) + '</div>';
  if (!sg.list.length) {
    var w = sg.why;
    h += '<p class="note sg-none">条件に合うプランがない。除外：予算超過 ' + w.budget + '・料金未確認 ' + w.price + '・人数 ' + w.cap + '・日程 ' + w.time + '・空きなし ' + w.avail + '・最低泊数 ' + w.minstay + '</p>' + altCard(sg.alt);
  } else {
    h += '<div class="sg-grid">' + sg.list.map(function (x, i) {
      var p = x[3], s = p.s, pr = p.blocks[0] && p.blocks[0].q ? p.blocks[0].q.p : null;
      var same = toQ(s) === toQ(st), cert = ipCert(p), tt = totalTxt(p), ti = tt.indexOf('<small class="taxe">');
      function row(k, v, c) { return '<div' + (c ? ' class="' + c + '"' : '') + '><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
      return '<article class="sg sg-' + x[0] + '"><header><span class="sg-l">' + x[1] + '</span><span class="tag tag-au">サイト算出</span></header>'
        + '<p class="sg-p"><b>' + (ti < 0 ? tt : tt.slice(0, ti)) + '</b><small>/人</small><span class="lbl c-' + cert.k + '">' + cert.t + '</span>' + (ti < 0 ? '' : tt.slice(ti)) + '</p>'
        + '<dl class="sg-m sg-dl">'
        + '<div><dt>宿</dt><dd class="card-desc">' + esc(pr ? pr.name : '宿未選択') + '</dd></div>'
        + row('日程', p.nights.length + '泊（' + md(s.ci) + '–' + md(s.co) + '）')
        + row('往路', esc(flShort(FBY[s.f])))
        + row('復路', esc(flShort(FBY[s.r])))
        + row('参加', Math.round(p.it.hours) + '時間（' + daysTxt(p.it) + '）・' + (p.km != null ? '会場まで' + p.km.toFixed(1) + 'km' : '会場まで 不明'))
        + '</dl><p class="sg-d"><span class="dl">' + (same ? '今のプラン' : '今より ' + dlt(deltaOf(r, p))) + '</span></p>'
        + '<button type="button" class="btn" data-act="load-sg" data-i="' + i + '"' + (same ? ' disabled' : '') + '>' + (same ? '選択中' : 'このプランにする') + '</button></article>';
    }).join('') + '</div>' + altCard(sg.alt, r) + '<p class="note">掲載データ内・税込み目安の安い順。除外：料金未確認・人数不適合・日程不成立・空きなし（10/18時点）・最低泊数不適合（' + sg.n + '件から選択）。</p>';
  }
  el.innerHTML = h;
}
function renderPlanDetail(r) {
  var h = '<h2>' + ic('bed', 'ic h') + '宿と便の内訳</h2><ul class="pl-blocks">' + r.blocks.map(function (b) {
    if (!b.q) return '<li class="none">' + b.nights.map(md).join('・') + '泊：宿が未選択</li>';
    var q = b.q, p = q.p, rm = q.room;
    var price = q.total != null ? '<b>' + money(q.total) + (b.m.conf === 'from' ? '〜' : '') + '</b>' + lbl(b.m.conf) + priceFoot(b.m)
      : (q.parts.length ? '<b>' + money(q.partial) + '＋未確認</b>' + lbl('unv') + '<small class="pf">' + q.unk.map(md).join('・') + '泊が未確認</small>' + priceFoot(b.m) : '<b>未確認</b>' + lbl('unv'));
    return '<li><a href="' + stayURL(p.id) + '">' + esc(p.name) + '</a>' + minBadge(p) + '<span class="pl-bm">' + b.nights.map(md).join('・') + '泊・' + esc(rm && rm.room_type || '部屋情報なし') + '</span>'
      + '<span class="stt">' + capTxt(q, st.n) + tip(TIPS.fit) + availTxt(q, b.nights) + tip(TIPS.avail) + '</span><span class="pl-bp">' + price + '</span></li>';
  }).join('') + '</ul>';
  h += renderFlightList(r);
  if (r.notes.length) h += '<details class="ctl"><summary>そのほかの注意 ' + r.notes.length + '件</summary><div class="db"><ul class="wl">' + r.notes.map(function (w) { return '<li>' + ic(w[0]) + '<span>' + esc(w[1]) + '</span></li>'; }).join('') + '</ul></div></details>';
  $('#plan-detail').innerHTML = h;
}
var FL_OPEN = {list: false, rows: []};
function fareKind(fa) {
  if (fa.one_way_or_rt === 'rt_total') return fa.old ? '往復（旧）' : '往復の最安（復路は未固定）';
  return fa.one_way_or_rt === 'rt' ? '往復' : fa.one_way_or_rt === 'one_way' ? '片道' : '往復/片道不明';
}
function fareTable(f, dir) {
  function yn(v, y, n) { return v === true ? y : v === false ? n : (typeof v === 'number' ? v + '個' : (v ? esc(v) : '<span class="muted">?</span>')); }
  var fares = (f.fares || []).slice().sort(function (x, y) { return (x.old ? 1 : 0) - (y.old ? 1 : 0) || (num(x.price) == null ? 1e9 : num(x.price)) - (num(y.price) == null ? 1e9 : num(y.price)); });
  if (!fares.length) return '<p class="note">運賃データなし' + (dir === 'return' ? '（往路の往復運賃に含む場合あり）' : '') + '。</p>';
  return '<div class="tw"><table class="wide"><thead><tr><th>予約先</th><th>運賃種別</th><th>価格</th><th>預け荷物</th><th>変更</th><th>払い戻し</th><th>確認日</th><th></th></tr></thead><tbody>'
    + fares.map(function (fa) {
      var cur = fa.currency && fa.currency !== 'USD' ? fa.currency + ' ' : '';
      var tag = (fa.old ? '<span class="lbl c-old">' + (fa.status_note || '旧') + '</span>' : '') + (fa.ota ? '<span class="lbl c-unv">OTA・合計に使わない</span>' : '') + (fa.one_way_or_rt === 'rt_total' && !fa.old ? '<span class="lbl c-unv">参考</span>' : '');
      return '<tr' + (fa.old ? ' class="old"' : '') + '><td>' + esc(fa.channel || '') + (fa.site ? '<small>' + esc(fa.site) + '</small>' : '') + tag + '</td><td>' + (fa.fare_brand ? esc(fa.fare_brand) : '<span class="muted">不明</span>') + (fa.fare_brand_note ? '<small>' + esc(fa.fare_brand_note) + '</small>' : '') + '</td>'
        + '<td>' + (num(fa.price) != null ? (cur ? cur + num(fa.price) : money(num(fa.price))) : '未確認') + '<small>' + fareKind(fa) + '・' + (fa.taxes_included == null ? '税込か' + (fa.taxes_display || '未確認') : taxTxt(!!fa.taxes_included)) + '</small>' + lbl(confKey(fa.confidence)) + '</td>'
        + '<td>' + yn(fa.bags_included, '込み', 'なし') + '</td><td>' + yn(fa.change_policy) + '</td><td>' + yn(fa.refundable, '可', '不可') + '</td>'
        + '<td>' + esc(fa.price_seen_date ? md(fa.price_seen_date) : '不明') + (stale(fa.price_seen_date) ? '<span class="lbl c-old">要再確認</span>' : '') + '</td>'
        + '<td>' + (fa.url ? '<a href="' + esc(fa.url) + '" target="_blank" rel="noopener" aria-label="予約先を開く">' + ic('external-link') + '</a>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    + ((f.sources || []).length ? '<div class="links">' + f.sources.map(function (x) { return '<a class="btn" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + ic('link') + esc(x.label || '出典') + '</a>'; }).join('') + '</div>' : '');
}
function renderFlightList(r) {
  function rows(dir) {
    var by = {};
    FL.filter(function (f) { return f.direction === dir && flVisible(f); }).forEach(function (f) { (by[f.date] = by[f.date] || []).push(f); });
    return Object.keys(by).sort().map(function (d) {
      return '<h5 class="fl-d">' + esc(mdw(d)) + '</h5>' + by[d].map(function (f) {
        var b = bestFare(f, st.fb), chosen = f.id === st.f || f.id === st.r, open = FL_OPEN.rows.indexOf(f.id) >= 0;
        var s2 = clone(st); s2[dir === 'outbound' ? 'f' : 'r'] = f.id;
        var dd = chosen ? '' : dlt(deltaOf(r, calc(s2)));
        var ap = f.alternative ? '・' + (dir === 'outbound' ? f.arrive_airport + '着' : f.depart_airport + '発') : '';
        return '<details class="fl-row' + (chosen ? ' on' : '') + '" data-id="' + esc(f.id) + '" data-dir="' + dir + '"' + (open ? ' open' : '') + '><summary><span class="fl-n">' + esc(flName(f)) + '</span><span class="fl-t">' + esc(flTime(f)) + '・' + stopsTxt(f) + (f.overnight ? '・夜行' : '') + esc(ap) + '</span>'
          + '<span class="fl-p">' + (b ? money(num(b.price)) + '<small>' + (b.one_way_or_rt === 'rt' ? '往復' : '片道') + '</small>' + fareFoot([b]) : '<span class="muted">運賃未確認</span>') + (dd ? '<span class="dl">' + dd + '</span>' : '') + '</span>'
          + '<button type="button" class="btn" data-act="pick-flight" data-dir="' + dir + '" data-id="' + esc(f.id) + '"' + (chosen ? ' disabled' : '') + '>' + (chosen ? ic('check') + '選択中' : 'この便にする') + '</button></summary>'
          + '<div class="db">' + (open ? fareTable(f, dir) : '') + '</div></details>';
      }).join('');
    }).join('');
  }
  var cur = $('.fl-list');
  FL_OPEN = {list: cur ? cur.open : false, rows: $$('details.fl-row[open]').map(function (d) { return d.dataset.id; })};
  var nAlt = FL.filter(function (f) { return f.alternative; }).length, nVis = FL.filter(flVisible).length;
  return '<details class="ctl fl-list"' + (FL_OPEN.list ? ' open' : '') + '><summary>' + ic('plane') + '便と予約先別の運賃（' + nVis + '便）</summary><div class="db">'
    + '<p class="note">' + esc(TRIP.fare_note || '') + '。時刻は現地時間（SEAとBOSの時差3時間）。</p>'
    + (nAlt ? '<label class="tg"><input type="checkbox" data-k="alt"' + (st.alt ? ' checked' : '') + '>PVD・MHT発着の便も表示（' + nAlt + '便。ボストンまでの移動は未計算）</label>' : '')
    + rtTable(r) + '<h4>往路</h4>' + rows('outbound') + '<h4>復路</h4>' + rows('return') + '</div></details>';
}
function rtTable(r) {
  if (!RTQ.length) return '';
  var q2 = RTQ.slice().sort(function (a, b) { return num(a.price) - num(b.price); });
  return '<h4>往復の見積もり（便の組み合わせ）</h4><p class="note">この組み合わせなら往復運賃で計算（片道2本より安いとき）。</p><div class="tw"><table class="wide"><thead><tr><th>往路</th><th>復路</th><th>往復/人</th><th>片道2本</th><th>予約先・確認日</th><th></th></tr></thead><tbody>'
    + q2.map(function (q) {
      var o = FBY[q.outbound_id], rt = FBY[q.return_id], on = st.f === q.outbound_id && st.r === q.return_id;
      var fo = bestFare(o, st.fb), fr = bestFare(rt, st.fb), ow = fo && fr ? num(fo.price) + num(fr.price) : null;
      return '<tr' + (on ? ' class="on"' : '') + '><td>' + esc(flShort(o)) + '</td><td>' + esc(flShort(rt)) + '</td><td>' + money(num(q.price)) + '<small>' + esc(q.fare_brand || '') + '・' + taxTxt(q.taxes_included == null ? null : !!q.taxes_included) + '</small>' + lbl(confKey(q.confidence)) + '</td>'
        + '<td>' + (ow != null ? money(ow) : '<span class="muted">未確認</span>') + '</td><td>' + esc(q.channel || '') + '・' + esc(q.price_seen_date ? md(q.price_seen_date) : '確認日不明') + (q.url ? ' <a href="' + esc(q.url) + '" target="_blank" rel="noopener" aria-label="予約先を開く">' + ic('external-link') + '</a>' : '') + '</td>'
        + '<td><button type="button" class="btn sm" data-act="pick-rt" data-o="' + esc(q.outbound_id) + '" data-r="' + esc(q.return_id) + '"' + (on ? ' disabled' : '') + '>' + (on ? '選択中' : 'この組み合わせ') + '</button></td></tr>';
    }).join('') + '</tbody></table></div>';
}
function fillFareRow(d) {
  if (!d || !d.open || !d.classList.contains('fl-row')) return;
  var box = d.querySelector('.db'), f = FBY[d.dataset.id];
  if (box && f && !box.firstChild) box.innerHTML = fareTable(f, d.dataset.dir);
}
/* 予約前チェック */
function checkItems(r) {
  var s = r.s, f = FBY[s.f], rt = FBY[s.r], b0 = r.blocks.filter(function (b) { return b.q; });
  var names = b0.map(function (b) { return b.q.p; });
  return [
    {k: 'fl', t: '往復便の日付・時刻', d: '往路 ' + flNo(f) + ' ' + flTime(f) + '・復路 ' + flNo(rt) + ' ' + flTime(rt), sig: [s.f, s.r].join('|')},
    {k: 'dt', t: '宿泊日とチェックアウト日', d: md(s.ci) + 'チェックイン・' + md(s.co) + 'チェックアウト（' + r.nights.length + '泊）', sig: [s.ci, s.co, encC(s.c)].join('|')},
    {k: 'pp', t: '人数・部屋数・定員', d: s.n + '人・' + (b0.map(function (b) { return (b.q.perBed ? 'ベッド' + b.q.units + '床' : b.q.units + '室') + (b.q.fits === true ? '（適合）' : b.q.fits === false ? '（入らない）' : '（定員未確認）'); }).join('／') || '宿が未選択'), sig: [s.n, encC(s.c)].join('|')},
    {k: 'fee', t: '税・追加料金・キャンセル条件', d: names.map(function (p) { return p.name + '：キャンセル ' + (p.cancellation || '未確認') + '・宿泊税' + (p.tax ? p.tax.rate + '%' + (p.tax.assumed ? '（仮定）' : '') : '未確認') + (p.extra_fee ? '・' + p.extra_fee.label : '') + (availOf(p, r.nights) ? '・' + availLbl(availOf(p, r.nights)) : ''); }).join('／') || '宿が未選択', sig: [encC(s.c), s.b, s.f, s.fb].join('|')},
    {k: 'fin', t: '予約サイトでの最終金額・空室', d: '表示は確認日時点。予約サイトを開いて最終額を見る', sig: toQ(s)}
  ];
}
function renderChecklist(r) {
  var items = checkItems(r), done = lsGet(LS.check, {}), n = 0;
  var links = [];
  r.it.fc.parts.forEach(function (fa) { if (fa.url) links.push(['航空券（' + (fa.channel || '予約先') + '）', fa.url]); });
  r.blocks.forEach(function (b) { if (b.q && b.q.p.url && !links.some(function (l) { return l[1] === b.q.p.url; })) links.push([b.q.p.name, b.q.p.url]); });
  var h = '<h2 id="chk-h">' + ic('list-checks', 'ic h') + '予約前チェック' + tip(TIPS.check) + '</h2><ul class="chk">' + items.map(function (x) {
    var on = done[x.k] === x.sig, reset = done[x.k] && !on; if (on) n++;
    return '<li><label><input type="checkbox" data-act="check" data-key="' + x.k + '" data-sig="' + esc(x.sig) + '"' + (on ? ' checked' : '') + '><b>' + x.t + '</b></label><small>' + esc(x.d) + (reset ? '<span class="lbl c-unv">プラン変更で解除</span>' : '') + '</small></li>';
  }).join('') + '</ul><p class="chk-p">確認 ' + n + '/' + items.length + (n === items.length ? '・チェック完了は予約完了ではない' : '') + '</p>';
  if (r.unkPrice.length || r.fit !== true || r.feeOpen) h += '<p class="bud b-unv">' + ic('triangle-alert') + '料金未確認・人数・追加料金の注意が残っている</p>';
  h += '<div class="links">' + links.map(function (l) { return '<a class="btn" href="' + esc(l[1]) + '" target="_blank" rel="noopener">' + ic('external-link') + esc(l[0]) + '</a>'; }).join('') + '</div>';
  $('#checklist').innerHTML = h;
}
/* 内訳シート：閉じるボタン・戻る（履歴）・Esc で閉じ、開いたボタンにフォーカスを戻す。開いている間は背景を操作できない（inert） */
function fillSheet(r) {
  var sh = $('#sheet'); if (!sh) return;
  var keep = document.activeElement && sh.contains(document.activeElement) ? document.activeElement.getAttribute('data-act') || document.activeElement.name : null;
  $('.sheet-box', sh).innerHTML = '<div class="sheet-h"><b id="sheet-t">費用の内訳</b><button type="button" class="ib" data-act="sheet-close" aria-label="閉じる">' + ic('x') + '</button></div>' + summaryHTML(r || calc(st));
  var f = keep && ($('[data-act="' + keep + '"]', sh) || $('[name="' + keep + '"]:checked', sh)); if (f) f.focus();
}
function bgInert(on) { ['.sitebar', '#main-c', '.botnav', '#mbar', '.skip'].forEach(function (q) { var el = $(q); if (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } }); }
function openSheet(r) {
  var sh = $('#sheet'); if (!sh || UI.sheet) { if (sh) fillSheet(r); return; }
  UI.opener = document.activeElement;
  UI.sheet = true; sh.hidden = false; document.body.classList.add('sheet-open');
  $('.sheet-box', sh).setAttribute('aria-labelledby', 'sheet-t');
  fillSheet(r); bgInert(true);
  try { history.pushState({sheet: 1}, '', location.href); UI.sheetHist = true; } catch (e) { UI.sheetHist = false; }
  var c = $('.sheet-h [data-act="sheet-close"]', sh); if (c) c.focus();
}
function closeSheet(fromPop) {
  var sh = $('#sheet'); if (!sh || !UI.sheet) return;
  UI.sheet = false; sh.hidden = true; document.body.classList.remove('sheet-open'); bgInert(false);
  if (UI.sheetHist && !fromPop) { UI.sheetHist = false; UI.skipHash = true; setTimeout(function () { UI.skipHash = false; }, 400); history.back(); }
  UI.sheetHist = false;
  var o = UI.opener && document.contains(UI.opener) ? UI.opener : $('#mbar .mbar-b'); if (o && o.focus) o.focus({preventScroll: true});
}
/* おすすめから開いたプラン＝編集できるコピー。元の案は変えない。内容が変わったら「編集済み」 */
function derivedNow() { var d = lsGet(LS.derived, null); if (!d || !d.from) return null; return {from: d.from, title: d.title, author: d.author, edited: toQ(parseQ(d.q)) !== toQ(st)}; }
function derivedHTML() { var d = derivedNow(); if (!d) return ''; return '<p class="drv" role="status">' + ic('copy', 'ic sm') + '<span>おすすめ「' + esc(d.title) + '」（' + esc(d.author) + '）のコピー・元の案は変わらない' + (d.edited ? '<span class="lbl c-unv">編集済み</span>' : '') + '</span><button type="button" class="btn sm" data-act="drv-x">' + ic('x', 'ic sm') + 'コピー表示を消す</button></p>'; }
function savePlan() {
  var saved = lsGet(LS.saved, []);
  if (saved.length >= MAXSAVE) { UI.saveMsg = '比較は' + MAXSAVE + '件まで。<a href="' + ROOT + 'compare/">比較ページ</a>で消してから保存する。'; return; }
  var q = toQ(st);
  if (saved.some(function (x) { return x.q === q; })) { UI.saveMsg = '同じプランは保存済み。<a href="' + ROOT + 'compare/">比較を見る</a>'; return; }
  var used = saved.map(function (x) { return x.name; }), name = ['A', 'B', 'C', 'D'].map(function (c) { return 'プラン' + c; }).find(function (x) { return used.indexOf(x) < 0; });
  var dv = derivedNow(), item = {id: Date.now().toString(36), name: name, q: q, at: new Date().toISOString()};
  if (dv) { item.from = dv.from; item.edited = dv.edited; var nm = dv.title + (dv.edited ? '（編集）' : '（コピー）'); if (used.indexOf(nm) < 0) item.name = name = nm; }
  saved.push(item);
  lsSet(LS.saved, saved);
  UI.saveMsg = name + 'として保存（' + saved.length + '/' + MAXSAVE + '）。<a href="' + ROOT + 'compare/">比較を見る</a>';
  navCount();
}

/* ---------- 宿一覧 ---------- */
var F = null;
function fdef() { return {ty: [], fit: 0, pm: '', unk: 1, ar: '', dm: '', ft: [], ex: 0, q: '', s: 'price', hc: '', rt: ''}; }
function revOf(p) { return p.reviews_info || null; }
function revBadge(p) { var r = revOf(p); if (!r) return ''; var hc = num(r.hotel_class), rp = r.rep; return '<p class="rev">' + (hc ? '<span class="lbl c-est">' + ic('star', 'ic sm') + hc + 'つ星</span>' : '') + (rp ? '<span class="lbl c-date">' + esc(rp.source || '') + ' ' + rp.score + '/' + rp.scale + (rp.count != null ? '（' + rp.count + '件）' : '') + '</span>' : '') + '</p>'; }
function photo(p) {
  var loc = META.local_photos && META.local_photos[p.id];
  var src = loc ? ROOT + loc : null; /* 直リンクしない：取り込めた写真だけ */
  if (!src || !p.photo_source_url) return null;
  return {src: src, alt: p.photo_alt || p.name, cap: p.photo_source_name || '掲載ページ', url: p.photo_source_url};
}
function photoHTML(p, cls) {
  var ph = photo(p), t = typeOf(p);
  /* 写真なし：写真と同じ箱（同じ縦横比・同じ位置）＋同じ高さのキャプション行 */
  if (!ph) return '<figure class="' + cls + ' noph"><div class="ph-box" role="img" aria-label="写真なし（実際の宿の写真ではありません）">' + ic(t[1], 'ic lg') + '<b>写真未掲載</b></div><figcaption>アイコンはイメージ・実際の宿ではない</figcaption></figure>';
  return '<figure class="' + cls + '"><img src="' + esc(ph.src) + '" alt="' + esc(ph.alt) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer">'
    + '<figcaption>写真: <a href="' + esc(ph.url) + '" target="_blank" rel="noopener">' + esc(ph.cap) + '</a></figcaption></figure>';
}
function maxOcc(p) { return (p.rooms || []).reduce(function (m, r) { return Math.max(m, r.max_occupancy || 0); }, 0); }
function tileDesc(p, k) {
  var a = String(p.area || 'エリア不明');
  var s = typeOf(p)[0] + '・' + a + '・' + (k != null ? '会場まで約' + k.toFixed(1) + 'km' : '会場まで 不明');
  if (s.length > 50) s = typeOf(p)[0] + '・' + areaOf(p) + '・' + (k != null ? '会場まで約' + k.toFixed(1) + 'km' : '会場まで 不明');
  return fitLen(s, 20, 50, maxOcc(p) ? '・1室' + maxOcc(p) + '人まで' : '・定員未確認');
}
/* 宿一覧：4つのチップ（人数・価格・宿タイプ・絞り込み）＋外せる条件チップ＋件数 */
function stayChips(n, types, areas) {
  var act = [];
  function a(lab, key, val) { act.push('<button type="button" class="chip on rm" data-act="frm" data-key="' + key + '" data-val="' + esc(val == null ? '' : val) + '" aria-label="' + esc(lab) + 'の条件を外す">' + esc(lab) + ic('x', 'ic sm') + '</button>'); }
  F.ty.forEach(function (t) { a(t, 'ty', t); });
  F.ft.forEach(function (k) { a(FEATS[k] ? FEATS[k][0] : k, 'ft', k); });
  if (F.fit) a(st.n + '人で泊まれる', 'fit');
  if (F.pm) a('1人1泊 ' + money(+F.pm) + 'まで', 'pm');
  if (F.ar) a('エリア：' + F.ar, 'ar');
  if (F.dm) a('会場まで' + F.dm + 'km以内', 'dm');
  if (!F.unk) a('料金未確認を除く', 'unk');
  if (F.ex) a('候補外も含む', 'ex');
  if (F.q) a('検索：' + F.q, 'q');
  if (F.hc) a(F.hc + 'つ星以上', 'hc');
  if (F.rt) a('評価' + F.rt + '以上', 'rt');
  function c(lab, row, val, on) { return '<button type="button" class="chip fc' + (on ? ' on' : '') + '" data-act="fchip" data-row="' + row + '" aria-controls="lx-fb" aria-expanded="' + (UI.fOpenNow ? 'true' : 'false') + '">' + esc(lab) + (val ? '<b>' + esc(val) + '</b>' : '') + ic('chevron-down', 'ic sm') + '</button>'; }
  return '<div class="lx-chips" role="group" aria-label="絞り込み">' + c('人数', 'fr-n', st.n + '人', false) + c('価格', 'fr-pm', F.pm ? money(+F.pm) + 'まで' : '', !!F.pm)
    + c('宿タイプ', 'fr-ty', F.ty.length ? F.ty.length + '種' : '', F.ty.length > 0) + c('詳細条件', 'lx-fb', act.length ? act.length + '件' : '', act.length > 0) + '</div>' + '\u0001'
    + (act.length ? '<div class="lx-active" aria-label="使っている条件">' + act.join('') + '<button type="button" class="btn sm" data-act="reset-f">すべて外す</button></div>' : '');
}
function renderStays(keepFocus) {
  F = F || Object.assign(fdef(), lsGet(LS.filt, {}));
  var q0 = new URLSearchParams(location.search).get('q'); if (q0 && !renderStays.q0) { F.q = q0; renderStays.q0 = 1; }
  var base = calc(st), nN = base.nights.length, target = sessionStorage.getItem(LS.target) || '';
  var types = Array.from(new Set(DB.map(function (p) { return typeOf(p)[0]; })));
  var areas = Array.from(new Set(DB.map(areaOf))).sort();
  var qq = F.q.trim().toLowerCase();
  var list = DB.map(function (p) {
    var t = lodgingQuote(p, base.nights, st.n, st.b, null);
    return {p: p, q: t, pp: t.total != null ? t.total / st.n : null, km: km(p), f: feats(p)};
  }).filter(function (x) {
    var p = x.p;
    if (!F.ex && excluded(p)) return false;
    if (F.ty.length && F.ty.indexOf(typeOf(p)[0]) < 0) return false;
    if (F.fit && x.q.fits !== true) return false;
    if (F.pm) { if (x.pp == null) { if (!F.unk) return false; } else if (x.pp / nN > +F.pm) return false; }
    else if (!F.unk && x.pp == null) return false;
    if (F.ar && areaOf(p) !== F.ar) return false;
    if (F.dm && (x.km == null || x.km > +F.dm)) return false;
    if (F.ft.some(function (k) { return !x.f[k]; })) return false;
    if (F.hc && !(num((revOf(p) || {}).hotel_class) >= +F.hc)) return false;
    if (F.rt && !(((revOf(p) || {}).rep || {}).score10 >= +F.rt)) return false;
    if (qq && (p.name + ' ' + (p.area || '') + ' ' + (p.note || '')).toLowerCase().indexOf(qq) < 0) return false;
    return true;
  }).sort(function (a, b) {
    if (F.s === 'dist') return (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km);
    if (F.s === 'name') return a.p.name.localeCompare(b.p.name);
    if (F.s === 'rate') return ((((revOf(b.p) || {}).rep) || {}).score10 || -1) - ((((revOf(a.p) || {}).rep) || {}).score10 || -1);
    if (F.s === 'stars') return (num((revOf(b.p) || {}).hotel_class) || -1) - (num((revOf(a.p) || {}).hotel_class) || -1);
    return (a.pp == null ? 1e9 : a.pp) - (b.pp == null ? 1e9 : b.pp);
  });
  var cur = $('.lx-f');
  var fOpen = cur ? cur.open : !(window.matchMedia && window.matchMedia('(max-width:640px)').matches);
  UI.fOpenNow = fOpen;
  var active = F.ty.length + F.ft.length + (F.fit ? 1 : 0) + (F.pm ? 1 : 0) + (F.ar ? 1 : 0) + (F.dm ? 1 : 0) + (F.unk ? 0 : 1) + (F.ex ? 1 : 0);
  var chp = stayChips(list.length, types, areas).split('\u0001');
  var panel = '';
  var h = chp[0] + '\u0002' + '<div class="lx-top"><label class="fld srch">' + ic('search') + '<input type="search" data-f="q" value="' + esc(F.q) + '" placeholder="宿名・エリアで検索" aria-label="宿名・エリアで検索"></label>'
    + '<div class="lx-sc"><label class="fld inl">並び<select data-f="s">' + opt('price', '安い順', F.s) + opt('dist', '近い順', F.s) + opt('name', '名前順', F.s) + (HASREV ? opt('rate', '評価が高い順', F.s) + opt('stars', 'ランクが高い順', F.s) : '') + '</select></label>'
    + '<span class="cnt-t" role="status" aria-live="polite"><b>' + list.length + '件</b>／' + DB.length + '件中</span></div></div>'
    + '<p class="note cond">' + st.n + '人・' + md(st.ci) + '–' + md(st.co) + '（' + nN + '泊）・' + BASIS[st.b] + 'で計算・人数' + tip(TIPS.fit) + '・空室' + tip(TIPS.avail) + (target ? '・<b>' + md(target) + 'の宿を探し中</b>' : '') + '</p>'
    + (chp[1] || '') + '\u0003<details class="ctl lx-f"' + (fOpen ? ' open' : '') + '><summary>' + ic('sliders-horizontal') + '絞り込み' + (active ? '（' + active + '）' : '') + '</summary><div class="db lx-fb" id="lx-fb">'
    + '<div class="lx-row" id="fr-n"><label class="fld">人数（プランと共通）<select data-k="n">' + (function () { var o = ''; for (var i = 1; i <= MAXN; i++) o += opt(i, i + '人', st.n); return o; })() + '</select></label></div>'
    + '<div class="lx-row" id="fr-ty"><span class="lx-k">種類</span>' + types.map(function (t) { return '<label class="chip"><input type="checkbox" data-f="ty" value="' + esc(t) + '"' + (F.ty.indexOf(t) >= 0 ? ' checked' : '') + '>' + esc(t) + '</label>'; }).join('') + '</div>'
    + '<div class="lx-row"><span class="lx-k">特徴</span>' + Object.keys(FEATS).map(function (k) { return '<label class="chip"><input type="checkbox" data-f="ft" value="' + k + '"' + (F.ft.indexOf(k) >= 0 ? ' checked' : '') + '>' + FEATS[k][0] + '</label>'; }).join('')
    + '<label class="chip"><input type="checkbox" data-f="fit"' + (F.fit ? ' checked' : '') + '>' + st.n + '人で泊まれる</label></div>'
    + '<div class="lx-row">'
    + '<label class="fld" id="fr-pm">1人1泊<select data-f="pm">' + opt('', '上限なし', F.pm) + [40, 60, 80, 100, 150].map(function (v) { return opt(v, money(v) + 'まで', F.pm); }).join('') + '</select></label>'
    + '<label class="fld">エリア<select data-f="ar">' + opt('', 'すべて', F.ar) + areas.map(function (a) { return opt(a, a, F.ar); }).join('') + '</select></label>'
    + (HASREV ? '<label class="fld">ホテルランク<select data-f="hc">' + opt('', '指定なし', F.hc) + [2, 3, 4].map(function (v) { return opt(v, v + 'つ星以上', F.hc); }).join('') + '</select></label><label class="fld">評価（10点換算）<select data-f="rt">' + opt('', '指定なし', F.rt) + [7, 8, 9].map(function (v) { return opt(v, v + '以上', F.rt); }).join('') + '</select></label>' : '')
    + '<label class="fld">会場まで（直線）<select data-f="dm">' + opt('', '指定なし', F.dm) + [2, 4, 8].map(function (v) { return opt(v, v + 'km以内', F.dm); }).join('') + '</select></label></div>'
    + '<div class="lx-row"><label class="chip"><input type="checkbox" data-f="unk"' + (F.unk ? ' checked' : '') + '>料金未確認も含む</label>'
    + '<label class="chip"><input type="checkbox" data-f="ex"' + (F.ex ? ' checked' : '') + '>候補外も含む</label>'
    + '<button type="button" class="btn" data-act="reset-f">' + ic('x') + '条件をリセット</button></div></div></details>';
  (function () { var i3 = h.indexOf('\u0003'); var pn = h.slice(i3 + 1); h = h.slice(0, i3).replace('\u0002', function () { return pn; }); })();
  var tiles = list.map(function (x) {
    var p = x.p, q = x.q, m = partsMeta(q.parts), url = stayURL(p.id);
    var s2 = clone(st); if (target && s2.c.mode === 'per') s2.c.nights[target] = {id: p.id, room: null}; else s2.c = {mode: 'same', id: p.id, room: null};
    var isCur = encC(s2.c) === encC(st.c), d = isCur ? 'プランに入っている' : 'プランに入れると ' + dlt(deltaOf(base, calc(s2)));
    var price = x.pp != null ? '<b>' + money(Math.round(x.pp)) + (m.conf === 'from' ? '〜' : '') + '</b><small>/人・' + nN + '泊</small>' + lbl(m.conf) + (m.tax.has(false) ? '<span class="lbl c-unv">税抜き</span>' : '') + (p.extra_fee ? '<span class="lbl c-unv">' + esc(p.extra_fee.per_room_night ? '＋施設料$' + p.extra_fee.per_room_night + '/泊' : '＋サービス料' + p.extra_fee.pct + '%') + '</span>' : '') + priceFoot(m)
      : (q.parts.length ? '<b>' + money(Math.round(q.partial / st.n)) + '＋未確認</b><small>/人</small>' + lbl('unv') : '<b>未確認</b>' + lbl('unv') + '<small class="pf">この日程の料金データなし</small>');
    return '<article class="lx-tile">' + photoHTML(p, 'lx-ph')
      + '<div class="lx-b">' + (excluded(p) ? '<span class="tag x">候補外</span>' : '')
      + '<h3><a href="' + url + '">' + esc(p.name) + '</a></h3>'
      + '<p class="lx-p">' + price + '</p>'
      + '<p class="stt">' + capTxt(q, st.n) + availTxt(q, base.nights) + '</p>'
      + minBadge(p) + revBadge(p)
      + '<p class="card-desc">' + esc(tileDesc(p, x.km)) + '</p>'
      + '<p class="dl">' + d + '</p>'
      + '<div class="btns"><a class="btn" href="' + url + '">' + ic('info') + '詳細</a>'
      + '<button type="button" class="btn pri" data-act="to-plan" data-id="' + esc(p.id) + '"' + (isCur ? ' disabled' : '') + '>' + ic('plus') + (target ? md(target) + 'の宿にする' : 'プランに入れる') + '</button></div></div></article>';
  }).join('');
  if (!list.length) tiles = '<p class="note">該当する宿なし。<button type="button" class="btn" data-act="reset-f">条件をリセット</button></p>';
  var foc = keepFocus && document.activeElement && document.activeElement.dataset.f;
  $('#stays-app').innerHTML = h + '<div class="lx-grid">' + tiles + '</div>';
  if (!renderStays.scrolled) { renderStays.scrolled = 1; var sy = +sessionStorage.getItem('bcf26.staysY'); if (sy) setTimeout(function () { window.scrollTo(0, sy); }, 30); }
  if (foc) { var el = $('[data-f="' + foc + '"]', $('#stays-app')); if (el && el.type === 'search') { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
}
function putInPlan(id, room) {
  var target = sessionStorage.getItem(LS.target) || '';
  if (target && st.c.mode === 'per') st.c.nights[target] = {id: id, room: room == null ? null : room};
  else if (target && nightsOf(st.ci, st.co).length > 1 && st.c.mode === 'same' && st.c.id && st.c.id !== id) {
    var o = {mode: 'per', nights: {}}; nightsOf(st.ci, st.co).forEach(function (d) { o.nights[d] = {id: st.c.id, room: st.c.room}; }); o.nights[target] = {id: id, room: room == null ? null : room}; st.c = o;
  } else st.c = {mode: 'same', id: id, room: room == null ? null : room};
  sessionStorage.removeItem(LS.target);
  persist();
}

/* ---------- 宿の詳細 ---------- */
function cmpRows(p, nights, n) {
  var rows = [];
  (p.rooms || []).forEach(function (r, ri) {
    var u = roomUnits(p, r, n);
    function mk(list, src, meta) {
      var b = blockPrice(list, nights);
      rows.push(Object.assign({ri: ri, room: r, src: src, units: u.units, perBed: u.perBed, fits: u.fits,
        total: list.length && !b.unk.length ? b.amt * u.units : null, partial: b.amt * u.units, unk: b.unk, any: b.parts.length > 0}, meta));
    }
    var be = baseEntries(r);
    if (be.length || r.price_note) mk(be, r.price_source || '掲載サイト', {plan: r.price_note ? '目安' : '', tax: baseTax(r), seen: r.price_seen_date || null, conf: confKey(r.price_confidence, r.price_note), url: '', refundable: null, member: null, avail: null, note: r.price_note || ''});
    (r.offers || []).forEach(function (o) {
      var cur = o.currency && o.currency !== 'USD';
      var mism = o.guests != null && r.pricing !== 'per_bed' && u.per != null && +o.guests !== u.per;
      var list = [];
      if (!cur && !mism) {
        Object.keys(o.price_per_night || {}).forEach(function (d) { var a = num(o.price_per_night[d]); if (a != null) list.push({key: d, amt: a}); });
        var t = num(o.total_for_stay), sd = o.stay_dates;
        if (t != null && sd) { var k = Array.isArray(sd) ? sd[0] + '/' + sd[1] : (sd.checkin ? sd.checkin + '/' + sd.checkout : String(sd)); if (/\//.test(k)) list.push({key: k, amt: t}); }
      }
      mk(list, o.channel || '予約先', {plan: o.rate_plan || '', tax: o.taxes_fees_included == null ? null : !!o.taxes_fees_included, seen: o.price_seen_date || null, conf: confKey(o.confidence), url: o.url || '',
        refundable: o.refundable == null ? null : !!o.refundable, member: o.member_rate === true, avail: o.availability || null, cur: cur ? o.currency : '', mism: mism ? o.guests : null,
        bd: (o.base_price != null || o.taxes != null || o.fees != null) ? [o.base_price, o.taxes, o.fees] : null, note: o.note || ''});
    });
  });
  return rows;
}
var CMP_SORT = 'total';
function renderStayDetail() {
  var p = BY[META.stay]; if (!p) return;
  var base = calc(st), nights = base.nights, n = st.n, target = sessionStorage.getItem(LS.target) || '';
  var rows = cmpRows(p, nights, n);
  var tot = rows.filter(function (x) { return x.total != null; });
  var minT = tot.length ? Math.min.apply(null, tot.map(function (x) { return x.total; })) : null;
  var freeT = tot.filter(function (x) { return x.refundable === true; }), minF = freeT.length ? Math.min.apply(null, freeT.map(function (x) { return x.total; })) : null;
  rows.sort(function (a, b) {
    if (CMP_SORT === 'free') { var fa = a.refundable === true ? 0 : a.refundable === false ? 2 : 1, fb = b.refundable === true ? 0 : b.refundable === false ? 2 : 1; if (fa !== fb) return fa - fb; }
    return (a.total == null ? 1e9 : a.total) - (b.total == null ? 1e9 : b.total);
  });
  function yn(v) { return v === true ? '無料' : v === false ? '返金不可' : '<span class="muted">未確認</span>'; }
  var h = '<h2 id="cmp-h">' + ic('receipt', 'ic h') + '料金を比較' + tip(TIPS.cmp) + '</h2>'
    + '<p class="cond">' + md(st.ci) + '–' + md(st.co) + '・' + nights.length + '泊・' + n + '人・部屋タイプごと</p>'
    + '<div class="lx-top"><label class="fld inl">並び<select data-act="cmp-sort">' + opt('total', '総額順', CMP_SORT) + opt('free', 'キャンセル無料を先に', CMP_SORT) + '</select></label></div>';
  if (!rows.length) h += '<p class="note">料金データはまだない。</p>';
  else h += '<div class="tw tw-off"><table class="wide cmp offers"><thead><tr><th>予約先<small>部屋・プラン・キャンセル</small></th><th>総額</th><th>税・手数料</th><th>確認日</th><th><span class="sr">操作</span></th></tr></thead><tbody>'
    + rows.map(function (x) {
      var price = x.cur ? '<span class="muted">' + esc(x.cur) + '（合計に入れない）</span>' : x.mism != null ? '<span class="muted">' + x.mism + '人の料金（条件が違う）</span>'
        : x.total != null ? '<b>' + money(x.total) + '</b><small>1人 ' + money(Math.round(x.total / n)) + '・' + (x.perBed ? x.units + '床' : x.units + '室') + '</small>'
        : x.any ? '<b>' + money(x.partial) + '＋未確認</b><small>' + x.unk.map(md).join('・') + '泊が未確認</small>' : '<span class="muted">この日程は未確認</span>';
      var badges = (x.total != null && x.total === minT ? '<span class="lbl c-date">最安</span>' : '') + (x.total != null && x.total === minF && x.refundable ? '<span class="lbl c-est">キャンセル無料の最安</span>' : '') + (x.member ? '<span class="lbl c-from">会員価格</span>' : '');
      var bd = x.bd ? '<small>' + (x.bd[0] != null ? '基本' + money(x.bd[0]) : '基本?') + '＋税' + (x.bd[1] != null ? money(x.bd[1]) : '?') + '＋手数料' + (x.bd[2] != null ? money(x.bd[2]) : '?') + '</small>' : '';
      var av = x.avail === 'observed' ? '<small>確認日に掲載あり</small>' : x.avail === 'unavailable' ? '<small>確認日に満室表示</small>' : '';
      return '<tr' + (x.fits === false ? ' class="ng"' : '') + '><td class="o-src" data-l="予約先"><b>' + esc(x.src) + '</b>' + badges
        + '<small class="o-sub">' + esc(x.room.room_type || '部屋') + (x.plan ? '・' + esc(x.plan) : '') + '・キャンセル：' + yn(x.refundable) + '</small>' + (x.fits === false ? '<small><em>' + n + '人は入らない</em></small>' : '') + '</td>'
        + '<td class="o-num" data-l="総額">' + price + lbl(x.conf) + '</td><td data-l="税・手数料">' + taxTxt(x.tax) + bd + '</td>'
        + '<td class="o-num" data-l="確認日">' + (x.seen ? md(x.seen) : '不明') + (stale(x.seen) ? '<span class="lbl c-old">要再確認</span>' : '') + av + '</td>'
        + '<td class="acts">' + (x.url ? '<a class="btn xs" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + ic('external-link') + '予約サイト</a>' : '')
        + '<button type="button" class="btn xs" data-act="use-room" data-ri="' + x.ri + '">この部屋で計算</button></td></tr>';
    }).join('') + '</tbody></table></div><p class="note">最終額と空室は予約サイトで確認する。</p>';
  $('#stay-cmp').innerHTML = h;
  /* 今のプランでの概算 */
  var s2 = clone(st); if (target && s2.c.mode === 'per') s2.c.nights[target] = {id: p.id, room: null}; else s2.c = {mode: 'same', id: p.id, room: s2.c.id === p.id ? s2.c.room : null};
  var r2 = calc(s2), q = lodgingQuote(p, nights, n, st.b, s2.c.mode === 'same' ? s2.c.room : null), m = partsMeta(q.parts);
  var inPlan = encC(s2.c) === encC(st.c);
  var btn = inPlan ? '<button type="button" class="btn sel-ok" data-act="to-plan" data-id="' + esc(p.id) + '" aria-pressed="true" disabled>' + ic('check') + 'プランに入っている</button>'
    : '<button type="button" class="btn pri" data-act="to-plan" data-id="' + esc(p.id) + '">' + ic('plus') + (target ? md(target) + 'の宿として入れる' : 'プランに入れる') + '</button>';
  var chg = inPlan ? '<a class="btn" href="../" data-act="back-list">' + ic('shuffle') + '別の宿にする</a>' : '';
  var kmv = km(p);
  var sp = '<h2>このプランだと</h2><dl class="sp-kv"><div><dt>人数</dt><dd>' + n + '人</dd></div><div><dt>日程</dt><dd>' + md(st.ci) + '–' + md(st.co) + '</dd></div><div><dt>泊数</dt><dd>' + nights.length + '泊</dd></div>'
    + '<div><dt>会場まで</dt><dd>' + (kmv != null ? '直線' + kmv.toFixed(1) + 'km' : '不明（座標なし）') + (typeof p.transit_to_hynes === 'string' ? '<small>' + esc(p.transit_to_hynes) + '</small>' : '') + '</dd></div></dl>'
    + '<div class="sp-amt sp-a1"><span class="sp-k">この宿の料金</span><p class="sp-price">' + (q.total != null ? '<b>' + money(Math.round(q.total / n)) + '</b><small>/人（宿' + money(q.total) + '）</small>' : q.parts.length ? '<b>' + money(Math.round(q.partial / n)) + '＋未確認</b><small>/人</small>' : '<b>未確認</b>') + '</p>'
    + '<div class="sp-c">' + (q.total != null ? lbl(m.conf) : lbl('unv')) + '</div>' + (q.parts.length ? priceFoot(m) : '') + '</div>'
    + '<p class="stt">' + capTxt(q, n) + tip(TIPS.fit) + availTxt(q) + '</p>'
    + (function () { var tt = totalTxt(r2), ti = tt.indexOf('<small class="taxe">'), tg = totalTxt(r2, true), tgi = tg.indexOf('<small class="taxe">');
        return '<div class="sp-amt sp-a2"><span class="sp-k">プラン全体</span><p class="sp-tot"><b>' + (ti < 0 ? tt : tt.slice(0, ti)) + '</b><small>/人</small></p>'
          + '<p class="sp-g">' + n + '人の合計 ' + (tgi < 0 ? tg : tg.slice(0, tgi)) + '</p>' + (inPlan ? '' : '<span class="dl">今より ' + dlt(deltaOf(base, r2)) + '</span>') + '<div class="sp-c">' + lbl(ipCert(r2).k) + '</div></div>'
          + (ti < 0 ? '' : '<div class="sp-amt sp-a3"><span class="sp-k">税込目安</span><p>' + '<b>' + tt.slice(ti).replace(/<\/?small[^>]*>/g, '').replace('宿泊税抜き・税込み目安 ', '') + '</b><small>/人</small></p><p class="sp-g">' + n + '人の合計 ' + tg.slice(tgi).replace(/<\/?small[^>]*>/g, '').replace('宿泊税抜き・税込み目安 ', '') + '</p><div class="sp-c">' + lbl('est') + '</div></div>'); })()
    + '<div class="sp-act">' + btn + chg + '<a class="btn" href="' + ROOT + '">' + ic('arrow-left') + 'プランに戻る</a></div>';
  $('#stay-plan').innerHTML = sp;
  var mb = $('#dt-mbar');
  if (!mb) { mb = document.createElement('div'); mb.id = 'dt-mbar'; mb.className = 'dt-mbar'; var dk = $('#dock'); if (dk) dk.insertBefore(mb, dk.firstChild); else document.body.appendChild(mb); }
  mb.innerHTML = '<span><small>1人あたり（宿）</small><b>' + (q.total != null ? money(Math.round(q.total / n)) : q.parts.length ? money(Math.round(q.partial / n)) + '＋未確認' : '未確認') + '</b></span>' + btn;
}

/* ---------- 比較 ---------- */
/* ---------- おすすめプラン（ideal_plans.json） ---------- */
var IDEAL = {plans: [], sources: []}, HASREV = false;
function ipByID(id) { for (var i = 0; i < IDEAL.plans.length; i++) if (IDEAL.plans[i].id === id) return IDEAL.plans[i]; return null; }
function ipSel() { return lsGet(LS.ipsel, []).filter(function (id) { var p = ipByID(id); return p && !(p.broken || []).length; }); }
/* 作成者の合計（1人あたり、分かっている分）とサイトの計算エンジンでの再計算を比べる。$5 を超える差か「未確認の有無」の違いを不一致とする */
var IP_TOL = 5;
function auLbl(a) { return String(a || '').toLowerCase() === 'chatgpt' ? 'ChatGPT' : a; }
function txtList(x) { return Array.isArray(x) ? x : x == null || x === '' ? [] : [x]; }
function fzLbl(p) { var t = p.tags || {}, fz = p.feasibility || {}; return '<span class="lbl ' + ((t.status || fz.status) === 'OK' ? 'c-ok' : 'c-unv') + '">' + esc(t.status_label || fz.status_as_written || fz.status || '不明') + '</span>'; }
function recLbl(p) { return p.recommended ? '<span class="lbl c-rec">' + ic('star', 'ic sm') + esc(auLbl(p.author)) + 'の推奨</span>' : ''; }
function ipCheck(p, r) {
  var T = p.totals || {}, st0 = num(T.total_pp_known), lo = r.taxPP ? r.loT : r.lo, hi = r.taxPP ? r.hiT : r.hi;
  var reUnk = !!r.unkPrice.length, auUnk = T.complete === false || (T.unknown_parts || []).length > 0;
  var res = {stated: st0, lo: lo, hi: hi, diff: null, bad: false, why: []};
  if (st0 == null) { res.why.push('作成者の合計なし'); res.bad = true; return res; }
  if (!r.lo && reUnk) { res.why.push('再計算は料金未確認'); res.bad = true; return res; }
  res.diff = st0 - (lo + hi) / 2;
  if (st0 < lo - IP_TOL || st0 > hi + IP_TOL) { res.bad = true; res.why.push('再計算が' + dlt(-res.diff).replace('/人', '') + '/人'); }
  if (reUnk !== auUnk) { res.bad = true; res.why.push(reUnk ? '再計算に未確認あり' : '作成者は未確認あり・再計算は全額判明'); }
  return res;
}
function ipChips(p) {
  var t = p.tags || {};
  return '<span class="tag tag-au">' + esc(auLbl(p.author)) + '</span>' + [t.strategy, t.arrival, t.return ? '帰り：' + t.return : '', p.party_size + '人'].filter(Boolean).map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join('');
}
var IP_FIELDS = {
  rec: function (c) { return c.p.recommended ? '<p class="ip-recf"><b>推奨理由：</b>' + esc(c.p.recommended_reason || '記載なし') + '</p>' : ''; },
  totals: function (c) { var T = c.T, r = c.r; return '<dl class="ip-tot"><div><dt>作成者の合計</dt><dd>' + esc(T.display_pp || (num(T.total_pp_known) != null ? money(T.total_pp_known) : '不明')) + '<small>/人・グループ ' + esc(T.display_group || '不明') + '</small></dd></div>'
    + '<div><dt>再計算</dt><dd>' + (r ? totalTxt(r) + '<small>/人・グループ ' + totalTxt(r, true, true) + '</small>' : '計算不可') + '</dd></div></dl>'; },
  check: function (c) { var ck = c.ck; return ck ? (ck.bad ? '<p class="ip-mm"><span class="lbl c-unv">合計不一致</span>' + ck.why.map(esc).join('・') + '</p>' : '<p class="ip-ok"><span class="lbl c-ok">合計一致</span>差$' + IP_TOL + '以内</p>') : ''; },
  meta: function (c) { var p = c.p, r = c.r; return '<p class="ip-m">' + esc(p.dates ? md(p.dates.check_in) + '–' + md(p.dates.check_out) + '・' + p.dates.nights + '泊' : '') + '／' + esc(p.items && p.items.lodging ? p.items.lodging.name + (p.items.lodging.units > 1 ? '×' + p.items.lodging.units + '室' : '') : '') + '<br>'
    + (r ? esc(flShort(FBY[r.s.f])) + '／' + esc(flShort(FBY[r.s.r])) : esc(((p.items || {}).outbound || {}).flight_id || '') + '／' + esc(((p.items || {}).return || {}).flight_id || '')) + '</p>'; },
  feasibility: function (c) { var fz = c.fz; return '<div class="ip-fz"><b>実現性：</b>' + fzLbl(c.p) + ((fz.notes || []).length ? '<ul>' + fz.notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>'; },
  stay: function (c) { var q = c.p.stay_q, a = c.p.raw_alt; if (!q && !a) return '';
    return '<div class="ip-stayf"><b>宿の口コミ判定：</b>' + (q ? esc(q.label) + (q.rating ? '（' + esc(q.rating) + '）' : '') + (q.notes.length ? '<ul>' + q.notes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') : '記載なし')
      + (a && a.why ? '<p><b>代替案を既定にしない理由（作成者）：</b>' + esc(a.why) + '</p>' : '') + '<p class="note">自動で拾った口コミの件数。誤検出を含み、事実の確認ではない</p></div>'; },
  note: function (c) { var n = txtList(c.p.note); return n.length ? '<div class="ip-notef"><b>注記：</b><ul>' + n.map(function (x) { return '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>'; }).join('') + '</ul></div>' : ''; },
  unconfirmed: function (c) { var un = (c.p.unconfirmed || []).concat((c.T.unknown_parts || []).map(function (x) { return '合計外：' + (typeof x === 'string' ? x : JSON.stringify(x)); }));
    return '<div class="ip-un"><b>未確認：</b>' + (un.length ? '<ul>' + un.map(function (x) { return '<li>' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>'; }).join('') + '</ul>' : 'なし') + '</div>'; },
  proscons: function (c) { var p = c.p, T = c.T; return (p.pros || []).length || (p.cons || []).length || (T.excludes || []).length ? '<details class="ctl"><summary>長所・短所・合計外</summary><ul>' + (p.pros || []).map(function (x) { return '<li>＋' + esc(x) + '</li>'; }).join('') + (p.cons || []).map(function (x) { return '<li>−' + esc(x) + '</li>'; }).join('') + (T.excludes || []).map(function (x) { return '<li>合計外：' + esc(typeof x === 'string' ? x : JSON.stringify(x)) + '</li>'; }).join('') + '</ul></details>' : ''; },
  actions: function (c) { var bad = c.bad.length; return '<div class="btns"><button type="button" class="btn pri" data-act="ip-open" data-id="' + esc(c.p.id) + '"' + (bad ? ' disabled' : '') + '>' + ic('external-link') + 'プランビルダーで開く</button>'
    + '<label class="chip"><input type="checkbox" data-act="ip-cmp" value="' + esc(c.p.id) + '"' + (c.sel ? ' checked' : '') + (bad ? ' disabled' : '') + '>比較に追加</label></div>'; }
};
/* ===== おすすめプラン（chatgpt_plans_layout.md の配置）=====
   上から：人数 → 詳細フィルター → まず見る3プラン → 全プランを探す（方針×入り方）。JSON は変えず、UI 側で正規化する */
var IP_LAYOUT = {group_order: {strategy: ['最安', 'バランス', '時間優先', 'その他'], arrival: ['前泊', '当日入り', '土日のみ']}, default_sort: 'rec', default_view: 'merged', reason_max: 40, note_max: 35,
  card_fields: ['rec', 'totals', 'check', 'meta', 'feasibility', 'note', 'unconfirmed', 'proscons']};
var IPF2 = 'bcf26.idealView';
var HAD_PLAN = (function () { try { return !!localStorage.getItem('bcf26.plan'); } catch (e) { return false; } })(); /* 読み込み前にビルダーを使っていたか */
var STAT_ORD = {'OK': 0, '要確認': 1, '時間不足': 2};
var RET_ORD = ['日曜朝', '日曜夕方以降', '月曜朝', '月曜夕方以降'];
function ipStrat(p) { return (p.tags || {}).strategy || 'その他'; }
function ipCalc(p) { if (!p._r && !(p.broken || []).length) p._r = calc(parseQ(p.site_q)); return p._r || null; }
function ipState() {
  var f = lsGet(IPF2, {}), o = {n: f.n || '', rd: f.rd || '', au: f.au || '', fs: f.fs || '', sort: f.sort || IP_LAYOUT.default_sort, view: f.view || IP_LAYOUT.default_view, cs: f.cs || '', ca: f.ca || '', open: !!f.open, inh: ''};
  if (!o.n) { var bn = st && st.n; if ([1, 2, 4].indexOf(+bn) >= 0 && HAD_PLAN) { o.n = String(bn); o.inh = 'ビルダーの人数'; } else { o.n = '1'; o.inh = 'none'; } }
  return o;
}
function ipSet(k, v) { var f = lsGet(IPF2, {}); f[k] = v; lsSet(IPF2, f); }
function ipBase(f) { return IDEAL.plans.filter(function (p) { var t = p.tags || {}; return String(p.party_size) === f.n && (!f.rd || t.return_day === f.rd) && (!f.au || String(p.author).toLowerCase() === f.au) && (!f.fs || t.status === f.fs); }); }
function ipCert(r) {
  if (!r) return {k: 'unv', t: '未確認'};
  if (r.unkPrice.length && !r.lo) return {k: 'unv', t: '未確認'};
  if (r.unkPrice.length) return {k: 'unv', t: '一部未確認'};
  var parts = [].concat.apply([], r.blocks.map(function (b) { return b.q ? b.q.parts : []; })), m = partsMeta(parts);
  return m.conf === 'date' && !r.from && !r.taxPP && r.lo === r.hi ? {k: 'date', t: '確認済み'} : {k: 'est', t: '概算'};
}
/* 帰着の実時刻（データにあるときだけ）。無ければ区分の順。推定はしない */
function ipRet(p) {
  var r = ipCalc(p), f = r && FBY[r.s.r];
  if (f && f.date && f.arrive_time) return {real: true, v: (f.arrive_date || f.date) + 'T' + pad(f.arrive_time)};
  var i = RET_ORD.indexOf((p.tags || {}).return); return {real: false, v: i < 0 ? 99 : i};
}
function ipUnc(p) { var r = ipCalc(p); return (p.unconfirmed || []).length + (r ? r.unkPrice.length : 9); }
function ipPrice(p) { var r = ipCalc(p); return r && !r.unkPrice.length ? r.mid : null; }
function ipSchedOK(p) { var r = ipCalc(p); return r && r.v.lv !== 'no' && (p.tags || {}).status !== '時間不足'; }
function ipSort(list, how) {
  function byRec(a, b) { return (STAT_ORD[(a.tags || {}).status] - STAT_ORD[(b.tags || {}).status]) || ((b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)) || (ipUnc(a) - ipUnc(b)) || cmpPrice(a, b) || a.id.localeCompare(b.id); }
  function cmpPrice(a, b) { var x = ipPrice(a), y = ipPrice(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return x - y; }
  function cmpRet(a, b, dir) { var x = ipRet(a), y = ipRet(b);
    if (x.real && y.real) return dir * x.v.localeCompare(y.v);
    if (x.real !== y.real) return x.real ? -1 : 1;
    return dir * (x.v - y.v); }
  var fn = how === 'price' ? function (a, b) { return cmpPrice(a, b) || a.id.localeCompare(b.id); }
    : how === 'ret_early' ? function (a, b) { return cmpRet(a, b, 1) || a.id.localeCompare(b.id); }
    : how === 'ret_late' ? function (a, b) { return cmpRet(a, b, -1) || a.id.localeCompare(b.id); }
    : how === 'author' ? function (a, b) { return String(a.author).localeCompare(String(b.author)) || byRec(a, b); } : byRec;
  return list.slice().sort(fn);
}
/* まず見る3プラン：方針ごとに1件。日程NG・人数NGは出さない。足りなくても埋めない */
function qOK(p) { return p.stay_q && p.stay_q.level === 'green' ? 1 : 0; } /* 作成者の「おすすめ」→口コミ判定を通った宿→日程OK の順 */
function isCore(p) { return ['cheapest', 'balance', 'time_first'].indexOf(p.scenario) >= 0 ? 1 : 0; } /* 方針そのものの案（入り方・帰り方の比較用でない） */
function ipReps(base) {
  return ['最安', 'バランス', '時間優先'].map(function (s) {
    var c = base.filter(function (p) { var r = ipCalc(p); return ipStrat(p) === s && r && ipSchedOK(p) && r.fit !== false; });
    c.sort(function (a, b) { var ra = ipCalc(a), rb = ipCalc(b);
      return ((b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)) || (qOK(b) - qOK(a)) || (isCore(b) - isCore(a)) || ((rb.fit === true && rb.v.lv === 'ok' ? 1 : 0) - (ra.fit === true && ra.v.lv === 'ok' ? 1 : 0)) || ((b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)) || (ipUnc(a) - ipUnc(b))
        || ((ra.unkPrice.length ? 1 : 0) - (rb.unkPrice.length ? 1 : 0)) || a.id.localeCompare(b.id); });
    return {s: s, p: c[0] || null};
  });
}
function ipTitle(p) { var t = p.tags || {}; return p.scenario === 'return_style' ? '帰り' + (t.return || '不明') + '・' + (t.arrival || '') : (t.strategy || t.arrival || '') + '・' + (t.strategy ? t.arrival : '帰り' + (t.return || '不明')); }
/* 短く切る（句点・読点で切れるなら優先）。全文は「詳細」で必ず読める */
function cut(s, n) { s = String(s || ''); if (s.length <= n) return {t: s, more: false}; var i = Math.max(s.lastIndexOf('。', n), s.lastIndexOf('、', n), s.lastIndexOf('・', n)); return {t: (i >= n * 0.5 ? s.slice(0, i) : s.slice(0, n)) + '…', more: true}; }
function ipNotes(p) { return txtList(p.note).concat((p.feasibility || {}).notes || [], (p.unconfirmed || []).map(function (x) { return '未確認：' + (typeof x === 'string' ? x : JSON.stringify(x)); })).map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }); }
function ipDetail(p, c) {
  var flds = (IP_LAYOUT.card_fields || []).slice();
  ['rec', 'totals', 'check', 'meta', 'stay', 'feasibility', 'note', 'unconfirmed', 'proscons'].forEach(function (k) { if (flds.indexOf(k) < 0) flds.push(k); });
  return '<details class="ctl ip-more"><summary>詳細・全文</summary><div class="db"><p class="ip-ot">' + esc(p.title || p.id) + '</p>' + flds.map(function (k) { return IP_FIELDS[k] ? IP_FIELDS[k](c) : ''; }).join('') + '</div></details>';
}
/* 宿の口コミ判定（作成者の判定。警告は「最近の口コミでの指摘」の形）と、生の最安を代替案として */
var Q_SHORT = {green: '赤信号なし', amber: '注意', red: '除外の基準', unrated: '評価点のみ'};
function ipQual(p) {
  var q = p.stay_q, a = p.raw_alt, h = '';
  if (q) h += '<p class="ip-q q-' + esc(q.level) + '"><span class="lbl">' + esc(q.label) + '</span>' + (q.rating ? '<small>' + esc(q.rating) + '</small>' : '') + (q.other ? '<small class="ip-q2">' + (q.other === q.level ? auLbl(q.other_by) + 'の判定も同じ' : auLbl(q.other_by) + 'の判定：' + esc(Q_SHORT[q.other] || q.other)) + '</small>' : '')
    + (q.level !== 'green' && q.notes.length ? '<span class="ip-qn">' + esc(q.notes[0]) + (q.notes.length > 1 ? '（ほか' + (q.notes.length - 1) + '件）' : '') + '</span>' : '') + '</p>';
  if (a) h += '<div class="ip-alt" data-alt="' + esc(a.site_id) + '"><p><b class="tag tag-alt">代替案</b>生の最安：<a href="' + ROOT + 'stays/' + esc(a.site_id) + '/">' + esc(a.name) + '</a>'
    + (a.total_pp != null ? '・1人$' + Math.round(a.total_pp).toLocaleString('en-US') + '<small>（作成者の概算）</small>' : '') + '</p>'
    + (a.warnings.length ? '<p class="ip-altw">' + ic('triangle-alert', 'ic sm') + esc(a.warnings.join('・')) + '</p>' : '') + '</div>';
  return h;
}
function ipCard(p, sel) {
  var bad = p.broken || [], r = ipCalc(p), t = p.tags || {}, cert = ipCert(r);
  var c = {p: p, sel: sel, bad: bad, r: r, ck: r ? ipCheck(p, r) : null, T: p.totals || {}, fz: p.feasibility || {}};
  var reason = p.recommended_reason || (p.pros || []).join('・'), rc = cut(reason, IP_LAYOUT.reason_max), notes = ipNotes(p), nc = notes.length ? cut(notes[0], IP_LAYOUT.note_max) : null;
  return '<article class="ip' + (bad.length ? ' ip-bad' : '') + '" data-ip="' + esc(p.id) + '">'
    + '<header class="ip-h"><h3>' + esc(ipTitle(p)) + '</h3><div class="ip-tags"><span class="tag tag-au">' + esc(auLbl(p.author)) + '</span>' + recLbl(p) + '</div></header>'
    + (function () { var tt = r ? totalTxt(r) : '計算不可', i = tt.indexOf('<small class="taxe">'); return '<p class="ip-price"><b>' + (i < 0 ? tt : tt.slice(0, i)) + '</b><small>/人</small><span class="lbl c-' + cert.k + '">' + cert.t + '</span>' + (i < 0 ? '' : tt.slice(i)) + '</p>'; })()
    + '<p class="ip-meta">' + p.party_size + '人・帰り' + esc(t.return || '不明') + fzLbl(p) + (c.ck && c.ck.bad ? '<span class="lbl c-unv">合計不一致</span>' : '') + '</p>'
    + '<p class="ip-why' + (p.recommended ? ' ip-rec' : '') + '">' + (reason ? esc(rc.t) : '<span class="muted">理由の記載なし</span>') + '</p>'
    + '<p class="ip-note">' + (nc ? '<b>注記 ' + notes.length + '件</b>' + esc(nc.t) : '<b>注記なし</b>') + '</p>'
    + '<div class="ip-qa">' + ipQual(p) + (bad.length ? '<p class="ip-broken"><b>壊れたプラン</b>（未登録ID）：' + bad.map(esc).join('／') + '</p>' : '') + '</div>'
    + ipDetail(p, c)
    + '<div class="btns ip-btns"><label class="chip"><input type="checkbox" data-act="ip-cmp" value="' + esc(p.id) + '"' + (sel ? ' checked' : '') + (bad.length ? ' disabled' : '') + '>比較に追加</label>'
    + '<button type="button" class="btn pri" data-act="ip-open" data-id="' + esc(p.id) + '"' + (bad.length ? ' disabled' : '') + '>' + ic('external-link') + 'ビルダーで開く</button></div></article>';
}
function ipGroupKey(p) { var t = p.tags || {}; return [p.party_size, ipStrat(p), t.arrival, t.return].join('|'); }
function ipByAuthor(list, authors, sel) {
  var keys = [], g = {};
  list.forEach(function (p) { var k = ipGroupKey(p); if (!g[k]) { g[k] = {}; keys.push(k); } var a = String(p.author).toLowerCase(); (g[k][a] = g[k][a] || []).push(p); });
  return '<div class="ip-ab">' + keys.map(function (k) { var x = k.split('|');
    return '<section class="ip-abg" data-g="' + esc(k) + '"><h4>' + esc(x[1] + '・' + x[2] + '・帰り' + x[3] + '・' + x[0] + '人') + '</h4><div class="ip-abc" style="--na:' + authors.length + '">'
      + authors.map(function (a) { var ps = g[k][a.toLowerCase()] || []; return '<div class="ip-abcol"><p class="ip-abau">' + esc(auLbl(a)) + '</p>' + (ps.length ? ps.map(function (p) { return ipCard(p, sel.indexOf(p.id) >= 0); }).join('') : '<p class="note ip-none">該当案なし</p>') + '</div>'; }).join('')
      + '</div></section>'; }).join('') + '</div>';
}
function renderIdeal() {
  var el = $('#ideal-app'); if (!el) return;
  if (IDEAL.layout) Object.keys(IDEAL.layout).forEach(function (k) { IP_LAYOUT[k] = IDEAL.layout[k]; });
  if (!IDEAL.plans.length) { el.innerHTML = '<p class="note">おすすめプランのデータなし' + (IDEAL.error ? '（' + esc(IDEAL.error) + '）' : '') + '。</p>'; return; }
  var f = ipState(), sel = ipSel(), GO = IP_LAYOUT.group_order;
  var authors = IDEAL.sources.map(function (x) { return x.author; });
  IDEAL.plans.forEach(function (p) { var a = String(p.author).toLowerCase(); if (authors.indexOf(a) < 0) authors.push(a); });
  function uniq(fn) { var o = []; IDEAL.plans.forEach(function (p) { var v = fn(p); if (v != null && v !== '' && o.indexOf(String(v)) < 0) o.push(String(v)); }); return o; }
  function sl(k, lab, vals, fmt, allLab) { return '<label class="fld inl">' + lab + '<select data-ipf="' + k + '">' + opt('', allLab || 'すべて', f[k]) + vals.map(function (v) { return opt(v, fmt ? fmt(v) : v, f[k]); }).join('') + '</select></label>'; }
  var base = ipBase(f), mm = IDEAL.plans.filter(function (p) { var r = ipCalc(p); return r && ipCheck(p, r).bad; }).length;
  /* 2) 人数＋詳細フィルター */
  var h = '<p class="note">' + IDEAL.plans.length + '件（' + IDEAL.sources.map(function (x) { return esc(auLbl(x.author)) + ' ' + x.count + '・' + esc(x.generated || '日付不明'); }).join('／') + '）・今のデータで再計算・作成者の合計と不一致 ' + mm + '件</p>'
    + '<div class="ip-ppl" role="radiogroup" aria-label="人数">' + ['1', '2', '4'].map(function (n) { return '<button type="button" class="seg' + (f.n === n ? ' on' : '') + '" role="radio" aria-checked="' + (f.n === n) + '" data-act="ip-n" data-v="' + n + '">' + ic('users', 'ic sm') + n + '人</button>'; }).join('')
    + '<span class="note ip-inh">' + (f.inh === 'none' ? '1人の候補を表示中' : f.inh ? esc(f.inh) + 'を引き継ぎ' : '') + '</span></div>'
    + '<div class="ip-f">' + sl('rd', '帰る日', uniq(function (p) { return (p.tags || {}).return_day; })) + sl('au', '作成者', authors, auLbl, '両方') + sl('fs', '日程', uniq(function (p) { return (p.tags || {}).status; }))
    + '<label class="fld inl">並び<select data-ipf="sort">' + opt('rec', 'おすすめ順', f.sort) + opt('price', '安い順', f.sort) + opt('ret_early', '帰着が早い順', f.sort) + opt('ret_late', '帰着が遅い順', f.sort) + opt('author', '作成者順', f.sort) + '</select></label>'
    + '<div class="ip-view" role="radiogroup" aria-label="表示">' + [['merged', '統合'], ['author', '作成者で比較']].map(function (x) { return '<button type="button" class="seg' + (f.view === x[0] ? ' on' : '') + '" role="radio" aria-checked="' + (f.view === x[0]) + '" data-act="ip-view" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
  var act = [];
  if (f.rd) act.push(['rd', '帰り：' + f.rd]); if (f.au) act.push(['au', '作成者：' + auLbl(f.au)]); if (f.fs) act.push(['fs', '日程：' + f.fs]);
  if (f.cs) act.push(['cs', '方針：' + f.cs]); if (f.ca) act.push(['ca', '入り方：' + f.ca]);
  if (act.length) h += '<div class="lx-active" aria-label="使っている条件">' + act.map(function (x) { return '<button type="button" class="chip on" data-act="ip-rmf" data-k="' + x[0] + '">' + esc(x[1]) + ic('x', 'ic sm') + '<span class="sr">を外す</span></button>'; }).join('') + '<button type="button" class="btn sm" data-act="ip-reset">すべて外す</button></div>';
  /* 3) まず見る3プラン */
  var reps = ipReps(base);
  h += '<section class="ip-reps" aria-labelledby="ip-reps-h"><h3 id="ip-reps-h">まず見る3プラン<small>' + f.n + '人</small></h3>'
    + (reps.some(function (x) { return x.p; }) ? '<div class="ip-grid ip-g3">' + reps.map(function (x) { return x.p ? ipCard(x.p, sel.indexOf(x.p.id) >= 0).replace('<article class="ip', '<article data-rep="' + esc(x.s) + '" class="ip') : '<div class="ip-empty" data-rep="' + esc(x.s) + '"><b>' + esc(x.s) + '</b><p class="note">この条件で適合する案なし</p></div>'; }).join('') + '</div>' : '<p class="note">この条件で適合する案なし</p>') + '</section>';
  /* 4) 全プランを探す：方針×入り方 */
  var rows = GO.strategy.filter(function (s) { return base.some(function (p) { return ipStrat(p) === s; }) || s !== 'その他'; }), cols = GO.arrival;
  function cnt(s, a) { return base.filter(function (p) { return (!s || ipStrat(p) === s) && (!a || (p.tags || {}).arrival === a); }).length; }
  function cellBtn(s, a, lab) { var n = cnt(s, a), on = f.cs === s && f.ca === a; return '<button type="button" class="mx-c' + (on ? ' on' : '') + '" data-act="ip-cell" data-cs="' + esc(s) + '" data-ca="' + esc(a) + '" aria-pressed="' + on + '"' + (n ? '' : ' disabled') + '>' + (lab ? '<span>' + esc(lab) + '</span>' : '') + '<b>' + n + '</b><small>件</small></button>'; }
  var mx = '<div class="tw mx-w"><table class="mx" aria-label="方針×入り方の件数"><thead><tr><th scope="col">方針＼入り方</th>' + cols.map(function (a) { return '<th scope="col">' + esc(a) + '</th>'; }).join('') + '<th scope="col">計</th></tr></thead><tbody>'
    + rows.map(function (s) { return '<tr><th scope="row">' + esc(s) + '</th>' + cols.map(function (a) { return '<td>' + cellBtn(s, a) + '</td>'; }).join('') + '<td>' + cellBtn(s, '') + '</td></tr>'; }).join('')
    + '<tr><th scope="row">計</th>' + cols.map(function (a) { return '<td>' + cellBtn('', a) + '</td>'; }).join('') + '<td>' + cellBtn('', '') + '</td></tr></tbody></table></div>';
  var tabs = '<div class="mx-m"><div class="tabs" role="tablist" aria-label="方針">' + [''].concat(rows).map(function (s) { var on = f.cs === s; return '<button type="button" role="tab" aria-selected="' + on + '" class="tab' + (on ? ' on' : '') + '" data-act="ip-cell" data-cs="' + esc(s) + '" data-ca="' + esc(f.ca) + '">' + (s || 'すべて') + '<small>' + cnt(s, f.ca) + '</small></button>'; }).join('') + '</div>'
    + '<div class="ip-view segs" role="radiogroup" aria-label="入り方">' + [''].concat(cols).map(function (a) { var on = f.ca === a; return '<button type="button" class="seg' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="ip-cell" data-cs="' + esc(f.cs) + '" data-ca="' + esc(a) + '">' + (a === '当日入り' ? '当日' : a || 'すべて') + '</button>'; }).join('') + '</div></div>';
  var list = ipSort(base.filter(function (p) { return (!f.cs || ipStrat(p) === f.cs) && (!f.ca || (p.tags || {}).arrival === f.ca); }), f.sort);
  var body = !list.length ? '<p class="note">該当するおすすめプランなし。</p>' : f.view === 'author' ? ipByAuthor(list, authors, sel) : '<div class="ip-grid">' + list.map(function (p) { return ipCard(p, sel.indexOf(p.id) >= 0); }).join('') + '</div>';
  h += '<details class="ip-all"' + (f.open ? ' open' : '') + '><summary><span>全プランを探す</span><small>' + base.length + '件</small></summary><div class="db">' + mx + tabs
    + '<p class="note ip-cnt" role="status" aria-live="polite">' + (f.cs || 'すべての方針') + '・' + (f.ca || 'すべての入り方') + '：' + list.length + '件' + (sel.length ? '・比較中 ' + sel.length + '件' : '') + '</p>' + body + '</div></details>';
  el.innerHTML = h;
}
function renderSaved(saved, hid) {
  var el = $('#saved-app'); if (!el) return;
  if (!saved.length) { el.innerHTML = '<p class="note">保存なし。<a href="' + ROOT + '">プラン作成</a>で「比較に保存」（最大' + MAXSAVE + '件）。</p>'; return; }
  el.innerHTML = '<ul class="sv-list">' + saved.map(function (x, i) { var r = calc(parseQ(x.q)), on = hid.indexOf(x.q) < 0;
    return '<li class="sv"><div class="sv-b"><b>' + esc(x.name) + '</b><small>' + r.s.n + '人・' + md(r.s.ci) + '–' + md(r.s.co) + '・' + esc(lodName(r)) + '</small></div><span class="sv-p">' + totalTxt(r) + '<small>/人</small></span>'
      + '<div class="btns"><label class="chip"><input type="checkbox" data-act="sv-show" value="' + esc(x.q) + '"' + (on ? ' checked' : '') + '>表に出す</label><button type="button" class="btn" data-act="cmp-edit" data-i="' + i + '">編集</button><button type="button" class="btn" data-act="cmp-del" data-i="' + i + '">' + ic('trash-2') + '削除</button></div></li>'; }).join('') + '</ul>';
}
function renderCompare() {
  renderIdeal();
  var saved = lsGet(LS.saved, []), el = $('#compare-app'), hid = lsGet(LS.shide, []);
  renderSaved(saved, hid);
  var cols = saved.map(function (x, i) { return {name: x.name, q: x.q, kind: 'saved', i: i}; }).filter(function (x) { return hid.indexOf(x.q) < 0; }).concat(ipSel().map(function (id) { var p = ipByID(id); return {name: p.title || p.id, q: p.site_q, kind: 'ideal', id: id, p: p}; }));
  if (!cols.length) { el.innerHTML = '<div class="empty cmp-empty">' + ic('scale') + '<p><b>比較するプランなし</b></p><ol><li><a href="#ip-h">おすすめプラン</a>で「比較に追加」</li><li><a href="' + ROOT + '">プラン作成</a>で「比較に保存」（最大' + MAXSAVE + '件）</li>' + (saved.length ? '<li><a href="#sv-h">保存したプラン</a>で「表に出す」</li>' : '') + '</ol></div>'; return; }
  var rs = cols.map(function (x) { return calc(parseQ(x.q)); });
  /* 最安は「人数が同じ・料金がすべて分かる・日程が成立」のプランが2つ以上あるときだけ */
  /* 人数・泊数が違うプランどうしで最安を付けない */
  var comp = rs.filter(function (r) { return !r.unkPrice.length && r.v.lv !== 'no' && r.s.n === rs[0].s.n && r.nights.length === rs[0].nights.length; });
  var sameN = rs.every(function (r) { return r.s.n === rs[0].s.n && r.nights.length === rs[0].nights.length; });
  var minMid = comp.length >= 2 && sameN ? Math.min.apply(null, comp.map(function (r) { return r.mid; })) : null;
  var kms = rs.map(function (r) { return r.km; }).filter(function (x) { return x != null; }), minKm = kms.length ? Math.min.apply(null, kms) : null;
  function cells(fn) { return rs.map(function (r, i) { return '<td>' + fn(r, i) + '</td>'; }).join(''); }
  function row(lab, fn, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th>' + lab + '</th>' + cells(fn) + '</tr>'; }
  var nIdeal = cols.filter(function (x) { return x.kind === 'ideal'; }).length;
  var mixP = rs.some(function (r) { return r.s.n !== rs[0].s.n; }), mixN = rs.some(function (r) { return r.nights.length !== rs[0].nights.length; });
  var chips = '<span class="tag">比較中' + cols.length + '件（保存' + (cols.length - nIdeal) + '/' + MAXSAVE + (nIdeal ? '・おすすめ' + nIdeal : '') + '）</span><span class="tag">基準：' + esc(cols[0].name) + '</span>'
    + (mixP ? '<span class="tag x">人数混在</span>' : '') + (mixN ? '<span class="tag x">泊数混在</span>' : '') + (minMid == null && rs.length > 1 ? '<span class="tag x">最安判定なし</span>' : '');
  var why = minMid == null && rs.length > 1 ? (mixP || mixN ? (mixP ? '人数' : '') + (mixP && mixN ? '・' : '') + (mixN ? '泊数' : '') + 'が違うため最安を付けない。' : '料金が全部分かり日程が成立する案が2件未満のため最安を付けない。') : '';
  var h = '<div class="cmp-chips">' + chips + '</div><p class="note cmp-why">差額は「' + esc(cols[0].name) + '」との比較。' + why + '</p>'
    + '<details class="cmp-wrap" open><summary><span class="cw-o">比較表を閉じる</span><span class="cw-c">比較表を開く</span><span>（' + cols.length + '件）</span></summary><p class="cmp-pos" aria-live="polite"></p><div class="tw cmp-tw"><table class="cmp-t cmp-main" style="--nc:' + cols.length + '"><colgroup><col class="c-l">' + cols.map(function () { return '<col class="c-p">'; }).join('') + '</colgroup><thead><tr><th></th>'
    + cols.map(function (x, i) { var r = rs[i]; return '<th scope="col"><span class="th-b">' + (i === 0 ? '<span class="lbl c-base">基準</span>' : '') + (r.v.lv === 'no' ? '<span class="lbl c-old">日程不成立</span>' : '') + (x.kind === 'ideal' ? '<span class="lbl c-date">' + esc(auLbl(x.p.author)) + '案</span>' : '') + (minMid != null && !r.unkPrice.length && r.mid === minMid ? '<span class="lbl c-date">最安</span>' : '') + (minKm != null && r.km === minKm ? '<span class="lbl c-est" title="会場まで最短">最短<span class="sr">（会場まで最短）</span></span>' : '') + '</span><span class="th-n">' + esc(x.name) + '</span></th>'; }).join('') + '</tr></thead><tbody>'
    + row('1人あたり', function (r) { return '<b>' + totalTxt(r) + '</b>'; })
    + row(rs[0].s.n === rs[rs.length - 1].s.n ? 'グループ合計' : '人数分の合計', function (r) { return totalTxt(r, true) + '<small>' + r.s.n + '人</small>'; })
    + (nIdeal ? row('作成者の合計', function (r, i) { var x = cols[i]; if (x.kind !== 'ideal') return '—'; var ck = ipCheck(x.p, r); return esc((x.p.totals || {}).display_pp || '不明') + (ck.bad ? '<span class="lbl c-unv">不一致</span><small>' + ck.why.map(esc).join('・') + '</small>' : '<span class="lbl c-ok">一致</span>'); }) : '')
    + row('差額', function (r, i) { return i ? dlt(deltaOf(rs[0], r)) : '基準'; })
    + row('日程', function (r) { return '<span class="vchip v-' + r.v.lv + '">' + VLBL[r.v.lv] + '</span>'; })
    + row('参加できる日', function (r) { return daysTxt(r.it) + '<small>' + Math.round(r.it.hours) + '時間</small>'; })
    + row('便', function (r) { return esc(flShort(FBY[r.s.f])) + '<small>' + esc(flShort(FBY[r.s.r])) + '</small>'; })
    + row('宿', function (r) { return esc(lodName(r)) + '<small>' + r.nights.length + '泊（' + md(r.s.ci) + '–' + md(r.s.co) + '）</small>'; })
    + row('会場まで', function (r) { return r.km != null ? '直線' + r.km.toFixed(1) + 'km' : '不明'; })
    + row('人数', function (r) { return r.fit === true ? '適合' : r.fit === false ? '<em>入らない</em>' : '未確認'; })
    + row('料金未確認', function (r) { return r.unk.length ? '<span class="lbl c-unv">' + r.unk.join('・') + '</span>' : 'なし'; })
    + (nIdeal ? row('要確認（作成者）', function (r, i) { var x = cols[i]; if (x.kind !== 'ideal') return '—'; var fz = x.p.feasibility || {}, u = x.p.unconfirmed || []; return fzLbl(x.p) + txtList(x.p.note).map(function (t) { return '<small>注記：' + esc(t) + '</small>'; }).join('') + (fz.notes || []).concat(u).map(function (t) { return '<small>' + esc(typeof t === 'string' ? t : JSON.stringify(t)) + '</small>'; }).join(''); }) : '')
    + row('料金の確認日', function (r) { var s = partsMeta([].concat.apply([], r.blocks.map(function (b) { return b.q ? b.q.parts : []; }))).seen; return s.length ? md(s[0]) + (stale(s[0]) ? '<span class="lbl c-old">要再確認</span>' : '') : '不明'; })
    + row('', function (r, i) { var x = cols[i]; return x.kind === 'ideal' ? '<div class="btns"><button type="button" class="btn" data-act="ip-open" data-id="' + esc(x.id) + '">プランビルダーで開く</button><button type="button" class="btn" data-act="ip-rm" data-id="' + esc(x.id) + '">' + ic('x') + '外す</button></div>'
      : '<div class="btns"><button type="button" class="btn" data-act="cmp-edit" data-i="' + x.i + '">編集</button><button type="button" class="btn" data-act="cmp-del" data-i="' + x.i + '">' + ic('trash-2') + '削除</button></div>'; })
    + '</tbody></table></div></details>'
    + '<details class="ctl"><summary>費用の内訳（1人あたり）</summary><div class="db tw"><table class="cmp-t"><thead><tr><th></th>' + cols.map(function (x) { return '<th>' + esc(x.name) + '</th>'; }).join('') + '</tr></thead><tbody>'
    + row('航空券', function (r) { return r.fare.v != null ? money(r.fare.v) : '未確認'; })
    + row('宿泊', function (r) { return r.unknown.length ? (r.total ? money(Math.round(r.lodPP)) + '＋未確認' : '未確認') : money(Math.round(r.lodPP)); })
    + row('空港移動', function (r) { return r.tin.lo != null && r.tout.lo != null ? range(r.tin.lo + r.tout.lo, r.tin.hi + r.tout.hi) : '一部未確認'; })
    + row('市内交通・その他', function (r) { return money(r.loc + r.oth); })
    + '</tbody></table></div></details>'
    + '<p class="links"><a class="btn" href="' + ROOT + '#checklist">' + ic('list-checks') + '予約前チェック</a></p>';
  el.innerHTML = h;
  scrollCue(el);
}
/* 横スクロールできる表に「横にスクロール」の手がかりを付ける */
function scrollCue(root) {
  $$('.tw', root).forEach(function (w) {
    var over = w.scrollWidth > w.clientWidth + 2;
    w.classList.toggle('xs-over', over);
    var cue = w.previousElementSibling && w.previousElementSibling.classList.contains('xcue') ? w.previousElementSibling : null;
    if (over && !cue) { cue = document.createElement('p'); cue.className = 'xcue'; cue.innerHTML = ic('move-horizontal', 'ic sm') + '横にスクロールできます'; w.parentNode.insertBefore(cue, w); }
    if (!over && cue) cue.remove();
    var pos = w.classList.contains('cmp-tw') ? $('.cmp-pos', root) : null;
    function upd() { w.classList.toggle('xs-end', w.scrollLeft + w.clientWidth >= w.scrollWidth - 2);
      if (pos) { var cs = $$('thead th[scope=col]', w), lab = cs.length ? w.querySelector('thead th').getBoundingClientRect().right : 0, wr = w.getBoundingClientRect().right, first = 0, last = 0;
        cs.forEach(function (c, i) { var b = c.getBoundingClientRect(); if (b.right > lab + 40 && !first) first = i + 1; if (b.left < wr - 40) last = i + 1; });
        pos.textContent = over ? (first === last || !last ? (first || 1) : first + '–' + last) + ' / ' + cs.length + '件表示中' : ''; } }
    w.onscroll = upd; upd();
  });
}

/* ---------- ガイド ---------- */
var gmap = null;
function initMap() {
  if (gmap || !window.L || !document.getElementById('map')) return;
  gmap = L.map('map', {scrollWheelZoom: false}).setView([42.355, -71.07], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(gmap);
  var C = {venue: '#c8102e', hostel: '#1f3a5f', hotel: '#2a8c82', airbnb: '#e07a00', poi: '#6b7280'}, b = [];
  (window.MAP_POINTS || []).forEach(function (p) {
    var big = p.c === 'venue';
    var mk = L.circleMarker([p.lat, p.lon], {radius: big ? 10 : 6, color: '#fff', weight: 2, fillColor: C[p.c], fillOpacity: .95}).addTo(gmap);
    var dv = document.createElement('div'), t = document.createElement('a'); t.href = p.u; t.target = '_blank'; t.rel = 'noopener'; t.textContent = p.n; dv.appendChild(t);
    if (p.p) { var s = document.createElement('div'); s.textContent = p.p; dv.appendChild(s); }
    mk.bindPopup(dv); if (big) mk.bindTooltip('会場', {permanent: true, direction: 'right', className: 'vtip'});
    b.push([p.lat, p.lon]);
  });
  if (b.length) gmap.fitBounds(b, {padding: [18, 18]});
}
function guideMapWhenVisible() {
  var m = document.getElementById('map'); if (!m) return;
  function tryInit() { var d = m.closest('details'); if ((!d || d.open) && window.L) { initMap(); if (gmap) setTimeout(function () { gmap.invalidateSize(); }, 60); } }
  document.addEventListener('toggle', tryInit, true);
  window.addEventListener('load', tryInit);
  tryInit();
}

/* ---------- 操作 ---------- */
function rerender(keep) {
  navCount();
  if (PAGE === 'planner') renderPlanner();
  else if (PAGE === 'stays') renderStays(keep);
  else if (PAGE === 'stay') renderStayDetail();
  else if (PAGE === 'compare') renderCompare();
}
function setK(k, t) {
  if (k === 'n') st.n = +t.value;
  else if (k === 'sw') st.sw = +t.value;
  else if (t.type === 'checkbox') st[k] = t.checked ? 1 : 0;
  else st[k] = t.value;
  if (k === 'ci' && st.co <= st.ci) st.co = addD(st.ci, 1);
  if (k === 'n' || k === 'b') UI.saveMsg = '';
}
function onChange(e) {
  var t = e.target;
  if (t.dataset.ipf) { ipSet(t.dataset.ipf, t.value); rerender(); return; }
  if (t.dataset.act === 'sv-show') { var hd = lsGet(LS.shide, []).filter(function (x) { return x !== t.value; }); if (!t.checked) hd.push(t.value); lsSet(LS.shide, hd); rerender(); return; }
  if (t.dataset.act === 'ip-cmp') { var sl0 = lsGet(LS.ipsel, []).filter(function (x) { return x !== t.value; }); if (t.checked) sl0.push(t.value); lsSet(LS.ipsel, sl0); rerender(); return; }
  if (t.dataset.k) { setK(t.dataset.k, t); UI.saveMsg = ''; persist(); rerender(); return; }
  if (t.dataset.f) {
    var f = t.dataset.f;
    if (f === 'ty' || f === 'ft') F[f] = $$('[data-f="' + f + '"]:checked').map(function (x) { return x.value; });
    else if (t.type === 'checkbox') F[f] = t.checked ? 1 : 0;
    else F[f] = t.value;
    lsSet(LS.filt, F); renderStays(true); return;
  }
  var act = t.dataset.act;
  if (act === 'pick') { st.c = {mode: 'same', id: t.value, room: null}; }
  else if (act === 'room') st.c.room = t.value === '' ? null : +t.value;
  else if (act === 'pick-night') { st.c.nights[t.dataset.d] = t.value ? {id: t.value, room: null} : null; }
  else if (act === 'mode') {
    var nights = nightsOf(st.ci, st.co);
    if (t.checked) { var o = {mode: 'per', nights: {}}; nights.forEach(function (d) { o.nights[d] = st.c.id ? {id: st.c.id, room: st.c.room} : null; }); st.c = o; }
    else { var first = assign(st.c, nights).find(Boolean); st.c = {mode: 'same', id: first ? first.id : '', room: first ? first.room : null}; }
  }
  else if (act === 'check') {
    var d2 = lsGet(LS.check, {}); if (t.checked) d2[t.dataset.key] = t.dataset.sig; else delete d2[t.dataset.key]; lsSet(LS.check, d2);
    renderChecklist(calc(st)); return;
  }
  else if (act === 'cmp-sort') { CMP_SORT = t.value; renderStayDetail(); return; }
  else return;
  UI.saveMsg = ''; persist(); rerender();
}
function onInput(e) { if (e.target.dataset.f === 'q') { F.q = e.target.value; lsSet(LS.filt, F); renderStays(true); } }
function goto(id) {
  if (!id) return;
  var el = document.getElementById(id); if (!el) return;
  var was = UI.sheet; closeSheet();
  var x = el; while (x) { if (x.tagName === 'DETAILS') x.open = true; x = x.parentElement; }
  setTimeout(function () {
    el.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center'});
    var f = $('select,input', el) || el; if (f.focus) f.focus({preventScroll: true});
  }, was ? 120 : 0);
}
function onClick(e) {
  var a = e.target.closest('[data-act]');
  if (!a) {
    if (!e.target.closest('.tipw')) $$('.tip[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    return;
  }
  var act = a.dataset.act;
  if (act === 'tip') { var on = a.getAttribute('aria-expanded') !== 'true'; $$('.tip[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); a.setAttribute('aria-expanded', on ? 'true' : 'false'); return; }
  if (act === 'goto') { e.preventDefault(); goto(a.dataset.tgt); return; }
  if (act === 'sheet-open') { openSheet(); return; }
  if (act === 'sheet-close') { closeSheet(); return; }
  if (act === 'find') { if (a.dataset.night) sessionStorage.setItem(LS.target, a.dataset.night); else sessionStorage.removeItem(LS.target); return; }
  if (act === 'open-all' || act === 'close-all') { $$('details').forEach(function (d) { d.open = act === 'open-all'; }); return; }
  if (act === 'ack') { var ack = lsGet(LS.ack, {}), key = a.dataset.key + '|' + sigOf(calc(st).s); if (ack[key]) delete ack[key]; else ack[key] = 1; lsSet(LS.ack, ack); rerender(); return; }
  if (act === 'save-plan') { savePlan(); renderPlanner(); return; }
  if (act === 'load-sg') { var SG = suggestions(), sg = a.dataset.i === 'alt' ? (SG.alt ? [0, 0, 0, SG.alt] : null) : SG.list[+a.dataset.i]; if (sg) { st = clone(sg[3].s); UI.saveMsg = ''; persist(); rerender(); window.scrollTo({top: 0, behavior: 'smooth'}); } return; }
  if (act === 'pick-rt') { st.f = a.dataset.o; st.r = a.dataset.r; persist(); rerender(); return; }
  if (act === 'pick-flight') { e.preventDefault(); st[a.dataset.dir === 'outbound' ? 'f' : 'r'] = a.dataset.id; persist(); rerender(); return; }
  if (act === 'to-plan') { putInPlan(a.dataset.id, null); location.href = ROOT; return; }
  if (act === 'use-room') { st.c = {mode: 'same', id: META.stay, room: +a.dataset.ri}; sessionStorage.removeItem(LS.target); persist(); rerender(); return; }
  if (act === 'reset-f') { F = fdef(); lsSet(LS.filt, F); renderStays(); return; }
  if (act === 'ip-open') { var ipp = ipByID(a.dataset.id); if (ipp && !(ipp.broken || []).length) { lsSet(LS.plan, {v: SCHEMA, q: ipp.site_q}); lsSet(LS.derived, {from: ipp.id, title: ipTitle(ipp), author: auLbl(ipp.author), q: ipp.site_q}); location.href = ROOT + '#/?' + ipp.site_q; } return; }
  if (act === 'ip-rm') { lsSet(LS.ipsel, lsGet(LS.ipsel, []).filter(function (x) { return x !== a.dataset.id; })); rerender(); return; }
  if (act === 'ip-reset') { ['rd', 'au', 'fs', 'cs', 'ca'].forEach(function (k) { ipSet(k, ''); }); rerender(); return; }
  if (act === 'ip-n') { ipSet('n', a.dataset.v); rerender(); return; }
  if (act === 'ip-view') { ipSet('view', a.dataset.v); ipSet('open', true); rerender(); return; }
  if (act === 'ip-cell') { ipSet('cs', a.dataset.cs); ipSet('ca', a.dataset.ca); ipSet('open', true); rerender(); var lst = $('.ip-cnt'); if (lst && a.classList.contains('mx-c')) lst.scrollIntoView({block: 'nearest'}); return; }
  if (act === 'ip-rmf') { ipSet(a.dataset.k, ''); rerender(); return; }
  if (act === 'drv-x') { lsSet(LS.derived, null); renderPlanner(); return; }
  if (act === 'fchip') { var fd = $('.lx-f'); if (fd) { if (fd.open && UI.fRow === a.dataset.row) { fd.open = false; UI.fRow = null; Array.prototype.forEach.call(document.querySelectorAll('.fc'), function (b) { b.setAttribute('aria-expanded', 'false'); }); return; } UI.fRow = a.dataset.row; fd.open = true; Array.prototype.forEach.call(document.querySelectorAll('.fc'), function (b) { b.setAttribute('aria-expanded', 'true'); }); var row = document.getElementById(a.dataset.row); if (row) { row.scrollIntoView({block: 'nearest'}); var fe = $('select,input', row); if (fe) fe.focus(); } } return; }
  if (act === 'frm') { var key = a.dataset.key, val = a.dataset.val; if (key === 'ty' || key === 'ft') F[key] = F[key].filter(function (x) { return x !== val; }); else if (key === 'unk') F.unk = 1; else if (key === 'fit' || key === 'ex') F[key] = 0; else F[key] = ''; lsSet(LS.filt, F); renderStays(); var nx = $('.lx-active .rm') || $('.lx-chips .fc'); if (nx) nx.focus(); return; }
  if (act === 'back-list') { if (document.referrer && document.referrer.indexOf('/stays/') >= 0 && /\/stays\/(\?|#|$)/.test(document.referrer.replace(location.origin, '')) && history.length > 1) { e.preventDefault(); history.back(); } return; }
  if (act === 'cmp-edit') { var sv = lsGet(LS.saved, [])[+a.dataset.i]; if (sv) { lsSet(LS.plan, {v: SCHEMA, q: sv.q}); location.href = ROOT; } return; }
  if (act === 'cmp-del') { var arr = lsGet(LS.saved, []); arr.splice(+a.dataset.i, 1); lsSet(LS.saved, arr); rerender(); return; }
}

/* ---------- 起動 ---------- */
/* 旧URL（#/stay/<id>）は静的な詳細ページへ */
function oldStayRedirect() {
  var m = (location.hash || '').match(/^#\/stay\/([^?]+)/);
  if (!m) return false;
  var id = decodeURIComponent(m[1]), q = location.hash.split('?')[1];
  if (q && q.indexOf('n=') >= 0 && q.indexOf('f=') >= 0) { try { localStorage.setItem(LS.plan, JSON.stringify({v: SCHEMA, q: q})); } catch (x) { /* 保存できなくても移動する */ } }
  location.replace(ROOT + 'stays/' + encodeURIComponent(id) + '/');
  return true;
}
function getJSON(u) { return fetch(u, {cache: 'no-cache'}).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }); }
function start() {
  document.addEventListener('click', onClick);
  /* 下部ドック：上段（概算・内訳）と下段（ナビ） */
  if (PAGE === 'stays') window.addEventListener('pagehide', function () { sessionStorage.setItem('bcf26.staysY', String(Math.round(window.scrollY))); });
  var dock = $('#dock'), mb0 = $('#mbar'); if (dock && mb0) dock.insertBefore(mb0, dock.firstChild);
  /* 固定UI（ナビ＋ドック）の実高さ＋16px をページ下の余白にする（safe-area 込み） */
  if (dock) { var setDock = function () { var h = window.matchMedia('(max-width:860px)').matches || window.matchMedia('(max-width:980px)').matches ? Math.ceil(dock.getBoundingClientRect().height) : 0; document.body.style.setProperty('--dock-h', h + 'px'); };
    if (window.ResizeObserver) new ResizeObserver(setDock).observe(dock); window.addEventListener('resize', setDock); setDock();
    /* キーボード表示中はドックを隠して入力欄と重ねない */
    if (window.visualViewport) visualViewport.addEventListener('resize', function () { document.body.classList.toggle('kb-open', window.innerHeight - visualViewport.height > 150); });
    document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input[type=number],input[type=search],input[type=text]')) document.body.classList.add('kb-focus'); });
    document.addEventListener('focusout', function () { document.body.classList.remove('kb-focus'); }); }
  navCount();
  if (PAGE === 'guide') { guideMapWhenVisible(); return; }
  if (PAGE === 'planner' && oldStayRedirect()) return;
  Promise.all([getJSON(ROOT + 'data/lodging_db.json'), getJSON(ROOT + 'data/trip.json'), getJSON(ROOT + 'data/flights_db.json'), PAGE === 'compare' ? getJSON(ROOT + 'data/ideal_plans.json').catch(function (e) { return {plans: [], sources: [], error: e.message}; }) : null]).then(function (res) {
    IDEAL = res[3] || {plans: [], sources: []};
    var d = res[0];
    DB = (Array.isArray(d) ? d : d.properties || d.lodging || d.lodgings || []).filter(function (p) { return p && p.id && p.name; });
    DB.forEach(function (p) { p.rooms = Array.isArray(p.rooms) ? p.rooms : []; BY[p.id] = p; });
    HASREV = DB.some(function (p) { return p.reviews_info; });
    TRIP = res[1];
    var fd = res[2];
    RTQ = (fd && Array.isArray(fd.rt_quotes) ? fd.rt_quotes : []).filter(function (q) { return q && q.outbound_id && q.return_id && num(q.price) != null; });
    FL = (Array.isArray(fd) ? fd : fd.flights || []).filter(function (f) { return f && f.id && f.date && (f.direction === 'outbound' || f.direction === 'return'); });
    FL.forEach(function (f) { f.fares = Array.isArray(f.fares) ? f.fares : []; FBY[f.id] = f; });
    FL.sort(function (a, b) { return (a.date + (a.depart_time ? pad(a.depart_time) : '99')).localeCompare(b.date + (b.depart_time ? pad(b.depart_time) : '99')); });
    st = loadPlan();
    persist();
    rerender();
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('toggle', function (e) { fillFareRow(e.target); }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); $$('.tip[aria-expanded="true"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); }); } });
    document.addEventListener('toggle', function (e) { var d = e.target; if (d.classList && d.classList.contains('ip-all') && !!lsGet(IPF2, {}).open !== d.open) ipSet('open', d.open); }, true);
    window.addEventListener('popstate', function () { if (UI.sheet) closeSheet(true); });
    window.addEventListener('hashchange', function () { if (UI.skipHash) { UI.skipHash = false; if (PAGE === 'planner') history.replaceState(null, '', '#/?' + toQ(st)); return; } if (PAGE === 'planner' && oldStayRedirect()) return; if (PAGE === 'planner' && location.hash.indexOf('#/?') === 0) { st = loadPlan(); persist(); rerender(); } else if (PAGE === 'planner' && location.hash.length > 1 && location.hash.indexOf('#/') !== 0) goto(location.hash.slice(1)); });
    window.addEventListener('storage', function (e) { if (e.key === LS.saved || e.key === LS.plan) { if (e.key === LS.plan) st = loadPlan(); rerender(); } });
    if (PAGE === 'planner' && location.hash.length > 1 && location.hash.indexOf('#/') !== 0) { var anc = location.hash.slice(1); history.replaceState(null, '', '#/?' + toQ(st)); setTimeout(function () { goto(anc); }, 50); }
  }).catch(function (err) {
    var msg = '<p class="note">データを読み込めなかった（' + esc(err.message) + '）。ローカルで見るときは <code>python3 -m http.server</code> などで配信して開く。</p>';
    ['#plan-inputs', '#stays-app', '#compare-app', '#stay-plan'].forEach(function (s) { var el = $(s); if (el) el.innerHTML = msg; });
    if (window.console) console.warn(err);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

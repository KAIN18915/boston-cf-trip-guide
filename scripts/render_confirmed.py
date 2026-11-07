#!/usr/bin/env python3
"""Render the booked itinerary from data/confirmed_plan.json into the static pages.

The browser also redraws #confirmed from the same JSON (assets/app.js).
Run from the repository root: python3 scripts/render_confirmed.py
"""
import datetime
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIRMED = ROOT / "data" / "confirmed_plan.json"
WD = "月火水木金土日"
FACTS = (
    "DL473",
    "23:07",
    "07:20",
    "Main Classic",
    "$468.41",
    "AS257",
    "18:04",
    "21:29",
    "Saver",
    "$308.40",
    "HI Boston Hostel",
    "19 Stuart St, Theater District",
    "男性6人ドミトリーのベッド1床",
    "16:00",
    "11:00",
    "$289.26",
    "$1,066.07",
    "確定プラン",
    "予約済み",
)


def mdw(iso):
    day = datetime.date.fromisoformat(iso)
    return f"{day.month}/{day.day}（{WD[day.weekday()]}）"


def money2(value):
    return f"${value:,.2f}"


def inner_html(plan, root):
    outbound = plan["outbound"]
    ret = plan["return"]
    stay = plan["lodging"]
    stay_href = root + "stays/" + stay["id"] + "/"
    research = root + "research-2026-11-06.html"
    return (
        '<h2><svg class="ic h" aria-hidden="true"><use href="#i-shield-check"/></svg>'
        + plan["label"]
        + ' <span class="lbl c-ok">予約済み</span></h2>'
        + "<p>"
        + plan["party_label"]
        + "。"
        + plan["event"]
        + "は "
        + mdw(plan["event_dates"]["start"])
        + "〜"
        + mdw(plan["event_dates"]["end"])
        + "。この内容が予約したプラン。ほかの金額は調査時点の見積もり。</p>"
        + '<p class="amt">'
        + money2(plan["total_usd"])
        + " <small>"
        + plan["total_includes"]
        + "</small></p>"
        + '<dl class="facts">'
        + "<div><dt>往路</dt><dd>"
        + outbound["airline"]
        + " "
        + outbound["flight_number"]
        + "・"
        + mdw(outbound["date"])
        + " "
        + outbound["depart_time"]
        + " "
        + outbound["depart_airport"]
        + "発 → "
        + mdw(outbound["arrive_date"])
        + " "
        + outbound["arrive_time"]
        + " "
        + outbound["arrive_airport"]
        + "着・直行・"
        + outbound["cabin_fare"]
        + "・"
        + money2(outbound["price_usd"])
        + "<small>変更可、払戻不可</small></dd></div>"
        + "<div><dt>復路</dt><dd>"
        + ret["airline"]
        + " "
        + ret["flight_number"]
        + "・"
        + mdw(ret["date"])
        + " "
        + ret["depart_time"]
        + " "
        + ret["depart_airport"]
        + "発 → "
        + ret["arrive_time"]
        + " "
        + ret["arrive_airport"]
        + "着・直行・"
        + ret["cabin_fare"]
        + "・"
        + money2(ret["price_usd"])
        + "</dd></div>"
        + '<div><dt>宿</dt><dd><a href="'
        + stay_href
        + '">'
        + stay["name"]
        + "</a>（"
        + stay["address"]
        + "）・"
        + stay["room"]
        + "<small>"
        + mdw(stay["check_in"])
        + " "
        + stay["check_in_from"]
        + "からチェックイン、"
        + mdw(stay["check_out"])
        + " "
        + stay["check_out_by"]
        + "までにチェックアウト・"
        + str(stay["nights"])
        + "泊・"
        + money2(stay["price_usd"])
        + "（税込、払戻不可、"
        + stay["payment"]
        + "）</small></dd></div>"
        + "</dl>"
        + '<p class="note"><a href="'
        + research
        + '">2026-11-06 調査まとめ</a>は当時の見積もり。予約した金額ではない。プラン作成の合計は調査データでの再計算で、この予約額とは別。</p>'
    )


def block(plan, root):
    return (
        "<!-- confirmed:start -->\n"
        '<section class="panel confirmed" id="confirmed" data-confirmed-mount>\n'
        + inner_html(plan, root)
        + "\n</section>\n<!-- confirmed:end -->\n"
    )


def upsert(text, plan, root, anchor):
    rendered = block(plan, root)
    if "<!-- confirmed:start -->" in text:
        return re.sub(
            r"<!-- confirmed:start -->.*?<!-- confirmed:end -->\n?",
            rendered,
            text,
            count=1,
            flags=re.S,
        )
    if anchor not in text:
        raise SystemExit("anchor missing:\n" + anchor[:120])
    return text.replace(anchor, anchor + rendered, 1)


def add_nav(text):
    pattern = re.compile(
        r'<a href="(?P<pre>\./|\.\./\.\./|\.\./)research-2026-11-06\.html"(?: aria-current=page)? title="2026-11-06 調査まとめ（航空券・ホテル）">'
    )

    def repl(match):
        pre = match.group("pre")
        window = text[max(0, match.start() - 500) : match.start()]
        if f'href="{pre}#confirmed"' in window:
            return match.group(0)
        ahead = text[match.end() : match.end() + 220]
        top = 'class="ic sm"' in ahead
        icon = "ic sm" if top else "ic"
        label = "確定プラン" if top else "<span>確定</span>"
        link = (
            f'<a href="{pre}#confirmed" title="予約済みの確定プラン">'
            f'<svg class="{icon}" aria-hidden="true"><use href="#i-shield-check"/></svg>{label}</a>'
        )
        return link + match.group(0)

    return pattern.sub(repl, text)


def wording(text):
    pairs = [
        (
            "<title>ボスキャリ2026 旅行プラン（Seattle発）</title>",
            "<title>確定プラン｜ボスキャリ2026 旅行プラン（Seattle発）</title>",
        ),
        (
            'content="ボストンキャリアフォーラム2026へシアトルから行くときの旅程・宿・費用を組み立てて比べるプランナー。"',
            'content="ボストンキャリアフォーラム2026の予約済み確定プラン（1人・DL473 / AS257 / HI Boston・合計 $1,066.07）と、調査時点の見積もり。"',
        ),
        (
            'content="2026-11-06時点のSEA→BOS航空券とボストンのホテル調査。未予約。便ごとの運賃は未確認。"',
            'content="2026-11-06時点のSEA→BOS航空券とボストンのホテル調査。当時の見積もりで、予約した金額ではない。このページの便ごとの運賃は未確認。"',
        ),
        (
            "<p>シアトル（SEA）発・ボストンキャリアフォーラム（11/20〜11/22）向け。予約はしていない。</p>",
            "<p>シアトル（SEA）発・ボストンキャリアフォーラム（11/20〜11/22）向け。2026-11-06（PST）時点の調査メモで、予約した金額ではない。</p>",
        ),
        (
            "<li><strong>航空券もホテルも予約・支払いはしていない。</strong></li>",
            "<li><strong>このページを書いた 2026-11-06 時点では予約していない。</strong>その後に予約した内容は上の確定プラン（往路 DL473、復路 AS257、HI Boston Hostel、合計 $1,066.07）。</li>",
        ),
        (
            "<li><strong>便ごとの運賃は未確認。</strong> Alaska「from $309」、Southwest「from $294」は片道の参考価格で、下の各便の運賃ではない。</li>",
            "<li><strong>このページの便ごとの運賃は未確認。</strong> Alaska「from $309」、Southwest「from $294」は片道の参考価格で、下の各便の運賃ではない。確定プランの運賃（DL473 $468.41、AS257 $308.40）とは別。</li>",
        ),
        (
            "合計は約$866（未予約）。",
            "合計は約$866（11/6時点の未予約の見積もり。確定プランの $1,066.07 とは別）。",
        ),
        (
            "市内交通・食費は含まない。未予約。",
            "市内交通・食費は含まない。11/6時点の未予約の見積もりで、確定プランとは別。",
        ),
        (
            "このページは予約しない。",
            "このページの金額は予約した金額ではない。予約した内容は上の確定プラン。",
        ),
        (
            "<span class=\"k\">予約状況：</span>未予約。",
            "<span class=\"k\">予約状況：</span>1人の確定プランは予約済み（上の確定プラン。往路 DL473、復路 AS257、HI Boston、合計 $1,066.07）。このガイドの表は調査時点の見積もり。",
        ),
        (
            '<p class="note"><a href="../research-2026-11-06.html">2026-11-06 調査まとめ（航空券・ホテル）</a>（未予約・11/6時点）</p>',
            '<p class="note"><a href="../research-2026-11-06.html">2026-11-06 調査まとめ（航空券・ホテル）</a>は11/6時点の見積もり。予約した金額ではない。</p>',
        ),
        (
            '<span><svg class="ic" aria-hidden="true"><use href="#i-calendar-days"/></svg>見積もり基準：航空券・宿とも2026/10/18（旧運賃は10/12）</span>',
            '<span><svg class="ic" aria-hidden="true"><use href="#i-shield-check"/></svg>確定プランは予約済み</span><span><svg class="ic" aria-hidden="true"><use href="#i-calendar-days"/></svg>見積もり基準：航空券・宿とも2026/10/18（旧運賃は10/12）</span>',
        ),
    ]
    for old, new in pairs:
        text = text.replace(old, new)
    return text


FLIGHT = r'''  {
   "id": "out-1118-SEABOS-2307-DL473",
   "direction": "outbound",
   "date": "2026-11-18",
   "airline": "Delta",
   "operated_by": null,
   "flight_numbers": [
    "DL 473"
   ],
   "stops": 0,
   "layovers": null,
   "depart_airport": "SEA",
   "depart_time": "23:07",
   "arrive_airport": "BOS",
   "arrive_time": "07:20",
   "duration": "5 hr 13 min",
   "aircraft": null,
   "overnight": true,
   "arrival_note": "予約済みの往路。水 11/18 23:07 SEA発、木 11/19 07:20 BOS着、直行、Main Classic、$468.41。変更可、払戻不可。",
   "alternative": false,
   "booked": true,
   "fares": [
    {
     "channel": "予約済み",
     "fare_brand": "Main Classic",
     "price": 468.41,
     "currency": "USD",
     "one_way_or_rt": "one_way",
     "bags_included": null,
     "carry_on_allowed": null,
     "change_policy": "変更可",
     "refundable": false,
     "seat_selection": null,
     "price_seen_date": null,
     "url": null,
     "confidence": "confirmed",
     "taxes_included": null,
     "taxes_note": null,
     "booked": true
    }
   ]
  },
'''


def insert_flight():
    path = ROOT / "data" / "flights_db.json"
    text = path.read_text()
    if "out-1118-SEABOS-2307-DL473" in text:
        return
    needle = '"flights": [\n'
    at = text.find(needle)
    if at < 0:
        raise SystemExit("flights array not found")
    at += len(needle)
    text = text[:at] + FLIGHT + text[at:]
    json.loads(text)
    path.write_text(text)


def main():
    plan = json.loads(CONFIRMED.read_text())
    parts = (
        plan["outbound"]["price_usd"]
        + plan["return"]["price_usd"]
        + plan["lodging"]["price_usd"]
    )
    if round(parts, 2) != plan["total_usd"]:
        raise SystemExit(f"total mismatch: {parts} != {plan['total_usd']}")
    pages = {
        ROOT / "index.html": ("./","<section class=\"panel\" id=\"research-1106\">"),
        ROOT / "research-2026-11-06.html": ("./","<main id=\"main-c\" tabindex=\"-1\" class=\"wrap\">\n"),
        ROOT / "compare" / "index.html": ("../","<main id=\"main-c\" tabindex=\"-1\" class=\"wrap\">"),
        ROOT / "guide" / "index.html": ("../","<main id=\"main-c\" tabindex=\"-1\" class=\"guide-main\">"),
        ROOT / "map" / "index.html": ("../","<main id=\"main-c\" tabindex=\"-1\" class=\"wrap guide-more map-page\">"),
        ROOT / "stays" / "hi_boston" / "index.html": ("../../","</nav>\n<div class=\"dt-grid\">"),
    }
    before_grid = {
        ROOT / "stays" / "hi_boston" / "index.html",
    }
    # index replaces the research banner rather than appending after an anchor
    index = ROOT / "index.html"
    index_text = index.read_text()
    if "<!-- confirmed:start -->" not in index_text:
        old = re.search(
            r'<section class="panel" id="research-1106">.*?</section>\n',
            index_text,
        )
        if not old:
            raise SystemExit("homepage research banner missing")
        index_text = index_text[: old.start()] + block(plan, "./") + index_text[old.end() :]
        index.write_text(index_text)
    for path, (root, anchor) in pages.items():
        if path == index:
            text = upsert(path.read_text(), plan, root, anchor)
        else:
            text = path.read_text()
            rendered = block(plan, root)
            if "<!-- confirmed:start -->" in text:
                text = upsert(text, plan, root, anchor)
            else:
                if anchor not in text:
                    raise SystemExit(f"anchor missing in {path}")
                if path in before_grid:
                    text = text.replace(anchor, "</nav>\n" + rendered + "<div class=\"dt-grid\">", 1)
                else:
                    text = text.replace(anchor, anchor + rendered, 1)
        path.write_text(wording(text))
    for path in ROOT.rglob("*.html"):
        original = path.read_text()
        updated = add_nav(original)
        if updated != original:
            path.write_text(updated)
    insert_flight()
    home = (ROOT / "index.html").read_text()
    missing = [fact for fact in FACTS if fact not in home]
    if missing:
        raise SystemExit("homepage missing " + ", ".join(missing))
    banned = ("予約はしていない", "（未予約・11/6時点）", "予約状況：</span>未予約")
    blob = "\n".join(p.read_text() for p in pages)
    for phrase in banned:
        if phrase in blob:
            raise SystemExit("contradictory phrase remains: " + phrase)
    print("rendered confirmed plan")


if __name__ == "__main__":
    main()

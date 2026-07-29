#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘의집(store.ohou.se) 상품/리뷰 1회성 수집 스크립트
=====================================================

바지 수납 정리함 카테고리 - 우리 상품 1개 + 경쟁 상품 15개(총 16개)의
판매 지표와 리뷰를 수집해 경쟁 분석용 데이터 파일을 만든다.

수집 방식
---------
오늘의집은 SPA 이므로 HTML 셀렉터보다 XHR/fetch JSON 응답을 우선 사용한다.
`page.on("response")` 로 goods 상세 API / 리뷰 API 응답을 캡처해 파싱하고,
API 캡처가 실패한 경우에만 DOM 셀렉터 + __NEXT_DATA__ / JSON-LD 로 폴백한다.

산출물 (스크립트와 같은 폴더)
-----------------------------
1. products.csv   (UTF-8 BOM, 엑셀에서 바로 열림)
2. reviews.json   (UTF-8, indent=2)
3. summary.md     (상품별 1줄 요약)
4. errors.log     (실패 URL + 원인)
5. raw_captures/  (goods 별 캡처 원본 JSON - 파싱 튜닝/검증용)

실행
----
    pip install playwright
    playwright install chromium
    python scrape_ohou.py                 # headless=False (기본, 사람이 보는 창)
    HEADLESS=1 python scrape_ohou.py      # 서버/CI 등 디스플레이 없는 환경

주의: 실행 환경에서 store.ohou.se 로 아웃바운드 접근이 가능해야 한다.
"""

import csv
import json
import os
import random
import re
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

# --------------------------------------------------------------------------- #
# 설정
# --------------------------------------------------------------------------- #

HERE = Path(__file__).resolve().parent

OUR_GOODS = "https://store.ohou.se/goods/1756806"
COMPETITOR_GOODS = [
    "https://store.ohou.se/goods/2083016",
    "https://store.ohou.se/goods/2434503",
    "https://store.ohou.se/goods/870484",
    "https://store.ohou.se/goods/2355521",
    "https://store.ohou.se/goods/1991310",
    "https://store.ohou.se/goods/1812660",
    "https://store.ohou.se/goods/1451962",
    "https://store.ohou.se/goods/1955028",
    "https://store.ohou.se/goods/1343717",
    "https://store.ohou.se/goods/1669000",
    "https://store.ohou.se/goods/1154880",
    "https://store.ohou.se/goods/1769296",
    "https://store.ohou.se/goods/1634150",
    "https://store.ohou.se/goods/2310107",
    "https://store.ohou.se/goods/2196817",
]
ALL_URLS = [OUR_GOODS] + COMPETITOR_GOODS

MAX_REVIEWS_PER_SORT = 50          # 최신순 50 + 베스트순 50
MAX_REVIEWS_TOTAL = 100            # 중복 제거 후 상품당 최대치
MAX_RETRIES = 3                    # URL 당 재시도 횟수
NAV_TIMEOUT_MS = 45_000

HEADLESS = os.environ.get("HEADLESS", "").strip() in ("1", "true", "True", "yes")

PRODUCTS_CSV = HERE / "products.csv"
REVIEWS_JSON = HERE / "reviews.json"
SUMMARY_MD = HERE / "summary.md"
ERROR_LOG = HERE / "errors.log"
RAW_DIR = HERE / "raw_captures"
RAW_DIR.mkdir(exist_ok=True)


def polite_sleep(lo=3.0, hi=5.0):
    """요청 간 3~5초 랜덤 대기 (크롤링 매너)."""
    t = random.uniform(lo, hi)
    time.sleep(t)


def log_error(url, reason):
    line = f"[{datetime.now().isoformat(timespec='seconds')}] {url}\t{reason}\n"
    with open(ERROR_LOG, "a", encoding="utf-8") as f:
        f.write(line)
    print(f"  ! ERROR logged: {reason}", flush=True)


def goods_id_from_url(url):
    m = re.search(r"/goods/(\d+)", url)
    return m.group(1) if m else url


# --------------------------------------------------------------------------- #
# JSON 탐색 유틸 - 캡처한 응답에서 필드를 유연하게 찾는다.
# 오늘의집 API 의 정확한 키 이름을 하드코딩하지 않고, 흔한 키 후보들을
# deep-search 로 매칭한다. 실제 응답 구조는 raw_captures/ 에 저장되므로
# 필요 시 아래 후보 리스트만 손봐서 정밀도를 높일 수 있다.
# --------------------------------------------------------------------------- #

def deep_find_first(obj, key_candidates, _depth=0):
    """중첩 dict/list 를 순회하며 key_candidates 중 하나에 해당하는 값을 반환."""
    if _depth > 8 or obj is None:
        return None
    if isinstance(obj, dict):
        for k in key_candidates:
            if k in obj and obj[k] not in (None, "", [], {}):
                return obj[k]
        for v in obj.values():
            r = deep_find_first(v, key_candidates, _depth + 1)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = deep_find_first(v, key_candidates, _depth + 1)
            if r is not None:
                return r
    return None


def looks_like_goods_detail(url, data, gid):
    """응답이 해당 goods 상세 payload 인지 휴리스틱 판정."""
    u = url.lower()
    if "review" in u or "comment" in u:
        return False
    if "/goods" not in u and "/production" not in u and "/api" not in u:
        return False
    if gid in u:
        return True
    # id + 이름 + 가격류 키가 함께 있으면 상세로 간주
    has_name = deep_find_first(data, ["name", "title", "goods_name", "product_name"]) is not None
    has_price = deep_find_first(data, ["price", "sell_price", "selling_price", "sale_price"]) is not None
    return bool(has_name and has_price)


def looks_like_reviews(url, data):
    u = url.lower()
    if "review" in u or "comment" in u or "card" in u:
        # 리스트 형태의 리뷰 배열을 품고 있는지 확인
        arr = extract_review_array(data)
        return bool(arr)
    return False


def extract_review_array(data):
    """응답에서 리뷰 객체 배열을 추출."""
    if isinstance(data, list) and data and isinstance(data[0], dict):
        if any(k in data[0] for k in ("star", "star_avg", "review", "comment", "contents", "rating")):
            return data
    if isinstance(data, dict):
        for k in ("reviews", "results", "data", "items", "list", "cards", "review_list"):
            v = data.get(k)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                if any(kk in v[0] for kk in ("star", "star_avg", "review", "comment",
                                             "contents", "rating", "content")):
                    return v
        # 한 단계 더 내려가서 탐색
        for v in data.values():
            if isinstance(v, (dict, list)):
                r = extract_review_array(v)
                if r:
                    return r
    return None


# --------------------------------------------------------------------------- #
# 상품 파싱
# --------------------------------------------------------------------------- #

def parse_product(gid, url, detail_payloads, page):
    """캡처한 상세 payload(우선) + DOM 폴백으로 상품 기본 정보 구성."""
    p = {
        "goods_id": gid,
        "url": url,
        "name": None,
        "brand": None,
        "sell_price": None,
        "original_price": None,
        "discount_rate": None,
        "delivery_fee": None,
        "is_free_delivery": None,
        "review_count": None,
        "rating": None,
        "scrap_count": None,
        "inquiry_count": None,
        "options": None,   # JSON 문자열
        "source": None,    # 'api' | 'dom' | 'api+dom'
    }

    # ---- 1) API payload 우선 ----
    best = None
    for pl in detail_payloads:
        if best is None:
            best = pl
        # gid 가 url 에 들어있는 payload 를 우선
        if gid in pl.get("_url", ""):
            best = pl
            break
    data = best.get("_data") if best else None

    if data is not None:
        p["name"] = deep_find_first(data, ["name", "title", "goods_name", "product_name"])
        p["brand"] = deep_find_first(data, ["brand_name", "brand", "seller_name", "store_name", "brandName"])
        p["sell_price"] = deep_find_first(data, ["sell_price", "selling_price", "sale_price", "price", "sellPrice"])
        p["original_price"] = deep_find_first(data, ["original_price", "consumer_price", "list_price",
                                                     "origin_price", "market_price", "originalPrice"])
        p["discount_rate"] = deep_find_first(data, ["discount_rate", "discount", "sale_rate", "discountRate"])
        p["review_count"] = deep_find_first(data, ["review_count", "reviews_count", "review_total",
                                                   "total_review", "reviewCount"])
        p["rating"] = deep_find_first(data, ["star_avg", "review_avg", "rating", "star_average",
                                             "avg_star", "starAvg"])
        p["scrap_count"] = deep_find_first(data, ["scrap_count", "scrapCount", "scrap", "bookmark_count",
                                                  "favorite_count"])
        p["inquiry_count"] = deep_find_first(data, ["inquiry_count", "question_count", "qna_count",
                                                    "inquiryCount"])
        # 배송비
        dfee = deep_find_first(data, ["delivery_fee", "shipping_fee", "delivery_price", "deliveryFee"])
        if dfee is not None:
            p["delivery_fee"] = dfee
            try:
                p["is_free_delivery"] = (float(dfee) == 0)
            except (TypeError, ValueError):
                pass
        # 옵션
        opts = extract_options(data)
        if opts:
            p["options"] = json.dumps(opts, ensure_ascii=False)
        p["source"] = "api"

    # ---- 2) DOM / __NEXT_DATA__ / 메타 폴백 ----
    need_dom = any(p[k] in (None, "") for k in ("name", "sell_price", "review_count", "rating"))
    if need_dom:
        dom = dom_fallback(page)
        for k, v in dom.items():
            if p.get(k) in (None, "") and v not in (None, ""):
                p[k] = v
        p["source"] = "api+dom" if p["source"] == "api" else "dom"

    # 할인율 보정 (정가/판매가로 계산 가능하면)
    if p["discount_rate"] in (None, "") and p["original_price"] and p["sell_price"]:
        try:
            o, s = float(p["original_price"]), float(p["sell_price"])
            if o > 0:
                p["discount_rate"] = round((o - s) / o * 100, 1)
        except (TypeError, ValueError):
            pass

    return p


def extract_options(data):
    """옵션 배열 -> [{name, extra_price, sold_out}] 로 정규화."""
    candidates = deep_find_first(data, ["options", "option_list", "goods_options",
                                        "product_options", "optionList"])
    if not isinstance(candidates, list):
        return None
    out = []
    for o in candidates:
        if not isinstance(o, dict):
            continue
        name = deep_find_first(o, ["name", "option_name", "title", "value"])
        extra = deep_find_first(o, ["extra_price", "additional_price", "add_price", "price",
                                    "extraPrice"])
        sold_out = deep_find_first(o, ["is_sold_out", "sold_out", "soldout", "is_soldout",
                                       "stock_out", "isSoldOut"])
        if sold_out is None:
            stock = deep_find_first(o, ["stock", "quantity", "remain"])
            if isinstance(stock, (int, float)):
                sold_out = stock <= 0
        out.append({
            "name": name,
            "extra_price": extra,
            "sold_out": bool(sold_out) if sold_out is not None else None,
        })
    return out or None


def dom_fallback(page):
    """__NEXT_DATA__ / JSON-LD / 메타 태그 / 텍스트에서 최대한 긁어온다."""
    out = {}
    # __NEXT_DATA__ (Next.js) 또는 window.__PRELOADED_STATE__ 류
    for expr in ("() => document.getElementById('__NEXT_DATA__')?.textContent",
                 "() => window.__PRELOADED_STATE__ ? JSON.stringify(window.__PRELOADED_STATE__) : null"):
        try:
            raw = page.evaluate(expr)
        except Exception:
            raw = None
        if raw:
            try:
                data = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            out.setdefault("name", deep_find_first(data, ["name", "title", "goods_name"]))
            out.setdefault("brand", deep_find_first(data, ["brand_name", "brand", "seller_name"]))
            out.setdefault("sell_price", deep_find_first(data, ["sell_price", "price", "selling_price"]))
            out.setdefault("original_price", deep_find_first(data, ["original_price", "origin_price"]))
            out.setdefault("review_count", deep_find_first(data, ["review_count", "reviews_count"]))
            out.setdefault("rating", deep_find_first(data, ["star_avg", "rating", "review_avg"]))
            out.setdefault("scrap_count", deep_find_first(data, ["scrap_count", "scrap"]))

    # JSON-LD
    try:
        lds = page.eval_on_selector_all(
            "script[type='application/ld+json']", "els => els.map(e => e.textContent)")
    except Exception:
        lds = []
    for raw in lds or []:
        try:
            ld = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue
        blocks = ld if isinstance(ld, list) else [ld]
        for b in blocks:
            if not isinstance(b, dict):
                continue
            if b.get("@type") in ("Product", "product"):
                out.setdefault("name", b.get("name"))
                brand = b.get("brand")
                if isinstance(brand, dict):
                    brand = brand.get("name")
                out.setdefault("brand", brand)
                offers = b.get("offers")
                if isinstance(offers, dict):
                    out.setdefault("sell_price", offers.get("price"))
                agg = b.get("aggregateRating")
                if isinstance(agg, dict):
                    out.setdefault("rating", agg.get("ratingValue"))
                    out.setdefault("review_count", agg.get("reviewCount"))

    # og:title 최후 폴백
    if not out.get("name"):
        try:
            out["name"] = page.get_attribute("meta[property='og:title']", "content")
        except Exception:
            pass
    return out


# --------------------------------------------------------------------------- #
# 리뷰 파싱
# --------------------------------------------------------------------------- #

def normalize_review(gid, r, has_photo_hint=None):
    def g(*keys):
        return deep_find_first(r, list(keys))
    body = g("comment", "review", "contents", "content", "body", "text")
    photos = g("images", "image_urls", "photos", "review_images", "media")
    photo = bool(photos) if photos is not None else bool(has_photo_hint)
    return {
        "goods_id": gid,
        "rating": g("star", "star_avg", "rating", "score", "star_rate"),
        "body": (body or "").strip() if isinstance(body, str) else body,
        "created_at": g("created_at", "write_date", "reg_date", "date", "created", "createdAt"),
        "option": g("option", "option_name", "selected_option", "goods_option", "productOption"),
        "helpful_count": g("helpful_count", "like_count", "recommend_count", "helpful", "likeCount"),
        "has_photo": photo,
        "_id": g("id", "review_id", "seq", "no"),
    }


def collect_reviews_via_capture(page, gid, capture_store, sort_label):
    """
    리뷰 탭으로 이동/정렬 후 스크롤 페이지네이션을 돌리며
    page.on('response') 로 쌓인 리뷰 응답에서 리뷰를 모은다.
    반환: 이 정렬에서 수집한 리뷰 리스트(정규화, 최대 MAX_REVIEWS_PER_SORT).
    """
    collected = {}
    stagnant = 0
    prev_seen = 0

    # 페이지네이션: 최대 12회 스크롤/더보기 시도 (50개 확보 목표)
    for _ in range(12):
        # 현재까지 캡처된 리뷰 응답 소진
        for item in list(capture_store["reviews"]):
            arr = extract_review_array(item["_data"])
            if not arr:
                continue
            for raw in arr:
                nr = normalize_review(gid, raw)
                key = nr["_id"] or (nr["body"], nr["created_at"])
                collected[key] = nr
        capture_store["reviews"].clear()

        if len(collected) >= MAX_REVIEWS_PER_SORT:
            break

        # 스크롤 다운으로 lazy-load 유발 + '더보기' 버튼 있으면 클릭
        try:
            page.mouse.wheel(0, 4000)
        except Exception:
            pass
        clicked = False
        for label in ("더보기", "리뷰 더보기", "더 보기"):
            try:
                btn = page.get_by_text(label, exact=False)
                if btn and btn.count() > 0:
                    btn.first.click(timeout=2500)
                    clicked = True
                    break
            except Exception:
                continue

        polite_sleep()  # 페이지네이션에도 3~5초 매너 대기

        if len(collected) == prev_seen and not clicked:
            stagnant += 1
            if stagnant >= 2:
                break
        else:
            stagnant = 0
        prev_seen = len(collected)

    reviews = list(collected.values())[:MAX_REVIEWS_PER_SORT]
    for rv in reviews:
        rv["_sort"] = sort_label
    return reviews


def try_sort_reviews(page, sort_label):
    """리뷰 정렬 버튼(최신순/베스트순)을 텍스트로 찾아 클릭."""
    labels = {
        "latest": ["최신순", "최신", "신상품순"],
        "best": ["베스트순", "베스트", "추천순", "인기순"],
    }[sort_label]
    for t in labels:
        try:
            el = page.get_by_text(t, exact=True)
            if el and el.count() > 0:
                el.first.click(timeout=2500)
                polite_sleep()
                return True
        except Exception:
            continue
    return False


def extract_keyword_summary(page):
    """'튼튼해요 90%' 같은 리뷰 키워드 요약 블록을 텍스트에서 추출."""
    try:
        texts = page.eval_on_selector_all(
            "*", "els => els.slice(0,4000).map(e => e.childElementCount===0 ? e.textContent : '')"
        )
    except Exception:
        return None
    kws = []
    seen = set()
    for t in texts or []:
        if not t:
            continue
        t = t.strip()
        m = re.match(r"^(.{2,20}?)\s*(\d{1,3})\s*%$", t)
        if m:
            kw = m.group(1).strip()
            if kw and kw not in seen and not kw.isdigit():
                seen.add(kw)
                kws.append({"keyword": kw, "percent": int(m.group(2))})
    return kws or None


# --------------------------------------------------------------------------- #
# 메인 크롤 루프
# --------------------------------------------------------------------------- #

def scrape_one(context, url):
    gid = goods_id_from_url(url)
    page = context.new_page()
    page.set_default_timeout(NAV_TIMEOUT_MS)

    capture = {"details": [], "reviews": []}

    def on_response(resp):
        try:
            ctype = resp.headers.get("content-type", "")
            if "json" not in ctype.lower():
                return
            data = resp.json()
        except Exception:
            return
        ru = resp.url
        if looks_like_reviews(ru, data):
            capture["reviews"].append({"_url": ru, "_data": data})
        elif looks_like_goods_detail(ru, data, gid):
            capture["details"].append({"_url": ru, "_data": data})

    page.on("response", on_response)

    # ---- 상세 페이지 진입 ----
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    try:
        page.wait_for_load_state("networkidle", timeout=15_000)
    except PWTimeout:
        pass
    polite_sleep()

    # 스크롤로 지연 로딩되는 상세/리뷰 섹션 유발
    for _ in range(4):
        try:
            page.mouse.wheel(0, 3000)
        except Exception:
            pass
        time.sleep(1.0)

    # ---- 원본 캡처 저장 (검증/튜닝용) ----
    raw_path = RAW_DIR / f"{gid}.json"
    try:
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(capture, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    # ---- 상품 정보 파싱 ----
    product = parse_product(gid, url, capture["details"], page)

    # ---- 리뷰 키워드 요약 ----
    keyword_summary = extract_keyword_summary(page)

    # ---- 리뷰 수집: 최신순 + 베스트순 ----
    all_reviews = {}
    for sort_label in ("latest", "best"):
        try_sort_reviews(page, sort_label)
        revs = collect_reviews_via_capture(page, gid, capture, sort_label)
        for rv in revs:
            key = rv["_id"] or (rv["body"], rv["created_at"])
            if key not in all_reviews:
                all_reviews[key] = rv
        if len(all_reviews) >= MAX_REVIEWS_TOTAL:
            break

    reviews = list(all_reviews.values())[:MAX_REVIEWS_TOTAL]
    # 내부 키 정리
    for rv in reviews:
        rv.pop("_id", None)

    page.close()
    return product, reviews, keyword_summary


def scrape_with_retries(context, url):
    gid = goods_id_from_url(url)
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"[{gid}] attempt {attempt}/{MAX_RETRIES} ...", flush=True)
            return scrape_one(context, url)
        except Exception as e:
            last_err = f"{type(e).__name__}: {e}"
            print(f"[{gid}] failed attempt {attempt}: {last_err}", flush=True)
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)  # 2s, 4s backoff
    log_error(url, f"{MAX_RETRIES}회 재시도 실패 - {last_err}")
    return None, None, None


# --------------------------------------------------------------------------- #
# 산출물 쓰기
# --------------------------------------------------------------------------- #

PRODUCT_FIELDS = [
    "goods_id", "url", "name", "brand", "sell_price", "original_price",
    "discount_rate", "delivery_fee", "is_free_delivery", "review_count",
    "rating", "scrap_count", "inquiry_count", "options", "source",
]


def write_products_csv(products):
    with open(PRODUCTS_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PRODUCT_FIELDS)
        w.writeheader()
        for p in products:
            w.writerow({k: p.get(k) for k in PRODUCT_FIELDS})


def write_reviews_json(reviews_by_goods):
    with open(REVIEWS_JSON, "w", encoding="utf-8") as f:
        json.dump(reviews_by_goods, f, ensure_ascii=False, indent=2)


def write_summary_md(rows):
    lines = ["# 오늘의집 상품 수집 요약", "",
             f"- 생성: {datetime.now().isoformat(timespec='seconds')}",
             f"- 대상: {len(ALL_URLS)}개 (우리 1 + 경쟁 {len(ALL_URLS) - 1})", "",
             "| 상품명 | 가격 | 리뷰수 | 평점 | 스크랩수 | 수집리뷰 | 결과 |",
             "|---|---|---|---|---|---|---|"]
    for r in rows:
        lines.append("| {name} | {price} | {rc} | {rating} | {scrap} | {got} | {res} |".format(
            name=(r["name"] or "-"),
            price=(r["price"] if r["price"] not in (None, "") else "-"),
            rc=(r["review_count"] if r["review_count"] not in (None, "") else "-"),
            rating=(r["rating"] if r["rating"] not in (None, "") else "-"),
            scrap=(r["scrap"] if r["scrap"] not in (None, "") else "-"),
            got=r["collected_reviews"],
            res=r["result"],
        ))
    text = "\n".join(lines) + "\n"
    with open(SUMMARY_MD, "w", encoding="utf-8") as f:
        f.write(text)
    return text


# --------------------------------------------------------------------------- #
# 엔트리포인트
# --------------------------------------------------------------------------- #

def main():
    # 새 실행마다 에러 로그 초기화
    if ERROR_LOG.exists():
        ERROR_LOG.unlink()

    print(f"오늘의집 수집 시작 - {len(ALL_URLS)}개 URL / headless={HEADLESS}\n", flush=True)

    products = []
    reviews_by_goods = {}
    summary_rows = []
    success = 0
    fail = 0

    # 브라우저 실행 옵션.
    # 보통은 `playwright install chromium` 으로 받은 기본 번들을 쓰지만,
    # CI/사전 프로비저닝 이미지처럼 별도 경로에 크로미움이 있는 경우
    # CHROME_PATH 환경변수로 실행 파일을 직접 지정할 수 있다.
    launch_kwargs = {"headless": HEADLESS}
    chrome_path = os.environ.get("CHROME_PATH", "").strip()
    if chrome_path:
        launch_kwargs["executable_path"] = chrome_path

    with sync_playwright() as pw:
        browser = pw.chromium.launch(**launch_kwargs)
        context = browser.new_context()  # Playwright 기본 UA 그대로 사용 (위장 없음)
        context.set_default_navigation_timeout(NAV_TIMEOUT_MS)

        for i, url in enumerate(ALL_URLS, 1):
            gid = goods_id_from_url(url)
            tag = "우리상품" if url == OUR_GOODS else f"경쟁{i-1}"
            print(f"\n===== ({i}/{len(ALL_URLS)}) {tag} goods {gid} =====", flush=True)

            product, reviews, kw_summary = scrape_with_retries(context, url)

            if product is None:
                fail += 1
                summary_rows.append({
                    "name": None, "price": None, "review_count": None,
                    "rating": None, "scrap": None, "collected_reviews": 0,
                    "result": "실패",
                })
                # 실패해도 전체 중단 없이 계속
            else:
                success += 1
                products.append(product)
                reviews_by_goods[gid] = {
                    "goods_id": gid,
                    "url": url,
                    "keyword_summary": kw_summary,
                    "review_count_collected": len(reviews),
                    "reviews": reviews,
                }
                summary_rows.append({
                    "name": product.get("name"),
                    "price": product.get("sell_price"),
                    "review_count": product.get("review_count"),
                    "rating": product.get("rating"),
                    "scrap": product.get("scrap_count"),
                    "collected_reviews": len(reviews),
                    "result": "성공",
                })
                print(f"  -> name={product.get('name')!r} price={product.get('sell_price')} "
                      f"reviews_collected={len(reviews)} source={product.get('source')}", flush=True)

            # 다음 URL 전 매너 대기 (마지막 제외)
            if i < len(ALL_URLS):
                polite_sleep()

        context.close()
        browser.close()

    # ---- 산출물 ----
    write_products_csv(products)
    write_reviews_json(reviews_by_goods)
    summary_text = write_summary_md(summary_rows)

    # ---- 최종 보고 ----
    print("\n" + "=" * 60, flush=True)
    print(f"완료: 성공 {success} / 실패 {fail}  (총 {len(ALL_URLS)})", flush=True)
    print(f"산출물: {PRODUCTS_CSV.name}, {REVIEWS_JSON.name}, {SUMMARY_MD.name}", flush=True)
    if ERROR_LOG.exists():
        print(f"실패 상세: {ERROR_LOG.name}", flush=True)
    print("=" * 60 + "\n", flush=True)
    print(summary_text, flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n중단됨 (KeyboardInterrupt)", flush=True)
        sys.exit(1)
    except Exception:
        traceback.print_exc()
        sys.exit(1)

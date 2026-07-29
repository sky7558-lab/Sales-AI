# 오늘의집 상품/리뷰 수집기 (1회성)

바지 수납 정리함 카테고리에서 **우리 상품 1개 + 경쟁 상품 15개(총 16개)** 의
판매 지표와 리뷰를 수집해 경쟁 분석용 데이터 파일을 만든다.

## 수집 방식

오늘의집(store.ohou.se)은 SPA 이므로 HTML 셀렉터보다 **XHR/fetch JSON 응답 캡처**를
우선 사용한다. `page.on("response")` 로 goods 상세 API / 리뷰 API 응답을 가로채
파싱하고, API 캡처 실패 시에만 DOM 셀렉터 · `__NEXT_DATA__` · JSON-LD 로 폴백한다.

## 실행 방법

```bash
cd ohou_scraper
pip install -r requirements.txt
playwright install chromium      # 최초 1회 브라우저 다운로드

python scrape_ohou.py            # 기본: headless=False (창이 보임)
HEADLESS=1 python scrape_ohou.py # 디스플레이 없는 서버/CI
```

> **네트워크 요구사항:** 실행 환경에서 `store.ohou.se` 로 아웃바운드 접근이
> 가능해야 한다. 사내/클라우드 방화벽이 외부 도메인을 막고 있으면 개인 PC 등
> 접근 가능한 환경에서 실행할 것.

### 환경변수

| 변수 | 설명 |
|---|---|
| `HEADLESS=1` | 헤드리스 실행 (기본은 창을 띄우는 `headless=False`) |
| `CHROME_PATH=/path/to/chrome` | 크로미움 실행 파일을 직접 지정 (사전 프로비저닝 이미지/CI용) |

## 산출물 (스크립트와 같은 폴더)

| 파일 | 내용 |
|---|---|
| `products.csv` | 상품 기본 정보 (UTF-8 BOM, 엑셀에서 바로 열림) |
| `reviews.json` | 상품별 리뷰 (최신순+베스트순, 중복 제거 최대 100개) + 키워드 요약 |
| `summary.md` | 상품별 1줄 요약 (상품명/가격/리뷰수/평점/스크랩수/수집리뷰/결과) |
| `errors.log` | 실패한 URL 과 원인 |
| `raw_captures/` | goods 별 캡처 원본 JSON — 파싱 검증/튜닝용 |

## 수집 항목

**products.csv**: `goods_id, url, name, brand, sell_price, original_price,
discount_rate, delivery_fee, is_free_delivery, review_count, rating,
scrap_count, inquiry_count, options(JSON 문자열), source`

**reviews.json** (상품별): 평점 · 본문 전문 · 작성일 · 선택 옵션 ·
도움돼요 수 · 포토 여부, 그리고 `keyword_summary`("튼튼해요 90%" 류 블록).

## 크롤링 매너

- 요청/페이지네이션 간 **3~5초 랜덤 대기**
- Playwright 기본 User-Agent 그대로 (위장 없음)
- **로그인 없이** 접근 가능한 범위만 수집
- URL 당 **3회 재시도**, 실패 시 건너뛰고 `errors.log` 기록 — 전체 중단 없음

## 파싱 정밀도 튜닝 (필요 시)

오늘의집의 실제 API 키 이름은 변경될 수 있어, 파서는 흔한 키 후보들을
deep-search 로 매칭하도록 설계했다. 첫 실행 후 값이 비어 있는 항목이 있으면
`raw_captures/<goods_id>.json` 에서 실제 응답 구조를 확인하고,
`scrape_ohou.py` 상단의 `deep_find_first(...)` 호출에 실제 키 이름을
후보로 추가하면 된다.

# 동업 대시보드

둘이 같이 굴리는 프로젝트의 진행 현황을 짧게 공유하고, 할 일을 함께 처리하기 위한 모바일 우선 대시보드입니다.

- **Next.js 14 + Tailwind** (App Router)
- **Supabase** 인증 + DB + RLS
- **PWA**: 아이폰 사파리에서 "홈 화면에 추가" 하면 앱처럼 동작

## 기능

- **홈 대시보드**: 전체 진행률, 오늘 마감/지난 마감, 둘의 오늘 체크인 한눈에
- **할일 (Tasks)**: 담당자/마감일/상태(대기·진행중·완료) 관리
- **체크인 (Daily/Weekly)**: 매일/매주 짧은 회고 — 한 일, 다음 할 일, 막힌 점, 컨디션
- **메모 (Notes)**: 결정·아이디어 기록, 핀 고정 가능
- **설정**: 워크스페이스 ID로 동업자 초대, 표시 이름 변경, 로그아웃

## 0. 사전 준비

- Node 18+ (권장 20+)
- [Supabase](https://supabase.com) 무료 프로젝트 (둘이 같이 쓰면 충분)

## 1. Supabase 세팅 (5분)

1. supabase.com 에서 새 프로젝트 생성
2. 좌측 **SQL Editor** → `supabase/schema.sql` 의 전체 내용을 붙여넣고 실행
3. **Authentication → Providers**: Email 켜져 있는지 확인 (기본값 ON)
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (개발), 또는 배포 후 도메인
   - Redirect URLs 에 `http://localhost:3000/auth/callback` 와 배포 도메인의 `/auth/callback` 추가
5. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사

## 2. 로컬 실행

```bash
cp .env.example .env.local
# .env.local 에 위에서 복사한 값 두 줄 입력

npm install
npm run dev
```

브라우저에서 http://localhost:3000 → 이메일 입력 → 메일함의 매직 링크 클릭하면 로그인.

## 3. 동업자 초대

1. 둘 중 한 명이 먼저 로그인 → **시작하기** 화면에서 "새로 만들기"
2. 들어간 뒤 **설정** 탭에서 "공유 ID" 복사 → 동업자에게 카톡 등으로 전송
3. 동업자가 로그인 → **시작하기** 화면에서 "ID로 참여" → 받은 ID 붙여넣기
4. 끝. 두 사람의 데이터가 한 워크스페이스에서 공유됩니다.

## 4. 아이폰 홈 화면에 추가

1. 사파리로 배포된 URL 접속
2. 공유 버튼 (네모+화살표) → "홈 화면에 추가"
3. 홈 화면에서 아이콘을 누르면 풀스크린 앱처럼 실행됨

## 5. 배포 (Vercel, 무료)

```bash
npm i -g vercel
vercel
```

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 환경변수 두 개 등록
- 배포 후 Supabase 의 **Site URL / Redirect URLs** 에 배포 도메인 추가하는 거 잊지 말기

## 디렉터리 구조

```
src/
  app/
    (app)/             # 로그인 필요한 모든 페이지
      page.tsx         # 홈 대시보드
      tasks/           # 할일
      checkin/         # 데일리 / 위클리 체크인
      notes/           # 메모
      settings/        # 설정 + 초대
    auth/              # 매직링크 콜백 / 로그아웃
    login/             # 로그인 페이지
  components/          # TopBar, BottomNav
  lib/
    supabase/          # 브라우저/서버 클라이언트
    workspace.ts       # 현재 사용자의 워크스페이스 + 멤버 로딩
    dates.ts           # 날짜 포맷 헬퍼
  middleware.ts        # 로그인 체크
supabase/schema.sql    # DB 스키마 + RLS 정책
```

## 데이터 모델

- `workspaces` ↔ `workspace_members` (한 워크스페이스에 두 사람 소속)
- `tasks` (workspace 단위, 담당자/마감일/상태)
- `daily_checks` (사용자 × 날짜 unique)
- `weekly_checks` (사용자 × 주 unique)
- `notes` (작성자, 핀 고정)

모든 테이블에 RLS 적용: 자기 워크스페이스의 데이터만 보이고 수정할 수 있도록 정책이 걸려 있습니다.

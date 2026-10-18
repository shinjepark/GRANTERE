# 더샵 송도그란테르 — Cloudflare Pages 배포 가이드

기존에 운영하던 랜딩페이지(시티오씨엘 9단지)와 **동일한 파일 구성 · 동일한 운영 방식**으로 제작되었습니다.

## 1. 폴더 구성

```
songdo-grandeur/
├── index.html            메인 (히어로(이미지만)·배치도·평면·입지·커뮤니티·사전예약 등록)
├── images/               이미지 (평면도 26종 · 배치도 · 입지 · 커뮤니티 · 히어로)
│   ├── plan/             84A ~ 198PK 평면도
│   └── complex/          단지배치도 / 블록별 동호수 배치도
├── og_image.jpg          카카오톡·SNS 공유 썸네일 (1200×630)
├── admin.html            관리자 페이지 (신청내역·집계·CSV·수정·삭제)
├── thankyou.html         신청 완료 페이지
├── oc-pixel-config.js    광고 채널 전환추적 설정 (index·thankyou 공유)
├── schema.sql            D1 테이블 생성 스크립트
├── _headers              관리자·완료페이지 검색 제외 + 캐시 설정
└── functions/
    ├── submit.js         POST /submit  →  D1 저장 + 텔레그램 알림 + 카운터 +1
    ├── admin.js          POST /admin   →  비밀번호 확인 후 조회/수정/삭제 + 집계
    ├── count.js          GET  /count   →  현재 등록 수 (말풍선 숫자)
    └── visit.js          POST /visit   →  방문 세션 기록 (하루 1회·봇 제외)
```

> `functions` 폴더가 있어야 텔레그램 알림과 관리자 페이지가 동작합니다.
> 이 폴더를 빼고 이미지만 올리면 신청은 되지 않고 오류 알림만 뜹니다.

---

## 2. 데이터가 처리되는 흐름

```
방문자가 이름·연락처·관심블록·관심평형(1·2·3순위) 입력 후 [사전예약 등록하기]
        │
        ▼
  브라우저가 POST /submit 으로 전송
  (이름·연락처·관심블록·관심평형 + 유입경로·utm·event_id·접속페이지)
        │
        ▼
  Cloudflare Pages Function (functions/submit.js)
        ├── ① D1 에 1건 저장              → admin.html 에서 조회
        ├── ② 카운터 +1                   → 하단 말풍선 숫자에 반영
        └── ③ 텔레그램 봇 API로 알림 전송  → 지정한 채팅방에 즉시 도착
        │
        ▼
  thankyou.html 로 이동 (?ch=유입경로&eid=이벤트ID)
        └── 이 페이지에서 광고 채널 전환(Lead)이 발화됩니다
```

- 고객정보는 **Cloudflare D1(서버리스 SQLite)에만** 저장됩니다. 별도 서버가 필요 없습니다.
- 텔레그램 알림은 봇 토큰과 채팅방 ID 두 개의 환경변수로 동작합니다.
- 같은 방문자의 재접수는 막지 않습니다(중복 여부는 관리자 페이지에서 확인).

---

## 3. D1 데이터베이스 준비

```bash
npx wrangler d1 create thesharp-grandeur
npx wrangler d1 execute thesharp-grandeur --remote --file=./schema.sql
```

`schema.sql` 은 세 개의 테이블을 만듭니다.

| 테이블 | 용도 |
|---|---|
| `leads` | 사전예약 신청내역 (이름·연락처·블록·1/2/3순위·유입경로·utm) |
| `visits` | 방문 세션 기록 (채널별 전환율 계산용) |
| `stats` | 하단 말풍선 카운터 값 |

> **카운터 시작값** — `stats` 의 `reservations` 값입니다. `schema.sql` 은 `0` 으로 시작합니다.
> 특정 숫자부터 보여주고 싶다면 `functions/count.js` 의 `BASE` 값과 `stats` 값을 함께 바꾸세요.
> 실제 접수 건수만 보여주는 것이 가장 안전합니다.

---

## 4. 환경변수 · 바인딩 설정

Cloudflare 대시보드 → 해당 Pages 프로젝트 → **Settings → Variables and Secrets**

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `TG_BOT_TOKEN` | 텔레그램 봇 토큰 (기존 봇 그대로 사용 가능) |
| Secret | `TG_CHAT_ID` | 알림 받을 채팅방 ID |
| Secret | `ADMIN_PASSWORD` | 관리자 페이지 접속 비밀번호 |

Settings → **Functions → D1 database bindings**

| Variable name | D1 database |
|---|---|
| `DB` | 위에서 만든 데이터베이스 |

> `DB` 라는 이름이 중요합니다. 코드가 `env.DB` 로 접근합니다.

### 텔레그램 값을 모를 때
- **봇 토큰**: 텔레그램에서 `@BotFather` → `/mybots` → 봇 선택 → `API Token`
- **채팅방 ID**: 봇을 알림 받을 방에 초대한 뒤
  브라우저에서 `https://api.telegram.org/bot<봇토큰>/getUpdates` 를 열어 `"chat":{"id":-100...}` 값 확인

같은 봇을 그대로 쓰면 **기존 채팅방에 그대로 알림이 도착**합니다.

---

## 5. 광고 채널 전환추적 설정

`oc-pixel-config.js` 파일 하나만 수정하면 `index.html`(방문)과 `thankyou.html`(등록 완료)에 동시에 반영됩니다.

```js
window.OC_PIXELS = {
  meta:   { id: '' },              // 메타 픽셀 ID
  google: { id: '', label: '' },   // 예: AW-123456789 / AbC-D_efGh
  kakao:  { id: '' },              // 카카오 픽셀 ID
  daangn: { id: '' },              // 당근 픽셀 ID
  naver:  { wa: '' }               // 네이버 프리미엄 로그분석 'wa' 값 (s_ 로 시작)
};
```

- **빈 값인 채널은 아무 스크립트도 불러오지 않습니다.** 광고 집행 전에도 안전합니다.
- 발화 이벤트

| 채널 | 메인 페이지 | 완료 페이지 |
|---|---|---|
| 메타 | PageView | **Lead** (event_id 포함) |
| 구글 | 페이지뷰 | **conversion** (thankyou.html 내 스니펫) |
| 카카오 | pageView | **completeRegistration** |
| 당근 | ViewPage | **SubmitApplication** |
| 네이버 | 방문 + 유입경로 | **lead 전환** |

> 카카오는 `kp.js` 에 `lead()` 메서드가 없어 표준 이벤트인 `completeRegistration` 으로 발화합니다.
> 카카오 캠페인 세팅 시 전환 이벤트로 **"회원가입(CompleteRegistration)"** 을 선택해야 성과로 집계됩니다.

---

## 6. 배포

```bash
cd songdo-grandeur
npx wrangler pages deploy . --project-name=thesharp-grandeur
```

또는 대시보드 → Workers & Pages → Create → Pages → **Upload assets** 에
이 폴더 전체(또는 압축 파일)를 올립니다. `functions` 폴더가 포함되어야 합니다.

---

## 7. 배포 후 반드시 수정할 것

`index.html` 안의 공유 주소는 임시 도메인으로 들어가 있습니다.
실제 도메인으로 **교체**하세요 (총 4곳).

```html
<meta property="og:image"              content="https://<실제도메인>/og_image.jpg">
<meta property="og:image:secure_url"   content="https://<실제도메인>/og_image.jpg">
<meta property="og:url"                content="https://<실제도메인>/">
<meta name="twitter:image"             content="https://<실제도메인>/og_image.jpg">
```

### 카카오톡 공유가 안 바뀔 때
카카오는 미리보기 이미지·문구를 **캐시**합니다.
- 카카오 디벨로퍼스 → 내 애플리케이션 → **도구 → 캐시 초기화** 에서 해당 URL 초기화
- 그래도 안 되면 주소 뒤에 `?v=2` 를 붙여 공유 (새 주소로 인식)

---

## 8. 관리자 페이지

```
https://<실제도메인>/admin.html
```

- 비밀번호 입력 → 전체 신청내역(최신순) 조회
- 상단 카드: 전체·오늘·최근 7일 건수, 방문자 수, 전환율
- 유입경로별 · 관심블록별 · 평형별 자동 집계
- 최근 14일 추이 그래프
- `이름·연락처·유입경로` 검색, `엑셀(CSV) 저장` (한글 깨짐 방지 BOM 포함)
- 각 행에서 **수정 / 삭제**

---

## 9. 유입경로 자동 분류

로그인 없이도 어디서 들어온 문의인지 자동 기록됩니다.

| 상황 | 기록값 |
|---|---|
| 카카오톡 공유 링크로 유입 | 카카오톡 |
| 인스타그램 / 페이스북 / 밴드 | 각 플랫폼명 |
| 네이버 / 구글 검색 | 네이버 / 구글 |
| 네이버 블로그·티스토리·브런치 | 바로기 |
| 네이버 카페 | 네이버카페 |
| 언론사 기사 | 뉴스기사 |
| 그 외 외부 사이트 | 해당 도메인 |
| 주소 직접 입력 | 모바일 직접유입 / PC 직접유입 |

`?utm_source=...&utm_medium=...&utm_campaign=...` 파라미터를 붙이면
광고 채널별로 정확히 구분됩니다. (예: `?utm_source=naver&utm_medium=cpc`)

---

## 10. 교체가 필요한 항목 (미수령)

| 항목 | 현재 상태 | 넣는 곳 |
|---|---|---|
| 히어로 이미지 PC / 모바일 | 그라데이션 자리표시자 | `images/hero_pc.webp` (1920×1000), `images/hero_mo.webp` (1080×1350) |
| 텔레그램 봇 토큰 · 채팅방 ID | 미설정 | Cloudflare 환경변수 |
| 광고 채널 ID 5종 | 빈 값 (스크립트 미로드) | `oc-pixel-config.js` |
| 개인정보 보유기간 · 파기절차 | "목적 달성 후 지체 없이 파기" | `index.html` 동의 문구 |

히어로 이미지는 **같은 파일명으로 덮어쓰면** 코드 수정 없이 반영됩니다.

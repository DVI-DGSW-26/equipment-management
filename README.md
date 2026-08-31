<p align="center">
  <img src="public/logo.svg" alt="DVISION" width="220">
</p>

# 자산·기자재 관리 시스템

DVISION 의 사내 자산과 기자재를 한 곳에서 관리하는 웹 서비스다. 고정자산 등록·감가상각,
비품관리대장(실물자산), 계측기 교정 이력, 안전검사 기한 관리와 메일 알림을 다룬다.
사내망 브라우저용이고 사용자 10명 내외, 사무실 PC(1440px) 기준으로 만들었다.

**주 기술** — React 19 · TypeScript · Vite · TanStack Query · React Router · Tailwind CSS v4

백엔드는 **Jagigo API** 를 쓴다 (Swagger: `https://api.dvi-ind.com/jagigo/swagger-ui/index.html`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입체크 + 프로덕션 빌드
npm run typecheck
npm run lint
```

## 백엔드 연결

백엔드에 CORS 헤더가 없어 브라우저에서 직접 호출할 수 없다. **개발 중에는 vite 프록시를 탄다.**

```
.env
  VITE_API_BASE_URL=/api                                   # 브라우저가 호출할 경로
  VITE_API_PROXY_TARGET=http://112.146.55.78:3378/jagigo    # vite dev 프록시 대상
```

`vite.config.ts` 의 `server.proxy` 가 `/api/*` 를 `VITE_API_PROXY_TARGET` 으로 넘긴다.
`.env` 를 고치면 dev 서버를 다시 띄워야 한다.

배포 시에는 같은 오리진에 얹거나, 백엔드에 CORS 를 열고 `VITE_API_BASE_URL` 을 절대 주소로 바꾼다.

## 디렉터리

```
src/
  api/          서버 경계. 컴포넌트에서 fetch 직접 호출 금지
    client.ts   요청 래퍼. 응답 봉투 해제 + 파일 다운로드(requestFile/saveFile)
    types.ts    Won·IsoDate·Page<T>·ApiError·BaseResponse
    assets.ts / physicalAssets.ts / depreciation.ts / inspections.ts / masters.ts
    instruments.ts / calibrations.ts / attachments.ts / instrumentMasters.ts / notifications.ts
    queryKeys.ts
  domain/       순수 규칙. assetCode / depreciationMethod / editability / dday
  config/       appConfig.ts — 미확정 값(라벨 규격·QR·알림) 전부 여기
  lib/          won.ts(금액 표시) / date.ts(날짜 포맷)
  components/   AppLayout / Modal / Toast / ui.tsx(공통 조각)
  pages/        assets / physicalAssets / instruments / depreciation / inspections /
                notifications / settings
  index.css     Tailwind v4 @theme 토큰 (팔레트·폰트·표 유틸)
```

## API 규칙

**응답은 봉투에 싸여 있다.** 모든 응답이 `{status, message, data}` 이고 `request()` 가 `data` 만
벗겨서 돌려준다. 목록은 Spring `Page` 라 `types.ts` 의 `toPage()` 로 `{items,total,totalPages,page,size}`
로 바꾼다. **페이지 번호는 서버와 동일하게 0-base.**

**금액은 number 다.** 서버가 소수 2자리 JSON number 로 준다. 화면에서 금액 산술을 하지 않는다.
합계·상각비·장부가액은 전부 서버 계산값을 그대로 표시하고, 포맷은 `lib/won.ts` 에서만 한다
(예외: 막대 차트 길이 비율 `wonRatio`).

**필드명은 서버 스키마 그대로 쓴다.** `name` / `acquisitionDate` / `usingDeptCode` … Swagger 와
1:1 로 대조되도록 별도 매핑 레이어를 두지 않는다.

**에러 본문은 `{code, status, message}`.** `ApiError.code` 로 분기하고, 화면에는 `errorMessage(e)`
로 서버 메시지를 그대로 보여준다.

**상각률을 코드에 박지 않는다.** 내용연수 × 상각방법 조합으로 마스터(`/depreciation/rate`)에서
조회한다 (`domain/depreciationMethod.ts`). 계정과목이 허용하는 상각방법도 마스터에서 온다.

**미확정 값은 `src/config/appConfig.ts` 에만 둔다.** 라벨 규격·인쇄 항목·QR 포함 여부·알림
시점·수신자. `confirmed: false` 인 항목은 마스터 화면의 "미확정 설정" 탭과 헤더 배지에 나온다.

**다크 모드·애니메이션·PWA 없음.** 정보 밀도 우선, 금액 셀은 우측 정렬 + `tabular-nums`(`.num`),
자산코드는 고정폭(`.code`).

## 로그인 (DVI 통합 로그인 · Keycloak)

아이디·비밀번호를 화면에서 받지 않는다. 로그인 버튼이 브라우저를 통째로 백엔드로 보내고
(`https://api.dvi-ind.com/jagigo/oauth2/authorization/keycloak`), Keycloak 이 OTP 까지 처리한 뒤
콜백으로 토큰을 돌려준다.

```
성공  https://honey-go.vercel.app/auth/callback#token=<JWT>
실패  https://honey-go.vercel.app/auth/callback#error=<사유>
```

- **콜백 도메인이 운영 주소로 고정**이다. localhost·프리뷰 배포에서는 콜백을 못 받으므로
  로그인 확인은 프로덕션에서 한다. 개발 중에는 로그인 화면을 세우지 않는다
  (`isLoginRequired` — 확인하려면 `.env` 에 `VITE_FORCE_LOGIN=true`,
  운영에서 받은 토큰을 쓰려면 `VITE_DEV_TOKEN=<JWT>`).
- **토큰이 없으면 화면을 세우지 않고 곧바로 통합 로그인으로 보낸다.** 우리 로그인 화면은
  되풀이를 멈춰야 할 때만 나온다 — 스스로 로그아웃했을 때, 그리고 방금 다녀왔는데 또 튕겼을 때
  (권한 없는 계정 등). 그러지 않으면 무한 왕복이 된다.
- 토큰은 `localStorage` 에 둔다 (`lib/session.ts`). 새로고침해도 유지된다.
- 모든 요청에 `Authorization: Bearer` 가 붙는다 (`api/client.ts`). **401 이면 다시 로그인으로 보낸다** —
  수명이 30분이라 만료는 일상이고, SSO 세션이 살아 있으면 화면 없이 새 토큰을 들고 돌아온다.
  방금 다녀왔는데 또 401 이면(권한 없음 등) 되풀이를 멈추고 로그인 화면에서 선다.
- `<img src>` 는 헤더를 붙일 수 없어 401 이 된다. 첨부 사진은 `components/AuthImage.tsx` 가
  fetch 로 받아 objectURL 로 끼운다.
- 헤더에 `GET /auth/me` 의 `name` 과 `roles` 를 띄우고, 로그아웃은 토큰 삭제 + 쿼리 캐시 비우기다.

## 화면

| 경로 | 내용 | 주요 엔드포인트 |
| --- | --- | --- |
| `/assets` | 요약 지표 · 10개 조건 검색 · 목록 · 선택 스티커 · PDF/Excel | `GET /asset`, `/asset/summary`, `/asset/export/*`, `POST /asset/sticker` |
| `/assets/new` | 등록. 자산코드 실시간 미리보기, 비품(P05)만 비품구분·품목 활성 | `GET /asset/code-preview`, `POST /asset` |
| `/assets/:id` | 상세 · 일반 수정 · 회계 정정(사유 필수) · 변경 이력 · 삭제 | `PATCH /asset/{id}`, `PATCH /asset/{id}/correction`, `GET /asset/{id}/history` |
| `/depreciation` | 명세(월별) · 연도별 · 관리대장 · 향후 예상 + 연도 상각 계산 | `/depreciation/schedule·yearly·ledger·forecast·calculate` |
| `/physical-assets` | 비품관리대장. 자산등록 O/X · 소액 비품 필터 · 등록/수정/삭제 · 스티커 | `/physical-asset/**` |
| `/instruments` | 계측기 목록(검색·위치·차기 교정일 경과) / 연간 교정검사 LIST + 계획 일괄 생성 | `GET /instrument`, `/calibration/annual` |
| `/instruments/:id` | 측정기 이력카드. 헤더 · 교정 이력 CRUD · 첨부파일 업로드/다운로드 | `/instrument/{id}`, `/calibration/**`, `/attachment/**` |
| `/depreciation` | 명세(월별) · 연도별 · 관리대장 · 향후 예상 + 연도 상각 계산 | `/depreciation/schedule·yearly·ledger·forecast·calculate` |
| `/inspections` | 안전검사 요약 · 기한 오름차순 목록(D-day) · 검사 이력/결과 등록 | `/safety-equipment/**` |
| `/notifications` | 수신 이메일(인증코드 2단계 등록·해지) · 수동 발송 · 발송 이력 | `/notification-email/**`, `/notification/**` |
| `/settings/master` | 계정과목 · 코드 마스터 4종 · 품목 · 상각률 · 계측기 사용위치 · 거래처 · 미확정 설정 | `/asset/account`, `/asset-master/**`, `/depreciation/rate`, `/location`, `/partner` |

Swagger 에 정의된 엔드포인트에는 전부 화면이 붙어 있다.

## 쓰기 작업 주의

아래 세 가지는 실제 데이터를 바꾸거나 메일을 보낸다. 전부 확인 대화상자를 거친 뒤 실행한다.

- `POST /depreciation/calculate` — 해당 연도 상각 결과를 다시 계산해 **대체**한다
- `POST /calibration/annual` — 연간 교정계획을 일괄 생성한다 (기존 계획은 건너뜀)
- `POST /notification/alert/send` · `/notification/safety-alert/send` — **실제 메일이 나간다**

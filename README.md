# Die No More — Plant Care PWA

실내외 모든 식물을 대상으로 하는 식별·건강 분석·관리 기록 통합 PWA 프로젝트입니다.

## 현재 단계

4단계 구현 중입니다. 기준 문서는 `docs/stage2/`와 `docs/decisions/ADR-0003-implementation-decisions.md`입니다.

## 개발 환경

- Node.js 22 이상(CI는 24), npm.
- `.env.example`을 `.env.local`로 복사하고 Supabase 값과 소유자 이메일을 채웁니다. 모든 값은 서버 전용이며 `NEXT_PUBLIC_` 접두사를 쓰지 않습니다.
- Supabase 콘솔에서 소유자 계정 1개를 만들고 공개 가입을 끕니다(ADR-0003 D2).

| 명령 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run check` | 린트, 타입 검사, 계층 검사(ADR-0002), 문서 검사, 단위 테스트 |
| `npm run test:e2e` | Playwright E2E (빌드 후 3100 포트로 실행) |

**Windows 주의:** 작업 폴더 경로의 드라이브 문자가 소문자(`c:\...`)로 열려 있으면 Vitest가 모듈을 두 번 불러 모든 테스트가 `Cannot read properties of undefined (reading 'config')`로 실패합니다. 터미널에서 `cd C:\Users\...`처럼 대문자 드라이브 경로로 이동한 뒤 실행하세요.

## 데이터베이스 (Supabase CLI)

스키마는 `supabase/migrations/`의 SQL 파일로 관리하고, RLS 테스트는 `supabase/tests/`(pgTAP)에 있습니다. CI가 매 PR마다 새 Supabase 스택에 마이그레이션을 적용하고 테스트합니다. 로컬 실행(`npx supabase start`, `npm run test:db`)은 Docker가 필요합니다.

실제 프로젝트에 적용하기 (최초 1회 연결, 이후 PR 병합 때마다 적용):

```
npx supabase login                       # 브라우저 인증 (사용자 직접)
npx supabase link --project-ref <ref>    # ref: Project Settings → General → Project ID. DB 비밀번호 입력
npx supabase db push --dry-run           # 적용될 마이그레이션 확인
npm run db:push                          # 적용
```

마이그레이션은 PR이 병합된 뒤에만 실제 프로젝트에 적용합니다.

## 코드 구조 (ADR-0002 계층)

의존 방향은 한쪽으로만: `src/types` → `src/config` → `src/repo` → `src/service` → `src/runtime`(+ `src/proxy.ts`) → `src/ui`, `src/app`. UI는 Config·Repo를 직접 불러오지 않습니다. `npm run check:layers`가 위반을 막습니다.

## 협업 원칙

- GPT: 요구사항·아키텍처·API·DB 설계 검증, 구현 결과 리뷰
- Claude: 구현 설계, 코드 작성, 테스트, 수정
- 사용자: 주요 설계 결정 및 PR 최종 승인
- GitHub: 공식 문서, 검토 의견, 의사결정 및 코드 변경 이력의 기준 저장소

## 문서

초기 기획 문서는 별도 브랜치의 Draft Pull Request에서 검토 후 병합합니다. 제안은 확정된 결정과 구분합니다.

## 보안

API 키, 환경변수 비밀값, 실제 사용자 사진·개인정보를 커밋하지 않습니다.

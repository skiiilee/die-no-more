# Die No More — Plant Care PWA

실내외 모든 식물을 대상으로 하는 식별·건강 분석·관리 기록 통합 PWA 프로젝트입니다.

## 현재 단계

PR #1의 기획 문서는 `main`에 병합되었습니다. 현재는 **GitHub Pages 기반 개인용 웹앱**으로 개발 환경을 전환하는 별도 제안(PR)을 검토 중이며, 구현 코드는 아직 없습니다.

## 협업 원칙

- GPT: 요구사항·아키텍처·API·DB 설계 검증, 구현 결과 리뷰
- Claude: 구현 설계, 코드 작성, 테스트, 수정
- 사용자: 주요 설계 결정 및 PR 최종 승인
- GitHub: 공식 문서, 검토 의견, 의사결정 및 코드 변경 이력의 기준 저장소

## 문서

초기 기획 문서는 PR #1로 병합되었습니다. 최신 개발 환경 전환안은 `docs/decisions/ADR-0002-github-pages-static-app.md`, `docs/08-development-environment.md` 및 해당 Draft PR을 참고하세요. **PR 문서 제안은 사용자 승인 전까지 확정된 결정이 아닙니다.**

## 제안 개발 환경

- 프런트엔드: React + TypeScript + Vite (정적 빌드)
- 호스팅: GitHub Pages (`https://skiiilee.github.io/die-no-more/`, 배포 전 예상 주소)
- 데이터 및 로그인: Supabase Auth/PostgreSQL(RLS)/private Storage
- API 키 보호와 외부 AI 호출: Supabase Edge Functions
- 외부 식별/분석 후보: Pl@ntNet, Gemini (현재 약관·무료 한도 검증 전)
- 식물별 관리 데이터: 처음에는 비워두고 식물 등록 때 온디맨드 생성·검토·캐싱

## 보안

API 키, 환경변수 비밀값, 실제 사용자 사진·개인정보를 커밋하지 않습니다.

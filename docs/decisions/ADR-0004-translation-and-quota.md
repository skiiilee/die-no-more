# ADR-0004: 번역 제공자 변경(Azure Translator F0)과 제공자 한도 기준

Status: Accepted (사용자 결정, 2026-11-13)
Date: 2026-11-13
Related: ADR-0003 D8, `docs/04-api-design.md`, `docs/stage2/03-functional-specification.md`, `docs/stage2/04-data-sources.md`, PR #12

## Context
- `docs/stage2/04-data-sources.md`와 `docs/04-api-design.md`는 한국어 이름을 Google Cloud Translation으로 만든다고 정했다.
- 사용자는 번역 결과에 번역사 로고나 "기계 번역" 표시를 붙이지 않기로 했다(2026-11-13).
- Google은 번역 결과를 보여줄 때 Google 출처 표시(배지)를 **반드시** 붙이도록 요구한다([attribution](https://docs.cloud.google.com/translate/attribution)). 위 결정과 맞지 않는다.
- Azure Translator는 텍스트 번역에 출처 표시가 필수가 아니다([FAQ](https://learn.microsoft.com/en-us/azure/ai-services/translator/faq)). F0 요금제는 월 200만 자 무료이고, 다 쓰면 번역이 멈추며 자동으로 유료로 넘어가지 않는다([가격](https://azure.microsoft.com/en-us/pricing/details/translator/), [Translator FAQ](https://www.microsoft.com/en-us/translator/business/faq/)).
- 사용자는 아직 Azure에 가입하지 못했다. 번역 기능은 마지막에 붙이고 다른 기능을 먼저 만든다.
- GPT 검토(PR #12)는 ADR-0003 D8의 "KST 날짜 기준 집계"가 UTC 기준으로 초기화되는 Pl@ntNet 한도를 지켜 주지 못한다고 지적했다([quota](https://my.plantnet.org/doc/api/quota)).

## Decision

### D1. 번역 제공자: Azure Translator F0
- 번역은 Azure Translator **F0(무료) 요금제**로 한다. Google Cloud Translation은 쓰지 않는다. Google로 자동 대체 호출하지 않는다.
- 리소스는 반드시 F0로 만들고 유지한다. S1 등 유료 요금제로 바꾸면 그 시점부터 첫 글자부터 과금되므로, 바꾸려면 새 ADR이 필요하다.
- 화면에 번역사 표시나 "기계 번역" 표시를 하지 않는다.
- 키와 리전은 서버 환경변수에만 둔다.

### D2. 한국어 텍스트 출처 순서
1. 제공자 데이터에 한국어가 있으면 그 값을 쓴다(예: Trefle `common_names.ko`).
2. 없을 때만 Azure로 번역하고 결과를 저장해 다시 쓴다. 같은 원문은 한 번만 번역한다.

번역을 쓰는 곳은 세 군데다.
- 화면에 보이는 식물 이름
- 한국어 검색 결과가 없을 때 영문으로 다시 검색하기
- 건강 점검 설명

학명, EPPO 코드, 급수 기준 같은 계산용 원본 값은 번역하지 않고 번역값으로 덮어쓰지 않는다. 건강 점검 설명은 원문, EPPO 코드, 번역문, 번역 제공자를 따로 저장한다.

### D3. 번역 실패·미연결 시 동작
번역이 없거나 실패해도 화분 등록과 기록 저장은 막지 않는다.
- 식물 이름: 학명을 표시한다.
- 건강 점검 설명: 영어 원문을 EPPO 코드와 함께 표시한다.
- 한국어 검색: 영문 재검색 단계를 건너뛰고, 결과가 없으면 바로 '직접 입력'으로 안내한다.

### D4. 일정
번역 연결은 구현 순서의 맨 마지막에 둔다. 그 전까지 번역 어댑터는 "사용 불가"를 돌려주고, 앱은 D3대로 동작한다. Azure 실제 호출 확인(F0 여부, 키·리전, 영한·한영 샘플 품질, 한도 초과 응답)은 연결할 때 따로 하고 `docs/04-api-design.md`에 기록한다. 2026-11-13의 Google 호출 결과는 조사 기록일 뿐 Azure 확인을 대신하지 않는다.

### D5. 제공자 한도 집계 기준 (ADR-0003 D8 보완)
- 제공자 한도를 지키기 위한 집계는 **제공자가 정한 날짜 경계**로 센다. Pl@ntNet은 UTC 날짜(한국 시각 오전 9시 초기화)다.
- 제공자가 응답으로 남은 횟수나 재개 시각을 알려 주면 그 값을 우선한다. Pl@ntNet의 `RateLimit`, 429 응답의 `Retry-After`, `/v2/quota/daily`가 여기에 해당한다.
- 경계가 문서에 없는 제공자(Perenual, Trefle)는 앱 자체 상한을 KST 날짜로 세고, 제공자의 429 응답을 따른다. 단, Perenual의 "Please Upgrade Plan" 응답은 한도가 아니라 무료 범위 밖으로 처리한다.
- 화면에 재개 시각을 안내할 때는 제공자 기준 시각을 한국 시각으로 바꿔 보여준다. 예: Pl@ntNet은 "오전 9시 이후 다시 시도".

## Consequences
- stage2 문서의 "한국어 이름은 Google Cloud Translation" 규칙과 ADR-0003 D8의 "KST 날짜 기준 집계"는 이 ADR로 대체된다. 나머지 ADR-0003 결정은 그대로다.
- DB: `api_usage_logs.provider` 허용 값의 `google_translate`를 `azure_translator`로 바꾸는 마이그레이션이 필요하다. 다음 구현 PR에서 추가한다(초기 마이그레이션은 이미 병합됨).
- 번역 연결 전에는 Trefle에 한국어 이름이 없는 종이 학명으로 보이고, 건강 점검 설명이 영어로 보인다.
- 사용자: Google 번역 키는 더 쓰지 않으므로 `.env.local`에서 지우고 Google Cloud 콘솔에서 키를 삭제하거나 사용 중지할 수 있다.

import { Suspense, use } from "react";
import type { CareField, CareFacts, SpeciesCare } from "@/types/species";
import { Spinner } from "@/ui/shell/Spinner";
import styles from "./plants.module.css";

const NO_INFO = "정보 없음";
const LOADING = "불러오는 중…";

/** Where the care is shown: S04-B before the pot exists, or S06 for a saved pot. */
export type CarePlace = "preview" | "pot";

/** `loading`: fields the care AI is being asked for right now (shown as 불러오는 중). */
function FactList({ facts, loading }: { facts: CareFacts | null; loading: CareField[] }) {
  const rows: [string, CareField, string | null][] = [
    ["관리 난이도", "careLevel", facts?.careLevel ?? null],
    ["빛 환경", "light", facts?.light ?? null],
    ["물 주기", "watering", facts?.watering ?? null],
    ["흙 확인 간격 참고", "wateringInterval", facts?.wateringInterval ?? null],
    ["온도", "temperature", facts?.temperature ?? null],
    ["흙", "soil", facts?.soil ?? null],
    ["비료", "fertilizer", facts?.fertilizer ?? null],
    // English original from Perenual until translation is connected (ADR-0004 D3, owner decision 2026-11-15).
    ["짧은 식물 설명", "description", facts?.description ?? null],
  ];
  return (
    <dl className={styles.facts}>
      {rows.map(([label, field, value]) => (
        <div key={label} className={styles.factRow}>
          <dt>{label}</dt>
          <dd>
            {value ?? (loading.includes(field) ? LOADING : NO_INFO)}
            {value !== null && facts?.aiFields.includes(field) ? <span className={styles.aiMark}>AI 생성</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function CareNote({ care, place }: { care: SpeciesCare; place: CarePlace }) {
  if (care.status === "none") {
    return place === "preview" ? (
      <p className={styles.note}>
        이 식물의 관리 정보가 없습니다. 물 알림은 제공되지 않으며, 등록한 뒤 관리 정보를 직접 입력할 수 있습니다(직접
        입력 화면은 다음 단계에서 연결됩니다).
      </p>
    ) : (
      <p className={styles.note}>
        이 식물의 관리 정보가 없습니다. 물 알림은 제공되지 않습니다. 관리 정보 직접 입력은 다음 단계에서 연결됩니다.
      </p>
    );
  }
  if (care.status === "pending") {
    return <p className={styles.note}>관리 정보를 지금 불러오지 못했습니다. 이 화면을 다시 열면 다시 확인합니다.</p>;
  }
  if (care.status === "available" && care.facts.aiFields.length > 0) {
    return (
      <p className={styles.note}>
        관리 정보 출처: Perenual, 그리고 AI({care.facts.aiModel ?? "모델 정보 없음"})가 만든 &lsquo;AI 생성&rsquo; 항목. AI 값은 사실
        확인을 거치지 않은 참고 정보입니다. 화분 환경에 맞게 판단하세요.
      </p>
    );
  }
  return <p className={styles.note}>관리 정보 출처: Perenual. 화분 환경에 따라 다를 수 있습니다.</p>;
}

/** The facts table and its source note, for the care as known now. */
function CareBlock({ care, place, loading = [] }: { care: SpeciesCare; place: CarePlace; loading?: CareField[] }) {
  return (
    <>
      <FactList facts={care.status === "available" ? care.facts : null} loading={loading} />
      {loading.length > 0 ? (
        <p className={`${styles.note} ${styles.aiLoading}`} role="status">
          <Spinner />
          비어 있는 항목을 AI 참고 정보로 찾는 중입니다. 몇 초 걸릴 수 있습니다.
        </p>
      ) : (
        <CareNote care={care} place={place} />
      )}
    </>
  );
}

/** The care once the care AI step is done (ADR-0005 D6). */
function StreamedCare({ care, place }: { care: Promise<SpeciesCare>; place: CarePlace }) {
  return <CareBlock care={use(care)} place={place} />;
}

/**
 * Species care facts as S04-B and S06 show them. Values come only from
 * Perenual and the care AI (marked 'AI 생성'); empty items say '정보 없음'.
 * `aiCare`: the care AI step when `aiFill` is not empty. The facts show at
 * once with those fields as 불러오는 중, and they fill in when it ends.
 */
export function SpeciesCareFacts({
  care,
  aiFill,
  aiCare,
  place,
}: {
  care: SpeciesCare;
  aiFill: CareField[];
  aiCare: Promise<SpeciesCare> | null;
  place: CarePlace;
}) {
  if (!aiCare) return <CareBlock care={care} place={place} />;
  return (
    <Suspense fallback={<CareBlock care={care} place={place} loading={aiFill} />}>
      <StreamedCare care={aiCare} place={place} />
    </Suspense>
  );
}

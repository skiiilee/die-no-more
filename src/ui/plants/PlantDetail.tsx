import Link from "next/link";
import { Suspense, use } from "react";
import {
  ENVIRONMENTS,
  LAST_REPOTTED_RANGES,
  LAST_WATERED_RANGES,
  LIGHT_LEVELS,
  POT_MATERIALS,
  optionLabel,
  plantName,
  potDisplayName,
  type PotView,
} from "@/types/plant";
import type { CareRecordSummary } from "@/types/care";
import type { SavedHealthSummary } from "@/types/health";
import type { PotCare } from "@/types/species";
import { CareHistoryCard } from "@/ui/care/CareHistoryCard";
import { HealthHistoryCard } from "@/ui/health/HealthHistoryCard";
import { Spinner } from "@/ui/shell/Spinner";
import { PotPhotoPanel } from "./PotPhotoPanel";
import { SpeciesCareFacts } from "./SpeciesCare";
import styles from "./plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/** The species care once loaded, with the care AI step streamed in (ADR-0005 D6). */
function PotCareFacts({ care }: { care: Promise<PotCare> }) {
  const { care: now, aiFill, aiCare } = use(care);
  return <SpeciesCareFacts care={now} aiFill={aiFill} aiCare={aiCare} place="pot" />;
}

/**
 * S06 종별 관리 참고 (F10): what is known for the species, kept apart from
 * this pot's own info and records. A pot without a species has none.
 */
function SpeciesCareCard({ pot, care }: { pot: PotView; care: Promise<PotCare> | null }) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>종별 관리 참고</h2>
      {pot.species && care ? (
        <>
          <p className={styles.note}>
            {pot.species.koreanName ?? pot.species.scientificName} 종 공통 참고 정보입니다. 이 화분의 기록이 아닙니다.
          </p>
          <Suspense
            fallback={
              <p className={`${styles.note} ${styles.aiLoading}`} role="status">
                <Spinner />
                관리 정보를 불러오는 중입니다.
              </p>
            }
          >
            <PotCareFacts care={care} />
          </Suspense>
        </>
      ) : (
        <p className={styles.note}>아직 관리 정보 없음. 종이 정해지지 않은 화분입니다.</p>
      )}
    </div>
  );
}

/**
 * S06 내 화분 상세 (wireframe pages 19–20): the pot's own info, its photo,
 * the newest care records (S08) and health checks (S07-S), and the species
 * care (F10). The full history (S10) and direct care entry (S13) are added by
 * the PRs that build those screens.
 * `care` streams in after the pot is shown; null when the pot has no species.
 */
export function PlantDetail({
  pot,
  care = null,
  photoFailed = false,
  healthChecks = [],
  healthSaved = false,
  careRecords = [],
  careSaved = false,
}: {
  pot: PotView;
  care?: Promise<PotCare> | null;
  photoFailed?: boolean;
  /** Newest saved health checks (S07-S). */
  healthChecks?: SavedHealthSummary[];
  /** S07-S just saved one. */
  healthSaved?: boolean;
  /** Newest S08 records. */
  careRecords?: CareRecordSummary[];
  /** S08 just saved one. */
  careSaved?: boolean;
}) {
  const recordedOn = dateFormat.format(new Date(pot.initialStateRecordedAt));
  const label = <T extends string>(options: readonly { code: T; label: string }[], code: T) =>
    optionLabel(options, code) ?? code;

  return (
    <section className={styles.screen} aria-labelledby="pot-title">
      <div className={styles.header}>
        <h1 id="pot-title" className={styles.title}>
          {potDisplayName(pot)}
        </h1>
        <Link href="/plants" className={styles.back}>
          목록
        </Link>
      </div>
      {pot.nickname ? <p className={styles.lead}>{plantName(pot)}</p> : null}

      <div className={styles.columns}>
        <PotPhotoPanel potId={pot.id} name={potDisplayName(pot)} photo={pot.photo} registrationPhotoFailed={photoFailed} />

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>화분 기본 정보</h2>
          <dl className={styles.facts}>
            <dt>실내 / 실외</dt>
            <dd>{label(ENVIRONMENTS, pot.environment)}</dd>
            <dt>관리 장소</dt>
            <dd>{pot.location ?? "입력 안 함"}</dd>
            <dt>현재 채광</dt>
            <dd>{label(LIGHT_LEVELS, pot.lightLevel)}</dd>
            <dt>화분 재질</dt>
            <dd>{label(POT_MATERIALS, pot.potMaterial)}</dd>
            {pot.memo ? (
              <>
                <dt>메모</dt>
                <dd className={styles.memo}>{pot.memo}</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>등록할 때 고른 관리 시기</h2>
          <p className={styles.note}>{recordedOn} 등록 기준의 대략적인 기간입니다. 실제 관리 기록이 아닙니다.</p>
          <dl className={styles.facts}>
            <dt>마지막 물 준 시기</dt>
            <dd>{label(LAST_WATERED_RANGES, pot.lastWatered)}</dd>
            <dt>마지막 분갈이 시기</dt>
            <dd>{label(LAST_REPOTTED_RANGES, pot.lastRepotted)}</dd>
          </dl>
        </div>

        <CareHistoryCard potId={pot.id} records={careRecords} justSaved={careSaved} />

        <HealthHistoryCard potId={pot.id} checks={healthChecks} justSaved={healthSaved} />

        <SpeciesCareCard pot={pot} care={care} />
      </div>
    </section>
  );
}

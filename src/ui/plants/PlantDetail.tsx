import Link from "next/link";
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
import styles from "./plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/**
 * S06 내 화분 상세 (wireframe pages 19–20), first part: the pot's own info.
 * Records (S08/S10), health check (S07) and species care (S13) are added by
 * the PRs that build those screens.
 */
export function PlantDetail({ pot }: { pot: PotView }) {
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
                <dd>{pot.memo}</dd>
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

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>종별 관리 참고</h2>
          <p className={styles.note}>
            {pot.species ? "관리 정보 조회는 아직 연결 중입니다." : "아직 관리 정보 없음. 종이 정해지지 않은 화분입니다."}
          </p>
        </div>
      </div>
    </section>
  );
}

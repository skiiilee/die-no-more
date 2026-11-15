"use client";

import styles from "./plants.module.css";

/**
 * Shown when a plants screen could not read the database (S06, S11, S05
 * context). Distinct from "not found": the pot may well exist. No database
 * detail is shown; [다시 시도] reloads the screen's data.
 */
export function PlantsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={styles.screen} aria-labelledby="load-error-title">
      <h1 id="load-error-title" className={styles.title}>
        불러오지 못했습니다
      </h1>
      <p role="alert" className={styles.lead}>
        식물 정보를 불러오는 중 문제가 생겼습니다. 저장된 화분은 그대로 있으니 잠시 후 다시 시도해 주세요.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRetry}>
          다시 시도
        </button>
      </div>
    </section>
  );
}

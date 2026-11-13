import Link from "next/link";
import styles from "./plants.module.css";

/**
 * S03 식물 추가 (wireframe pages 7–8). Name search and photo scan sit side by
 * side from the start. Both are connected in later PRs (search: Perenual and
 * Trefle; scan: Pl@ntNet), so they are shown but disabled with a plain note
 * instead of fake results. The manual and unknown paths work now.
 */
export function AddPlantStart() {
  return (
    <section className={styles.screen} aria-labelledby="add-title">
      <div className={styles.header}>
        <h1 id="add-title" className={styles.title}>
          식물 추가
        </h1>
        <Link href="/plants" className={styles.back} aria-label="식물 추가 닫기">
          닫기
        </Link>
      </div>
      <p className={styles.lead}>사진 또는 이름, 학명, 품종명으로 식물을 찾으세요.</p>

      <div className={styles.card}>
        <div className={styles.columns}>
          <div className={styles.field}>
            <label htmlFor="species-search" className={styles.label}>
              식물 이름 검색
            </label>
            <input
              id="species-search"
              type="search"
              className={styles.input}
              placeholder="식물 이름 입력"
              disabled
              aria-describedby="search-note"
            />
          </div>
          <button type="button" className={styles.secondary} disabled aria-describedby="search-note">
            식물 스캔
          </button>
        </div>
        <p id="search-note" className={styles.note}>
          이름 검색과 사진 스캔은 아직 연결 중입니다. 지금은 이름을 직접 입력하거나 종을 모르는 채로 등록할 수 있습니다.
        </p>
      </div>

      <div className={styles.actions}>
        <Link href="/plants/new/manual" className={styles.primary}>
          이름 직접 입력 / 종을 모르겠어요
        </Link>
      </div>
    </section>
  );
}

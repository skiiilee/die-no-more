import Link from "next/link";
import { SpeciesSearchForm } from "./SpeciesSearchForm";
import styles from "./plants.module.css";

/**
 * S03 식물 추가 (wireframe pages 7–8). Name search and photo scan sit side by
 * side from the start. Search is connected (Perenual and Trefle); the photo
 * scan (Pl@ntNet) comes with the next PR, so it is shown but disabled with a
 * plain note. No popular or recommended list (ADR-0003 D11).
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
        <SpeciesSearchForm />
        <button type="button" className={styles.secondary} disabled aria-describedby="scan-note">
          식물 스캔
        </button>
        <p id="scan-note" className={styles.note}>
          사진 스캔은 아직 연결 중입니다. 이름으로 검색하거나 직접 입력해 주세요.
        </p>
      </div>

      <div className={styles.actions}>
        <Link href="/plants/new/manual" className={styles.secondary}>
          이름 직접 입력 / 종을 모르겠어요
        </Link>
      </div>
    </section>
  );
}

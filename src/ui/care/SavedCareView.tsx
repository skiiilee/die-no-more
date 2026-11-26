import Link from "next/link";
import { CARE_ACTIONS, SOIL_STATES, type SavedCareRecord } from "@/types/care";
import styles from "@/ui/plants/plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/** One saved S08 record (S06 최근 관리 기록 → this screen): only what was entered. */
export function SavedCareView({ potId, potName, record }: { potId: string; potName: string; record: SavedCareRecord }) {
  const soil = SOIL_STATES.find((state) => state.code === record.soilState)?.label ?? null;
  const label = (code: string) => CARE_ACTIONS.find((action) => action.code === code)?.label ?? code;

  return (
    <section className={styles.screen} aria-labelledby="saved-care-title">
      <div className={styles.header}>
        <h1 id="saved-care-title" className={styles.title}>
          관리 기록
        </h1>
        <Link href={`/plants/${potId}`} className={styles.back}>
          {potName}
        </Link>
      </div>
      <p className={styles.lead}>{dateFormat.format(new Date(record.recordedAt))}</p>

      {record.actions.length > 0 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>실제로 한 관리</h2>
          <ul className={styles.list} aria-label="실제로 한 관리">
            {record.actions.map((action) => (
              <li key={action.type}>
                {label(action.type)}
                {action.type === "water" && action.amountMl !== null ? ` · ${action.amountMl.toLocaleString("ko-KR")}ml` : ""}
                {action.notes ? <p className={styles.memo}>{action.notes}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {soil || record.observation ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>관찰</h2>
          {soil ? <p>흙 상태: {soil}</p> : null}
          {record.observation ? <p className={styles.memo}>{record.observation}</p> : null}
        </div>
      ) : null}

      {record.photos.length > 0 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>사진</h2>
          <ul className={styles.photoGrid} aria-label="기록 사진">
            {record.photos.map((photo, index) => (
              <li key={photo.id} className={styles.photoItem}>
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to the private bucket
                  <img src={photo.url} alt={`기록 사진 ${index + 1}`} className={styles.thumb} />
                ) : (
                  <span className={`${styles.thumb} ${styles.noPhoto}`} role="img" aria-label="사진을 불러오지 못함">
                    사진 없음
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {record.notes ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>메모</h2>
          <p className={styles.memo}>{record.notes}</p>
        </div>
      ) : null}
    </section>
  );
}

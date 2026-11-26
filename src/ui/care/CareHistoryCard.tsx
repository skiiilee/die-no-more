import Link from "next/link";
import { careSummaryText, type CareRecordSummary } from "@/types/care";
import styles from "@/ui/plants/plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/**
 * S06 최근 관리 기록: the pot's newest S08 records, each opening its detail,
 * and [관리 기록] to add one. The full history (S10) comes next. `justSaved`
 * says the record from S08 was stored.
 */
export function CareHistoryCard({
  potId,
  records,
  justSaved = false,
}: {
  potId: string;
  records: CareRecordSummary[];
  justSaved?: boolean;
}) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>최근 관리 기록</h2>
      {justSaved ? (
        <p role="status" className={styles.note}>
          관리 기록을 저장했습니다.
        </p>
      ) : null}
      {records.length === 0 ? (
        <p className={styles.note}>아직 남긴 관리 기록이 없습니다.</p>
      ) : (
        <ul className={styles.list} aria-label="최근 관리 기록">
          {records.map((record) => (
            <li key={record.id}>
              <Link href={`/plants/${potId}/records/${record.id}`} className={styles.back}>
                {dateFormat.format(new Date(record.recordedAt))} · {careSummaryText(record)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/plants/${potId}/records/new`} className={styles.secondary}>
        관리 기록
      </Link>
    </div>
  );
}

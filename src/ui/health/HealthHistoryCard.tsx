import Link from "next/link";
import type { SavedHealthSummary } from "@/types/health";
import styles from "@/ui/plants/plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/**
 * S06 건강 점검 기록: the pot's newest saved checks (S07-S), each opening its
 * detail. The full history (S10) comes with the care records. `justSaved`
 * says the check from S07-S was stored.
 */
export function HealthHistoryCard({
  potId,
  checks,
  justSaved = false,
}: {
  potId: string;
  checks: SavedHealthSummary[];
  justSaved?: boolean;
}) {
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>건강 점검 기록</h2>
      {justSaved ? (
        <p role="status" className={styles.note}>
          건강 점검 결과를 이 화분에 저장했습니다.
        </p>
      ) : null}
      {checks.length === 0 ? (
        <p className={styles.note}>아직 저장한 건강 점검이 없습니다.</p>
      ) : (
        <ul className={styles.list} aria-label="최근 건강 점검">
          {checks.map((check) => (
            <li key={check.id}>
              <Link href={`/plants/${potId}/health/${check.id}`} className={styles.back}>
                {dateFormat.format(new Date(check.analyzedAt))} ·{" "}
                {check.outcome === "found" && check.topCause ? `${check.topCause} 가능성` : "판단 어려움"}
                {check.hasAi ? " · AI 참고 포함" : ""}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/health?pot=${potId}`} className={styles.secondary}>
        건강 점검
      </Link>
    </div>
  );
}

import Link from "next/link";
import { FIXED_ACTIONS, NOTICED, SYMPTOMS, fixedChecks, type SavedHealthCheck } from "@/types/health";
import styles from "@/ui/plants/plants.module.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/**
 * A saved health check (S07-S → S06 → this screen). Shows what S07-B showed
 * when it was saved: the user's observation apart from the services, the
 * possible causes or '판단 어려움', the AI texts in their own cards with one
 * 'AI 생성' note at the bottom (ADR-0006 D4), the fixed checks, and the limits.
 */
export function SavedHealthView({ potId, potName, check }: { potId: string; potName: string; check: SavedHealthCheck }) {
  const symptoms = SYMPTOMS.filter((symptom) => check.symptoms.includes(symptom.code)).map((symptom) => symptom.label);
  const noticed = NOTICED.find((option) => option.code === check.noticed)?.label ?? "알 수 없음";
  const explanation = check.aiExplanation;
  const judgement = check.aiJudgement;
  const aiItems = explanation ? [...explanation.checks, ...explanation.actions] : [];

  return (
    <section className={styles.screen} aria-labelledby="saved-health-title">
      <div className={styles.header}>
        <h1 id="saved-health-title" className={styles.title}>
          건강 점검 기록
        </h1>
        <Link href={`/plants/${potId}`} className={styles.back}>
          {potName}
        </Link>
      </div>
      <p className={styles.lead}>{dateFormat.format(new Date(check.analyzedAt))} 점검 · 확정 진단이 아닙니다.</p>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>증상 사진</h2>
        <ul className={styles.photoGrid} aria-label="저장한 증상 사진">
          {check.photos.map((photo, index) => (
            <li key={photo.id} className={styles.photoItem}>
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to the private bucket
                <img src={photo.url} alt={`증상 사진 ${index + 1}`} className={styles.thumb} />
              ) : (
                <span className={`${styles.thumb} ${styles.noPhoto}`} role="img" aria-label="사진을 불러오지 못함">
                  사진 없음
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>내가 입력한 관찰</h2>
        <p>{symptoms.length > 0 ? symptoms.join(", ") : "고른 증상 없음"}</p>
        <p className={styles.note}>발견 시점: {noticed}</p>
        {check.notes ? <p className={styles.memo}>{check.notes}</p> : null}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>가능한 원인</h2>
        {check.causes.length === 0 ? (
          <p>판단 어려움: 사진에서 가능한 원인을 찾지 못했습니다.</p>
        ) : (
          <ol className={styles.list} aria-label="가능한 원인 후보">
            {check.causes.map((cause, index) => (
              <li key={cause.code}>
                <p>
                  <span className={styles.rank}>후보 {index + 1}</span> {cause.name} 가능성
                </p>
                <p className={styles.note}>EPPO 코드 {cause.code} · 추가 확인 필요</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {explanation && explanation.causes.length + aiItems.length > 0 ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>AI 참고 설명</h2>
          {explanation.causes.length > 0 ? (
            <ul className={styles.list} aria-label="원인 풀이">
              {explanation.causes.map((cause) => (
                <li key={cause.code}>
                  <p>{check.causes.find((item) => item.code === cause.code)?.name ?? cause.code}</p>
                  <p className={styles.note}>{cause.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {aiItems.length > 0 ? (
            <ul className={styles.list} aria-label="AI가 덧붙인 확인과 행동">
              {aiItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {judgement ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>AI의 사진 판단 (참고)</h2>
          {judgement.signs.length > 0 ? (
            <ul className={styles.list} aria-label="AI가 사진에서 본 징후">
              {judgement.signs.map((sign) => (
                <li key={sign}>{sign}</li>
              ))}
            </ul>
          ) : null}
          {judgement.causes.length > 0 ? (
            <ol className={styles.list} aria-label="AI가 본 가능한 원인">
              {judgement.causes.map((cause, index) => (
                <li key={cause.name}>
                  <p>
                    <span className={styles.rank}>후보 {index + 1}</span> {cause.name} 가능성
                  </p>
                  <p className={styles.note}>{cause.reason}</p>
                </li>
              ))}
            </ol>
          ) : null}
          {judgement.checks.length + judgement.actions.length > 0 ? (
            <ul className={styles.list} aria-label="AI가 덧붙인 확인·행동">
              {[...judgement.checks, ...judgement.actions].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>먼저 확인할 내용</h2>
        <ul className={styles.list}>
          {fixedChecks(check.symptoms).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h2 className={styles.cardTitle}>안전한 다음 행동</h2>
        <ul className={styles.list}>
          {FIXED_ACTIONS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>불확실성과 출처</h2>
        <p className={styles.note}>
          사진만으로 원인을 확정할 수 없습니다. 가능한 원인: Pl@ntNet 질병 식별({dateFormat.format(new Date(check.analyzedAt))}
          분석). 원인 이름은 Pl@ntNet의 영어 이름입니다.
        </p>
      </div>

      {check.hasAi ? (
        <p role="note" aria-label="AI 생성 안내" className={styles.note}>
          ※ AI 생성: &lsquo;AI 참고 설명&rsquo;과 &lsquo;AI의 사진 판단&rsquo;은 AI{check.aiModel ? `(${check.aiModel})` : ""}가 쓴
          참고 내용입니다. 사실 확인을 거치지 않았고 틀릴 수 있습니다. 그 밖의 확인 항목과 행동은 앱이 정해 둔 내용입니다.
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  FIXED_ACTIONS,
  NOTICED,
  SYMPTOMS,
  fixedChecks,
  type ExplainAnswer,
  type HealthAnswer,
  type HealthInput,
} from "@/types/health";
import styles from "@/ui/plants/plants.module.css";
import { Spinner } from "@/ui/shell/Spinner";
import { AiJudgePanel, type AiRecipient } from "./AiJudgePanel";
import { requestExplanation } from "./health-client";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" });

/**
 * S07-B 건강 결과 (wireframe §6, 03 §4 result structure). Never a diagnosis:
 * - what the user observed is shown apart from what the services suggest;
 * - Pl@ntNet's possible causes (rank only, no score as a probability, 03 §3-4),
 *   or '판단 어려움' when none passed;
 * - fixed checks and safe steps always; everything the AI wrote is kept in its
 *   own card ('AI 참고 설명', 'AI의 사진 판단') and marked once, in a note at the
 *   bottom, not on every line (owner decision 2026-11-22, ADR-0006 D4);
 * - the limits: photos alone cannot confirm a cause, source and time.
 * The AI explanation is asked for after this screen is shown; when it is off
 * or fails, the fixed parts are the whole result.
 */
export function HealthResult({
  answer,
  input,
  photos = [],
  aiRecipient = null,
  onAgain,
}: {
  answer: Extract<HealthAnswer, { kind: "ok" | "unclear" }>;
  input: HealthInput;
  /** The photos sent to Pl@ntNet, for asking the AI after '판단 어려움' (ADR-0006 D6). */
  photos?: Blob[];
  aiRecipient?: AiRecipient | null;
  onAgain: () => void;
}) {
  const candidates = answer.kind === "ok" ? answer.candidates : [];
  const [explained, setExplained] = useState<ExplainAnswer | "loading" | null>(candidates.length > 0 ? "loading" : null);

  useEffect(() => {
    if (candidates.length === 0) return;
    let live = true;
    void requestExplanation(answer.token, input).then((result) => {
      if (live) setExplained(result);
    });
    return () => {
      live = false;
    };
    // Asked once per shown result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  const ai = explained !== "loading" && explained?.kind === "ok" ? explained.explanation : null;
  const judgeOffered = candidates.length === 0 && aiRecipient !== null && photos.length > 0;
  const aiModel = ai?.model ?? aiRecipient?.model ?? null;
  const symptomLabels = SYMPTOMS.filter((symptom) => input.symptoms.includes(symptom.code)).map((symptom) => symptom.label);
  const noticed = NOTICED.find((option) => option.code === input.noticed)?.label ?? "알 수 없음";

  return (
    <section className={styles.screen} aria-labelledby="health-result-title">
      <div className={styles.header}>
        <h1 id="health-result-title" className={styles.title}>
          건강 점검 결과
        </h1>
        <button type="button" className={styles.back} onClick={onAgain}>
          뒤로
        </button>
      </div>
      <p role="note" className={styles.lead}>
        결과는 확정 진단이 아닙니다. 사진만으로는 원인을 확정할 수 없으니 아래 내용을 직접 확인해 주세요.
      </p>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>내가 입력한 관찰</h2>
        <p>{symptomLabels.length > 0 ? symptomLabels.join(", ") : "고른 증상 없음"}</p>
        <p className={styles.note}>발견 시점: {noticed}</p>
        {input.notes ? <p className={styles.memo}>{input.notes}</p> : null}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>가능한 원인</h2>
        {candidates.length === 0 ? (
          <p>판단 어려움: 사진에서 가능한 원인을 찾지 못했습니다. 증상이 더 잘 보이는 사진으로 다시 점검해 볼 수 있습니다.</p>
        ) : (
          <ol className={styles.list} aria-label="가능한 원인 후보">
            {candidates.map((candidate, index) => (
              <li key={candidate.code}>
                <p>
                  <span className={styles.rank}>후보 {index + 1}</span> {candidate.name} 가능성
                </p>
                <p className={styles.note}>EPPO 코드 {candidate.code} · 추가 확인 필요</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {explained === "loading" || ai ? (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>AI 참고 설명</h2>
          {explained === "loading" ? (
            <p className={`${styles.note} ${styles.aiLoading}`} role="status">
              <Spinner />
              가능한 원인을 쉬운 말로 풀어 쓰는 중입니다. 몇 초 걸릴 수 있습니다.
            </p>
          ) : null}
          {ai && ai.causes.length > 0 ? (
            <ul className={styles.list} aria-label="원인 풀이">
              {ai.causes.map((cause) => (
                <li key={cause.code}>
                  <p>{candidates.find((candidate) => candidate.code === cause.code)?.name ?? cause.code}</p>
                  <p className={styles.note}>{cause.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {ai && ai.checks.length + ai.actions.length > 0 ? (
            <ul className={styles.list} aria-label="AI가 덧붙인 확인과 행동">
              {[...ai.checks, ...ai.actions].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {judgeOffered && aiRecipient ? (
        <AiJudgePanel photos={photos} input={input} token={answer.token} recipient={aiRecipient} />
      ) : null}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>먼저 확인할 내용</h2>
        <ul className={styles.list}>
          {fixedChecks(input.symptoms).map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>안전한 다음 행동</h2>
        <ul className={styles.list}>
          {FIXED_ACTIONS.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
        <p className={styles.note}>약제나 처치가 꼭 필요하다고 판단하지 않습니다. 걱정되면 전문가에게 확인해 주세요.</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>불확실성과 출처</h2>
        <p className={styles.note}>
          사진만으로 원인을 확정할 수 없습니다. 가능한 원인: Pl@ntNet 질병 식별({dateFormat.format(new Date(answer.analyzedAt))}
          분석). 원인 이름은 Pl@ntNet의 영어 이름입니다.
          {answer.speciesName ? ` 대상 식물: ${answer.speciesName}.` : " 대상 식물을 정하지 않아 정확도가 더 낮을 수 있습니다."}
        </p>
        {explained !== "loading" && explained !== null && explained.kind !== "ok" ? (
          <p className={styles.note}>AI 설명은 지금 만들지 못해 기본 확인 항목만 보여 줍니다.</p>
        ) : null}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onAgain}>
          다시 점검
        </button>
      </div>
      <p className={styles.note}>결과를 화분에 저장하는 기능은 다음 단계에서 연결됩니다.</p>
      {ai || judgeOffered ? (
        <p role="note" aria-label="AI 생성 안내" className={styles.note}>
          ※ AI 생성: &lsquo;AI 참고 설명&rsquo;과 &lsquo;AI의 사진 판단&rsquo;은 AI{aiModel ? `(${aiModel})` : ""}가 쓴 참고
          내용입니다. 사실 확인을 거치지 않았고 틀릴 수 있습니다. 그 밖의 확인 항목과 행동은 앱이 정해 둔 내용입니다.
        </p>
      ) : null}
    </section>
  );
}

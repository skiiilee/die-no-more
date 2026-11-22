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

function AiMark() {
  return <span className={styles.aiMark}>AI 생성</span>;
}

/**
 * S07-B 건강 결과 (wireframe §6, 03 §4 result structure). Never a diagnosis:
 * - what the user observed is shown apart from what the services suggest;
 * - Pl@ntNet's possible causes (rank only, no score as a probability, 03 §3-4),
 *   or '판단 어려움' when none passed;
 * - fixed checks and safe steps always, AI additions marked 'AI 생성' (ADR-0006);
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
    void requestExplanation(candidates, input).then((result) => {
      if (live) setExplained(result);
    });
    return () => {
      live = false;
    };
    // Asked once per shown result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answer]);

  const ai = explained !== "loading" && explained?.kind === "ok" ? explained.explanation : null;
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
            {candidates.map((candidate, index) => {
              const text = ai?.causes.find((cause) => cause.code === candidate.code)?.text ?? null;
              return (
                <li key={candidate.code}>
                  <p>
                    <span className={styles.rank}>후보 {index + 1}</span> {candidate.name} 가능성
                  </p>
                  <p className={styles.note}>EPPO 코드 {candidate.code} · 추가 확인 필요</p>
                  {text ? (
                    <p className={styles.note}>
                      {text} <AiMark />
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
        {explained === "loading" ? (
          <p className={`${styles.note} ${styles.aiLoading}`} role="status">
            <Spinner />
            가능한 원인을 쉬운 말로 풀어 쓰는 중입니다. 몇 초 걸릴 수 있습니다.
          </p>
        ) : null}
      </div>

      {candidates.length === 0 && aiRecipient && photos.length > 0 ? (
        <AiJudgePanel photos={photos} input={input} recipient={aiRecipient} />
      ) : null}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>먼저 확인할 내용</h2>
        <ul className={styles.list}>
          {fixedChecks(input.symptoms).map((check) => (
            <li key={check}>{check}</li>
          ))}
          {ai?.checks.map((check) => (
            <li key={`ai-${check}`}>
              {check} <AiMark />
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>안전한 다음 행동</h2>
        <ul className={styles.list}>
          {FIXED_ACTIONS.map((action) => (
            <li key={action}>{action}</li>
          ))}
          {ai?.actions.map((action) => (
            <li key={`ai-${action}`}>
              {action} <AiMark />
            </li>
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
        {ai ? (
          <p className={styles.note}>
            &lsquo;AI 생성&rsquo; 항목은 AI({ai.model})가 위 결과와 고른 증상만 보고 쓴 참고 설명입니다. 사실 확인을 거치지
            않았습니다.
          </p>
        ) : null}
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
    </section>
  );
}

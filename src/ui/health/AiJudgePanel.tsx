"use client";

import { useState } from "react";
import type { AiJudgement, HealthInput } from "@/types/health";
import styles from "@/ui/plants/plants.module.css";
import { Spinner } from "@/ui/shell/Spinner";
import { requestAiJudgement } from "./health-client";

export type AiRecipient = { name: string; model: string };

export const JUDGE_MESSAGES: Record<string, string> = {
  none: "AI도 사진에서 판단할 만한 징후를 찾지 못했습니다. 증상이 더 잘 보이는 사진으로 다시 점검해 보세요.",
  consent_required: "AI에 사진을 보내는 데 동의해야 물어볼 수 있습니다.",
  stale: "점검한 지 30분이 지나 AI에게 물어볼 수 없습니다. [다시 점검]으로 다시 분석해 주세요.",
  not_allowed: "이 결과로는 AI에게 사진을 보낼 수 없습니다. [다시 점검]으로 다시 분석해 주세요.",
  quota: "오늘은 AI 판단을 더 이상 이용할 수 없습니다. 내일 다시 시도해 주세요.",
  unavailable: "지금은 AI에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  failed: "AI 답을 받지 못했습니다. 다시 시도해 주세요.",
  signed_out: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  network: "연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
};

function AiMark() {
  return <span className={styles.aiMark}>AI 생성</span>;
}

function Judgement({ judgement }: { judgement: AiJudgement }) {
  return (
    <>
      {judgement.signs.length > 0 ? (
        <>
          <h3 className={styles.cardTitle}>AI가 사진에서 본 징후</h3>
          <ul className={styles.list}>
            {judgement.signs.map((sign) => (
              <li key={sign}>
                {sign} <AiMark />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <h3 className={styles.cardTitle}>AI가 본 가능한 원인</h3>
      {judgement.causes.length > 0 ? (
        <ol className={styles.list} aria-label="AI가 본 가능한 원인">
          {judgement.causes.map((cause, index) => (
            <li key={cause.name}>
              <p>
                <span className={styles.rank}>후보 {index + 1}</span> {cause.name} 가능성 <AiMark />
              </p>
              <p className={styles.note}>{cause.reason}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p>판단 어려움: AI도 원인을 짚지 못했습니다.</p>
      )}
      {judgement.checks.length + judgement.actions.length > 0 ? (
        <>
          <h3 className={styles.cardTitle}>AI가 덧붙인 확인·행동</h3>
          <ul className={styles.list}>
            {[...judgement.checks, ...judgement.actions].map((item) => (
              <li key={item}>
                {item} <AiMark />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className={styles.note}>
        AI({judgement.model})가 사진만 보고 추정한 내용입니다. 확정 진단이 아니고 사실 확인을 거치지 않았으며 틀릴 수
        있습니다. 위의 기본 확인 항목을 먼저 확인해 주세요.
      </p>
    </>
  );
}

/**
 * S07-B '판단 어려움' → ask the AI with the same photos (ADR-0006 D6, owner
 * choice 2026-11-22). A separate consent, for this request only, names who
 * receives the photos and that the free tier may use them for training.
 * Notes are not sent. The answer is shown as the AI's own guess, marked.
 */
export function AiJudgePanel({
  photos,
  input,
  token,
  recipient,
}: {
  photos: Blob[];
  input: HealthInput;
  /** The signed '판단 어려움' result for these photos; the server checks it (ADR-0006 D6). */
  token: string;
  recipient: AiRecipient;
}) {
  const [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false);
  const [judgement, setJudgement] = useState<AiJudgement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ask = async () => {
    if (!consent || asking || photos.length === 0) return;
    setAsking(true);
    setMessage(null);
    const answer = await requestAiJudgement(photos, consent, input, token);
    setAsking(false);
    setConsent(false);
    if (answer.kind === "ok") {
      setJudgement(answer.judgement);
      return;
    }
    setMessage(answer.kind === "invalid" ? answer.message : (JUDGE_MESSAGES[answer.kind] ?? JUDGE_MESSAGES.failed));
  };

  if (judgement) {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>AI의 사진 판단 (참고)</h2>
        <Judgement judgement={judgement} />
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>AI에게 사진으로 다시 물어보기</h2>
      <p className={styles.note}>
        Pl@ntNet이 원인을 찾지 못했습니다. 원하면 같은 사진을 AI에 보내 보이는 징후와 가능한 원인을 물어볼 수 있습니다. AI의
        판단은 확정 진단이 아니며 틀릴 수 있습니다.
      </p>
      <label className={styles.choice}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={asking} />
        <span>{recipient.name}에 이 사진을 보내 판단을 받는 데 동의합니다.</span>
      </label>
      <p className={styles.note}>
        이번 요청에 한해 위치 정보를 지운 사진과 고른 증상·발견 시점·식물 이름만 {recipient.name}({recipient.model})에
        보냅니다. 추가 설명은 보내지 않습니다. 무료 등급이라 보낸 사진이 해당 서비스의 개선(학습)에 쓰일 수 있습니다. 이 앱
        서버에는 사진을 저장하지 않습니다.
      </p>
      {message ? (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      ) : null}
      {asking ? (
        <p className={`${styles.note} ${styles.aiLoading}`} role="status">
          <Spinner />
          AI가 사진을 보는 중입니다. 몇 초 걸릴 수 있습니다.
        </p>
      ) : null}
      <button type="button" className={styles.primary} onClick={ask} disabled={!consent || asking}>
        {asking ? "물어보는 중…" : "AI에게 사진으로 물어보기"}
      </button>
    </div>
  );
}

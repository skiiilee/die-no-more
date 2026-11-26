"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HealthInput } from "@/types/health";
import styles from "@/ui/plants/plants.module.css";
import { requestSave } from "./health-client";

export type HealthPot = { id: string; name: string };

export const SAVE_MESSAGES: Record<string, string> = {
  stale: "점검한 지 30분이 지나 저장할 수 없습니다. [다시 점검]으로 다시 분석해 주세요.",
  not_allowed: "이 결과는 저장할 수 없습니다. [다시 점검]으로 다시 분석해 주세요.",
  not_found: "고른 화분을 찾을 수 없습니다. 다른 화분을 골라 주세요.",
  failed: "결과를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  signed_out: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  network: "연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
};

/**
 * S07-S 이 화분에 결과 저장 (wireframe §6, 05 snapshot rule 6: saving needs
 * a pot). The pot chosen on S07-A is preselected. Saving sends the signed
 * result, the same photos and the signed AI texts; on success S06 of that pot
 * opens and lists it. `waiting` keeps the button off while the AI
 * explanation is still coming, so it is not left out by accident.
 */
export function HealthSaveCard({
  pots,
  input,
  photos,
  tokens,
  waiting,
}: {
  pots: HealthPot[];
  input: HealthInput;
  photos: Blob[];
  tokens: { result: string; explanation: string | null; judgement: string | null };
  waiting: boolean;
}) {
  const router = useRouter();
  const [potId, setPotId] = useState(input.potId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (pots.length === 0) {
    return (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>이 화분에 결과 저장</h2>
        <p className={styles.note}>등록한 화분이 없어 결과를 저장할 수 없습니다. 화분을 먼저 등록해 주세요.</p>
        <Link href="/plants/new" className={styles.secondary}>
          식물 추가
        </Link>
      </div>
    );
  }

  const save = async () => {
    if (!potId || saving || saved || waiting) return;
    setSaving(true);
    setMessage(null);
    const answer = await requestSave(photos, { ...input, potId }, tokens);
    if (answer.kind === "saved") {
      setSaved(true);
      router.push(`/plants/${answer.potId}?health=saved`);
      return;
    }
    setSaving(false);
    setMessage(answer.kind === "invalid" ? answer.message : (SAVE_MESSAGES[answer.kind] ?? SAVE_MESSAGES.failed));
  };

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>이 화분에 결과 저장</h2>
      <div className={styles.field}>
        <label htmlFor="health-save-pot" className={styles.label}>
          저장할 화분
        </label>
        <select
          id="health-save-pot"
          className={styles.select}
          value={potId}
          onChange={(event) => setPotId(event.target.value)}
          disabled={saving || saved}
        >
          <option value="">화분 고르기</option>
          {pots.map((pot) => (
            <option key={pot.id} value={pot.id}>
              {pot.name}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.note}>
        사진, 고른 증상과 추가 설명, 이 결과(AI 설명 포함)를 그 화분의 기록으로 저장합니다. 사진은 위치 정보를 지운 뒤 나만 볼
        수 있는 저장소에 보관합니다.
      </p>
      {message ? (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      ) : null}
      <button type="button" className={styles.primary} onClick={save} disabled={!potId || saving || saved || waiting}>
        {saved ? "저장했습니다" : saving ? "저장 중…" : waiting ? "AI 설명을 기다리는 중…" : "이 화분에 결과 저장"}
      </button>
    </div>
  );
}

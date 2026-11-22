"use client";

import { useCallback, useState } from "react";
import { HEALTH_LIMITS, NOTICED, SYMPTOMS, type HealthAnswer, type HealthInput, type NoticedCode, type SymptomCode } from "@/types/health";
import { PHOTO_RULES } from "@/types/photo";
import { fitRequest } from "@/ui/plants/photo-prep";
import { PhotoSourceDialog } from "@/ui/plants/PhotoSourceDialog";
import styles from "@/ui/plants/plants.module.css";
import { useUnsavedChanges } from "@/ui/shell/unsaved-changes";
import type { AiRecipient } from "./AiJudgePanel";
import { requestHealthCheck } from "./health-client";
import { HealthResult } from "./HealthResult";
import { usePhotoList } from "./use-photo-list";

export type HealthPot = { id: string; name: string };

export const HEALTH_MESSAGES: Record<string, string> = {
  consent_required: "Pl@ntNet 사진 전송에 동의해야 분석할 수 있습니다.",
  quota: "오늘은 사진 분석을 더 이상 이용할 수 없습니다. 오전 9시 이후 다시 시도해 주세요.",
  rejected: "사진을 분석하지 못했습니다. 증상이 잘 보이는 다른 사진으로 다시 시도해 주세요.",
  unavailable: "지금은 건강 점검 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  failed: "분석 결과를 받지 못했습니다. 다시 시도해 주세요.",
  signed_out: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  network: "연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
};

type Shown = { answer: Extract<HealthAnswer, { kind: "ok" | "unclear" }>; input: HealthInput; photos: Blob[] };

/**
 * S07-A 건강 점검 입력 → S07-B 결과 (wireframe §6, 03 §4 F05). Photos stay in
 * this tab; [분석하기] needs at least one prepared photo and this request's
 * consent (ADR-0003 D5), which is cleared after every request. A failure keeps
 * the photos and answers. [다시 점검] returns here with everything kept.
 * Saving the result to a pot (S07-S) comes in the next step.
 */
export function HealthCheckScreen({
  pots,
  initialPotId,
  aiRecipient = null,
}: {
  pots: HealthPot[];
  initialPotId: string | null;
  /** Who gets the photos if the user asks the AI after '판단 어려움'; null hides that option. */
  aiRecipient?: AiRecipient | null;
}) {
  const photos = usePhotoList();
  const [potId, setPotId] = useState<string>(initialPotId ?? "");
  const [symptoms, setSymptoms] = useState<SymptomCode[]>([]);
  const [noticed, setNoticed] = useState<NoticedCode>("unknown");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);

  useUnsavedChanges(photos.items.length > 0 && !sending);

  const toggle = (code: SymptomCode, on: boolean) =>
    setSymptoms((list) => (on ? [...list, code] : list.filter((other) => other !== code)));

  const tooLong = notes.trim().length > HEALTH_LIMITS.notes;
  const canSend = consent && photos.ready.length > 0 && !photos.preparing && !sending && !tooLong;

  const analyze = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const input: HealthInput = { symptoms, noticed, notes: notes.trim(), potId: potId || null };
    const fitted = await fitRequest(photos.ready.map((item) => ({ file: item.file, blob: item.blob })));
    const answer = fitted.ok
      ? await requestHealthCheck(fitted.blobs, consent, input)
      : ({ kind: "invalid", message: fitted.message } as const);
    setSending(false);
    setConsent(false);
    if (answer.kind === "ok" || answer.kind === "unclear") {
      setShown({ answer, input, photos: fitted.ok ? fitted.blobs : [] });
      return;
    }
    setError(answer.kind === "invalid" ? answer.message : (HEALTH_MESSAGES[answer.kind] ?? HEALTH_MESSAGES.failed));
  };

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  if (shown) {
    return (
      <HealthResult
        answer={shown.answer}
        input={shown.input}
        photos={shown.photos}
        aiRecipient={aiRecipient}
        onAgain={() => setShown(null)}
      />
    );
  }

  return (
    <section className={styles.screen} aria-labelledby="health-title">
      <div className={styles.header}>
        <h1 id="health-title" className={styles.title}>
          건강 점검
        </h1>
      </div>
      <p className={styles.lead}>증상 사진으로 가능한 원인을 찾아봅니다. 결과는 확정 진단이 아닙니다.</p>

      <div className={styles.card}>
        <div className={styles.field}>
          <label htmlFor="health-pot" className={styles.label}>
            대상 화분 (선택)
          </label>
          <select id="health-pot" className={styles.select} value={potId} onChange={(event) => setPotId(event.target.value)} disabled={sending}>
            <option value="">선택 안 함 / 미등록 식물</option>
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>증상 사진</h2>
        <p className={styles.note}>증상이 잘 보이게 1~{PHOTO_RULES.maxCount}장 골라 주세요. 잎 앞뒤, 줄기를 함께 찍으면 좋습니다.</p>
        {photos.items.length === 0 ? <p className={styles.note}>아직 고른 사진이 없습니다.</p> : null}
        <ul className={styles.photoGrid} aria-label="고른 증상 사진">
          {photos.items.map((item, index) => (
            <li key={item.key} className={styles.photoItem}>
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own photo
                <img src={item.previewUrl} alt={`증상 사진 ${index + 1}`} className={styles.thumb} />
              ) : (
                <span className={`${styles.thumb} ${styles.noPhoto}`} role="img" aria-label={`사진 ${index + 1} 준비 중`}>
                  {item.status === "error" ? "오류" : "준비 중"}
                </span>
              )}
              <span className={styles.note} aria-live="polite">
                {item.status === "preparing" ? "사진 줄이는 중" : null}
                {item.status === "ready" ? "준비됨" : null}
                {item.status === "error" ? <span className={styles.error}>{item.message}</span> : null}
              </span>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => photos.remove(item)}
                disabled={sending || item.status === "preparing"}
                aria-label={`사진 ${index + 1} 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
        {photos.notice ? <p className={styles.note}>{photos.notice}</p> : null}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setDialogOpen(true)}
          disabled={photos.items.length >= PHOTO_RULES.maxCount || sending}
        >
          + 증상 사진 추가
        </button>
      </div>

      <fieldset className={styles.card}>
        <legend className={styles.cardTitle}>어떤 증상이 보이나요? (선택)</legend>
        {SYMPTOMS.map((symptom) => (
          <label key={symptom.code} className={styles.choice}>
            <input
              type="checkbox"
              checked={symptoms.includes(symptom.code)}
              onChange={(event) => toggle(symptom.code, event.target.checked)}
              disabled={sending}
            />
            <span>{symptom.label}</span>
          </label>
        ))}
        <div className={styles.field}>
          <label htmlFor="health-noticed" className={styles.label}>
            발견 시점
          </label>
          <select
            id="health-noticed"
            className={styles.select}
            value={noticed}
            onChange={(event) => setNoticed(event.target.value as NoticedCode)}
            disabled={sending}
          >
            {NOTICED.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="health-notes" className={styles.label}>
            추가 설명 (선택, {HEALTH_LIMITS.notes}자까지)
          </label>
          <textarea
            id="health-notes"
            className={styles.input}
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            aria-invalid={tooLong || undefined}
            disabled={sending}
          />
          {tooLong ? <p className={styles.error}>추가 설명은 {HEALTH_LIMITS.notes}자까지 쓸 수 있습니다.</p> : null}
        </div>
      </fieldset>

      <div className={styles.card}>
        <label className={styles.choice}>
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={sending} />
          <span>Pl@ntNet에 사진을 보내 건강 상태를 분석하는 데 동의합니다.</span>
        </label>
        <p className={styles.note}>
          동의하고 [분석하기]를 누르면 이번 요청에 한해 위 사진만 위치 정보를 지운 뒤 Pl@ntNet으로 보냅니다. 이 앱 서버에는
          사진을 저장하지 않습니다. 결과 설명을 돕는 AI에는 사진과 추가 설명을 보내지 않고, 고른 증상·발견 시점·식물
          이름과 Pl@ntNet 결과만 보냅니다.
        </p>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <button type="button" className={styles.primary} onClick={analyze} disabled={!canSend}>
          {sending ? "분석 중…" : "분석하기"}
        </button>
      </div>

      {dialogOpen ? (
        <PhotoSourceDialog
          onCancel={closeDialog}
          onPick={(files) => {
            setDialogOpen(false);
            photos.add(files);
          }}
        />
      ) : null}
    </section>
  );
}

"use client";

import { CARE_ACTIONS, CARE_LIMITS, SOIL_STATES, type CareActionCode } from "@/types/care";
import styles from "@/ui/plants/plants.module.css";
import type { CareForm } from "./care-client";

export type CarePot = { id: string; name: string };

/** Which text is over its limit, for the inline messages and the save button. */
export function overLimits(form: CareForm) {
  return {
    fertilize: form.actionNotes.fertilize.trim().length > CARE_LIMITS.actionNotes,
    repot: form.actionNotes.repot.trim().length > CARE_LIMITS.actionNotes,
    prune: form.actionNotes.prune.trim().length > CARE_LIMITS.actionNotes,
    observation: form.observation.trim().length > CARE_LIMITS.observation,
    notes: form.notes.trim().length > CARE_LIMITS.notes,
  };
}

/** A watering amount that is filled in but not a whole number of ml in range. */
export function badWater(form: CareForm): boolean {
  const amount = form.waterMl.trim();
  if (!form.actions.includes("water") || amount === "") return false;
  return !/^\d+$/.test(amount) || Number(amount) < 1 || Number(amount) > CARE_LIMITS.waterMaxMl;
}

/**
 * The S08 fields (wireframe §7): pot, shared date and time, the four
 * activities with their optional details, soil state, observation and the
 * common memo. Everything is optional and shown at once; nothing is chosen
 * first. Photos are a separate part of the screen.
 */
export function CareFormFields({
  pots,
  form,
  maxTime,
  disabled,
  onChange,
}: {
  pots: CarePot[];
  form: CareForm;
  /** The latest time the field offers (now, Korean time). */
  maxTime: string;
  disabled: boolean;
  onChange(change: Partial<CareForm>): void;
}) {
  const over = overLimits(form);
  const toggle = (code: CareActionCode, on: boolean) =>
    onChange({ actions: on ? [...form.actions, code] : form.actions.filter((other) => other !== code) });
  const setNote = (code: Exclude<CareActionCode, "water">, value: string) =>
    onChange({ actionNotes: { ...form.actionNotes, [code]: value } });

  return (
    <>
      <div className={styles.card}>
        <div className={styles.field}>
          <label htmlFor="care-pot" className={styles.label}>
            화분
          </label>
          <select
            id="care-pot"
            className={styles.select}
            value={form.potId}
            onChange={(event) => onChange({ potId: event.target.value })}
            disabled={disabled}
          >
            <option value="">화분 고르기</option>
            {pots.map((pot) => (
              <option key={pot.id} value={pot.id}>
                {pot.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="care-time" className={styles.label}>
            수행 날짜와 시간
          </label>
          <input
            id="care-time"
            type="datetime-local"
            className={styles.input}
            value={form.recordedAt}
            max={maxTime}
            onChange={(event) => onChange({ recordedAt: event.target.value })}
            disabled={disabled}
            suppressHydrationWarning
          />
          <p className={styles.note}>아래에 입력한 모든 항목에 이 시간이 함께 기록됩니다.</p>
        </div>
      </div>

      <fieldset className={styles.card}>
        <legend className={styles.cardTitle}>실제로 한 관리 (선택)</legend>
        {CARE_ACTIONS.map((action) => {
          const on = form.actions.includes(action.code);
          return (
            <div key={action.code} className={styles.field}>
              <label className={styles.choice}>
                <input type="checkbox" checked={on} onChange={(event) => toggle(action.code, event.target.checked)} disabled={disabled} />
                <span>{action.label}</span>
              </label>
              {on && action.code === "water" ? (
                <>
                  <label htmlFor="care-water" className={styles.label}>
                    물의 양 (선택, ml)
                  </label>
                  <input
                    id="care-water"
                    className={styles.input}
                    inputMode="numeric"
                    value={form.waterMl}
                    onChange={(event) => onChange({ waterMl: event.target.value })}
                    aria-invalid={badWater(form) || undefined}
                    disabled={disabled}
                  />
                  {badWater(form) ? (
                    <p className={styles.error}>1~{CARE_LIMITS.waterMaxMl.toLocaleString("ko-KR")} 사이의 숫자로 입력해 주세요.</p>
                  ) : null}
                </>
              ) : null}
              {on && action.code !== "water" ? (
                <>
                  <label htmlFor={`care-${action.code}-notes`} className={styles.label}>
                    {action.label} 메모 (선택)
                  </label>
                  <input
                    id={`care-${action.code}-notes`}
                    className={styles.input}
                    value={form.actionNotes[action.code]}
                    onChange={(event) => setNote(action.code as Exclude<CareActionCode, "water">, event.target.value)}
                    aria-invalid={over[action.code] || undefined}
                    disabled={disabled}
                  />
                  {over[action.code] ? <p className={styles.error}>{CARE_LIMITS.actionNotes}자까지 쓸 수 있습니다.</p> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={styles.cardTitle}>흙 상태 (선택)</legend>
        <p className={styles.note}>흙 상태 확인은 관찰로만 기록되며, 물을 준 기록이 되지 않습니다.</p>
        {SOIL_STATES.map((state) => (
          <label key={state.code} className={styles.choice}>
            <input
              type="radio"
              name="care-soil"
              checked={form.soilState === state.code}
              onChange={() => onChange({ soilState: state.code })}
              disabled={disabled}
            />
            <span>{state.label}</span>
          </label>
        ))}
        {form.soilState ? (
          <button type="button" className={styles.secondary} onClick={() => onChange({ soilState: null })} disabled={disabled}>
            흙 상태 선택 지우기
          </button>
        ) : null}
      </fieldset>

      <div className={styles.card}>
        <div className={styles.field}>
          <label htmlFor="care-observation" className={styles.label}>
            잎·해충·환경 관찰 (선택, {CARE_LIMITS.observation}자까지)
          </label>
          <textarea
            id="care-observation"
            className={styles.input}
            rows={3}
            value={form.observation}
            onChange={(event) => onChange({ observation: event.target.value })}
            aria-invalid={over.observation || undefined}
            disabled={disabled}
          />
          {over.observation ? <p className={styles.error}>관찰 내용은 {CARE_LIMITS.observation}자까지 쓸 수 있습니다.</p> : null}
        </div>
        <div className={styles.field}>
          <label htmlFor="care-notes" className={styles.label}>
            공통 메모 (선택, {CARE_LIMITS.notes}자까지)
          </label>
          <textarea
            id="care-notes"
            className={styles.input}
            rows={2}
            value={form.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
            aria-invalid={over.notes || undefined}
            disabled={disabled}
          />
          {over.notes ? <p className={styles.error}>공통 메모는 {CARE_LIMITS.notes}자까지 쓸 수 있습니다.</p> : null}
        </div>
      </div>
    </>
  );
}

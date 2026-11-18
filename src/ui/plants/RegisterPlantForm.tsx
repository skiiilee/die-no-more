"use client";

import { useActionState, useState } from "react";
import { registerPotAction } from "@/runtime/plant-actions";
import { GuardedLink } from "@/ui/shell/GuardedLink";
import { useUnsavedChanges } from "@/ui/shell/unsaved-changes";
import {
  ENVIRONMENTS,
  LAST_REPOTTED_RANGES,
  LAST_WATERED_RANGES,
  LIGHT_LEVELS,
  POT_MATERIALS,
  TEXT_LIMITS,
  type PlantIdentity,
  type RegisterFormState,
  type ReminderOptions,
} from "@/types/plant";
import { SelectField, TextAreaField, TextField } from "./FormFields";
import { PotPhotoPicker } from "./PotPhotoPicker";
import { usePickedPhoto } from "./use-picked-photo";
import styles from "./plants.module.css";

const INITIAL: RegisterFormState = { status: "idle", errors: {}, values: {} };

type Props = {
  identity: PlantIdentity;
  plantName: string;
  reminders: ReminderOptions;
  /** Where [뒤로] goes: S05-M for manual/unknown, S04-B for a species. */
  backHref: string;
};

/**
 * S05 내 화분 등록 (wireframe pages 17–18, choices from page 38). One scrolling
 * form on mobile, two columns on PC. Every choice is required; text fields are
 * optional. Period choices are stored as categories,
 * never as dates (05 rule 1). Reminder choices appear only for types the
 * species' API data supports (05 rule 2); otherwise the area is hidden.
 */
export function RegisterPlantForm({ identity, plantName, reminders, backHref }: Props) {
  const [state, formAction, pending] = useActionState(registerPotAction, INITIAL);
  const [dirty, setDirty] = useState(false);
  // Kept outside the form fields, so it survives the remount after an answer.
  const picked = usePickedPhoto();
  // The server's photo message is about the photo sent with that answer; a new pick replaces it.
  const [photoChangedAt, setPhotoChangedAt] = useState<RegisterFormState | null>(null);
  const serverPhotoError = photoChangedAt === state ? null : (state.errors.photo ?? null);
  // The answer that was on screen when [식물 추가하기] was pressed. While it is
  // still the current answer, the save is running or redirecting to S06, so
  // leaving is expected. A new answer (invalid, save_failed) re-arms the warning.
  const [submittedAt, setSubmittedAt] = useState<RegisterFormState | null>(null);
  const saving = submittedAt === state;

  // Warn before unsaved input is lost (02-wireframes §1).
  useUnsavedChanges(dirty && !saving);

  const { errors, values } = state;
  const showReminders = reminders.water || reminders.fertilizer;
  // Remount the fields after each answer so they show the echoed values.
  const formKey = JSON.stringify(values);

  // The prepared photo travels with the fields; the picker itself sends nothing.
  const submit = (formData: FormData) => {
    formData.delete("photo");
    if (picked.photo) formData.set("photo", picked.photo, "pot-photo.jpg");
    formAction(formData);
  };

  return (
    <section className={styles.screen} aria-labelledby="register-title">
      <div className={styles.header}>
        <h1 id="register-title" className={styles.title}>
          내 화분 등록
        </h1>
        <GuardedLink href={backHref} className={styles.back}>
          뒤로
        </GuardedLink>
      </div>

      {state.status === "save_failed" ? (
        <p role="alert" className={styles.error}>
          저장하지 못했습니다. 입력한 내용은 그대로 있으니 다시 시도해 주세요.
        </p>
      ) : null}
      {errors.identity ? (
        <p role="alert" className={styles.error}>
          {errors.identity} <GuardedLink href="/plants/new">식물 추가로 돌아가기</GuardedLink>
        </p>
      ) : null}
      {state.status === "invalid" && !errors.identity ? (
        <p role="alert" className={styles.error}>
          표시된 항목을 확인해 주세요.
        </p>
      ) : null}

      <form
        key={formKey}
        action={submit}
        className={styles.columns}
        onChange={() => setDirty(true)}
        onSubmit={() => setSubmittedAt(state)}
        noValidate
      >
        <IdentityFields identity={identity} />

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>식물 추가</h2>
          <PotPhotoPicker
            previewUrl={picked.previewUrl}
            preparing={picked.preparing}
            error={picked.error ?? serverPhotoError}
            onPick={(file) => {
              setDirty(true);
              setPhotoChangedAt(state);
              void picked.pick(file);
            }}
            onClear={() => {
              setPhotoChangedAt(state);
              picked.clear();
            }}
          />
          <p className={styles.note}>
            식물 이름: <strong>{plantName}</strong>
          </p>
          <TextField
            name="nickname"
            label="화분 별명 (선택)"
            placeholder="예: 거실 몬스테라"
            max={TEXT_LIMITS.nickname}
            hint="비워 두면 식물 이름으로 표시합니다."
            defaultValue={values.nickname}
            error={errors.nickname}
          />
          <TextField
            name="location"
            label="관리 장소 (선택)"
            placeholder="예: 거실 창가"
            max={TEXT_LIMITS.location}
            defaultValue={values.location}
            error={errors.location}
          />
          <SelectField
            name="environment"
            label="실내 / 실외"
            options={ENVIRONMENTS}
            defaultValue={values.environment ?? "indoor"}
            error={errors.environment}
          />
          <TextAreaField
            name="memo"
            label="메모 (선택)"
            max={TEXT_LIMITS.memo}
            defaultValue={values.memo}
            error={errors.memo}
          />
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>지금까지 어떻게 관리했나요?</h2>
          <p className={styles.note}>
            고른 시기는 오늘 기준의 대략적인 기간으로만 저장합니다. 실제 물주기·분갈이 기록으로 만들지 않습니다.
          </p>
          <SelectField
            name="lastWatered"
            label="마지막으로 물 준 시기"
            options={LAST_WATERED_RANGES}
            defaultValue={values.lastWatered}
            error={errors.lastWatered}
          />
          <SelectField
            name="lightLevel"
            label="빛이 얼마나 들어오나요?"
            options={LIGHT_LEVELS}
            defaultValue={values.lightLevel}
            error={errors.lightLevel}
          />
          <SelectField
            name="lastRepotted"
            label="마지막 분갈이 시기"
            options={LAST_REPOTTED_RANGES}
            defaultValue={values.lastRepotted}
            error={errors.lastRepotted}
          />
          <SelectField
            name="potMaterial"
            label="화분의 재질"
            options={POT_MATERIALS}
            defaultValue={values.potMaterial}
            error={errors.potMaterial}
          />

          {showReminders ? (
            <fieldset className={styles.field}>
              <legend className={styles.label}>알림 설정</legend>
              {reminders.water ? (
                <label className={styles.choice}>
                  <input type="checkbox" name="waterReminder" defaultChecked={values.waterReminder === "on"} />물
                  알림 (흙 상태 확인)
                </label>
              ) : null}
              {reminders.fertilizer ? (
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    name="fertilizerReminder"
                    defaultChecked={values.fertilizerReminder === "on"}
                  />
                  비료 알림
                </label>
              ) : null}
            </fieldset>
          ) : null}

          <button type="submit" className={styles.primary} disabled={pending || picked.preparing}>
            {pending ? "저장 중…" : "식물 추가하기"}
          </button>
        </div>
      </form>
    </section>
  );
}

function IdentityFields({ identity }: { identity: PlantIdentity }) {
  return (
    <>
      <input type="hidden" name="mode" value={identity.kind} />
      {identity.kind === "species" ? <input type="hidden" name="species" value={identity.speciesId} /> : null}
      {identity.kind === "manual" ? <input type="hidden" name="name" value={identity.name} /> : null}
    </>
  );
}

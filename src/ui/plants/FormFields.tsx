import type { Option, RegistrationField } from "@/types/plant";
import styles from "./plants.module.css";

/** S05 form controls: label, hint and error wired together for screen readers. */

type FieldProps = {
  name: RegistrationField;
  label: string;
  defaultValue?: string;
  error?: string;
};

function describedBy(name: string, error?: string, hint?: string) {
  const ids = [error ? `${name}-error` : null, hint ? `${name}-hint` : null].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

function FieldMessages({ name, error, hint }: { name: string; error?: string; hint?: string }) {
  return (
    <>
      {hint ? (
        <p id={`${name}-hint`} className={styles.note}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}

export function TextField({
  name,
  label,
  placeholder,
  max,
  hint,
  defaultValue,
  error,
}: FieldProps & { placeholder?: string; max: number; hint?: string }) {
  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <input
        id={name}
        name={name}
        className={styles.input}
        placeholder={placeholder}
        maxLength={max}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error, hint)}
      />
      <FieldMessages name={name} error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({ name, label, max, defaultValue, error }: FieldProps & { max: number }) {
  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        className={styles.textarea}
        maxLength={max}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error)}
      />
      <FieldMessages name={name} error={error} />
    </div>
  );
}

/** Every S05 choice is required (user decision, 2026-11-13). */
export function SelectField<T extends string>({
  name,
  label,
  options,
  defaultValue,
  error,
}: FieldProps & { options: readonly Option<T>[] }) {
  return (
    <div className={styles.field}>
      <label htmlFor={name} className={styles.label}>
        {label}
      </label>
      <select
        id={name}
        name={name}
        className={styles.select}
        defaultValue={defaultValue ?? ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(name, error)}
        required
      >
        <option value="" disabled>
          선택해 주세요
        </option>
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessages name={name} error={error} />
    </div>
  );
}

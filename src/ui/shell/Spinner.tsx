import styles from "./Spinner.module.css";

/**
 * Small turning ring shown while a screen waits for data. Decorative: the
 * text next to it ("검색 중…") or a role="status" message says what is
 * happening, so it is hidden from screen readers.
 */
export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" data-testid="spinner" />;
}

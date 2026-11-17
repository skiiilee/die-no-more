import styles from "./Spinner.module.css";

/**
 * Small turning ring shown while a screen waits for data. Decorative: the
 * text next to it ("검색 중…") or a role="status" message says what is
 * happening, so it is hidden from screen readers.
 */
export function Spinner({ size = "small" }: { size?: "small" | "large" }) {
  const className = size === "large" ? `${styles.spinner} ${styles.large}` : styles.spinner;
  return <span className={className} aria-hidden="true" data-testid={size === "large" ? "spinner-large" : "spinner"} />;
}

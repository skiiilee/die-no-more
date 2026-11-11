import styles from "./ScreenPlaceholder.module.css";

/** Fallback while the session check and screen data stream in. */
export function ScreenLoading() {
  return (
    <p role="status" className={styles.loading}>
      불러오는 중…
    </p>
  );
}

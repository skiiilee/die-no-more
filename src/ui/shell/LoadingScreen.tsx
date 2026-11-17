import { Spinner } from "./Spinner";
import styles from "./Spinner.module.css";

/**
 * Whole-screen waiting state for a screen whose data comes from providers
 * and takes a few seconds (for example S04-B). A large spinner and a message,
 * centred; the message is a status for screen readers.
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <div role="status" className={styles.screen}>
      <Spinner size="large" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}

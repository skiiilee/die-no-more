import styles from "./ScreenPlaceholder.module.css";

/**
 * Temporary body for screens that later PRs implement. States plainly that
 * the screen is not built yet, so no fake plant data is shown.
 */
export function ScreenPlaceholder({ screen, title }: { screen: string; title: string }) {
  return (
    <section aria-labelledby="screen-title">
      <h1 id="screen-title" className={styles.title}>
        {title}
      </h1>
      <p className={styles.note}>
        이 화면({screen})은 아직 구현 중입니다.
      </p>
    </section>
  );
}

import styles from "./plants.module.css";

/**
 * A provider's reference photo, or '사진 없음' when it gave none (S04 image
 * rule). Never a photo the user uploaded. Plain <img>: the hosts vary by
 * provider and the files are already sized thumbnails.
 */
export function SpeciesPhoto({ url, name, size }: { url: string | null; name: string; size: "small" | "large" }) {
  const className = size === "small" ? styles.thumb : styles.photo;
  if (!url) {
    return (
      <span className={`${className} ${styles.noPhoto}`} role="img" aria-label="사진 없음">
        사진 없음
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote provider thumbnails from varying hosts
    <img src={url} alt={`${name} 참고 사진`} className={className} loading="lazy" referrerPolicy="no-referrer" />
  );
}

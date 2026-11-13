import Link from "next/link";
import { ENVIRONMENTS, optionLabel, plantName, potDisplayName, type PotView } from "@/types/plant";
import styles from "./plants.module.css";

/**
 * S11 내 식물 (wireframe pages 32–33). Each pot is its own card, so two pots
 * of the same species stay apart. Search, filters and the archive view come
 * with S11-R.
 */
export function PlantList({ pots }: { pots: PotView[] }) {
  return (
    <section className={styles.screen} aria-labelledby="plants-title">
      <div className={styles.header}>
        <h1 id="plants-title" className={styles.title}>
          내 식물
        </h1>
        <Link href="/plants/new" className={styles.primary}>
          + 추가
        </Link>
      </div>

      {pots.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.lead}>식물이 아직 없어요. 등록부터 시작해 보세요.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {pots.map((pot) => {
            const name = potDisplayName(pot);
            const meta = [
              pot.nickname ? plantName(pot) : null,
              pot.location,
              optionLabel(ENVIRONMENTS, pot.environment),
            ].filter(Boolean);
            return (
              <li key={pot.id}>
                <Link href={`/plants/${pot.id}`} className={styles.potLink}>
                  <span className={styles.potName}>{name}</span>
                  {meta.length > 0 ? <span className={styles.potMeta}>{meta.join(" · ")}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

import Link from "next/link";
import type { SpeciesCare, SpeciesPreview } from "@/types/species";
import { SpeciesCareFacts } from "./SpeciesCare";
import { SpeciesPhoto } from "./SpeciesPhoto";
import styles from "./plants.module.css";

/**
 * S04-B 식물 정보 확인 (wireframe pages 13–14). Shows only what providers
 * returned; empty items say '정보 없음' and nothing is generated (03 §3-6).
 * Nothing is saved as a pot until [이 식물 추가하기] → S05 → [식물 추가하기].
 */
/** Where S04-B [뒤로] goes: the name search or the photo identification it came from. */
export type PreviewBack = { kind: "search"; query: string } | { kind: "identify"; sessionId: string } | null;

function backHrefFor(back: PreviewBack): string {
  if (back?.kind === "search") return `/plants/new/search?${new URLSearchParams({ q: back.query }).toString()}`;
  if (back?.kind === "identify") return `/plants/new/identify/${back.sessionId}`;
  return "/plants/new";
}

/**
 * `aiCare`: the care AI step, when `preview.aiFill` is not empty. The screen
 * shows at once with those fields as 불러오는 중, and they fill in when it ends.
 */
export function SpeciesPreviewScreen({
  preview,
  back,
  aiCare = null,
}: {
  preview: SpeciesPreview;
  back: PreviewBack;
  aiCare?: Promise<SpeciesCare> | null;
}) {
  const name = preview.koreanName ?? preview.scientificName;
  const backHref = backHrefFor(back);
  const addHref = `/plants/new/register?${new URLSearchParams({ mode: "species", species: preview.id }).toString()}`;

  return (
    <section className={styles.screen} aria-labelledby="species-title">
      <div className={styles.header}>
        <span className={styles.lead}>식물 정보 확인</span>
        <Link href={backHref} className={styles.back}>
          뒤로
        </Link>
      </div>

      <div className={styles.columns}>
        <div>
          <SpeciesPhoto url={preview.imageUrl} name={name} size="large" />
          {preview.imageUrl && preview.imageCredit ? <p className={styles.credit}>사진: {preview.imageCredit}</p> : null}
        </div>
        <div className={styles.card}>
          <div>
            <h1 id="species-title" className={styles.title}>
              {name}
            </h1>
            {preview.koreanName ? <p className={styles.scientificSub}>{preview.scientificName}</p> : null}
          </div>
          <h2 className={styles.cardTitle}>기본 정보</h2>
          <SpeciesCareFacts care={preview.care} aiFill={preview.aiFill} aiCare={aiCare} place="preview" />
        </div>
      </div>

      <div className={styles.actions}>
        <Link href={addHref} className={styles.primary}>
          이 식물 추가하기
        </Link>
        <Link href="/plants/new" className={styles.secondary}>
          다시 검색하기
        </Link>
      </div>
    </section>
  );
}

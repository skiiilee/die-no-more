import Link from "next/link";
import type { IdentificationView } from "@/types/photo";
import { SpeciesPhoto } from "./SpeciesPhoto";
import styles from "./plants.module.css";

function speciesHref(speciesId: string, sessionId: string) {
  return `/plants/new/species/${speciesId}?${new URLSearchParams({ session: sessionId }).toString()}`;
}

function Body({ view }: { view: IdentificationView }) {
  if (view.kind === "failed") {
    return (
      <p role="alert" className={styles.error}>
        이 사진 찾기는 완료되지 않았습니다. 다시 시도하거나 이름으로 검색해 주세요.
      </p>
    );
  }
  if (view.kind === "processing") {
    return <p className={styles.note}>아직 결과를 받는 중입니다. 잠시 후 이 화면을 새로 고쳐 주세요.</p>;
  }
  if (view.candidates.length === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.lead}>사진으로 식물을 찾지 못했습니다.</p>
        <p className={styles.note}>
          식물이 잘 보이는 다른 사진으로 다시 찾거나, 이름으로 검색하거나, 직접 입력해 주세요.
        </p>
      </div>
    );
  }
  return (
    <>
      <p className={styles.note}>
        사진과 비슷한 순서로 보여 줍니다. 확정된 결과가 아니니 정보를 확인한 뒤 골라 주세요.
      </p>
      <ol className={styles.list} aria-label="사진으로 찾은 후보">
        {view.candidates.map((candidate) => {
          const name = candidate.koreanName ?? candidate.scientificName;
          return (
            <li key={candidate.speciesId} className={styles.candidate}>
              <SpeciesPhoto url={candidate.imageUrl} name={name} size="small" />
              <span className={styles.candidateNames}>
                <span className={styles.rank}>후보 {candidate.rank}</span>
                {candidate.koreanName ? <span className={styles.potName}>{candidate.koreanName}</span> : null}
                <span className={candidate.koreanName ? styles.scientificSub : styles.scientificMain}>
                  {candidate.scientificName}
                </span>
                {candidate.imageCredit ? <span className={styles.credit}>사진: {candidate.imageCredit}</span> : null}
              </span>
              <Link href={speciesHref(candidate.speciesId, view.sessionId)} className={styles.secondary} aria-label={`${name} 보기`}>
                보기
              </Link>
            </li>
          );
        })}
      </ol>
      <p className={styles.note}>식별 자료: Pl@ntNet</p>
    </>
  );
}

/**
 * S04-A for a photo identification (wireframe 02 §S04-A). Rank, Korean name
 * when known, scientific name and Pl@ntNet's reference photo with its credit.
 * The score is not shown as a probability (03 §3-4). The user's own photos
 * are never shown as a candidate's photo. Nothing is added from here.
 */
export function IdentificationResults({ view }: { view: IdentificationView }) {
  return (
    <section className={styles.screen} aria-labelledby="identify-title">
      <div className={styles.header}>
        <h1 id="identify-title" className={styles.title}>
          사진으로 찾은 식물
        </h1>
        <Link href="/plants/new" className={styles.back}>
          뒤로
        </Link>
      </div>

      <Body view={view} />

      <div className={styles.actions}>
        <Link href="/plants/new/manual" className={styles.secondary}>
          직접 입력하기
        </Link>
        <Link href="/plants/new" className={styles.secondary}>
          다시 검색하기
        </Link>
      </div>
    </section>
  );
}

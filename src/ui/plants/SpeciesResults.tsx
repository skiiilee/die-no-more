import Link from "next/link";
import type { SearchOutcome, SpeciesCandidate } from "@/types/species";
import { SpeciesPhoto } from "./SpeciesPhoto";
import { SpeciesSearchForm } from "./SpeciesSearchForm";
import styles from "./plants.module.css";

/** Fixed wording from 03 §3 "오류". */
export const QUOTA_MESSAGE = "오늘은 식물 검색을 더 이상 이용할 수 없습니다. 내일 다시 시도해 주세요.";

function speciesHref(candidate: SpeciesCandidate, query: string) {
  return `/plants/new/species/${candidate.id}?${new URLSearchParams({ q: query }).toString()}`;
}

function Message({ outcome }: { outcome: Exclude<SearchOutcome, { kind: "results" }> }) {
  switch (outcome.kind) {
    case "invalid":
      return <p role="alert" className={styles.error}>{outcome.message}</p>;
    case "quota":
      return <p role="alert" className={styles.error}>{QUOTA_MESSAGE}</p>;
    case "unavailable":
      return (
        <p role="alert" className={styles.error}>
          지금은 식물 검색에 연결할 수 없습니다. 잠시 후 다시 시도하거나 직접 입력해 주세요.
        </p>
      );
    case "empty":
      return (
        <div className={styles.card}>
          <p className={styles.lead}>‘{outcome.query}’에 맞는 식물을 찾지 못했습니다.</p>
          {outcome.korean ? (
            <p className={styles.note}>
              한국어 이름은 아직 일부 식물만 검색됩니다. 학명이나 영어 이름으로 다시 검색하거나 직접 입력해 주세요.
            </p>
          ) : null}
          {outcome.partial ? <PartialNote /> : null}
        </div>
      );
  }
}

function PartialNote() {
  return <p className={styles.note}>일부 검색 서비스에 연결하지 못해 빠진 결과가 있을 수 있습니다.</p>;
}

/**
 * S04-A 검색 결과 (wireframe pages 11–12). Korean name when known, scientific
 * name always, and the provider's reference photo only when it gave one. A
 * result opens S04-B; nothing is added to my plants from here.
 */
export function SpeciesResults({ outcome }: { outcome: SearchOutcome }) {
  return (
    <section className={styles.screen} aria-labelledby="results-title">
      <div className={styles.header}>
        <h1 id="results-title" className={styles.title}>
          검색 결과
        </h1>
        <Link href="/plants/new" className={styles.back}>
          뒤로
        </Link>
      </div>

      <SpeciesSearchForm query={outcome.query} />

      {outcome.kind === "results" ? (
        <>
          {outcome.partial ? <PartialNote /> : null}
          {outcome.dropped ? <p className={styles.note}>일부 결과를 저장하지 못해 목록에서 뺐습니다.</p> : null}
          <ul className={styles.list} aria-label="검색된 식물">
            {outcome.candidates.map((candidate) => (
              <li key={candidate.id} className={styles.candidate}>
                <SpeciesPhoto url={candidate.imageUrl} name={candidate.koreanName ?? candidate.scientificName} size="small" />
                <span className={styles.candidateNames}>
                  {candidate.koreanName ? <span className={styles.potName}>{candidate.koreanName}</span> : null}
                  <span className={candidate.koreanName ? styles.scientificSub : styles.scientificMain}>
                    {candidate.scientificName}
                  </span>
                  {candidate.imageUrl && candidate.imageCredit ? (
                    <span className={styles.credit}>사진: {candidate.imageCredit}</span>
                  ) : null}
                </span>
                <Link
                  href={speciesHref(candidate, outcome.query)}
                  className={styles.secondary}
                  aria-label={`${candidate.koreanName ?? candidate.scientificName} 보기`}
                >
                  보기
                </Link>
              </li>
            ))}
          </ul>
          <p className={styles.note}>검색 자료: Perenual, Trefle</p>
        </>
      ) : (
        <Message outcome={outcome} />
      )}

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

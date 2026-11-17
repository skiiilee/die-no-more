"use client";

import { useRouter } from "next/navigation";
import { MAX_QUERY_LENGTH } from "@/types/species";
import { Spinner } from "@/ui/shell/Spinner";
import styles from "./plants.module.css";
import { useSearchPending } from "./SearchPending";

export const SEARCHING_MESSAGE = "식물 정보를 찾는 중입니다. 몇 초 걸릴 수 있습니다.";

/** S04-A for a query; the query lives in the URL so [뒤로] from S04-B returns to the same list. */
export function searchHref(query: string): string {
  return `/plants/new/search?${new URLSearchParams({ q: query }).toString()}`;
}

/**
 * Name search box (S03 and the top of S04-A). The search runs on the server
 * and can take a few seconds (Perenual, Trefle), so from the tap until the
 * results are on screen the button shows a spinner and "검색 중…", and a
 * large spinner with a status line fills the space where results appear. Without JavaScript it is still a plain
 * GET form to S04-A.
 */
export function SpeciesSearchForm({ query = "" }: { query?: string }) {
  const router = useRouter();
  const { searching, startSearch } = useSearchPending();

  return (
    <form
      action="/plants/new/search"
      className={styles.searchRow}
      role="search"
      aria-busy={searching}
      onSubmit={(event) => {
        event.preventDefault();
        const value = String(new FormData(event.currentTarget).get("q") ?? "");
        startSearch(() => router.push(searchHref(value)));
      }}
    >
      <div className={styles.field}>
        <label htmlFor="species-search" className={styles.label}>
          식물 이름 검색
        </label>
        <input
          key={query}
          id="species-search"
          name="q"
          type="search"
          className={styles.input}
          placeholder="한국어 이름, 학명, 영어 이름"
          defaultValue={query}
          maxLength={MAX_QUERY_LENGTH}
          required
        />
      </div>
      <button type="submit" className={styles.primary} disabled={searching}>
        {searching ? (
          <span className={styles.busy}>
            <Spinner /> 검색 중…
          </span>
        ) : (
          "검색"
        )}
      </button>
      {searching ? (
        <div role="status" className={styles.searchStatus}>
          <Spinner size="large" />
          <p className={styles.note}>{SEARCHING_MESSAGE}</p>
        </div>
      ) : null}
    </form>
  );
}

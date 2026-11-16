import Form from "next/form";
import { MAX_QUERY_LENGTH } from "@/service/species-search";
import styles from "./plants.module.css";

/**
 * Name search box (S03 and the top of S04-A). A plain GET form to S04-A, so
 * the query lives in the URL and [뒤로] from S04-B returns to the same list.
 */
export function SpeciesSearchForm({ query = "" }: { query?: string }) {
  return (
    <Form action="/plants/new/search" className={styles.searchRow} role="search">
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
      <button type="submit" className={styles.primary}>
        검색
      </button>
    </Form>
  );
}

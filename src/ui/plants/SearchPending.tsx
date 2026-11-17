"use client";

import { createContext, useContext, useTransition } from "react";

type SearchPending = { searching: boolean; startSearch: (navigate: () => void) => void };

const SearchPendingContext = createContext<SearchPending | null>(null);

/**
 * One "search in progress" state for a whole screen, so the search box and
 * the results below it agree (PR #18 review): while a new search runs on
 * S04-A, the previous results are hidden instead of looking like the answer.
 * The state ends when the new results render, or when the navigation fails.
 */
export function SearchPendingProvider({ children }: { children: React.ReactNode }) {
  const [searching, startSearch] = useTransition();
  return <SearchPendingContext value={{ searching, startSearch }}>{children}</SearchPendingContext>;
}

/** The screen's shared search state, or the caller's own when there is no provider (S03). */
export function useSearchPending(): SearchPending {
  const shared = useContext(SearchPendingContext);
  const [searching, startSearch] = useTransition();
  return shared ?? { searching, startSearch };
}

/** Hides earlier results (and their [보기] links) while a new search is running. */
export function HiddenWhileSearching({ children }: { children: React.ReactNode }) {
  const { searching } = useSearchPending();
  return <div hidden={searching || undefined}>{children}</div>;
}

import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/ui/auth/LoginForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "로그인" };

type SearchParams = Promise<{ next?: string | string[] }>;

/**
 * S01 개인 사용자 접근 (wireframe pages 3–4).
 * The form is part of the static shell so there is only ever one password
 * field. Only the hidden return path reads request data, behind a boundary.
 */
export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>Die No More</p>
        <h1 id="login-title" className={styles.title}>
          로그인
        </h1>
        <LoginForm>
          <Suspense fallback={null}>
            <NextPathField searchParams={searchParams} />
          </Suspense>
        </LoginForm>
      </section>
    </main>
  );
}

async function NextPathField({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  // Validated again on the server in signInAction (safeNextPath).
  return typeof next === "string" ? <input type="hidden" name="next" value={next} /> : null;
}

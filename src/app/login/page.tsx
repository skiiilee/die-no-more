import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/ui/auth/LoginForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "로그인" };

type SearchParams = Promise<{ next?: string | string[] }>;

/** S01 개인 사용자 접근 (wireframe pages 3–4). */
export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>Die No More</p>
        <h1 id="login-title" className={styles.title}>
          로그인
        </h1>
        {/* searchParams is request data: read it behind a boundary. */}
        <Suspense fallback={<LoginForm next={undefined} />}>
          <LoginFormWithNext searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function LoginFormWithNext({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : undefined} />;
}

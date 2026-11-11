import type { Metadata } from "next";
import { LoginForm } from "@/ui/auth/LoginForm";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "로그인" };

/** S01 개인 사용자 접근 (wireframe pages 3–4). */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>Die No More</p>
        <h1 id="login-title" className={styles.title}>
          로그인
        </h1>
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </section>
    </main>
  );
}

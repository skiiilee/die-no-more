import Link from "next/link";
import { Suspense } from "react";
import { MainNav, NavList } from "./MainNav";
import styles from "./AppShell.module.css";

/** Signed-in frame: header, PC left menu / MO bottom tabs, content. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skipLink}>
        본문으로 건너뛰기
      </a>
      <header className={styles.header}>
        <Link href="/today" className={styles.brand}>
          Die No More
        </Link>
        <Link href="/more" className={styles.headerLink}>
          설정 / 계정
        </Link>
      </header>
      <Suspense fallback={<NavList />}>
        <MainNav />
      </Suspense>
      <main id="main" className={styles.content}>
        {children}
      </main>
    </div>
  );
}

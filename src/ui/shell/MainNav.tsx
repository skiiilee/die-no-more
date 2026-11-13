"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MAIN_TABS, findActiveTab } from "@/types/navigation";
import styles from "./AppShell.module.css";

/**
 * One nav list rendered twice by CSS: PC left menu and MO bottom tab bar
 * (wireframe pages 5–6, ADR-0003 D15).
 */
export function MainNav() {
  const pathname = usePathname();
  return <NavList activeHref={findActiveTab(pathname)?.href} />;
}

/**
 * The menu itself. Also the Suspense fallback in AppShell: on pages with a
 * dynamic segment (e.g. /plants/[id]) the pathname is only known at request
 * time, so the prerendered shell shows the menu without an active tab.
 */
export function NavList({ activeHref }: { activeHref?: string }) {
  return (
    <nav aria-label="주요 메뉴" className={styles.nav}>
      <ul className={styles.navList}>
        {MAIN_TABS.map((tab) => {
          const isActive = activeHref === tab.href;
          return (
            <li key={tab.href}>
              <Link href={tab.href} className={styles.navLink} aria-current={isActive ? "page" : undefined}>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

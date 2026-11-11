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
  const active = findActiveTab(pathname);

  return (
    <nav aria-label="주요 메뉴" className={styles.nav}>
      <ul className={styles.navList}>
        {MAIN_TABS.map((tab) => {
          const isActive = active?.href === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={styles.navLink}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

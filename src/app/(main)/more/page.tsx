import type { Metadata } from "next";
import { signOutAction } from "@/runtime/auth-actions";
import { ScreenPlaceholder } from "@/ui/shell/ScreenPlaceholder";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "더보기" };

/** S12 더보기 / 설정. Only logout is implemented so far. */
export default function MorePage() {
  return (
    <>
      <ScreenPlaceholder screen="S12" title="더보기" />
      <form action={signOutAction} className={styles.logout}>
        <button type="submit" className={styles.logoutButton}>
          로그아웃
        </button>
      </form>
    </>
  );
}

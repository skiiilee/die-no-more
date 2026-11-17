import type { Metadata } from "next";
import { signOutAction } from "@/runtime/auth-actions";
import { ScreenPlaceholder } from "@/ui/shell/ScreenPlaceholder";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "더보기" };

/**
 * S12 더보기 / 설정. Logout and the photo transfer notice (ADR-0003 D5:
 * where photos go, what is sent, what the app keeps) are implemented.
 */
export default function MorePage() {
  return (
    <>
      <ScreenPlaceholder screen="S12" title="더보기" />
      <section className={styles.notice} aria-labelledby="photo-transfer-title">
        <h2 id="photo-transfer-title" className={styles.noticeTitle}>
          외부 사진 전송 안내
        </h2>
        <ul className={styles.noticeList}>
          <li>
            <strong>보내는 곳:</strong> 식물 식별 서비스 Pl@ntNet. 다른 서비스에는 사진을 보내지 않습니다.
          </li>
          <li>
            <strong>보내는 때:</strong> 사진 목록 화면에서 전송 동의를 체크하고 [사진으로 식물 찾기]를 누를 때만
            보냅니다. 동의는 요청할 때마다 다시 받습니다.
          </li>
          <li>
            <strong>보내는 내용:</strong> 그 요청에 올린 사진(위치 정보 등 사진 속 메타데이터는 지운 뒤)과 촬영 부위
            설정(자동).
          </li>
          <li>
            <strong>이 앱이 보관하는 것:</strong> 올린 사진은 비공개 저장소에 둡니다. 화분 등록 등에 쓰지 않은 사진은
            24시간이 지나면 지우며, 지금은 다음에 사진을 올릴 때 함께 정리합니다. Pl@ntNet의 응답 원문은 저장하지 않고
            후보 목록(학명, 순서, 점수)만 저장합니다.
          </li>
          <li>
            <strong>Pl@ntNet의 처리:</strong> Pl@ntNet은 식별하는 동안만 사진을 메모리에 두고, 요청 날짜와 시각 등을
            기록한다고 안내합니다.
          </li>
        </ul>
      </section>
      <form action={signOutAction} className={styles.logout}>
        <button type="submit" className={styles.logoutButton}>
          로그아웃
        </button>
      </form>
    </>
  );
}

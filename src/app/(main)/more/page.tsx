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
            <strong>보내는 곳:</strong> 식물 식별·건강 점검 서비스 Pl@ntNet. 건강 점검이 &lsquo;판단 어려움&rsquo;일 때
            따로 동의하면 같은 사진을 AI 서비스(Google Gemini)에도 보냅니다. 그 밖의 서비스에는 사진을 보내지 않습니다.
          </li>
          <li>
            <strong>보내는 때:</strong> 사진 목록 화면에서 전송 동의를 체크하고 [사진으로 식물 찾기]를 누를 때, 건강
            점검에서 동의를 체크하고 [분석하기]를 누를 때, 건강 결과에서 AI 전송 동의를 체크하고 [AI에게 사진으로
            물어보기]를 누를 때만 보냅니다. 동의는 요청할 때마다 다시 받습니다.
          </li>
          <li>
            <strong>보내는 내용:</strong> 그 요청에 올린 사진(위치 정보 등 사진 속 메타데이터는 지운 뒤)과 촬영 부위
            설정(자동).
          </li>
          <li>
            <strong>이 앱이 보관하는 것:</strong> 식물 찾기에 쓰는 사진은 이 앱 서버에 저장하지 않습니다. 고른 사진은 이
            기기의 열린 화면에만 있다가, 요청할 때 위치 정보를 지운 뒤 Pl@ntNet으로 바로 전달됩니다. Pl@ntNet의 응답
            원문도 저장하지 않고 후보 목록(학명, 순서, 점수)만 저장합니다.
          </li>
          <li>
            <strong>화분 사진:</strong> 화분 등록이나 화분 상세에서 올린 사진은 외부로 보내지 않습니다. 위치 정보 등
            메타데이터를 지운 뒤 나만 볼 수 있는 저장소에 보관하고, 화분 상세의 [사진 삭제]로 지울 수 있습니다.
          </li>
          <li>
            <strong>건강 점검 사진:</strong> 지금은 이 앱 서버에 저장하지 않습니다. 결과 설명을 돕는 AI에는 사진 없이 고른
            증상과 Pl@ntNet 결과만 보내고, 직접 쓴 추가 설명은 어떤 AI에도 보내지 않습니다.
          </li>
          <li>
            <strong>AI(Google Gemini)의 처리:</strong> 무료 등급을 쓰므로 보낸 사진과 글이 Google의 서비스 개선(학습)에
            쓰일 수 있습니다.
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

import Link from "next/link";
import type { CareFacts, SpeciesPreview } from "@/types/species";
import { SpeciesPhoto } from "./SpeciesPhoto";
import styles from "./plants.module.css";

const NO_INFO = "정보 없음";

function FactList({ facts }: { facts: CareFacts | null }) {
  const rows: [string, string | null][] = [
    ["관리 난이도", facts?.careLevel ?? null],
    ["빛 환경", facts?.light ?? null],
    ["물 주기", facts?.watering ?? null],
    ["흙 확인 간격 참고", facts?.wateringInterval ?? null],
    // English original until translation is connected (ADR-0004 D3, owner decision 2026-11-15).
    ["짧은 식물 설명", facts?.description ?? null],
  ];
  return (
    <dl className={styles.facts}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.factRow}>
          <dt>{label}</dt>
          <dd>{value ?? NO_INFO}</dd>
        </div>
      ))}
    </dl>
  );
}

function CareNote({ care }: { care: SpeciesPreview["care"] }) {
  if (care.status === "none") {
    return (
      <p className={styles.note}>
        이 식물의 관리 정보가 없습니다. 물 알림은 제공되지 않으며, 등록한 뒤 관리 정보를 직접 입력할 수 있습니다(직접
        입력 화면은 다음 단계에서 연결됩니다).
      </p>
    );
  }
  if (care.status === "pending") {
    return <p className={styles.note}>관리 정보를 지금 불러오지 못했습니다. 이 화면을 다시 열면 다시 확인합니다.</p>;
  }
  return <p className={styles.note}>관리 정보 출처: Perenual. 화분 환경에 따라 다를 수 있습니다.</p>;
}

/**
 * S04-B 식물 정보 확인 (wireframe pages 13–14). Shows only what providers
 * returned; empty items say '정보 없음' and nothing is generated (03 §3-6).
 * Nothing is saved as a pot until [이 식물 추가하기] → S05 → [식물 추가하기].
 */
export function SpeciesPreviewScreen({ preview, query }: { preview: SpeciesPreview; query: string | null }) {
  const name = preview.koreanName ?? preview.scientificName;
  const backHref = query ? `/plants/new/search?${new URLSearchParams({ q: query }).toString()}` : "/plants/new";
  const addHref = `/plants/new/register?${new URLSearchParams({ mode: "species", species: preview.id }).toString()}`;

  return (
    <section className={styles.screen} aria-labelledby="species-title">
      <div className={styles.header}>
        <span className={styles.lead}>식물 정보 확인</span>
        <Link href={backHref} className={styles.back}>
          뒤로
        </Link>
      </div>

      <div className={styles.columns}>
        <SpeciesPhoto url={preview.imageUrl} name={name} size="large" />
        <div className={styles.card}>
          <div>
            <h1 id="species-title" className={styles.title}>
              {name}
            </h1>
            {preview.koreanName ? <p className={styles.scientificSub}>{preview.scientificName}</p> : null}
          </div>
          <h2 className={styles.cardTitle}>기본 정보</h2>
          <FactList facts={preview.care.status === "available" ? preview.care.facts : null} />
          <CareNote care={preview.care} />
        </div>
      </div>

      <div className={styles.actions}>
        <Link href={addHref} className={styles.primary}>
          이 식물 추가하기
        </Link>
        <Link href="/plants/new" className={styles.secondary}>
          다시 검색하기
        </Link>
      </div>
    </section>
  );
}

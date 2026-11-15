"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { identityQuery, parseIdentity } from "@/service/plant-registration";
import { TEXT_LIMITS } from "@/types/plant";
import styles from "./plants.module.css";

/**
 * S05-M 직접 입력 / 종 미상 (wireframe pages 46–47). The typed name is kept as
 * typed and never merged with a search result. [다음] → S05, [뒤로] → S03.
 */
export function ManualEntryForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"manual" | "unknown">("manual");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function next(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseIdentity({ mode, name });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    router.push(`/plants/new/register?${identityQuery(parsed.identity)}`);
  }

  return (
    <section className={styles.screen} aria-labelledby="manual-title">
      <div className={styles.header}>
        <h1 id="manual-title" className={styles.title}>
          검색 결과 없이 화분 등록 계속하기
        </h1>
      </div>

      <form className={styles.columns} onSubmit={next} noValidate>
        <fieldset className={styles.card}>
          <legend className="visually-hidden">식물 이름 정하기</legend>
          <label className={styles.choice}>
            <input
              type="radio"
              name="mode"
              value="manual"
              checked={mode === "manual"}
              onChange={() => {
                setMode("manual");
                setError(null);
              }}
            />
            이름을 직접 입력하겠습니다
          </label>
          <div className={styles.field}>
            <label htmlFor="plant-name" className={styles.label}>
              식물 이름
            </label>
            <input
              id="plant-name"
              name="name"
              className={styles.input}
              value={name}
              maxLength={TEXT_LIMITS.name}
              disabled={mode !== "manual"}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              aria-invalid={error !== null}
              aria-describedby={error ? "manual-error" : "manual-hint"}
            />
            <p id="manual-hint" className={styles.note}>
              학명을 몰라도 됩니다. 부르는 이름을 그대로 입력하세요. 입력한 이름은 그대로 저장되고 검색 결과와 자동으로 합치지 않습니다.
            </p>
          </div>
          <label className={styles.choice}>
            <input
              type="radio"
              name="mode"
              value="unknown"
              checked={mode === "unknown"}
              onChange={() => {
                setMode("unknown");
                setError(null);
              }}
            />
            종을 모르겠어요
          </label>
          {error ? (
            <p id="manual-error" role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
        </fieldset>

        <div className={styles.card}>
          <p className={styles.note}>종별 정보 없이도 화분을 등록할 수 있습니다.</p>
          <p className={styles.note}>AI가 종을 자동으로 확정하거나 이름을 만들지 않습니다.</p>
          <p className={styles.note}>다음 화면에서 화분별 환경 정보를 입력합니다.</p>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>
              다음
            </button>
            <Link href="/plants/new" className={styles.secondary}>
              뒤로
            </Link>
          </div>
        </div>
      </form>
    </section>
  );
}

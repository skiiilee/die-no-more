import type { Metadata } from "next";
import Link from "next/link";
import { getRegistrationContext } from "@/runtime/plant-queries";
import { RegisterPlantForm } from "@/ui/plants/RegisterPlantForm";

export const metadata: Metadata = { title: "내 화분 등록" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** S05 내 화분 등록. The identity arrives from S05-M (or S04-B) in the query string. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const context = await getRegistrationContext({
    mode: first(params.mode),
    name: first(params.name),
    species: first(params.species),
  });

  if (!context.ok) {
    return (
      <section aria-labelledby="register-title">
        <h1 id="register-title">내 화분 등록</h1>
        <p role="alert">
          {context.message} <Link href="/plants/new">식물 추가로 돌아가기</Link>
        </p>
      </section>
    );
  }

  return (
    <RegisterPlantForm
      identity={context.identity}
      plantName={context.plantName}
      reminders={context.reminders}
      backHref={context.identity.kind === "species" ? "/plants/new" : "/plants/new/manual"}
    />
  );
}

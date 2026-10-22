import { formatDate } from "~/lib/format";
import type { ModelCard } from "~/lib/models.server";
import { ModelGrid } from "./site";

export function Article({
  eyebrow,
  title,
  excerpt,
  cover,
  html,
  date,
  models,
}: {
  eyebrow: string;
  title: string;
  excerpt: string | null;
  cover: string | null;
  html: string | null;
  date?: Date | string | null;
  models: ModelCard[];
}) {
  return (
    <article className="mx-auto flex max-w-[1440px] flex-col gap-12 px-5 pt-16 pb-24 md:px-12 md:pt-20">
      <header className="flex max-w-4xl flex-col gap-5">
        <span className="label-mono text-xs">
          {eyebrow}
          {date ? ` · ${formatDate(date)}` : ""}
        </span>
        <h1 className="font-display text-[clamp(40px,6vw,80px)] font-medium leading-[0.98] tracking-[-0.035em]">{title}</h1>
        {excerpt && <p className="font-serif text-[26px] italic leading-snug text-ink-2">{excerpt}</p>}
      </header>
      {cover && <img src={cover} alt="" className="aspect-[16/9] w-full object-cover" />}
      {html && <div className="prose-content mx-auto w-full max-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />}
      {models.length > 0 && (
        <section className="flex flex-col gap-7 border-t border-ink pt-8">
          <h2 className="font-display text-[32px] font-medium tracking-tight">Mẫu trong bài</h2>
          <ModelGrid items={models} />
        </section>
      )}
    </article>
  );
}

import type { Metadata } from "next";
import { DOC_PAGE_LABELS } from "@/constants/labels";

export const metadata: Metadata = { title: "Document · DocSync" };

export default async function DocPage({ params }: PageProps<"/doc/[id]">) {
  // Next 16: params is async.
  const { id } = await params;

  return (
    <div className="px-4 py-5 sm:px-8 sm:py-7">
      <h1 className="mb-5.5 text-page-title">{DOC_PAGE_LABELS.placeholderTitle}</h1>
      <p className="text-body text-foreground-2">{DOC_PAGE_LABELS.placeholderBody}</p>
      <p className="mt-2 text-caption text-muted-foreground">id: {id}</p>
    </div>
  );
}

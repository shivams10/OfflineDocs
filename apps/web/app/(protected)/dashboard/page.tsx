import type { Metadata } from "next";
import { DOCUMENTS_PAGE_LABELS } from "@/constants/labels";

export const metadata: Metadata = { title: "Dashboard · DocSync" };

export default function DashboardPage() {
  return (
    <div className="px-8 py-7">
      <h1 className="mb-5.5 text-page-title">{DOCUMENTS_PAGE_LABELS.title}</h1>
      content
    </div>
  );
}

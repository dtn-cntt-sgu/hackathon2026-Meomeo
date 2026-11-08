import Link from "next/link";
import { HistoryList } from "@/components/history/HistoryList";
import { HistoryPicker } from "@/components/history/HistoryPicker";
import { HISTORY_SAMPLE } from "@/components/history/history-sample";
import { Boot } from "@/components/layout/Boot";
import { Navbar } from "@/components/layout/Navbar";
import { PageHeader } from "@/components/ui/Page";

interface HistoryPageProps {
  searchParams: Promise<{ session?: string | string[] }>;
}

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const { session } = await searchParams;
  const hasSession = typeof session === "string" && session.trim().length > 0;

  return (
    <>
      <Boot />
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <PageHeader
          title="Lịch sử học"
          actions={
            hasSession ? (
              <Link
                href="/history"
                className="rounded-lg bg-panel-2 px-3 py-1.5 text-sm font-medium text-muted ring-1 ring-inset ring-border transition-colors hover:text-text"
              >
                ← Tất cả phiên
              </Link>
            ) : undefined
          }
        />
        {/* Có phiên ⇒ HistoryList gọi GET /api/sessions/{id}/history; chưa chọn ⇒ danh sách đủ các phiên để chọn. */}
        {hasSession ? <HistoryList items={HISTORY_SAMPLE} sample /> : <HistoryPicker />}
      </main>
    </>
  );
}

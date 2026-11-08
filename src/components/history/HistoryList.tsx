"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/Page";
import { Button } from "@/components/ui/common";
import { LoadingAnimation } from "@/components/ui/LoadingAnimation";
import type { AttemptHistoryItem } from "@/contracts/storage";
import { fetchHistory, type HistoryResult } from "./fetch-history";
import { HistoryItem } from "./HistoryItem";

type HistoryDisplayItem = AttemptHistoryItem & { question?: string };

interface HistoryListProps {
  items: readonly HistoryDisplayItem[];
  sample: boolean;
}

export function HistoryList(props: HistoryListProps) {
  const sessionId = useSearchParams().get("session")?.trim() ?? "";

  return <SessionHistory key={sessionId} sessionId={sessionId} {...props} />;
}

function SessionHistory({
  sessionId,
  items,
  sample,
}: HistoryListProps & { sessionId: string }) {
  const [result, setResult] = useState<HistoryResult | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    void fetchHistory(sessionId).then((next) => {
      if (active) setResult(next);
    });
    return () => {
      active = false;
    };
  }, [sessionId, retryCount]);

  if (!result) {
    return (
      <div role="status" className="rounded-xl border border-line bg-panel p-8 flex flex-col items-center justify-center">
        <LoadingAnimation size={150} text="Đang tải lịch sử phiên học…" />
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-line bg-panel p-4">
        <p role="alert" className="text-sm text-text">{result.message}</p>
        <Button
          className="mt-3"
          onClick={() => {
            setResult(null);
            setRetryCount((count) => count + 1);
          }}
        >
          Thử lại
        </Button>
      </div>
    );
  }

  const displayItems: readonly HistoryDisplayItem[] = result.sample && sample ? items : result.items;
  const newestFirst = displayItems.toSorted((a, b) => b.created_at - a.created_at);
  if (newestFirst.length === 0) {
    return <EmptyState title="Chưa có lượt nộp bài" />;
  }

  return (
    <>
      {result.sample && (
        <p className="mb-4 text-sm text-muted">
          <strong className="font-semibold text-text">Dữ liệu mẫu</strong>
          <span> · Các lượt bên dưới minh họa cách trang hiển thị lịch sử.</span>
        </p>
      )}
      <ol className="space-y-3">
        {newestFirst.map((item) => (
          <li key={`${item.node_id}:${item.question_index}:${item.attempt_number}:${item.created_at}`}>
            <HistoryItem item={item} question={item.question} />
          </li>
        ))}
      </ol>
    </>
  );
}

"use client";

import { OverviewContent } from "@/components/learn/RepoOverview";
import { Modal } from "@/components/ui/common";
import { useWorkbenchStore } from "@/store/workbench";

/** Đặt cờ cửa sổ Tổng quan (`ui.overview_open`); store chưa có action riêng cho cờ này. */
export function setOverviewOpen(open: boolean): void {
  useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, overview_open: open } }));
}

/**
 * Cửa sổ Tổng quan, mở từ nút "Tổng quan" ở `CockpitHeader`. Luôn đóng được: ✕, `Esc`, bấm nền
 * (do `Modal` lo); bấm "Bắt đầu với" cũng đóng. 0 API.
 */
export function RepoOverviewModal() {
  const open = useWorkbenchStore((s) => s.ui.overview_open && s.result !== null);
  const close = () => setOverviewOpen(false);

  return (
    <Modal open={open} title="Bức tranh chung" onClose={close} className="max-w-[640px]">
      <div className="-mx-5 -my-4">
        <OverviewContent titleId={null} onStarted={close} />
      </div>
    </Modal>
  );
}

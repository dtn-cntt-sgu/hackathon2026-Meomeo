"use client";

// Xác nhận "Bỏ qua câu này" (docs/spec/30_UI.md Mục 6.2). `Esc`, ✕, bấm nền đều đóng được (Modal).
import { Button, Modal } from "@/components/ui/common";

export interface SkipConfirmDialogProps {
  open: boolean;
  skill: string; // nhãn kỹ năng tiếng Việt
  onConfirm: () => void;
  onClose: () => void;
}

export function SkipConfirmDialog({ open, skill, onConfirm, onClose }: SkipConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title="Bỏ qua câu này?"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Quay lại trả lời</Button>
          <Button variant="primary" onClick={onConfirm}>
            Bỏ qua câu này
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm">Câu này sẽ tính là CHƯA ĐẠT cho {skill} và hiện đáp án.</p>
    </Modal>
  );
}

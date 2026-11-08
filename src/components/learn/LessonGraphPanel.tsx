"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LessonCard, type CardAnalysis } from "@/components/learn/LessonCard";
import { LessonGroup, LessonSubfolder } from "@/components/learn/LessonGroup";
import { StatusPill } from "@/components/ui/Page";
import { Button } from "@/components/ui/common";
import { aiTitleOf, displayTitle } from "@/lib/derive";
import { folderLabel } from "@/lib/folder-label";
import {
  blockedBy,
  cardAction,
  crossGroupBlockers,
  firstOpenableBlocker,
  groupTree,
  lessonGroups,
  nodeStatesOf,
  startNodeIds,
  weakParents,
} from "@/lib/lesson-map";
import { useWorkbenchStore } from "@/store/workbench";

interface BlockedNotice {
  hint: string;
  openableId: string | null;
}

/**
 * Cột trái: danh sách nhóm và thẻ bài theo `prototype.html`. Không vẽ đồ thị.
 * Bấm bài `LOCKED` không gửi request nào: hiện dải "Cần xong: …" kèm nút mở bài cần học trước.
 */
export function LessonGraphPanel() {
  const sessionId = useWorkbenchStore((s) => s.session_id);
  const result = useWorkbenchStore((s) => s.result);
  const progress = useWorkbenchStore((s) => s.progress);
  const analyses = useWorkbenchStore((s) => s.analyses);
  const overview = useWorkbenchStore((s) => s.overview);
  const activeNodeId = useWorkbenchStore((s) => s.active_node_id);
  const openGroups = useWorkbenchStore((s) => s.ui.open_groups);
  const openNode = useWorkbenchStore((s) => s.openNode);
  const requestAnalysis = useWorkbenchStore((s) => s.requestAnalysis);
  const [notice, setNotice] = useState<BlockedNotice | null>(null);

  const view = useMemo(() => {
    if (!result) return null;
    const groups = lessonGroups(result, overview);
    const states = nodeStatesOf(result.nodes, progress);
    const byId = new Map(result.nodes.map((n) => [n.id, n]));
    return { groups, states, byId, starts: startNodeIds(result.nodes, result.edges) };
  }, [result, progress, overview]);

  // Lúc đầu chỉ mở nhóm "Nên học trước"; mỗi phiên làm 1 lần, sau đó người học tự đóng mở.
  const initializedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!view || !sessionId || initializedFor.current === sessionId) return;
    initializedFor.current = sessionId;
    const first = view.groups.find((g) => g.recommended) ?? view.groups[0];
    if (first && useWorkbenchStore.getState().ui.open_groups.length === 0) {
      useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, open_groups: [first.group_id] } }));
    }
  }, [view, sessionId]);

  if (!result || !view) return null;
  const { groups, states, byId, starts } = view;

  const aiOverview = overview === "PENDING" ? null : overview;
  const titleOf = (id: string) => {
    const n = byId.get(id);
    return n ? displayTitle(n, overview === "PENDING" ? null : overview) : id;
  };

  function toggleGroup(groupId: string) {
    useWorkbenchStore.setState((s) => {
      const open = s.ui.open_groups;
      const next = open.includes(groupId) ? open.filter((id) => id !== groupId) : [...open, groupId];
      return { ui: { ...s.ui, open_groups: next } };
    });
  }

  function onBlocked(nodeId: string) {
    const node = byId.get(nodeId);
    if (!node) return;
    const hint = cardAction("LOCKED", blockedBy(node, states).map(titleOf)).hint ?? "";
    setNotice({ hint, openableId: firstOpenableBlocker(result?.nodes ?? [], states, nodeId) });
  }

  function openBlocker(nodeId: string) {
    setNotice(null);
    openNode(nodeId);
  }

  function renderCard(id: string) {
    const node = byId.get(id);
    const state = states[id];
    if (!node || !state) return null;
    return (
      <LessonCard
        key={id}
        node={node}
        title={titleOf(id)}
        status={state.status}
        hasWarning={state.has_warning}
        weakNames={weakParents(node, states).map(titleOf)}
        // Bài cần học trước cùng nhóm chỉ hiện ổ khóa; khác nhóm mới hiện "cần thêm: …"
        blockedNames={crossGroupBlockers(node, states, groups).map(titleOf)}
        isStart={starts.has(id)}
        active={activeNodeId === id}
        analysis={analysisOf(id)}
        onOpen={openNode}
        onBlocked={onBlocked}
        onRetryAnalysis={(nodeId) => void requestAnalysis(nodeId, true)}
      />
    );
  }

  function analysisOf(id: string): CardAnalysis {
    const a = analyses[id];
    if (a === "PENDING" || a === "FAILED") return a;
    return a ? "READY" : "NONE";
  }

  return (
    <div className="px-3.5 pt-3.5 pb-4.5">
      <h2 className="mb-2.5 flex items-baseline justify-between text-xs font-semibold tracking-wider text-muted uppercase">
        <span>Bản đồ bài học</span>
        <span className="font-normal normal-case">{result.nodes.length} bài</span>
      </h2>

      {notice ? (
        <div
          role="status"
          className="mb-2.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-st-ready-border bg-st-ready-bg px-3 py-2 text-sm text-text"
        >
          <span className="min-w-0 flex-1">{notice.hint}</span>
          {notice.openableId ? (
            <Button variant="small" onClick={() => openBlocker(notice.openableId as string)}>
              Mở bài cần học trước
            </Button>
          ) : null}
          <Button variant="small" aria-label="Đóng thông báo" onClick={() => setNotice(null)}>
            ✕
          </Button>
        </div>
      ) : null}

      {groups.map((group) => {
        const tree = groupTree(group.node_ids, byId);
        return (
          <LessonGroup
            key={group.group_id}
            group={group}
            open={openGroups.includes(group.group_id)}
            onToggle={toggleGroup}
            summary={group.node_ids.map(titleOf).join(" · ")}
          >
            {tree.direct.map(renderCard)}
            {tree.subs.map((sub) => (
              <LessonSubfolder
                key={sub.key}
                id={`${group.group_id}-${sub.key}`}
                label={folderLabel(sub.node_ids.map((id) => aiTitleOf(id, aiOverview)), sub.label)}
                count={sub.node_ids.length}
              >
                {sub.node_ids.map(renderCard)}
              </LessonSubfolder>
            ))}
          </LessonGroup>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-label="Chú giải">
        <StatusPill status="AVAILABLE" />
        <StatusPill status="COMPLETED" />
        <StatusPill status="FAILED" />
      </div>
    </div>
  );
}

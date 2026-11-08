import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERSONAS } from "@/contracts";
import { FIXTURE_ANSWERS, FIXTURE_NODE_ID, buildFixtureBundle } from "@/lib/fixture-bundle";
import { resetOfflineRuntime, setOfflineMode as setOfflineRuntime } from "@/lib/offline";
import { useWorkbenchStore } from "../workbench";

const N3 = FIXTURE_NODE_ID;

function store() {
  return useWorkbenchStore.getState();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.unstubAllGlobals();
  useWorkbenchStore.setState(useWorkbenchStore.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
  setOfflineRuntime(false);
  resetOfflineRuntime();
});

/** Mở `/learn?fixture=1` rồi nạp bản đồ shop-api như `Boot` làm. */
async function openFixture() {
  useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));
  const pending = store().ingest({ repo_url: "https://github.com/demo/shop-api" });
  await vi.advanceTimersByTimeAsync(2_000);
  const res = await pending;
  expect(res.ok).toBe(true);
}

describe("?fixture=1: kịch bản A (A3 → A6) của docs/spec/50_TEST_VA_FIXTURE.md", () => {
  it("N3 có bản phân tích sẵn, bài khác không báo lỗi", async () => {
    await openFixture();
    expect(store().analyses[N3]).toMatchObject({ node_id: N3, skeleton_only: false });
    expect(store().profile).not.toBeNull();

    await store().requestAnalysis("slice-register");
    expect(store().analyses["slice-register"]).toBeUndefined();
  });

  it("câu 1 sai ⇒ gợi ý CODE_POINTER ⇒ đúng ⇒ câu 2 đúng ⇒ N3 xong, điểm kỹ năng khớp bảng, 0 request", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("fixture không được gọi mạng"));
    vi.stubGlobal("fetch", fetchMock);
    await openFixture();

    await store().loadRun(N3);
    const run = store().runs[N3];
    expect(run.questions.map((q) => q.skill)).toEqual(["DB_OPTIMIZATION", "LAYERED_SEPARATION"]);
    expect(run.questions.every((q) => q.state.reveal === null)).toBe(true); // D-36: chưa xong thì không có đáp án

    // A4: lượt 1 sai ⇒ chưa đạt, có gợi ý, BKT chưa đổi.
    const a4 = await store().submitAnswer(N3, 1, FIXTURE_ANSWERS.q1Attempt1);
    expect(a4?.ok).toBe(true);
    if (!a4?.ok) return;
    expect(a4.data.is_passed).toBe(false);
    expect(a4.data.follow_up?.type).toBe("CODE_POINTER");
    expect(a4.data.question.attempts_used).toBe(1);
    expect(a4.data.skill_change).toBeNull();

    // A5: lượt 2 đúng ⇒ PASS_AFTER_HINT, DB_OPTIMIZATION 0.25 → 0.4202.
    const a5 = await store().submitAnswer(N3, 1, FIXTURE_ANSWERS.q1Attempt2);
    expect(a5?.ok).toBe(true);
    if (!a5?.ok) return;
    expect(a5.data.question.outcome).toBe("PASS_AFTER_HINT");
    expect(a5.data.question.reveal).not.toBeNull();
    expect(a5.data.skill_change?.skill).toBe("DB_OPTIMIZATION");
    expect(a5.data.skill_change?.p_before).toBeCloseTo(0.25, 4);
    expect(a5.data.skill_change?.p_after).toBeCloseTo(0.4202, 4);

    // A6: câu 2 đúng ngay ⇒ PASS_FIRST, LAYERED_SEPARATION 0.25 → 0.5767, N3 hoàn thành, chưa mở bài nào.
    const a6 = await store().submitAnswer(N3, 2, FIXTURE_ANSWERS.q2Attempt1);
    expect(a6?.ok).toBe(true);
    if (!a6?.ok) return;
    expect(a6.data.question.outcome).toBe("PASS_FIRST");
    expect(a6.data.skill_change?.p_after).toBeCloseTo(0.5767, 4);
    expect(a6.data.node_state.status).toBe("COMPLETED");
    expect(a6.data.unlocked_node_ids).toEqual([]);

    expect(store().progress?.nodes[N3].status).toBe("COMPLETED");
    expect(store().profile?.skills.DB_OPTIMIZATION?.p_mastery).toBeCloseTo(0.4202, 4);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("câu ngoài kịch bản bị từ chối, không tính lượt", async () => {
    await openFixture();
    await store().loadRun(N3);

    const res = await store().submitAnswer(N3, 1, "Em nghĩ là do máy chủ yếu nên chạy chậm thôi ạ.");
    expect(res?.ok).toBe(false);
    expect(store().runs[N3].questions[0].state.attempts_used).toBe(0);
  });

  it("bỏ qua câu 1 ⇒ có đáp án mẫu, câu tính là chưa đạt", async () => {
    await openFixture();
    await store().loadRun(N3);

    await store().skipQuestion(N3, 1);
    const q1 = store().runs[N3].questions[0];
    expect(q1.state.finished).toBe(true);
    expect(q1.state.outcome).toBe("FAILED");
    expect(q1.state.reveal).not.toBeNull();
  });
});

describe("setOfflinePersona dựng lại hồ sơ và tiến độ trong store (spec Mục 9)", () => {
  async function openOffline() {
    useWorkbenchStore.setState((s) => ({ ui: { ...s.ui, fixture: true } }));
    const pending = store().ingest({ repo_url: "https://github.com/demo/shop-api" });
    await vi.advanceTimersByTimeAsync(2_000);
    const res = await pending;
    if (!res.ok) throw new Error("ingest lỗi");
    const bundle = buildFixtureBundle(res.data);
    if (!bundle) throw new Error("thiếu N3");
    resetOfflineRuntime();
    setOfflineRuntime(true, bundle);
    useWorkbenchStore.setState((s) => ({ is_offline_mode: true, ui: { ...s.ui, fixture: false } }));
  }

  it("đổi sang SENIOR_RUSTY ⇒ hồ sơ theo persona mới, bỏ run và bài đang mở", async () => {
    await openOffline();
    useWorkbenchStore.setState({ active_node_id: N3, runs: { [N3]: {} as never } });

    store().setOfflinePersona("SENIOR_RUSTY");

    const s = store();
    expect(s.ui.offline_persona).toBe("SENIOR_RUSTY");
    expect(s.runs).toEqual({});
    expect(s.active_node_id).toBeNull();
    const persona = PERSONAS.SENIOR_RUSTY;
    const skill = Object.values(s.profile?.skills ?? {})[0];
    expect(skill?.p_mastery).toBeCloseTo(persona.initial_p_mastery, 4);
    expect(Date.now() - (skill?.last_practiced_at ?? Date.now())).toBeGreaterThanOrEqual(persona.days_idle * 86_400_000 - 5_000);
    expect(s.progress?.nodes[N3].status).toBe("AVAILABLE");
  });

  it("chưa Offline thì chỉ nhớ lựa chọn, không đụng hồ sơ", () => {
    useWorkbenchStore.setState({ profile: null });
    store().setOfflinePersona("MID_LEVEL");
    expect(store().ui.offline_persona).toBe("MID_LEVEL");
    expect(store().profile).toBeNull();
  });
});

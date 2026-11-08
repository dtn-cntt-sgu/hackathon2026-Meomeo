import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import type { OfflineMockBundle, QuestionReveal } from "../src/contracts";

const REVIEW_CHECKBOX = "- [ ] ổn   ·   sai/bịa: ____   ·   sửa: ____";

function formatVietnamTime(timestamp: number): string {
  // Giờ Việt Nam là UTC+7 (không áp dụng daylight saving)
  const vnDate = new Date(timestamp + 7 * 60 * 60 * 1000);
  const dd = String(vnDate.getUTCDate()).padStart(2, "0");
  const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(vnDate.getUTCHours()).padStart(2, "0");
  const min = String(vnDate.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}

function extractPersona(runKey: string, nodeId: string): string {
  if (runKey.startsWith(`${nodeId}:`)) {
    const rest = runKey.slice(nodeId.length + 1);
    const parts = rest.split(":");
    if (parts.length >= 2) {
      return parts[1];
    }
    return parts[0] || "Mặc định";
  }
  const parts = runKey.split(":");
  if (parts.length >= 3) {
    return parts[2];
  }
  return parts[parts.length - 1] || "Mặc định";
}

export function renderBundle(bundle: OfflineMockBundle): string {
  const lines: string[] = [];

  // 1. Đầu file: recorded_from & các số đo tổng hợp
  const recordedFrom = bundle.recorded_from;
  const repo = recordedFrom?.repo ?? "N/A";
  const snapshotId = recordedFrom?.snapshot_id ?? "N/A";
  const engineVersion = recordedFrom?.engine_version ?? "N/A";
  const promptVersion = recordedFrom?.prompt_version ?? "N/A";
  const model = recordedFrom?.model ?? "N/A";
  const recordedAtStr =
    recordedFrom?.recorded_at != null
      ? formatVietnamTime(recordedFrom.recorded_at)
      : "N/A";

  const nodes = bundle.ingest?.result?.nodes ?? [];
  const nodeCount = nodes.length;

  const enrichMap = bundle.enrich ?? {};
  const runCount = Object.keys(enrichMap).length;

  const scriptedAnswersMap = bundle.scripted_answers ?? {};
  let totalGradeCount = 0;
  for (const key of Object.keys(scriptedAnswersMap)) {
    const list = scriptedAnswersMap[key];
    if (Array.isArray(list)) {
      totalGradeCount += list.length;
    }
  }

  const revealsMap = bundle.reveals ?? {};
  const revealCount = Object.keys(revealsMap).length;

  lines.push("# Duyệt AI — Bundle");
  lines.push("");
  lines.push(`- **Repo**: ${repo}`);
  lines.push(`- **Snapshot ID**: ${snapshotId}`);
  lines.push(`- **Engine version**: ${engineVersion}`);
  lines.push(`- **Prompt version**: ${promptVersion}`);
  lines.push(`- **Model**: ${model}`);
  lines.push(`- **Thời điểm ghi**: ${recordedAtStr} (giờ VN)`);
  lines.push(`- **Số bài**: ${nodeCount}`);
  lines.push(`- **Số run**: ${runCount}`);
  lines.push(`- **Số lượt chấm**: ${totalGradeCount}`);
  lines.push(`- **Số reveal**: ${revealCount}`);
  lines.push("");

  // 2. Từng bài (theo thứ tự node trong ingest.result.nodes)
  for (const node of nodes) {
    const title = node.title || node.id;
    lines.push(`## ${node.id} · ${title}`);
    lines.push("");

    // Phân tích (analyses[node_id])
    const analysis = bundle.analyses ? bundle.analyses[node.id] : undefined;
    lines.push("### Phân tích");
    lines.push("");

    if (!analysis) {
      lines.push("(chưa có phân tích)");
      lines.push("");
    } else {
      let hasAnalysisContent = false;

      // skills
      if (Array.isArray(analysis.skills) && analysis.skills.length > 0) {
        hasAnalysisContent = true;
        lines.push("#### Kỹ năng (skills)");
        lines.push("");
        for (const sk of analysis.skills) {
          const loc = sk.file_path
            ? ` tại \`${sk.file_path}:${sk.line_start}-${sk.line_end}\``
            : "";
          const sym = sk.symbol ? `, ký hiệu \`${sk.symbol}\`` : "";
          lines.push(`- **${sk.skill}** (bước ${sk.step}${sym}${loc}): ${sk.reason}`);
        }
        lines.push("");
      }

      // strengths (điểm hay)
      if (Array.isArray(analysis.strengths) && analysis.strengths.length > 0) {
        hasAnalysisContent = true;
        lines.push("#### Điểm hay (strengths)");
        lines.push("");
        for (const st of analysis.strengths) {
          lines.push(`- Bước ${st.step}: ${st.text}`);
        }
        lines.push("");
      }

      // weak_points (điểm dở)
      if (Array.isArray(analysis.weak_points) && analysis.weak_points.length > 0) {
        hasAnalysisContent = true;
        lines.push("#### Điểm dở (weak_points)");
        lines.push("");
        for (const wp of analysis.weak_points) {
          const loc = wp.file_path
            ? ` tại \`${wp.file_path}:${wp.line_start}-${wp.line_end}\``
            : "";
          const sym = wp.symbol ? `, ký hiệu \`${wp.symbol}\`` : "";
          lines.push(`- **${wp.skill}** (bước ${wp.step}${sym}${loc}): ${wp.what} — *Hệ quả:* ${wp.consequence}`);
          lines.push(`  ${REVIEW_CHECKBOX}`);
        }
        lines.push("");
      }

      if (!hasAnalysisContent) {
        lines.push("(chưa có phân tích)");
        lines.push("");
      }
    }

    // Từng run có khóa bắt đầu bằng <node_id>: trong enrich
    const runKeys = Object.keys(enrichMap).filter(
      (k) => k === node.id || k.startsWith(`${node.id}:`)
    );

    if (runKeys.length === 0) {
      lines.push("### Các run");
      lines.push("");
      lines.push("(chưa có run)");
      lines.push("");
    } else {
      lines.push("### Các run");
      lines.push("");

      for (const runKey of runKeys) {
        const enrichRes = enrichMap[runKey];
        const persona = extractPersona(runKey, node.id);

        lines.push(`#### Run \`${runKey}\` (Persona: ${persona})`);
        lines.push("");

        const questions = enrichRes?.questions ?? [];
        if (questions.length === 0) {
          lines.push("(chưa có câu hỏi)");
          lines.push("");
          continue;
        }

        for (const q of questions) {
          lines.push(`##### Câu ${q.question_index}: ${q.feynman_question}`);
          lines.push(`- **Kỹ năng**: ${q.skill} | **Bậc**: ${q.tier} | **Focus**: ${q.focus}`);
          lines.push(`${REVIEW_CHECKBOX}`);
          lines.push("");

          // Từng lượt trong scripted_answers (khóa <R>:<question_index>:<attempt>)
          const attemptPrefix = `${runKey}:${q.question_index}:`;
          const matchedAttemptKeys = Object.keys(scriptedAnswersMap)
            .filter((k) => k.startsWith(attemptPrefix))
            .sort((a, b) => {
              const numA = parseInt(a.slice(attemptPrefix.length), 10);
              const numB = parseInt(b.slice(attemptPrefix.length), 10);
              if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
                return numA - numB;
              }
              return a.localeCompare(b);
            });

          let finishedResponseReveal: QuestionReveal | null = null;

          if (matchedAttemptKeys.length > 0) {
            lines.push(`###### Các lượt chấm:`);
            lines.push("");

            for (const aKey of matchedAttemptKeys) {
              const attemptSuffix = aKey.slice(attemptPrefix.length);
              const answers = scriptedAnswersMap[aKey];
              if (!Array.isArray(answers) || answers.length === 0) continue;

              for (const item of answers) {
                const resp = item.response;
                const passedStr = resp.is_passed ? "Đạt" : "Chưa đạt";
                const attemptNum = resp.attempt_number ?? attemptSuffix;
                lines.push(`- **Lượt ${attemptNum}**:`);
                lines.push(`  - **Trả lời**: ${item.answer}`);
                lines.push(`  - **Đánh giá**: core_accuracy: ${resp.core_accuracy} | is_passed: ${passedStr} | intent: ${resp.intent}`);
                lines.push(`  - **Feedback**: ${resp.feedback}`);

                if (resp.follow_up) {
                  lines.push(`  - **Gợi ý (follow_up)** [${resp.follow_up.type}]: ${resp.follow_up.question}`);
                  lines.push(`    ${REVIEW_CHECKBOX}`);
                }

                if (resp.question?.finished && resp.question.reveal) {
                  finishedResponseReveal = resp.question.reveal;
                }
              }
            }
            lines.push("");
          }

          // Đáp án mẫu:
          // Câu có trong reveals thì in đáp án từ đó, ghi "(bỏ qua)"
          const revealKey = `${runKey}:${q.question_index}`;
          const revealFromReveals = revealsMap[revealKey];

          if (revealFromReveals?.question?.reveal) {
            const rev = revealFromReveals.question.reveal;
            lines.push(`###### Đáp án mẫu (bỏ qua):`);
            lines.push(`- **Đáp án mẫu**: ${rev.reference_answer}`);
            lines.push(`- **Ý bắt buộc**:`);
            if (Array.isArray(rev.must_have_points) && rev.must_have_points.length > 0) {
              for (const pt of rev.must_have_points) {
                lines.push(`  - ${pt}`);
              }
            } else {
              lines.push(`  - (không có)`);
            }
            lines.push(`- **Cách sửa**: ${rev.fix || "(không có)"}`);
            lines.push(`${REVIEW_CHECKBOX}`);
            lines.push("");
          } else {
            const rev = finishedResponseReveal ?? q.state?.reveal ?? null;
            if (rev) {
              lines.push(`###### Đáp án mẫu:`);
              lines.push(`- **Đáp án mẫu**: ${rev.reference_answer}`);
              lines.push(`- **Ý bắt buộc**:`);
              if (Array.isArray(rev.must_have_points) && rev.must_have_points.length > 0) {
                for (const pt of rev.must_have_points) {
                  lines.push(`  - ${pt}`);
                }
              } else {
                lines.push(`  - (không có)`);
              }
              lines.push(`- **Cách sửa**: ${rev.fix || "(không có)"}`);
              lines.push(`${REVIEW_CHECKBOX}`);
              lines.push("");
            }
          }
        }
      }
    }
  }

  // 3. Cuối file: Tóm tắt lỗi để trống cho người duyệt điền
  lines.push("## Tóm tắt lỗi");
  lines.push("");
  lines.push("| STT | Node / Câu | Mục | Loại lỗi (sai / bịa / lệch / ...) | Đề xuất sửa |");
  lines.push("|---|---|---|---|---|");
  lines.push("| 1 | | | | |");
  lines.push("| 2 | | | | |");
  lines.push("| 3 | | | | |");
  lines.push("");
  lines.push("### Ghi chú của người duyệt:");
  lines.push("");
  lines.push("- Số điểm dở đúng thực tế: ___ / ___");
  lines.push("- Số câu hỏi đạt chất lượng: ___ / ___");
  lines.push("- Số gợi ý hữu ích: ___ / ___");
  lines.push("- Số đáp án mẫu chuẩn xác: ___ / ___");
  lines.push("- Các câu ổn định 3/3 dùng cho kịch bản demo:");
  lines.push("");

  return lines.join("\n");
}

interface CliArgs {
  bundlePath: string;
  outPath: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  let bundlePath = "public/demo/mock_bundle.json";
  let outPath = "duyet-ai.md";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--out") {
      const nextVal = argv[++i];
      if (nextVal) {
        outPath = nextVal;
      }
    } else if (arg.startsWith("--out=")) {
      outPath = arg.slice("--out=".length);
    } else if (!arg.startsWith("-")) {
      bundlePath = arg;
    }
  }

  return { bundlePath, outPath };
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { bundlePath, outPath } = parseCliArgs(args);

  const resolvedBundlePath = path.resolve(bundlePath);
  const resolvedOutPath = path.resolve(outPath);

  let raw: string;
  try {
    raw = await fs.readFile(resolvedBundlePath, "utf-8");
  } catch (err) {
    console.error(`Không thể đọc file bundle tại: ${resolvedBundlePath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let bundle: OfflineMockBundle;
  try {
    bundle = JSON.parse(raw) as OfflineMockBundle;
  } catch (err) {
    console.error(`Lỗi parse JSON file bundle tại: ${resolvedBundlePath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const markdown = renderBundle(bundle);

  try {
    await fs.mkdir(path.dirname(resolvedOutPath), { recursive: true });
    await fs.writeFile(resolvedOutPath, markdown, "utf-8");
    console.log(`Đã xuất báo cáo duyệt AI ra: ${resolvedOutPath}`);
  } catch (err) {
    console.error(`Lỗi khi ghi file output tại: ${resolvedOutPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const currentScript = process.argv[1] ?? "";
if (currentScript.endsWith("xem-bundle.ts")) {
  main().catch((err: unknown) => {
    console.error("Lỗi:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

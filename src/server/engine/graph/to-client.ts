import type { ClientStaticEngineResult, StaticEngineResult } from "@/contracts";

/**
 * Mục 15 ý 5, API-03:
 * toClientResult dựng object mới từng trường, không spread.
 * Omit: symbol_whitelist, readme_excerpt, manifest_description,
 * và suspicious_instruction_files trong ingestion_report.
 */
export function toClientResult(r: StaticEngineResult): ClientStaticEngineResult {
  return {
    engine_version: r.engine_version,
    repo_name: r.repo_name,
    snapshot: {
      source: r.snapshot.source,
      repo_key: r.snapshot.repo_key,
      snapshot_id: r.snapshot.snapshot_id,
      snapshot_id_kind: r.snapshot.snapshot_id_kind,
      subdir: r.snapshot.subdir,
      ref_label: r.snapshot.ref_label,
    },
    fingerprint: {
      archetype: r.fingerprint.archetype,
      primary_language: r.fingerprint.primary_language,
      language_breakdown: r.fingerprint.language_breakdown.map((l) => ({
        language: l.language,
        tier: l.tier,
        code_bytes: l.code_bytes,
      })),
      graph_confidence: r.fingerprint.graph_confidence,
      detected_framework: r.fingerprint.detected_framework,
      tech_stack: [...r.fingerprint.tech_stack],
      is_monorepo: r.fingerprint.is_monorepo,
      root_dir_offset: r.fingerprint.root_dir_offset,
    },
    total_files: r.total_files,
    nodes: r.nodes.map((n) => ({
      id: n.id,
      title: n.title,
      title_source: n.title_source,
      title_evidence: n.title_evidence,
      node_type: n.node_type,
      entry_symbol: n.entry_symbol,
      prerequisites: [...n.prerequisites],
      position: { x: n.position.x, y: n.position.y },
      files: [...n.files],
      languages: [...n.languages],
      support_tier: n.support_tier,
      cognitive_complexity: n.cognitive_complexity,
      rank_score: n.rank_score,
      is_vip_algorithm: n.is_vip_algorithm,
      is_capstone: n.is_capstone,
      uncle_bob: n.uncle_bob
        ? {
            instability: n.uncle_bob.instability,
            abstractness: n.uncle_bob.abstractness,
            distance: n.uncle_bob.distance,
            diagnosis: n.uncle_bob.diagnosis,
            is_exempt: n.uncle_bob.is_exempt,
          }
        : null,
      trace_steps: n.trace_steps.map((s) => ({
        step_number: s.step_number,
        layer: s.layer,
        file_path: s.file_path,
        function_name: s.function_name,
        line_start: s.line_start,
        line_end: s.line_end,
        snippet: s.snippet,
        snippet_line_map: [...s.snippet_line_map],
        origin_note: s.origin_note,
        branch: s.branch ? { ...s.branch } : null,
      })),
      dto_snippet: n.dto_snippet,
      group_id: n.group_id,
      entities: n.entities.map((e) => ({
        name: e.name,
        ops: [...e.ops],
      })),
    })),
    edges: r.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      confidence: e.confidence,
      via_entities: [...e.via_entities],
    })),
    groups: r.groups.map((g) => ({
      group_id: g.group_id,
      key: g.key,
      key_kind: g.key_kind,
      node_ids: [...g.node_ids],
    })),
    file_index: [...r.file_index],
    ingestion_report: {
      truncated: r.ingestion_report.truncated,
      selective_fetch: r.ingestion_report.selective_fetch,
      code_file_count: r.ingestion_report.code_file_count,
      manifest_count: r.ingestion_report.manifest_count,
      omitted_node_count: r.ingestion_report.omitted_node_count,
      skipped: {
        garbage: r.ingestion_report.skipped.garbage,
        binary: r.ingestion_report.skipped.binary,
        oversized: r.ingestion_report.skipped.oversized,
        unsupported_lang: r.ingestion_report.skipped.unsupported_lang,
        quota: r.ingestion_report.skipped.quota,
        parse_error: r.ingestion_report.skipped.parse_error,
      },
      warnings: [...r.ingestion_report.warnings],
      degraded_mode: r.ingestion_report.degraded_mode,
      redacted_secret_count: r.ingestion_report.redacted_secret_count,
      engine_ms: r.ingestion_report.engine_ms,
      ingest_ms: r.ingestion_report.ingest_ms,
    },
  };
}

import type { StaticEngineResult } from "@/contracts";
import { mainPathOf } from "@/lib/lesson-map";
import type { SymbolIndex } from "./types";

function cleanSymbolName(raw: string): string | null {
  if (raw.includes("<")) {
    return null;
  }
  const cleaned = raw.replace(/~\d+$/, "").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned;
}

export function buildSymbolWhitelist(
  idx: SymbolIndex,
  finalStepFunctions: string[]
): string[] {
  const result = new Set<string>();

  const addName = (raw: string | undefined | null): void => {
    if (!raw) return;
    const cleaned = cleanSymbolName(raw);
    if (cleaned) {
      result.add(cleaned);
    }
  };

  // 1. name mọi symbol và Class.method (phần sau # của khóa method)
  for (const sym of idx.symbols.values()) {
    addName(sym.name);
    if (sym.kind === "METHOD") {
      const hashIndex = sym.key.indexOf("#");
      if (hashIndex !== -1) {
        addName(sym.key.slice(hashIndex + 1));
      }
    }
  }

  // 2. Tên field từ khóa idx.field_types
  for (const key of idx.field_types.keys()) {
    const hashIndex = key.indexOf("#");
    const afterHash = hashIndex !== -1 ? key.slice(hashIndex + 1) : key;
    const dotIndex = afterHash.lastIndexOf(".");
    const fieldName = dotIndex !== -1 ? afterHash.slice(dotIndex + 1) : afterHash;
    addName(fieldName);
  }

  // 3. idx.type_fields
  for (const field of idx.type_fields) {
    addName(field);
  }

  // 4. Tham số và biến cục bộ qua idx.locals của các hàm trong finalStepFunctions
  for (const fnKey of finalStepFunctions) {
    const locals = idx.locals.get(fnKey);
    if (locals) {
      for (const loc of locals) {
        addName(loc);
      }
    }
  }

  return Array.from(result).sort();
}

export function mainPath(graph: StaticEngineResult): string[] {
  return mainPathOf(graph.nodes, graph.edges);
}

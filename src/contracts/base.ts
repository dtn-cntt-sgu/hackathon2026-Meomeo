export const SWE_SKILLS = [
  "HTTP_ROUTING", "DTO_VALIDATION", "AUTH_SECURITY", "DEPENDENCY_INJECTION",
  "LAYERED_SEPARATION", "DB_OPTIMIZATION", "ASYNC_CONCURRENCY", "TRANSACTION_INTEGRITY",
  "ERROR_HANDLING", "STATE_MANAGEMENT", "ALGORITHMIC_COMPLEXITY", "MEMORY_MANAGEMENT",
  "API_CONTRACT_DESIGN", "CACHING_STRATEGY", "RATE_LIMIT_RESILIENCE", "DATA_SERIALIZATION",
] as const;
export type SWESkill = typeof SWE_SKILLS[number];

export type LearnerTier = "NOVICE" | "PRACTITIONER" | "ARCHITECT";

// Trạng thái FSM của node trong 1 phiên học (lưu ở node_progress; LOCKED chỉ suy ra, không lưu)
export type NodeStatus = "LOCKED" | "AVAILABLE" | "COMPLETED" | "FAILED";

export type ProjectArchetype =
  | "WEB_BACKEND" | "WEB_FRONTEND" | "MOBILE_APP" | "DESKTOP_APP" | "CLI_TOOL" | "ALGORITHM_CORE";

// Mã ngôn ngữ của Language Registry: UPPER_SNAKE theo tên adapter (VD "TYPESCRIPT", "TSX", "PYTHON", "CSHARP")
export type LanguageId = string;
export type LanguageSupportTier = "RESOLVED" | "STRUCTURAL" | "UNSUPPORTED";

export type ArchitecturalLayer =
  | "ENTRY_POINT" | "MIDDLEWARE" | "BUSINESS_LOGIC" | "DATA_ACCESS"       // Lát cắt nghiệp vụ
  | "ALGO_SETUP" | "ALGO_EXECUTION" | "ALGO_TERMINATION";                // Node thuật toán

export type NodeType = "ARCHITECTURAL_DATA_FLOW" | "ALGORITHMIC_CORE";
export type DegradedMode = "PROCEDURAL";
export type GraphConfidence = "HIGH" | "MIXED" | "LOW";

// Danh mục mẫu kiến trúc cố định (AI chỉ được chọn trong danh mục)
export const ARCHITECTURE_PATTERNS = [
  "LAYERED", "MVC", "REPOSITORY", "MIDDLEWARE_CHAIN", "DEPENDENCY_INJECTION", "FACTORY",
  "OBSERVER_EVENT", "STRATEGY", "ADAPTER", "SINGLETON", "PIPELINE", "ALGORITHMIC", "PROCEDURAL", "OTHER",
] as const;
export type ArchitecturePattern = typeof ARCHITECTURE_PATTERNS[number];

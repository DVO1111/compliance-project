export type Operator =
  | "equals" | "notEquals"
  | "greaterThan" | "lessThan"
  | "contains" | "notContains"
  | "in" | "notIn"
  | "exists" | "notExists";

export interface Condition {
  field: string;         // dot-notation path, e.g. "entity.riskScore"
  operator: Operator;
  value?: unknown;
}

export interface ComplianceRule {
  id: string;
  name: string;
  severity: "info" | "warning" | "critical";
  conditions: Condition[];          // ALL must pass (AND logic)
  anyConditions?: Condition[];      // ANY must pass (OR logic)
  message: string;
  action?: "block" | "warn" | "flag";
}

export interface RuleResult {
  ruleId: string;
  name: string;
  passed: boolean;
  severity: ComplianceRule["severity"];
  message: string;
  action?: ComplianceRule["action"];
}

// ─── CONDITION EVALUATOR ─────────────────────
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function evalCondition(condition: Condition, data: Record<string, unknown>): boolean {
  const actual = getNestedValue(data, condition.field);
  const { operator, value } = condition;

  switch (operator) {
    case "equals":       return actual === value;
    case "notEquals":    return actual !== value;
    case "greaterThan":  return (actual as number) > (value as number);
    case "lessThan":     return (actual as number) < (value as number);
    case "contains":     return String(actual).includes(String(value));
    case "notContains":  return !String(actual).includes(String(value));
    case "in":           return Array.isArray(value) && value.includes(actual);
    case "notIn":        return Array.isArray(value) && !value.includes(actual);
    case "exists":       return actual !== undefined && actual !== null;
    case "notExists":    return actual === undefined || actual === null;
    default:             return false;
  }
}

// ─── RULE ENGINE ─────────────────────────────
export function evaluate(
  data: Record<string, unknown>,
  rules: ComplianceRule[]
): RuleResult[] {
  return rules.map((rule) => {
    const allPass = rule.conditions.every((c) => evalCondition(c, data));
    const anyPass = rule.anyConditions
      ? rule.anyConditions.some((c) => evalCondition(c, data))
      : true;

    const passed = allPass && anyPass;
    return {
      ruleId: rule.id,
      name: rule.name,
      passed,
      severity: rule.severity,
      message: rule.message,
      action: passed ? undefined : rule.action,
    };
  });
}

// ─── EXAMPLE RULESET ─────────────────────────
export const COMPLIANCE_RULES: ComplianceRule[] = [
  {
    id: "KYC-001",
    name: "KYC Document Required",
    severity: "critical",
    conditions: [{ field: "entity.kycStatus", operator: "notEquals", value: "verified" }],
    message: "Entity must have verified KYC before proceeding.",
    action: "block",
  },
  {
    id: "RISK-001",
    name: "High Risk Score Flag",
    severity: "warning",
    conditions: [{ field: "entity.riskScore", operator: "greaterThan", value: 75 }],
    message: "Risk score exceeds threshold — requires manual review.",
    action: "flag",
  },
  {
    id: "GEO-001",
    name: "Restricted Jurisdiction",
    severity: "critical",
    conditions: [
      {
        field: "entity.country",
        operator: "in",
        value: ["IR", "KP", "CU", "SY"],
      },
    ],
    message: "Entity is in a restricted jurisdiction.",
    action: "block",
  },
  {
    id: "TXN-001",
    name: "Large Transaction Threshold",
    severity: "warning",
    conditions: [{ field: "transaction.amount", operator: "greaterThan", value: 10000 }],
    message: "Transaction exceeds reporting threshold — SAR may be required.",
    action: "warn",
  },
];

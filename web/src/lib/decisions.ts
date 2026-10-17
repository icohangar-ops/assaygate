export function describeDecision(code: number): {
  action: "RELEASE" | "HOLD" | "REJECT";
  reason: string;
} {
  switch (code) {
    case 0:
      return { action: "RELEASE", reason: "within_cfo_cap" };
    case 1:
      return { action: "REJECT", reason: "unknown_escrow" };
    case 2:
      return { action: "REJECT", reason: "zero_amount" };
    case 3:
      return { action: "HOLD", reason: "dispute_freeze" };
    case 4:
      return { action: "REJECT", reason: "exceeds_tranche_cap" };
    case 5:
      return { action: "REJECT", reason: "insufficient_escrow" };
    case 6:
      return { action: "REJECT", reason: "agent_not_allowlisted" };
    default:
      return { action: "REJECT", reason: "unrecognised_decision" };
  }
}

export function agentLine(line: string): string {
  return `[assaygate-agent] ${new Date().toISOString()} ${line}`;
}

import { Contract, Signer } from "ethers";

export const DECISION = {
  Ok: 0,
  UnknownEscrow: 1,
  ZeroAmount: 2,
  Frozen: 3,
  ExceedsTrancheCap: 4,
  InsufficientBalance: 5,
  NotAllowlisted: 6,
} as const;

export function describeDecision(code: number): {
  action: "RELEASE" | "HOLD" | "REJECT";
  reason: string;
} {
  switch (code) {
    case DECISION.Ok:
      return { action: "RELEASE", reason: "within_cfo_cap" };
    case DECISION.UnknownEscrow:
      return { action: "REJECT", reason: "unknown_escrow" };
    case DECISION.ZeroAmount:
      return { action: "REJECT", reason: "zero_amount" };
    case DECISION.Frozen:
      return { action: "HOLD", reason: "dispute_freeze" };
    case DECISION.ExceedsTrancheCap:
      return { action: "REJECT", reason: "exceeds_tranche_cap" };
    case DECISION.InsufficientBalance:
      return { action: "REJECT", reason: "insufficient_escrow" };
    case DECISION.NotAllowlisted:
      return { action: "REJECT", reason: "agent_not_allowlisted" };
    default:
      return { action: "REJECT", reason: "unrecognised_decision" };
  }
}

export function agentLog(line: string): string {
  const text = `[assaygate-agent] ${new Date().toISOString()} ${line}`;
  console.log(text);
  return text;
}

export function revertName(error: unknown): string {
  if (error && typeof error === "object") {
    const wrapped = error as {
      revert?: { name?: string; args?: unknown[] };
      shortMessage?: string;
      message?: string;
    };
    if (wrapped.revert?.name) {
      const args = wrapped.revert.args?.length
        ? `(${wrapped.revert.args.map((arg) => String(arg)).join(", ")})`
        : "";
      return `${wrapped.revert.name}${args}`;
    }
    if (wrapped.shortMessage) return wrapped.shortMessage;
    if (wrapped.message) return wrapped.message.split("\n")[0];
  }
  return "reverted";
}

export async function agentStep(
  escrow: Contract,
  agent: Signer,
  escrowId: bigint,
  amount: bigint,
): Promise<{
  sent: boolean;
  log: string;
  decision: { action: "RELEASE" | "HOLD" | "REJECT"; reason: string };
  code: number;
  txHash?: string;
}> {
  const agentAddress = await agent.getAddress();
  const code = Number(await escrow.preview(escrowId, amount, agentAddress));
  const decision = describeDecision(code);

  let context = "";
  if (code !== DECISION.UnknownEscrow) {
    const row = await escrow.getEscrow(escrowId);
    const remaining = BigInt(row.funded) - BigInt(row.released);
    context =
      ` cap=${row.trancheCap} remaining=${remaining} frozen=${row.frozen}` +
      (row.frozen ? ` freezeReason=${JSON.stringify(row.freezeReason)}` : "");
  }

  const header = agentLog(
    `escrow=${escrowId} agent=${agentAddress} amount=${amount} decision=${decision.action} reason=${decision.reason}${context}`,
  );

  if (decision.action !== "RELEASE") {
    return { sent: false, log: header, decision, code };
  }

  const tx = await escrow.connect(agent).release(escrowId, amount);
  const receipt = await tx.wait();
  const sentLine = agentLog(`sent release tx=${receipt.hash} block=${receipt.blockNumber}`);
  return {
    sent: true,
    log: `${header}\n${sentLine}`,
    decision,
    code,
    txHash: receipt.hash,
  };
}

import { ethers } from "ethers";

export function formatOusd(value: bigint | string): string {
  const asNumber = Number(ethers.formatUnits(BigInt(value), 6));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber);
}

export function formatGrade(bps: string | number): string {
  return `${(Number(bps) / 100).toFixed(2)}% Co`;
}

export function formatKg(kg: string | number): string {
  return `${new Intl.NumberFormat("en-US").format(Number(kg))} kg`;
}

export function shortAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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

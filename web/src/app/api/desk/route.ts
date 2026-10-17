import { NextResponse } from "next/server";
import { DeskError, readDesk, runAction } from "@/lib/chain";
import type { DeskAction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS: DeskAction[] = ["mint", "open", "fund", "release", "over-cap", "dispute", "unfreeze"];

function fail(error: unknown) {
  if (error instanceof DeskError) {
    const status = error.code === "chain_down" ? 503 : 400;
    return NextResponse.json({ ok: false, error: error.code, message: error.message, chainId: error.chainId }, { status });
  }
  const message = error instanceof Error ? error.message.split("\n")[0] : "Unexpected failure.";
  return NextResponse.json({ ok: false, error: "action_failed", message }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(await readDesk());
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: DeskAction };
    if (!body.action || !ACTIONS.includes(body.action)) {
      return NextResponse.json({ ok: false, error: "action_failed", message: "Unknown desk action." }, { status: 400 });
    }
    const note = await runAction(body.action);
    const state = await readDesk();
    return NextResponse.json({ ...state, note });
  } catch (error) {
    return fail(error);
  }
}

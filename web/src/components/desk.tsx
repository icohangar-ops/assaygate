"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatGrade, formatKg, formatOusd, shortAddress } from "@/lib/format";
import type { DeskAction, DeskOk, DeskResponse } from "@/lib/types";

function statusLabel(state: DeskOk): { label: string; tone: "default" | "secondary" | "destructive" | "outline" } {
  if (!state.certificate) return { label: "Awaiting assay", tone: "outline" };
  if (!state.escrow) return { label: "Certified", tone: "secondary" };
  if (state.escrow.frozen) return { label: "Frozen", tone: "destructive" };
  if (state.escrow.funded === "0") return { label: "Escrow open", tone: "secondary" };
  if (state.escrow.released === "0") return { label: "Funded", tone: "default" };
  return { label: "Drawing", tone: "default" };
}

export function Desk() {
  const [state, setState] = useState<DeskOk | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<DeskAction | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/desk", { cache: "no-store" });
      const body = (await response.json()) as DeskResponse;
      if (!body.ok) {
        setState(null);
        setProblem(body.message);
        return;
      }
      setProblem(null);
      setState(body);
    } catch {
      setState(null);
      setProblem("The desk could not reach its API. Check that the Next.js server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function act(action: DeskAction) {
    setBusy(action);
    try {
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as DeskResponse;
      if (!body.ok) {
        setLog((current) => [`[desk] ${body.message}`, ...current]);
        return;
      }
      setProblem(null);
      setState(body);
      if (body.note) {
        setLog((current) => [...body.note!.split("\n"), ...current]);
      }
    } catch {
      setLog((current) => ["[desk] The action request failed before the chain answered.", ...current]);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !state) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-16">
        <p className="text-muted-foreground">Reading the local chain…</p>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
        <p className="font-heading text-4xl text-primary">AssayGate</p>
        <Card>
          <CardHeader>
            <CardTitle>The desk is not on a chain yet</CardTitle>
            <CardDescription>{problem}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="overflow-x-auto rounded-lg bg-background p-4 text-sm text-foreground">{`npm run chain
npm run deploy:local
npm run dev`}</pre>
            <Button onClick={() => void refresh()}>Read the chain again</Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const plan = state.shipment;
  const cert = state.certificate;
  const escrow = state.escrow;
  const status = statusLabel(state);
  const releaseUnits = BigInt(Math.round(Number(plan.releaseOusd) * 1_000_000));
  const canRelease = Boolean(escrow && BigInt(escrow.remaining) >= releaseUnits);
  const locked = busy !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.18em] text-primary uppercase">Portaldot Hacker House 2026 · Ecosystem DApps</p>
          <h1 className="font-heading text-4xl text-foreground sm:text-5xl">AssayGate</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            Provisional payment for lot {plan.shipmentId}. The agent may draw {Number(plan.releaseOusd).toLocaleString("en-US")} oUSD
            at a time. The CFO cap is {Number(plan.trancheCapOusd).toLocaleString("en-US")}. A grade dispute freezes what is left.
          </p>
        </div>
        <Badge variant="outline" className="h-7 px-3">
          Local chain {state.chainId}
        </Badge>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="assay-paper relative overflow-hidden rounded-2xl border border-[#d9c7a2] p-6 shadow-sm sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs tracking-[0.16em] text-[#8c6a2f] uppercase">Assay certificate</p>
              <h2 className="font-heading mt-2 text-3xl">{cert ? cert.shipmentId : plan.shipmentId}</h2>
              <p className="mt-1 text-sm text-[#5c5144]">
                {cert ? cert.mineral : plan.mineral} · {cert ? cert.mine : plan.mine}
              </p>
            </div>
            <Seal label={cert ? (escrow?.frozen ? "Disputed" : "Certified") : "Awaiting assay"} />
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 text-sm sm:grid-cols-3">
            <Fact label="Origin" value={cert ? cert.origin : plan.origin} />
            <Fact label="Grade" value={formatGrade(cert ? cert.gradeBps : plan.gradeBps)} />
            <Fact label="Dry weight" value={formatKg(cert ? cert.weightKg : plan.weightKg)} />
            <Fact label="Concession" value={plan.concession} />
            <Fact label="Seller" value={plan.sellerName} />
            <Fact label="Buyer" value={plan.buyerName} />
          </dl>

          <p className="mt-8 max-w-prose text-sm leading-6 text-[#5c5144]">
            {cert
              ? `Token #${cert.tokenId} is held by ${shortAddress(cert.owner)}. Lab file ${cert.assayUri}.`
              : "The attester has not minted this lot. The figures above are the shipment the desk will write on-chain."}
          </p>

          {escrow?.frozen && (
            <p className="mt-4 border-l-2 border-[#c4563a] pl-3 text-sm leading-6 text-[#6e2e22]">{escrow.freezeReason}</p>
          )}
        </article>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="font-heading text-2xl">Escrow</CardTitle>
              <Badge variant={status.tone}>{status.label}</Badge>
            </div>
            <CardDescription>
              {escrow
                ? `Escrow #${escrow.id} against certificate #${escrow.certId}. Payee is fixed to the seller.`
                : "No escrow yet. The CFO opens it and stamps the tranche cap."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid grid-cols-2 gap-4">
              <Money label="Funded" value={escrow ? formatOusd(escrow.funded) : "0.00"} />
              <Money label="Released" value={escrow ? formatOusd(escrow.released) : "0.00"} />
              <Money label="Remaining" value={escrow ? formatOusd(escrow.remaining) : "0.00"} />
              <Money
                label={escrow ? "Tranche cap" : "Cap the CFO will set"}
                value={escrow ? formatOusd(escrow.trancheCap) : formatOusd(BigInt(Number(plan.trancheCapOusd) * 1_000_000))}
              />
            </dl>
            <Separator />
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Buyer wallet {formatOusd(state.buyerBalance)} oUSD</p>
              <p>Seller wallet {formatOusd(state.sellerBalance)} oUSD</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Desk sequence</CardTitle>
          <CardDescription>Each step signs with a local Hardhat account. Nothing here asks for a Portaldot faucet.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button variant="secondary" className="h-11 justify-start px-4" disabled={locked || Boolean(cert)} onClick={() => void act("mint")}>
            {busy === "mint" ? "Minting…" : "1. Mint assay certificate"}
          </Button>
          <Button variant="secondary" className="h-11 justify-start px-4" disabled={locked || !cert || Boolean(escrow)} onClick={() => void act("open")}>
            {busy === "open" ? "Opening…" : `2. CFO opens escrow, cap ${Number(plan.trancheCapOusd).toLocaleString("en-US")}`}
          </Button>
          <Button variant="secondary" className="h-11 justify-start px-4" disabled={locked || !escrow || escrow.funded !== "0" || escrow.frozen} onClick={() => void act("fund")}>
            {busy === "fund" ? "Funding…" : `3. Buyer funds ${Number(plan.fundOusd).toLocaleString("en-US")} oUSD`}
          </Button>
          <Button className="h-11 justify-start px-4" disabled={locked || !canRelease} onClick={() => void act("release")}>
            {busy === "release"
              ? "Agent judging…"
              : escrow?.frozen
                ? "4. Agent checks the frozen escrow"
                : `4. Agent releases ${Number(plan.releaseOusd).toLocaleString("en-US")}`}
          </Button>
          <Button variant="outline" className="h-11 justify-start px-4" disabled={locked || !escrow || escrow.funded === "0" || escrow.frozen} onClick={() => void act("over-cap")}>
            {busy === "over-cap" ? "Agent judging…" : `5. Agent attempts ${Number(plan.overCapOusd).toLocaleString("en-US")} (over cap)`}
          </Button>
          <Button variant="destructive" className="h-11 justify-start px-4" disabled={locked || !escrow || escrow.frozen} onClick={() => void act("dispute")}>
            {busy === "dispute" ? "Freezing…" : "6. Arbiter files grade dispute"}
          </Button>
          <Button variant="ghost" className="h-11 justify-start px-4 sm:col-span-2" disabled={locked || !escrow?.frozen} onClick={() => void act("unfreeze")}>
            {busy === "unfreeze" ? "Clearing…" : "CFO clears the freeze"}
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Agent decisions this session</CardTitle>
            <CardDescription>The agent logs the judgment before it sends. A refusal does not become a transaction.</CardDescription>
          </CardHeader>
          <CardContent>
            <div aria-live="polite" className="max-h-72 space-y-2 overflow-auto font-mono text-xs leading-5 text-muted-foreground">
              {log.length === 0 ? <p>The agent has not judged a draw in this session.</p> : log.map((line, index) => <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>On-chain history</CardTitle>
            <CardDescription>Events already mined on the local node.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="max-h-72 space-y-3 overflow-auto text-sm">
              {state.history.length === 0 ? (
                <li className="text-muted-foreground">No AssayGate events yet.</li>
              ) : (
                state.history.map((row) => (
                  <li key={row.tx + row.kind + row.detail} className="border-b border-border pb-3 last:border-0">
                    <p className="text-primary">{row.kind}</p>
                    <p>{row.detail}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">{row.tx}</p>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-2 text-xs leading-5 text-muted-foreground">
        <p>Certificate {state.addresses.certificate}</p>
        <p>Escrow {state.addresses.escrow}</p>
        <p>oUSD {state.addresses.paymentToken}</p>
        <p>Deploy tx {state.addresses.deployTx || "not recorded"}</p>
        <p>
          Portaldot testnet is configured separately (chain 420420777, RPC from the environment). This page will not sign on it.
        </p>
      </section>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.14em] text-[#8c6a2f] uppercase">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-heading text-2xl text-foreground">{value}</dd>
    </div>
  );
}

function Seal({ label }: { label: string }) {
  return (
    <div className="grid size-24 shrink-0 place-items-center rounded-full border-2 border-[#8c6a2f] text-center">
      <span className="max-w-16 text-[10px] font-semibold tracking-[0.14em] text-[#8c6a2f] uppercase">{label}</span>
    </div>
  );
}

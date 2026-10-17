import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { agentLine, describeDecision } from "./decisions";
import { formatOusd, revertName } from "./format";
import type { CertificateView, DeskAction, DeskOk, EscrowView, HistoryRow, ShipmentPlan } from "./types";

const ROOT = path.join(process.cwd(), "..");
const DEMO_MNEMONIC = "test test test test test test test test test test test junk";

const INDEX = {
  admin: 0,
  attester: 1,
  buyer: 2,
  seller: 3,
  agent: 4,
  arbiter: 5,
} as const;

export class DeskError extends Error {
  constructor(
    public code: string,
    message: string,
    public chainId?: string,
  ) {
    super(message);
  }
}

type Deployment = {
  certificate: string;
  escrow: string;
  paymentToken: string;
  deployTx?: string;
  roles: DeskOk["roles"];
};

function repoPath(...parts: string[]) {
  return path.join(ROOT, ...parts);
}

function loadShipment(): ShipmentPlan {
  return JSON.parse(fs.readFileSync(repoPath("demo", "shipment.json"), "utf8")) as ShipmentPlan;
}

function loadDeployment(): Deployment | null {
  const file = repoPath("deployments", "localhost.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
}

function loadAbi(contract: "AssayCertificate" | "AssayEscrow" | "MockUSD") {
  const file = repoPath("artifacts", "contracts", `${contract}.sol`, `${contract}.json`);
  if (!fs.existsSync(file)) {
    throw new DeskError("not_compiled", "Contracts are not compiled. From the repo root run npm run compile.");
  }
  return JSON.parse(fs.readFileSync(file, "utf8")).abi;
}

function rpcUrl() {
  return process.env.LOCAL_RPC_URL?.trim() || "http://127.0.0.1:18545";
}

function provider() {
  // cacheTimeout -1: ethers otherwise caches eth_getTransactionCount for 250ms,
  // so a second transaction from the same signer reuses the previous nonce.
  return new ethers.JsonRpcProvider(rpcUrl(), 31337, { staticNetwork: true, cacheTimeout: -1 });
}

function demoWallet(index: number, active: ethers.Provider) {
  return ethers.HDNodeWallet.fromPhrase(DEMO_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`).connect(active);
}

async function connect() {
  const active = provider();
  let network;
  try {
    network = await active.getNetwork();
  } catch {
    throw new DeskError(
      "chain_down",
      `Nothing is answering at ${rpcUrl()}. Start the local chain with npm run chain, then deploy with npm run deploy:local.`,
    );
  }
  if (network.chainId !== 31337n) {
    throw new DeskError(
      "refused",
      `This desk signs with the public Hardhat mnemonic and only runs on local chain 31337. Connected chain is ${network.chainId}.`,
      network.chainId.toString(),
    );
  }
  return { provider: active, chainId: network.chainId.toString() };
}

function contracts(deployment: Deployment, runner: ethers.Provider | ethers.Signer) {
  return {
    certificate: new ethers.Contract(deployment.certificate, loadAbi("AssayCertificate"), runner),
    escrow: new ethers.Contract(deployment.escrow, loadAbi("AssayEscrow"), runner),
    token: new ethers.Contract(deployment.paymentToken, loadAbi("MockUSD"), runner),
  };
}

async function requireDeployment(active: ethers.Provider) {
  const deployment = loadDeployment();
  if (!deployment) {
    throw new DeskError(
      "not_deployed",
      "No local deployment file. With the chain running, run npm run deploy:local.",
    );
  }
  const code = await active.getCode(deployment.escrow);
  if (code === "0x") {
    throw new DeskError(
      "stale_deploy",
      "The saved escrow address has no code on this chain. Restart is not required if the node is still up — run npm run deploy:local again. If you restarted the node, deploy again so the addresses match.",
    );
  }
  return deployment;
}

function assertRole(actual: string, expected: string, label: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new DeskError(
      "role_mismatch",
      `${label} ${actual} does not match the deployment record ${expected}. Run npm run deploy:local against this chain.`,
    );
  }
}

export async function readDesk(): Promise<DeskOk> {
  const { provider: active, chainId } = await connect();
  const deployment = await requireDeployment(active);
  const shipment = loadShipment();
  const { certificate, escrow, token } = contracts(deployment, active);

  const nextCert = BigInt(await certificate.nextId());
  const nextEscrow = BigInt(await escrow.nextEscrowId());

  let escrowView: EscrowView | null = null;
  let certificateView: CertificateView | null = null;
  let certId = nextCert > 1n ? nextCert - 1n : 0n;

  if (nextEscrow > 1n) {
    const id = nextEscrow - 1n;
    const row = await escrow.getEscrow(id);
    const funded = BigInt(row.funded);
    const released = BigInt(row.released);
    escrowView = {
      id: id.toString(),
      certId: BigInt(row.certId).toString(),
      buyer: row.buyer,
      seller: row.seller,
      funded: funded.toString(),
      released: released.toString(),
      remaining: (funded - released).toString(),
      trancheCap: BigInt(row.trancheCap).toString(),
      frozen: Boolean(row.frozen),
      freezeReason: row.freezeReason,
      frozenBy: row.frozenBy,
    };
    certId = BigInt(row.certId);
  }

  if (certId > 0n) {
    const assay = await certificate.getAssay(certId);
    certificateView = {
      tokenId: certId.toString(),
      owner: await certificate.ownerOf(certId),
      shipmentId: assay.shipmentId,
      mine: assay.mine,
      mineral: assay.mineral,
      origin: assay.origin,
      gradeBps: BigInt(assay.gradeBps).toString(),
      weightKg: BigInt(assay.weightKg).toString(),
      assayUri: assay.assayUri,
      attester: assay.attester,
      attestedAt: BigInt(assay.attestedAt).toString(),
    };
  }

  const [buyerBalance, sellerBalance, history] = await Promise.all([
    token.balanceOf(deployment.roles.buyer),
    token.balanceOf(deployment.roles.seller),
    readHistory(certificate, escrow),
  ]);

  return {
    ok: true,
    chainId,
    rpcUrl: rpcUrl(),
    addresses: {
      certificate: deployment.certificate,
      escrow: deployment.escrow,
      paymentToken: deployment.paymentToken,
      deployTx: deployment.deployTx ?? "",
    },
    roles: deployment.roles,
    shipment,
    certificate: certificateView,
    escrow: escrowView,
    buyerBalance: BigInt(buyerBalance).toString(),
    sellerBalance: BigInt(sellerBalance).toString(),
    history,
  };
}

async function readHistory(certificate: ethers.Contract, escrow: ethers.Contract): Promise<HistoryRow[]> {
  const rows: Array<HistoryRow & { block: number; index: number }> = [];
  const push = (log: ethers.EventLog | ethers.Log, kind: string, detail: string) => {
    const eventLog = log as ethers.EventLog;
    rows.push({
      kind,
      detail,
      tx: eventLog.transactionHash,
      block: eventLog.blockNumber,
      index: eventLog.index,
    });
  };

  const minted = await certificate.queryFilter(certificate.filters.CertificateMinted(), 0n, "latest");
  for (const log of minted) {
    const eventLog = log as ethers.EventLog;
    push(log, "Mint", `Certificate #${eventLog.args.tokenId} attested at ${formatGradeSafe(eventLog.args.gradeBps)}`);
  }

  const opened = await escrow.queryFilter(escrow.filters.EscrowOpened(), 0n, "latest");
  for (const log of opened) {
    const eventLog = log as ethers.EventLog;
    push(log, "Open", `Escrow #${eventLog.args.escrowId} cap ${formatOusd(eventLog.args.trancheCap)} oUSD`);
  }

  const funded = await escrow.queryFilter(escrow.filters.EscrowFunded(), 0n, "latest");
  for (const log of funded) {
    const eventLog = log as ethers.EventLog;
    push(log, "Fund", `Buyer deposited ${formatOusd(eventLog.args.amount)} oUSD`);
  }

  const released = await escrow.queryFilter(escrow.filters.TrancheReleased(), 0n, "latest");
  for (const log of released) {
    const eventLog = log as ethers.EventLog;
    push(log, "Release", `Agent released ${formatOusd(eventLog.args.amount)} oUSD to the seller`);
  }

  const frozen = await escrow.queryFilter(escrow.filters.EscrowFrozen(), 0n, "latest");
  for (const log of frozen) {
    const eventLog = log as ethers.EventLog;
    push(log, "Freeze", `Dispute freeze: ${eventLog.args.reason}`);
  }

  const thawed = await escrow.queryFilter(escrow.filters.EscrowUnfrozen(), 0n, "latest");
  for (const log of thawed) {
    push(log, "Unfreeze", "CFO or arbiter cleared the freeze");
  }

  rows.sort((a, b) => a.block - b.block || a.index - b.index);
  return rows.map(({ kind, detail, tx }) => ({ kind, detail, tx }));
}

function formatGradeSafe(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}% Co`;
}

async function agentConsider(amount: bigint): Promise<string> {
  const { provider: active } = await connect();
  const deployment = await requireDeployment(active);
  const agent = demoWallet(INDEX.agent, active);
  assertRole(agent.address, deployment.roles.agent, "Agent");
  const { escrow } = contracts(deployment, active);
  const escrowId = BigInt(await escrow.nextEscrowId()) - 1n;
  if (escrowId < 1n) throw new DeskError("action_failed", "Open the escrow before the agent runs.");

  const code = Number(await escrow.preview(escrowId, amount, agent.address));
  const decision = describeDecision(code);
  const row = await escrow.getEscrow(escrowId);
  const remaining = BigInt(row.funded) - BigInt(row.released);
  let note = agentLine(
    `escrow=${escrowId} agent=${agent.address} amount=${amount} decision=${decision.action} reason=${decision.reason} cap=${row.trancheCap} remaining=${remaining} frozen=${row.frozen}` +
      (row.frozen ? ` freezeReason=${JSON.stringify(row.freezeReason)}` : ""),
  );

  const signedEscrow = contracts(deployment, agent).escrow;
  if (decision.action === "RELEASE") {
    const tx = await signedEscrow.release(escrowId, amount);
    const receipt = await tx.wait();
    note += `\n${agentLine(`sent release tx=${receipt.hash} block=${receipt.blockNumber}`)}`;
    return note;
  }

  try {
    await signedEscrow.release.staticCall(escrowId, amount);
    note += "\n[demo] eth_call returned without reverting. The agent still did not send a transaction.";
  } catch (error) {
    note += `\n[demo] chain reverted: ${revertName(error)}`;
  }
  return note;
}

export async function runAction(action: DeskAction): Promise<string> {
  const { provider: active } = await connect();
  const deployment = await requireDeployment(active);
  const shipment = loadShipment();
  const { certificate, escrow } = contracts(deployment, active);

  if (action === "mint") {
    const attester = demoWallet(INDEX.attester, active);
    assertRole(attester.address, deployment.roles.attester, "Attester");
    if (BigInt(await certificate.nextId()) > 1n) return "[desk] Certificate already minted.";
    const tx = await contracts(deployment, attester).certificate.mint(
      deployment.roles.seller,
      shipment.shipmentId,
      shipment.mine,
      shipment.mineral,
      shipment.origin,
      shipment.gradeBps,
      shipment.weightKg,
      shipment.assayUri,
    );
    const receipt = await tx.wait();
    return `[desk] Minted ${shipment.shipmentId} tx=${receipt.hash}`;
  }

  if (action === "open") {
    const cfo = demoWallet(INDEX.admin, active);
    assertRole(cfo.address, deployment.roles.cfo, "CFO");
    if (BigInt(await certificate.nextId()) < 2n) {
      throw new DeskError("action_failed", "Mint the assay certificate before the CFO opens escrow.");
    }
    if (BigInt(await escrow.nextEscrowId()) > 1n) return "[desk] Escrow is already open.";
    const cap = ethers.parseUnits(shipment.trancheCapOusd, 6);
    const tx = await contracts(deployment, cfo).escrow.openEscrow(
      1n,
      deployment.roles.buyer,
      deployment.roles.seller,
      deployment.paymentToken,
      cap,
    );
    const receipt = await tx.wait();
    return `[desk] CFO opened escrow. Tranche cap ${shipment.trancheCapOusd} oUSD. tx=${receipt.hash}`;
  }

  if (action === "fund") {
    const buyer = demoWallet(INDEX.buyer, active);
    assertRole(buyer.address, deployment.roles.buyer, "Buyer");
    const escrowId = BigInt(await escrow.nextEscrowId()) - 1n;
    if (escrowId < 1n) throw new DeskError("action_failed", "The CFO has not opened the escrow yet.");
    const row = await escrow.getEscrow(escrowId);
    if (row.frozen) throw new DeskError("action_failed", "The escrow is frozen. Funding is blocked until it is cleared.");
    if (BigInt(row.funded) > 0n) return "[desk] Escrow is already funded.";
    const amount = ethers.parseUnits(shipment.fundOusd, 6);
    const signed = contracts(deployment, buyer);
    const allowance = BigInt(await signed.token.allowance(buyer.address, deployment.escrow));
    if (allowance < amount) {
      const approveTx = await signed.token.approve(deployment.escrow, amount);
      await approveTx.wait();
    }
    const fundTx = await signed.escrow.fund(escrowId, amount);
    const receipt = await fundTx.wait();
    return `[desk] ${shipment.buyerName} funded ${shipment.fundOusd} oUSD. tx=${receipt.hash}`;
  }

  if (action === "release") {
    return agentConsider(ethers.parseUnits(shipment.releaseOusd, 6));
  }

  if (action === "over-cap") {
    return agentConsider(ethers.parseUnits(shipment.overCapOusd, 6));
  }

  if (action === "dispute") {
    const arbiter = demoWallet(INDEX.arbiter, active);
    assertRole(arbiter.address, deployment.roles.arbiter, "Arbiter");
    const escrowId = BigInt(await escrow.nextEscrowId()) - 1n;
    if (escrowId < 1n) throw new DeskError("action_failed", "There is no escrow to freeze.");
    const row = await escrow.getEscrow(escrowId);
    if (row.frozen) return "[desk] Escrow is already frozen.";
    const tx = await contracts(deployment, arbiter).escrow.freeze(escrowId, shipment.disputeReason);
    const receipt = await tx.wait();
    return `[desk] Arbiter froze escrow #${escrowId}. tx=${receipt.hash}\n[desk] ${shipment.disputeReason}`;
  }

  if (action === "unfreeze") {
    const cfo = demoWallet(INDEX.admin, active);
    assertRole(cfo.address, deployment.roles.cfo, "CFO");
    const escrowId = BigInt(await escrow.nextEscrowId()) - 1n;
    if (escrowId < 1n) throw new DeskError("action_failed", "There is no escrow to clear.");
    const tx = await contracts(deployment, cfo).escrow.unfreeze(escrowId);
    const receipt = await tx.wait();
    return `[desk] CFO cleared the freeze. tx=${receipt.hash}`;
  }

  throw new DeskError("action_failed", "Unknown action.");
}

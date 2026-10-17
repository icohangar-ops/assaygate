export type ShipmentPlan = {
  shipmentId: string;
  mine: string;
  mineral: string;
  origin: string;
  gradeBps: number;
  weightKg: number;
  assayUri: string;
  fundOusd: string;
  trancheCapOusd: string;
  releaseOusd: string;
  overCapOusd: string;
  disputeReason: string;
  buyerName: string;
  sellerName: string;
  concession: string;
};

export type CertificateView = {
  tokenId: string;
  owner: string;
  shipmentId: string;
  mine: string;
  mineral: string;
  origin: string;
  gradeBps: string;
  weightKg: string;
  assayUri: string;
  attester: string;
  attestedAt: string;
};

export type EscrowView = {
  id: string;
  certId: string;
  buyer: string;
  seller: string;
  funded: string;
  released: string;
  remaining: string;
  trancheCap: string;
  frozen: boolean;
  freezeReason: string;
  frozenBy: string;
};

export type HistoryRow = {
  kind: string;
  detail: string;
  tx: string;
};

export type DeskOk = {
  ok: true;
  chainId: string;
  rpcUrl: string;
  addresses: {
    certificate: string;
    escrow: string;
    paymentToken: string;
    deployTx: string;
  };
  roles: {
    admin: string;
    cfo: string;
    attester: string;
    arbiter: string;
    agent: string;
    buyer: string;
    seller: string;
  };
  shipment: ShipmentPlan;
  certificate: CertificateView | null;
  escrow: EscrowView | null;
  buyerBalance: string;
  sellerBalance: string;
  history: HistoryRow[];
  note?: string;
};

export type DeskErr = {
  ok: false;
  error: string;
  message: string;
  chainId?: string;
};

export type DeskResponse = DeskOk | DeskErr;

export type DeskAction = "mint" | "open" | "fund" | "release" | "over-cap" | "dispute" | "unfreeze";

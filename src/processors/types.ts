/**
 * Processor-agnostic adapter contract. Sync code and the UI only talk to this interface,
 * so adding a second payment partner means writing one more adapter.
 * Normalized records always carry the processor's own id (`externalId`) and the raw payload.
 */

export type Page<T> = { items: T[]; page: number; pageCount: number; totalCount: number };

export type NAddress = { street?: string | null; city?: string | null; state?: string | null; zip?: string | null };

export type NPrincipal = {
  firstName: string; lastName: string; title?: string | null; email?: string | null; phone?: string | null;
  ownershipPct?: number | null; isSigner?: boolean; isGuarantor?: boolean;
};

export type NAccount = {
  externalId?: string | null; mid: string; processingMethod: string; status: string; riskLevel?: string | null;
  bankName?: string | null; bankAccount?: string | null; routing?: string | null; openedAt?: string | null; closedAt?: string | null;
};

export type NMerchant = {
  externalId: string; // DBA id
  merchantExternalId?: string | null;
  legalName: string; dbaName: string; ein?: string | null; mcc?: string | null;
  address: NAddress; csPhone?: string | null; csEmail?: string | null; website?: string | null;
  principals: NPrincipal[]; accounts: NAccount[]; raw: unknown;
};

export type NTerminal = { externalId: string; dbaExternalId: string; mid?: string | null; tid: string; name?: string | null; model?: string | null; status: string; raw: unknown };

export type NApplication = {
  externalId: string; status: "New" | "Pending" | "Underwriting" | "Approved" | "Declined" | "Cancelled";
  signatureStatus: "Unsigned" | "Partially Signed" | "Signed" | "Rejected"; conditional: boolean;
  legalName?: string | null; dbaName?: string | null; dbaExternalId?: string | null; mcc?: string | null; campaign?: string | null;
  createdAt?: string | null; updatedAt?: string | null; raw: unknown;
};

export type NCheck = { name: string; status: "Passed" | "Failed" | "Pending"; detail?: string | null };

export type NTicket = {
  externalId: string; dbaExternalId?: string | null; subject: string; text?: string | null;
  status: "New" | "In Progress" | "On Hold" | "Closed"; category?: string | null; createdAt?: string | null; raw: unknown;
};

export type NChargeback = {
  externalId: string; caseId: string; dbaExternalId?: string | null; amount: number; reasonCode?: string | null; reason?: string | null;
  cardBrand?: string | null; cardLast4?: string | null; receivedAt: string; respondBy?: string | null; status: "Processed" | "Won" | "Lost"; raw: unknown;
};

export type NResidual = {
  externalId: string; mid: string; period: string; salesCount: number; salesAmount: number; revenue: number; expense: number;
  splitPct: number; adjustment: number; adjustmentNote?: string | null; profit: number; held: number; heldNote?: string | null;
  publishedAt?: string | null; raw: unknown;
};

export type NPayout = { dbaExternalId: string; depositDate: string; gross: number; fees: number; chargebacks: number; reserve: number; net: number; batches: number };

export type TestResult = { ok: boolean; message: string; status?: number; detail?: string };

export interface ProcessorAdapter {
  readonly processor: string;
  testConnection(): Promise<TestResult>;
  listMerchants(page: number): Promise<Page<NMerchant>>;
  listTerminals(page: number): Promise<Page<NTerminal>>;
  listApplications(page: number): Promise<Page<NApplication>>;
  getApplicationChecks(externalId: string): Promise<NCheck[]>;
  listTickets(page: number): Promise<Page<NTicket>>;
  listChargebacks(page: number): Promise<Page<NChargeback>>;
  listResiduals(page: number): Promise<Page<NResidual>>;
  listPayouts(dbaExternalId: string, from: string, to: string): Promise<NPayout[]>;

  // Writes. Callers must confirm with the user first; these change data at the processor.
  createTicket(input: { dbaExternalId: string; subject: string; text: string; notifyMerchant: boolean }): Promise<{ externalId: string }>;
  addTicketResponse(ticketExternalId: string, text: string): Promise<void>;
  requestSignature(applicationExternalId: string): Promise<void>;
  getApplicationUrl(applicationExternalId: string): Promise<string | null>;
  submitToUnderwriting(applicationExternalId: string): Promise<void>;
  acceptChargeback(chargebackExternalId: string, caseId: string): Promise<void>;
}

export class ProcessorError extends Error {
  constructor(message: string, public status?: number, public body?: string) { super(message); }
}

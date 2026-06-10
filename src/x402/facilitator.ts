export class FacilitatorError extends Error {
  constructor(
    message: string,
    public readonly step: 'verify' | 'settle',
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'FacilitatorError';
  }
}

export class FacilitatorClient {
  private readonly verifyUrl: string;
  private readonly settleUrl: string;

  constructor(facilitatorBase: string) {
    const base = facilitatorBase.replace(/\/+$/, '');
    this.verifyUrl = `${base}/api/v1/facilitator/verify`;
    this.settleUrl = `${base}/api/v1/facilitator/settle`;
  }

  async verifyAndSettle(body: unknown): Promise<Record<string, unknown>> {
    const verifyRes = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const verifyText = await verifyRes.text();
    if (!verifyRes.ok) {
      throw new FacilitatorError(
        `verify ${verifyRes.status}: ${verifyText.slice(0, 400)}`,
        'verify',
        verifyRes.status,
        verifyText,
      );
    }
    const verifyJson = JSON.parse(verifyText) as Record<string, unknown>;
    const isValid = verifyJson['isValid'] === true || verifyJson['valid'] === true;
    if (!isValid) {
      throw new FacilitatorError(
        `verify indicated invalid proof: ${verifyText.slice(0, 400)}`,
        'verify',
        verifyRes.status,
        verifyText,
      );
    }

    const settleBody: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    const cid = verifyJson['correlationId'];
    if (typeof cid === 'string' && cid && !('correlationId' in settleBody)) {
      settleBody['correlationId'] = cid;
    }

    const settleRes = await fetch(this.settleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settleBody),
    });
    const settleText = await settleRes.text();
    if (!settleRes.ok) {
      if (isDuplicateSettleBody(settleText)) {
        return syntheticSettlementAfterDuplicate(verifyJson, body, settleText);
      }
      throw new FacilitatorError(
        `settle ${settleRes.status}: ${settleText.slice(0, 400)}`,
        'settle',
        settleRes.status,
        settleText,
      );
    }
    return JSON.parse(settleText) as Record<string, unknown>;
  }
}

function isDuplicateSettleBody(body: string): boolean {
  const lower = body.toLowerCase();
  return (
    lower.includes('already been processed') ||
    lower.includes('alreadyprocessed') ||
    lower.includes('this transaction has already been processed')
  );
}

function syntheticSettlementAfterDuplicate(
  verify: Record<string, unknown>,
  proof: unknown,
  settleErrorSnippet: string,
): Record<string, unknown> {
  const network =
    (proof as { paymentRequirements?: { network?: string } })?.paymentRequirements?.network ?? '';
  return {
    success: true,
    payer: verify['payer'] ?? null,
    network,
    transaction: '',
    settlementNote:
      'verify succeeded; settle reported duplicate on-chain — treating as idempotent success',
    settleErrorPreview: settleErrorSnippet.slice(0, 240),
  };
}

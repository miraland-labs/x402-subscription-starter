import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface ParameterRow {
  param_value: string;
}

export class AppDb {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.pragma('journal_mode = WAL');

    // mintforge-aligned parameters table — DB takes priority over env vars
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parameters (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          service        TEXT NOT NULL,
          endpoint       TEXT NOT NULL DEFAULT '*',
          param_name     TEXT NOT NULL,
          param_value    TEXT NOT NULL,
          inactive       INTEGER NOT NULL DEFAULT 0,
          effective_from TEXT,
          expires_at     TEXT,
          created_at     TEXT NOT NULL,
          updated_at     TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_parameters_service_endpoint_param
          ON parameters (service, endpoint, param_name);
      CREATE INDEX IF NOT EXISTS idx_parameters_service_active
          ON parameters (service, inactive);
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        payer       TEXT NOT NULL,
        tier        TEXT NOT NULL,
        issued_at   TEXT NOT NULL,
        expires_at  TEXT NOT NULL,
        tx_sig      TEXT,
        revoked     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_payer_issued
          ON subscriptions (payer, issued_at);
    `);
  }

  public resolveParameter(service: string, endpoint: string, paramName: string): string | null {
    let stmt = this.db.prepare(`
      SELECT param_value FROM parameters
      WHERE service = ? AND endpoint = ? AND param_name = ? AND inactive = 0
    `);
    let res = stmt.get(service, endpoint, paramName) as ParameterRow | undefined;
    if (res) return res.param_value;

    stmt = this.db.prepare(`
      SELECT param_value FROM parameters
      WHERE service = ? AND endpoint = '*' AND param_name = ? AND inactive = 0
    `);
    res = stmt.get(service, paramName) as ParameterRow | undefined;
    if (res) return res.param_value;

    return null;
  }

  public recordSubscription(
    payer: string,
    tier: string,
    issuedAt: Date,
    expiresAt: Date,
    txSig?: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO subscriptions (payer, tier, issued_at, expires_at, tx_sig, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .run(payer, tier, issuedAt.toISOString(), expiresAt.toISOString(), txSig ?? null);
  }

  public lookupSubscription(payer: string, issuedAtIso: string): { revoked: boolean } | null {
    const row = this.db
      .prepare(
        `SELECT revoked FROM subscriptions
         WHERE payer = ? AND issued_at = ? LIMIT 1`,
      )
      .get(payer, issuedAtIso) as { revoked: number } | undefined;

    if (!row) return null;
    return { revoked: row.revoked !== 0 };
  }

  /** Strict policy: missing row counts as revoked. Prefer SDK store for new code. */
  public isTokenRevoked(payer: string, issuedAtIso: string): boolean {
    const row = this.lookupSubscription(payer, issuedAtIso);
    if (!row) return true;
    return row.revoked;
  }

  public revokeToken(payer: string, issuedAtIso: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE subscriptions SET revoked = 1
         WHERE payer = ? AND issued_at = ? AND revoked = 0`,
      )
      .run(payer, issuedAtIso);
    return info.changes > 0;
  }
}

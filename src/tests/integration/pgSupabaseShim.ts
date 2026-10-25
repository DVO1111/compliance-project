/**
 * A supabase-js stand-in backed by a real PostgreSQL connection.
 *
 * ── WHY THIS EXISTS ──
 *
 * The unit tests mock `supabase` and prove the service's *logic*. The
 * SQL suites prove the database's *rules*. Neither touches the seam
 * between them, and that seam is where a real class of defect lives:
 * an RPC called with the wrong argument name, an insert naming a
 * column that does not exist, a status the service reads from a field
 * the database spells differently. All three pass a mocked test and
 * all three fail in production.
 *
 * So this shim speaks the small part of the supabase-js surface the
 * material services actually use, and executes it as SQL against a
 * real database. The service code under test is unmodified.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * It is not a Supabase emulator. It does not implement PostgREST
 * filter syntax, embedded selects, or auth. It implements exactly the
 * calls these services make, and throws loudly on anything else rather
 * than silently returning empty — a shim that quietly answers "no
 * rows" would make a broken contract look like a passing test, which
 * is the failure mode it exists to catch.
 *
 * ── IMPERSONATION IS REAL ──
 *
 * `setActor` issues `SET ROLE authenticated` and sets
 * `request.jwt.claims` on the same connection, which is how the
 * database's own suites impersonate. So RLS, the section guards and the
 * CoA authority trigger all apply exactly as they would to a signed-in
 * caller. `setServiceContext` resets to the owning role for fixtures.
 */

import { Client } from 'pg';

export interface ShimResult<T> { data: T | null; error: { message: string } | null }

type Order = { column: string; ascending: boolean };

function ident(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`unsafe identifier: ${name}`);
  return `"${name}"`;
}

class Query<T> implements PromiseLike<ShimResult<T[]>> {
  private wheres: { column: string; value: unknown }[] = [];
  private orders: Order[] = [];
  private columns = '*';

  constructor(private client: Client, private table: string) {}

  select(cols: string) { this.columns = cols; return this; }
  eq(column: string, value: unknown) { this.wheres.push({ column, value }); return this; }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: opts?.ascending !== false });
    return this;
  }

  private build(): { text: string; values: unknown[] } {
    //  The column list is passed through as written by the service, so
    //  a column the service names and the table does not have fails
    //  here — which is the point.
    const cols = this.columns
      .split(',')
      .map((c) => ident(c.trim()))
      .join(', ');
    const values: unknown[] = [];
    const where = this.wheres
      .map((w) => { values.push(w.value); return `${ident(w.column)} = $${values.length}`; })
      .join(' AND ');
    const orderBy = this.orders
      .map((o) => `${ident(o.column)} ${o.ascending ? 'ASC' : 'DESC'}`)
      .join(', ');
    return {
      text:
        `SELECT ${cols} FROM public.${ident(this.table)}` +
        (where ? ` WHERE ${where}` : '') +
        (orderBy ? ` ORDER BY ${orderBy}` : ''),
      values,
    };
  }

  then<R1 = ShimResult<T[]>, R2 = never>(
    onFulfilled?: ((v: ShimResult<T[]>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const { text, values } = this.build();
    return this.client
      .query(text, values)
      .then(
        (r) => ({ data: r.rows as T[], error: null }),
        (e: Error) => ({ data: null, error: { message: e.message } }),
      )
      .then(onFulfilled as never, onRejected as never);
  }
}

class Insert<T> {
  private columns = '*';
  constructor(private client: Client, private table: string, private row: Record<string, unknown>) {}

  select(cols: string) { this.columns = cols; return this; }

  async single(): Promise<ShimResult<T>> {
    const keys = Object.keys(this.row);
    const cols = keys.map(ident).join(', ');
    const params = keys.map((_, i) => `$${i + 1}`).join(', ');
    const returning = this.columns
      .split(',')
      .map((c) => ident(c.trim()))
      .join(', ');
    try {
      const r = await this.client.query(
        `INSERT INTO public.${ident(this.table)} (${cols}) VALUES (${params}) RETURNING ${returning}`,
        keys.map((k) => {
          const v = this.row[k];
          //  jsonb columns must go over as JSON text, which is what
          //  supabase-js does too.
          return Array.isArray(v) || (v !== null && typeof v === 'object')
            ? JSON.stringify(v)
            : v;
        }),
      );
      return { data: (r.rows[0] ?? null) as T, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }
}

export class PgSupabase {
  constructor(public client: Client) {}

  from(table: string) {
    return {
      select: (cols: string) => new Query<Record<string, unknown>>(this.client, table).select(cols),
      insert: (row: Record<string, unknown>) =>
        new Insert<Record<string, unknown>>(this.client, table, row),
    };
  }

  async rpc(name: string, args: Record<string, unknown> = {}): Promise<ShimResult<unknown>> {
    const keys = Object.keys(args);
    //  NAMED arguments, exactly as supabase-js sends them. An RPC
    //  called with an argument the function does not declare fails
    //  here — the contract defect this harness exists to catch.
    const call = keys.length
      ? keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')
      : '';
    try {
      const r = await this.client.query(
        `SELECT public.${ident(name)}(${call}) AS result`,
        keys.map((k) => args[k]),
      );
      return { data: r.rows[0]?.result ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  /** Act as a signed-in user: real RLS, real guards. */
  async setActor(userId: string): Promise<void> {
    await this.client.query('RESET ROLE');
    await this.client.query(
      `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
      [userId],
    );
    await this.client.query('SET ROLE authenticated');
  }

  /** Act as the owner, for fixtures. Exempt from the duty checks. */
  async setServiceContext(): Promise<void> {
    await this.client.query('RESET ROLE');
    await this.client.query(`SELECT set_config('request.jwt.claims', '', false)`);
  }
}

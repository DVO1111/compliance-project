/**
 * A Supabase stand-in that returns NOTHING.
 *
 * This is deliberately not the preview harness's stub. That one answers
 * every query with invented lots, invented weights and invented people,
 * which is useful for judging a layout and worthless for answering the
 * only question that matters here: WHAT DOES A REAL WORKSPACE LOOK LIKE
 * ON ITS FIRST DAY.
 *
 * The live tables were created hours ago and hold no rows. So the
 * honest fixture is an empty one: every select resolves to [], every
 * single-row read to null, and no error. That is exactly what the
 * database will return tomorrow morning, which makes this the state
 * worth photographing.
 *
 * `error: null` matters. Each page distinguishes "no rows" from "no
 * table" by asking its table directly, and a stub that returned an
 * error would send every page down its not-connected path and prove
 * nothing about the normal one.
 *
 * Nothing here is ever built into the application or published.
 */

type Res = { data: unknown; error: null };

function builder(): any {
  const self: any = {};
  const chain = () => self;
  for (const m of [
    'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'gt', 'gte',
    'lt', 'lte', 'is', 'in', 'or', 'and', 'not', 'like', 'ilike', 'contains',
    'order', 'limit', 'range', 'filter', 'match', 'returns', 'overlaps',
  ]) self[m] = chain;

  self.single = async (): Promise<Res> => ({ data: null, error: null });
  self.maybeSingle = async (): Promise<Res> => ({ data: null, error: null });
  self.csv = async (): Promise<Res> => ({ data: '', error: null });
  //  A query that is awaited without .single() resolves to a list.
  self.then = (resolve: (r: Res) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 } as Res).then(resolve);
  return self;
}

export const supabase: any = {
  from: () => builder(),
  //  Every RPC the pages call returns a list or a null, never a throw.
  rpc: async (): Promise<Res> => ({ data: [], error: null }),
  auth: {
    getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
};
export default supabase;

// Unit tests for the pure chain and ordering selectors in `src/state/store.ts`.
//
// These functions decide what a chain *is* - who is locked, what order tasks appear in, which links
// would close a loop - and they are walked on every render, so a mistake here either corrupts the
// display order or hangs the render loop. The browser tests drive them only indirectly, through
// whatever the demo fixture happens to contain, which is not enough.
//
// The real source is loaded through Vite's SSR pipeline, so there is no separate build step and no
// second copy of the logic to drift. Usage: npm run test:chain
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const store = await server.ssrLoadModule('/src/state/store.ts');
const { orderTasks, chainIndex, isLocked, isOutOfOrder, wouldCycle, indexById, chainsOf, linkCandidates, successorIndex } = store;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, a === e ? '' : `got ${a}, expected ${e}`);
};

/** `after` is the blocker id; `done` marks completion. Positions follow declaration order. */
let seq = 0;
const task = (id, { after = null, done = false, space = 's1', position } = {}) => ({
  id,
  spaceId: space,
  title: id,
  notes: '',
  priority: 0,
  dueAt: null,
  completedAt: done ? 1000 : null,
  position: position ?? seq++,
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  blockedBy: after,
});
const ids = (ts) => ts.map((t) => t.id);

// ---------------------------------------------------------------------------------------------
// orderTasks: chains must come out contiguous, parent immediately followed by its subtree.
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  // Declaration order is a..f; the chain is a -> c -> d, and b/e/f are loose.
  const tasks = [task('a'), task('b'), task('c', { after: 'a' }), task('d', { after: 'c' }), task('e'), task('f')];
  eq('chain is contiguous and depth-first', ids(orderTasks(tasks, 's1', true)), ['a', 'c', 'd', 'b', 'e', 'f']);
}
{
  seq = 0;
  // A fork: a releases b and c; c releases d. Siblings keep their own position order.
  const tasks = [task('a'), task('b', { after: 'a' }), task('c', { after: 'a' }), task('d', { after: 'c' })];
  eq('a fork walks each branch to the end', ids(orderTasks(tasks, 's1', true)), ['a', 'b', 'c', 'd']);
}
{
  seq = 0;
  // A completed blocker is not among the active tasks, so its successor is a root, not an orphan.
  const tasks = [task('a', { done: true }), task('b', { after: 'a' }), task('c')];
  eq('successor of a completed blocker is ordered as a root', ids(orderTasks(tasks, 's1', false)), ['b', 'c']);
  eq('completed tasks still come last when shown', ids(orderTasks(tasks, 's1', true)), ['b', 'c', 'a']);
}
{
  seq = 0;
  const tasks = [task('a', { space: 's1' }), task('b', { space: 's2' })];
  eq('other spaces are excluded', ids(orderTasks(tasks, 's2', true)), ['b']);
}
{
  seq = 0;
  // A blocker in another space cannot hold anything back, so the successor is a root.
  const tasks = [task('a', { space: 's2' }), task('b', { space: 's1', after: 'a' })];
  eq('a cross-space blocker does not strand its successor', ids(orderTasks(tasks, 's1', true)), ['b']);
}

// ---------------------------------------------------------------------------------------------
// Cycle tolerance. Bad data must degrade, never hang.
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  // a <-> b is a two-task loop: neither is a root, so the DFS reaches neither.
  const tasks = [task('a', { after: 'b' }), task('b', { after: 'a' }), task('c')];
  const out = orderTasks(tasks, 's1', true);
  eq('a cycle is still listed, never dropped', ids(out).sort(), ['a', 'b', 'c']);
  check('every task appears exactly once', new Set(ids(out)).size === out.length);
}
{
  seq = 0;
  const tasks = [task('a', { after: 'c' }), task('b', { after: 'a' }), task('c', { after: 'b' })];
  const meta = chainIndex(tasks);
  check('chainIndex terminates on a 3-cycle', Object.keys(meta).length === 3);
  check('chainIndex bounds depth inside a cycle', Object.values(meta).every((m) => m.depth < 3), JSON.stringify(Object.values(meta).map((m) => m.depth)));
}
{
  seq = 0;
  const tasks = [task('a', { after: 'b' }), task('b', { after: 'a' })];
  const byId = indexById(tasks);
  check('wouldCycle refuses when existing data is already cyclic', wouldCycle('a', 'b', byId) === true);
}

// ---------------------------------------------------------------------------------------------
// wouldCycle
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  const tasks = [task('a'), task('b', { after: 'a' }), task('c', { after: 'b' })];
  const byId = indexById(tasks);
  check('direct back-link is a cycle', wouldCycle('a', 'b', byId) === true);
  check('transitive back-link is a cycle', wouldCycle('a', 'c', byId) === true);
  check('self-link is a cycle', wouldCycle('a', 'a', byId) === true);
  check('forward link is fine', wouldCycle('c', 'a', byId) === false);
  eq('linkCandidates excludes self and descendants', ids(linkCandidates(tasks, 'a')), []);
  eq('linkCandidates offers upstream tasks', ids(linkCandidates(tasks, 'c')), ['a', 'b']);
}
{
  seq = 0;
  const tasks = [task('a', { space: 's1' }), task('b', { space: 's2' })];
  eq('linkCandidates never crosses spaces', ids(linkCandidates(tasks, 'b')), []);
}

// ---------------------------------------------------------------------------------------------
// isLocked / isOutOfOrder: the lock is derived, so reopening a blocker re-locks for free.
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  const open = [task('a'), task('b', { after: 'a' })];
  let byId = indexById(open);
  check('successor of an open blocker is locked', isLocked(byId.get('b'), byId) === true);
  check('a blocker itself is never locked', isLocked(byId.get('a'), byId) === false);

  const done = [task('a', { done: true, position: 0 }), task('b', { after: 'a', position: 1 })];
  byId = indexById(done);
  check('completing the blocker unlocks the successor', isLocked(byId.get('b'), byId) === false);

  // Reopening the blocker must re-lock the successor without un-completing it.
  const reopened = [task('a', { position: 0 }), task('b', { after: 'a', done: true, position: 1 })];
  byId = indexById(reopened);
  check('reopening a blocker re-locks its successor', isLocked(byId.get('b'), byId) === true);
  check('the successor stays completed', byId.get('b').completedAt !== null);
  check('that state reads as out of order', isOutOfOrder(byId.get('b'), byId) === true);

  // A blocker that no longer exists cannot lock anything.
  const orphan = [task('b', { after: 'gone' })];
  byId = indexById(orphan);
  check('a missing blocker never locks', isLocked(byId.get('b'), byId) === false);
}

// ---------------------------------------------------------------------------------------------
// chainIndex shape
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  const tasks = [task('a'), task('b', { after: 'a' }), task('c', { after: 'a' }), task('d', { after: 'c' }), task('loose')];
  const meta = chainIndex(tasks);
  check('loose tasks get no chain entry', meta.loose === undefined);
  eq('depth counts steps from the root', [meta.a.depth, meta.b.depth, meta.c.depth, meta.d.depth], [0, 1, 1, 2]);
  eq('every member shares the root id', [meta.a.rootId, meta.b.rootId, meta.c.rootId, meta.d.rootId], ['a', 'a', 'a', 'a']);
  eq('successors are listed in order', meta.a.successorIds, ['b', 'c']);
  check('unlockToken is 0 while the blocker is open', meta.b.unlockToken === 0);
  eq('successorIndex groups by blocker', [...successorIndex(tasks).entries()], [['a', ['b', 'c']], ['c', ['d']]]);
}
{
  seq = 0;
  const tasks = [task('a', { done: true }), task('b', { after: 'a' })];
  const meta = chainIndex(tasks);
  check('unlockToken carries the blocker completion time', meta.b.unlockToken === 1000);
  check('an unlocked successor is not locked', meta.b.locked === false);
}

// ---------------------------------------------------------------------------------------------
// chainsOf: the forest the DOM renders
// ---------------------------------------------------------------------------------------------
{
  seq = 0;
  const tasks = [task('a'), task('b', { after: 'a' }), task('c', { after: 'b' }), task('loose'), task('x'), task('y', { after: 'x' })];
  const forest = chainsOf(tasks, 's1');
  eq('one node per chain root', forest.map((n) => n.task.id), ['a', 'x']);
  eq('children nest', forest[0].children.map((n) => n.task.id), ['b']);
  eq('grandchildren nest', forest[0].children[0].children.map((n) => n.task.id), ['c']);
  check('loose tasks are omitted from the forest', !JSON.stringify(forest).includes('loose'));
}
{
  seq = 0;
  // A cycle has no root, so it contributes no tree - but it must not hang or repeat a node.
  const tasks = [task('a', { after: 'b' }), task('b', { after: 'a' })];
  const forest = chainsOf(tasks, 's1');
  check('chainsOf terminates on a cycle', Array.isArray(forest), `${forest.length} roots`);
}

await server.close();
console.log(failures ? `\n${failures} chain check(s) failed` : '\nAll chain checks passed');
process.exit(failures ? 1 : 0);

// Run only against your own disposable Supabase test project.
// node --env-file=.env tests/online.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw Error("Set the two VITE_SUPABASE_* values in .env first");
const clients = Array.from({ length: 3 }, () =>
  createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
);
async function call(c, name, args) {
  const { data, error } = await c.rpc(name, args);
  if (error) throw error;
  return data;
}
await Promise.all(
  clients.map(async (c) => {
    const { error } = await c.auth.signInAnonymously();
    if (error) throw error;
  }),
);
const room = await call(clients[0], "game_join", {
  p_name: "Host",
  p_room_name: "Integration " + Date.now(),
  p_secret: "test-only",
});
const view = (c) => call(c, "game_view", { p_room: room });
const action = (c, a, v = {}) =>
  call(c, "game_action", { p_room: room, p_action: a, p_value: v });
let g = await view(clients[0]);
for (let i = 1; i < 3; i++)
  await call(clients[i], "game_join", {
    p_code: g.code,
    p_name: "Player " + i,
    p_secret: "test-only",
  });
let received = false;
const channel = clients[1]
  .channel("integration-" + room)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "room_events",
      filter: "room=eq." + room,
    },
    (payload) => {
      assert.deepEqual(Object.keys(payload.new).sort(), ["room", "version"]);
      received = true;
    },
  );
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(Error("Realtime subscribe timeout")),
    15000,
  );
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timer);
      resolve();
    } else if (status === "CHANNEL_ERROR") {
      clearTimeout(timer);
      reject(Error("Realtime subscription failed"));
    }
  });
});
await action(clients[0], "start");
assert.equal((await view(clients[1])).question, null);
assert.ok((await view(clients[0])).question);
await action(clients[0], "open");
await assert.rejects(action(clients[0], "reveal", { answer: true }));
await action(clients[1], "vote", { answer: true });
assert.ok((await view(clients[0])).votes.every((v) => v.answer === null));
await assert.rejects(action(clients[1], "vote", { answer: false }));
await action(clients[2], "vote", { answer: false });
await action(clients[0], "reveal", { answer: true });
await assert.rejects(action(clients[0], "reveal", { answer: true }));
g = await view(clients[2]);
assert.equal(
  g.players.reduce((s, p) => s + p.score, 0),
  1,
);
await action(clients[0], "finish");
assert.equal((await view(clients[1])).state, "FINISHED");
const deadline = Date.now() + 5000;
while (!received && Date.now() < deadline)
  await new Promise((r) => setTimeout(r, 100));
assert.ok(received, "Expected a realtime invalidation event");
await Promise.all(clients.map((c) => c.removeAllChannels()));
console.log(
  "PASS: 3 anonymous sessions, private payloads, scoring once, finish and realtime event. Test room:",
  g.code,
);

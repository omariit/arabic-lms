import { io } from "socket.io-client";
const BASE = "https://arabic-lms-production.up.railway.app";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, x = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} — ${n}${x ? " · " + x : ""}`); };

const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "0785054355", password: "teacher-kh-2024" }),
});
const cookie = loginRes.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
check("teacher login", loginRes.ok);

const mk = await (await fetch(`${BASE}/api/live/meeting`, {
  method: "POST", headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({ courseId: "cmwmswsu90006v5n4hua4v053", title: "فحص إنتاج الحصة" }),
})).json();
const L = mk.liveSessionId;
check("meeting created on production", Boolean(L && mk.inviteToken), L);

const host = io(`${BASE}/meet`, { path: "/socket.io", transports: ["websocket"], extraHeaders: { cookie }, auth: { liveSessionId: L } });
let hostJoined = null, knocks = [], waiting = [], chats = [], signals = 0, hands = 0;
host.on("connect_error", (e) => console.log("host err", e.message));
host.on("meet:joined", (p) => { hostJoined = p; });
host.on("meet:knock", (k) => knocks.push(k));
host.on("meet:roster", (p) => { waiting = p.waiting ?? []; });
host.on("meet:chat", (m) => chats.push(m));
host.on("meet:signal", () => { signals += 1; });
host.on("meet:hand-raised", () => { hands += 1; });
await new Promise((r) => host.on("connect", r));
host.emit("meet:join", { liveSessionId: L });
await wait(1200);
check("host joins room", hostJoined?.isHost === true, `roster=${hostJoined?.roster?.length}`);
check("invite token issued", Boolean(hostJoined?.inviteToken));

const guest = io(`${BASE}/meet`, { path: "/socket.io", transports: ["websocket"], auth: { liveSessionId: L, inviteToken: mk.inviteToken, guestName: "ضيفة الإنتاج" } });
let waitingMsg = false, guestJoined = null;
guest.on("connect_error", (e) => console.log("guest err", e.message));
guest.on("meet:waiting", () => { waitingMsg = true; });
guest.on("meet:admitted", () => guest.emit("meet:join", { liveSessionId: L }));
guest.on("meet:joined", (p) => { guestJoined = p; });
await new Promise((r) => guest.on("connect", r));
guest.emit("meet:join", { liveSessionId: L });
await wait(1400);
check("guest enters lobby (no login)", waitingMsg && !guestJoined);
check("host notified + sees lobby", knocks.length === 1 && waiting.length === 1, `waiting=${waiting.length}`);

host.emit("meet:control", { liveSessionId: L, action: "admit", target: waiting[0].socketId });
await wait(1200);
check("guest admitted", Boolean(guestJoined), `roster=${guestJoined?.roster?.length}`);

guest.emit("meet:chat", { liveSessionId: L, body: "رسالة من الضيفة" });
guest.emit("meet:signal", { target: host.id, data: { candidate: { candidate: "probe" } } });
guest.emit("meet:hand", { liveSessionId: L, raised: true });
await wait(900);
check("signal relay on production", signals >= 1, `n=${signals}`);
check("chat on production", chats.length >= 1, chats[0]?.body);
check("hand raise on production", hands >= 1);

const info = await (await fetch(`${BASE}/api/live/${L}/info`)).json();
check("history API", (info.chat ?? []).length >= 1, `msgs=${info.chat?.length}`);

// guest with bad token
const bad = io(`${BASE}/meet`, { path: "/socket.io", transports: ["websocket"], auth: { liveSessionId: L, inviteToken: "nope", guestName: "x" } });
const badErr = await new Promise((r) => { bad.on("connect_error", (e) => r(e.message)); setTimeout(() => r("none"), 3000); });
check("bad invite rejected", badErr !== "none", badErr);
bad.disconnect();

host.emit("meet:control", { liveSessionId: L, action: "end-meeting" });
await wait(800);
const after = await (await fetch(`${BASE}/api/live/${L}/info`)).json();
check("meeting ended", after.live?.status === "ENDED", after.live?.status);

// page renders for guests through the public link
const page = await fetch(`${BASE}/live/${L}?invite=${mk.inviteToken}`);
const html = await page.text();
check("guest page renders", page.status === 200 && html.includes("اسمك"), `status=${page.status}`);

host.disconnect(); guest.disconnect();
console.log(`\n${results.filter(Boolean).length}/${results.length} production checks passed`);
console.log("ROOM=" + L);
process.exit(results.every(Boolean) ? 0 : 1);

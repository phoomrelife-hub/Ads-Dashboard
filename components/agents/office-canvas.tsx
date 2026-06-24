"use client";
import { useEffect, useRef } from "react";
import type { Office, PublicAgent, AgentStatus, TileType } from "@/lib/agents/types";

export type EditTool =
  | "floor" | "wall" | "carpet"
  | "desk" | "plant" | "coffee" | "cooler" | "rug"
  | "erase" | "move";

// Runtime status per agent id, driven by chat activity.
export type AgentRuntime = Record<string, { status: AgentStatus; needsConfirm: boolean }>;

interface Props {
  office: Office;
  agents: PublicAgent[];
  runtime: AgentRuntime;
  editMode: boolean;
  editTool: EditTool;
  soundOn: boolean;
  highlightId: string | null;
  onAgentClick: (id: string) => void;
  onPaintTile: (x: number, y: number, tool: EditTool) => void;
  onMoveAgent: (id: string, x: number, y: number) => void;
}

const TILE = 32; // logical px per tile (scaled crisply)
type Dir = "up" | "down" | "left" | "right";

interface Sprite {
  id: string;
  px: number; py: number;     // fractional pixel position in tile units
  tx: number; ty: number;     // current target tile
  path: { x: number; y: number }[];
  dir: Dir;
  frame: number; frameT: number;
  wanderT: number;
  seated: boolean;
  hasDesk: boolean;               // whether a real desk is assigned (else no typing-in-air)
  prevActive: boolean;
  color: string;
  name: string;
  homeX: number; homeY: number;   // tile the agent sits on (in front of desk)
  deskX: number; deskY: number;   // the desk tile (agent faces this when seated)
}

// ── audio: short completion chime ────────────────────────────────────────────
let audioCtx: AudioContext | null = null;
function chime() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(ctx.destination);
      o.start(t); o.stop(t + 0.2);
    });
  } catch { /* ignore */ }
}

function walkable(o: Office, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= o.cols || y >= o.rows) return false;
  if (o.tiles[y * o.cols + x] === 1) return false;
  // rugs are decorative and walkable; everything else blocks
  if (o.furniture.some((f) => f.x === x && f.y === y && f.type !== "rug")) return false;
  return true;
}

function bfs(o: Office, sx: number, sy: number, tx: number, ty: number) {
  if (sx === tx && sy === ty) return [];
  const key = (x: number, y: number) => y * o.cols + x;
  const prev = new Map<number, number>();
  const seen = new Set<number>([key(sx, sy)]);
  const q: [number, number][] = [[sx, sy]];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (q.length) {
    const [cx, cy] = q.shift()!;
    if (cx === tx && cy === ty) {
      const path: { x: number; y: number }[] = [];
      let k = key(cx, cy);
      while (k !== key(sx, sy)) {
        path.unshift({ x: k % o.cols, y: Math.floor(k / o.cols) });
        k = prev.get(k)!;
      }
      return path;
    }
    for (const [dx, dy] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(o, nx, ny)) continue;
      const nk = key(nx, ny);
      if (seen.has(nk)) continue;
      seen.add(nk); prev.set(nk, key(cx, cy)); q.push([nx, ny]);
    }
  }
  return [];
}

function deskFront(o: Office, deskId: string | null) {
  const d = o.furniture.find((f) => f.id === deskId);
  if (!d) return null;
  const off = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[d.facing];
  const fx = d.x + off[0], fy = d.y + off[1];
  return walkable(o, fx, fy) ? { x: fx, y: fy, deskX: d.x, deskY: d.y } : null;
}

export function OfficeCanvas({
  office, agents, runtime, editMode, editTool, soundOn, highlightId,
  onAgentClick, onPaintTile, onMoveAgent,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sprites = useRef<Map<string, Sprite>>(new Map());
  const officeRef = useRef(office);
  const runtimeRef = useRef(runtime);
  const editRef = useRef({ editMode, editTool });
  const soundRef = useRef(soundOn);
  const highlightRef = useRef(highlightId);
  const dragging = useRef<string | null>(null);
  const autoDesk = useRef<Map<string, string>>(new Map()); // agentId -> auto-claimed deskId
  const raf = useRef(0);

  officeRef.current = office;
  runtimeRef.current = runtime;
  editRef.current = { editMode, editTool };
  soundRef.current = soundOn;
  highlightRef.current = highlightId;

  // reconcile sprites from agents + assign each a desk (explicit, remembered, or nearest free)
  useEffect(() => {
    const map = sprites.current;
    const auto = autoDesk.current;
    const ids = new Set(agents.map((a) => a.id));
    for (const id of map.keys()) if (!ids.has(id)) map.delete(id);
    for (const id of [...auto.keys()]) if (!ids.has(id)) auto.delete(id);

    const desks = office.furniture.filter((f) => f.type === "desk");
    const deskIds = new Set(desks.map((d) => d.id));
    const claimed = new Set<string>();
    const resolved = new Map<string, { x: number; y: number; deskX: number; deskY: number } | null>();

    // pass 1: explicit desk assignment (from dragging an agent onto a desk)
    for (const a of agents) {
      const id = a.deskId && deskIds.has(a.deskId) ? a.deskId : null;
      const f = id ? deskFront(office, id) : null;
      if (id && f) { claimed.add(id); resolved.set(a.id, f); } else resolved.set(a.id, null);
    }
    // pass 2: keep a previously auto-claimed desk if still free
    for (const a of agents) {
      if (resolved.get(a.id)) continue;
      const prev = auto.get(a.id);
      const f = prev && deskIds.has(prev) && !claimed.has(prev) ? deskFront(office, prev) : null;
      if (prev && f) { claimed.add(prev); resolved.set(a.id, f); } else auto.delete(a.id);
    }
    // pass 3: assign remaining agents to the nearest free desk
    for (const a of agents) {
      if (resolved.get(a.id)) continue;
      const free = desks.filter((d) => !claimed.has(d.id) && deskFront(office, d.id));
      if (free.length === 0) continue;
      free.sort((p, q) => (Math.abs(a.pos.x - p.x) + Math.abs(a.pos.y - p.y)) - (Math.abs(a.pos.x - q.x) + Math.abs(a.pos.y - q.y)));
      const pick = free[0];
      claimed.add(pick.id); auto.set(a.id, pick.id);
      resolved.set(a.id, deskFront(office, pick.id));
    }

    for (const a of agents) {
      const r = resolved.get(a.id) || null;
      const hasDesk = !!r;
      const home = r ?? { x: a.pos.x, y: a.pos.y };
      const deskX = r ? r.deskX : a.pos.x;
      const deskY = r ? r.deskY : a.pos.y - 1;
      const ex = map.get(a.id);
      if (!ex) {
        map.set(a.id, {
          id: a.id, px: a.pos.x, py: a.pos.y, tx: a.pos.x, ty: a.pos.y,
          path: [], dir: "down", frame: 0, frameT: 0, wanderT: Math.random() * 3,
          seated: false, hasDesk, prevActive: false, color: a.color, name: a.name,
          homeX: home.x, homeY: home.y, deskX, deskY,
        });
      } else {
        ex.color = a.color; ex.name = a.name; ex.hasDesk = hasDesk;
        ex.homeX = home.x; ex.homeY = home.y; ex.deskX = deskX; ex.deskY = deskY;
      }
    }
  }, [agents, office]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let last = performance.now();

    function setSize() {
      const o = officeRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = o.cols * TILE * dpr;
      canvas.height = o.rows * TILE * dpr;
      canvas.style.width = `${o.cols * TILE}px`;
      canvas.style.height = `${o.rows * TILE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }
    setSize();

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      update(dt);
      draw(ctx);
      raf.current = requestAnimationFrame(frame);
    }
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function faceDesk(s: Sprite) {
    if (s.deskY < s.homeY) s.dir = "up";
    else if (s.deskY > s.homeY) s.dir = "down";
    else if (s.deskX < s.homeX) s.dir = "left";
    else s.dir = "right";
  }

  function update(dt: number) {
    const o = officeRef.current;
    const rt = runtimeRef.current;
    const SPEED = 3.4;
    for (const s of sprites.current.values()) {
      if (dragging.current === s.id) continue;
      const status = rt[s.id]?.status ?? "idle";
      const active = status === "thinking" || status === "acting";
      const atHome = Math.round(s.px) === s.homeX && Math.round(s.py) === s.homeY && s.path.length === 0 && s.px === s.tx && s.py === s.ty;

      // completion chime: was working, now idle
      if (s.prevActive && !active && soundRef.current) chime();
      s.prevActive = active;

      if (active) {
        if (!s.hasDesk) {
          // no desk in the office to use — stand and think in place (no typing-in-air)
          s.seated = false; s.path = []; s.tx = Math.round(s.px); s.ty = Math.round(s.py);
        } else if (atHome) {
          s.seated = true; faceDesk(s); s.path = [];
        } else {
          s.seated = false;
          if (s.tx !== s.homeX || s.ty !== s.homeY) retarget(s, s.homeX, s.homeY);
        }
      } else {
        s.seated = false;
        s.wanderT -= dt;
        if (s.path.length === 0 && s.px === s.tx && s.py === s.ty && s.wanderT <= 0) {
          s.wanderT = 2 + Math.random() * 4;
          const nx = Math.max(1, Math.min(o.cols - 2, Math.round(s.px) + (Math.floor(Math.random() * 3) - 1)));
          const ny = Math.max(1, Math.min(o.rows - 2, Math.round(s.py) + (Math.floor(Math.random() * 3) - 1)));
          if (walkable(o, nx, ny)) retarget(s, nx, ny);
        }
      }

      if (s.seated) { s.frame = 0; continue; }

      const moving = !(s.px === s.tx && s.py === s.ty) || s.path.length > 0;
      if (s.px === s.tx && s.py === s.ty && s.path.length > 0) {
        const n = s.path.shift()!;
        s.tx = n.x; s.ty = n.y;
        if (n.x > s.px) s.dir = "right"; else if (n.x < s.px) s.dir = "left";
        else if (n.y > s.py) s.dir = "down"; else if (n.y < s.py) s.dir = "up";
      }
      const dx = s.tx - s.px, dy = s.ty - s.py, dist = Math.hypot(dx, dy);
      if (dist > 0.001) { const step = Math.min(SPEED * dt, dist); s.px += (dx / dist) * step; s.py += (dy / dist) * step; }
      else { s.px = s.tx; s.py = s.ty; }

      if (moving) { s.frameT += dt; if (s.frameT > 0.13) { s.frameT = 0; s.frame = (s.frame + 1) % 4; } }
      else s.frame = 0;
    }
  }

  function retarget(s: Sprite, tx: number, ty: number) {
    const path = bfs(officeRef.current, Math.round(s.px), Math.round(s.py), tx, ty);
    if (path.length) s.path = path;
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const o = officeRef.current, rt = runtimeRef.current;
    ctx.clearRect(0, 0, o.cols * TILE, o.rows * TILE);
    for (let y = 0; y < o.rows; y++)
      for (let x = 0; x < o.cols; x++) drawTile(ctx, x, y, o.tiles[y * o.cols + x] as TileType);
    // rugs sit flat on the floor, under everything
    for (const f of o.furniture) if (f.type === "rug") drawRug(ctx, f.x, f.y);
    // chairs under seated agents
    for (const s of sprites.current.values()) if (s.seated) drawChair(ctx, s);
    // standing furniture
    for (const f of o.furniture) {
      if (f.type === "desk") drawDesk(ctx, f.x, f.y, f.facing, isDeskActive(o, f.x, f.y, rt));
      else if (f.type === "plant") drawPlant(ctx, f.x, f.y);
      else if (f.type === "coffee") drawCoffee(ctx, f.x, f.y);
      else if (f.type === "cooler") drawCooler(ctx, f.x, f.y);
    }
    const list = [...sprites.current.values()].sort((a, b) => a.py - b.py);
    for (const s of list) drawSprite(ctx, s, rt[s.id]?.status ?? "idle", rt[s.id]?.needsConfirm ?? false);

    // spotlight: dim the room except a halo around the highlighted agent
    const hl = highlightRef.current ? sprites.current.get(highlightRef.current) : null;
    if (hl) {
      const cx = hl.px * TILE + TILE / 2, cy = hl.py * TILE + TILE / 2;
      const grad = ctx.createRadialGradient(cx, cy, 14, cx, cy, 95);
      grad.addColorStop(0, "rgba(5,8,16,0)");
      grad.addColorStop(1, "rgba(5,8,16,0.68)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, o.cols * TILE, o.rows * TILE);
      // pulsing ring
      const t = performance.now();
      const r = 15 + Math.sin(t / 300) * 2;
      ctx.strokeStyle = hl.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(cx, cy + 2, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // redraw the highlighted agent on top of the dim
      if (hl.seated) drawChair(ctx, hl);
      drawSprite(ctx, hl, rt[hl.id]?.status ?? "idle", rt[hl.id]?.needsConfirm ?? false);
    }
  }

  function isDeskActive(o: Office, dx: number, dy: number, rt: AgentRuntime) {
    for (const s of sprites.current.values()) {
      if (s.seated && s.deskX === dx && s.deskY === dy) {
        const st = rt[s.id]?.status; return st === "thinking" || st === "acting";
      }
    }
    return false;
  }

  // ── tiles ──
  function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, t: TileType) {
    const px = x * TILE, py = y * TILE;
    if (t === 1) {
      ctx.fillStyle = "#0c1120"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#222d49"; ctx.fillRect(px, py, TILE, TILE - 7);          // wall face
      ctx.fillStyle = "#2c3a5e"; ctx.fillRect(px, py, TILE, 4);                 // top trim
      ctx.fillStyle = "#161f36"; ctx.fillRect(px, py + TILE - 7, TILE, 7);      // baseboard shadow
    } else if (t === 2) {
      ctx.fillStyle = "#13233c"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(91,108,255,0.14)"; ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = "rgba(91,108,255,0.25)"; ctx.strokeRect(px + 2.5, py + 2.5, TILE - 5, TILE - 5);
    } else {
      // wood-plank floor
      ctx.fillStyle = (x + y) % 2 === 0 ? "#0b1322" : "#0d1626"; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "rgba(255,255,255,0.018)"; ctx.fillRect(px, py + (y % 2 ? 0 : TILE / 2), TILE, 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.022)"; ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }

  function drawChair(ctx: CanvasRenderingContext2D, s: Sprite) {
    const px = s.homeX * TILE, py = s.homeY * TILE;
    ctx.fillStyle = "#2a3350";
    roundRect(ctx, px + 9, py + 12, TILE - 18, TILE - 16, 3); ctx.fill();   // seat
    ctx.fillStyle = "#222a42";
    roundRect(ctx, px + 9, py + 6, TILE - 18, 8, 3); ctx.fill();            // backrest
  }

  function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, _facing: string, active: boolean) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = "#2a2017"; ctx.fillRect(px + 2, py + 8, TILE - 4, TILE - 12);   // desk body
    ctx.fillStyle = "#5a4631"; ctx.fillRect(px + 2, py + 8, TILE - 4, 5);           // desk top edge
    ctx.fillStyle = "#46371f"; ctx.fillRect(px + 4, py + TILE - 6, 3, 4);
    ctx.fillStyle = "#46371f"; ctx.fillRect(px + TILE - 7, py + TILE - 6, 3, 4);
    // monitor
    ctx.fillStyle = "#070b14"; ctx.fillRect(px + 8, py + 2, TILE - 16, 11);
    ctx.fillStyle = active ? "#31c48d" : "#1d3a52";
    ctx.fillRect(px + 10, py + 4, TILE - 20, 7);
    if (active) {
      ctx.fillStyle = "rgba(49,196,141,0.25)";
      ctx.fillRect(px + 6, py, TILE - 12, 15);            // screen glow
      ctx.fillStyle = "#0a1f15";
      for (let i = 0; i < 3; i++) ctx.fillRect(px + 12, py + 5 + i * 2, (TILE - 24) * (0.4 + 0.5 * Math.random()), 1);
    }
    ctx.fillStyle = "#1a2438"; ctx.fillRect(px + TILE / 2 - 1, py + 13, 2, 2);   // stand
  }

  function drawRug(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const px = x * TILE, py = y * TILE;
    ctx.fillStyle = "rgba(167,139,250,0.14)"; ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = "rgba(167,139,250,0.35)"; ctx.lineWidth = 1;
    ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
    ctx.strokeStyle = "rgba(167,139,250,0.2)";
    ctx.strokeRect(px + 6.5, py + 6.5, TILE - 13, TILE - 13);
  }

  function drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const px = x * TILE, py = y * TILE, cx = px + TILE / 2;
    // pot
    ctx.fillStyle = "#7a4a2e"; ctx.fillRect(cx - 5, py + TILE - 11, 10, 8);
    ctx.fillStyle = "#8f5836"; ctx.fillRect(cx - 5, py + TILE - 11, 10, 2);
    // foliage
    ctx.fillStyle = "#1f7a4d";
    ctx.beginPath(); ctx.arc(cx, py + TILE - 13, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a9d63";
    ctx.beginPath(); ctx.arc(cx - 3, py + TILE - 16, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 3, py + TILE - 15, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#34c47a";
    ctx.beginPath(); ctx.arc(cx, py + TILE - 19, 4, 0, Math.PI * 2); ctx.fill();
  }

  function drawCoffee(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const px = x * TILE, py = y * TILE, cx = px + TILE / 2;
    // counter
    ctx.fillStyle = "#2a2017"; ctx.fillRect(px + 5, py + TILE - 9, TILE - 10, 6);
    // machine body
    ctx.fillStyle = "#3a4258"; ctx.fillRect(cx - 6, py + 6, 12, TILE - 15);
    ctx.fillStyle = "#262d40"; ctx.fillRect(cx - 6, py + 6, 12, 3);
    // display
    ctx.fillStyle = "#f5b14c"; ctx.fillRect(cx - 3, py + 11, 6, 2);
    // cup + steam
    ctx.fillStyle = "#e8eaf5"; ctx.fillRect(cx - 2, py + TILE - 13, 4, 3);
    ctx.strokeStyle = "rgba(232,234,245,0.4)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, py + TILE - 16); ctx.lineTo(cx - 1, py + TILE - 19); ctx.stroke();
  }

  function drawCooler(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const px = x * TILE, py = y * TILE, cx = px + TILE / 2;
    ctx.fillStyle = "#e8eef2"; ctx.fillRect(cx - 5, py + 9, 10, TILE - 14);   // body
    ctx.fillStyle = "#8fd6ef"; ctx.fillRect(cx - 4, py + 3, 8, 8);            // bottle
    ctx.fillStyle = "#bce6f5"; ctx.fillRect(cx - 4, py + 3, 8, 3);
    ctx.fillStyle = "#3a4258"; ctx.fillRect(cx - 2, py + 15, 4, 2);           // tap
    ctx.fillStyle = "#cdd6dd"; ctx.fillRect(cx - 5, py + TILE - 6, 10, 3);    // base
  }

  // ── characters ──
  function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, status: AgentStatus, needsConfirm: boolean) {
    const cx = s.px * TILE + TILE / 2;
    const cy = s.py * TILE + TILE / 2;
    const moving = !(s.px === s.tx && s.py === s.ty);
    const t = performance.now();

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(cx, cy + 10, 8, 3.2, 0, 0, Math.PI * 2); ctx.fill();

    if (s.seated) { drawSeated(ctx, cx, cy, s, status === "thinking" || status === "acting", t); }
    else {
      const bob = !moving && status === "idle" ? Math.sin(t / 380 + s.px) : 0;
      drawStanding(ctx, cx, cy + bob, s, moving);
    }

    const headTop = cy - 13 + (s.seated ? -1 : 0);
    if (status === "thinking") bubble(ctx, cx, headTop - 5, "…", "#5b6cff");
    else if (status === "acting") bubble(ctx, cx, headTop - 5, "⚡", "#ff6b6b");
    if (needsConfirm) bubble(ctx, cx + 11, headTop - 5, "!", "#f5b14c");

    ctx.font = "600 9px 'DM Sans', sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillText(s.name, cx, cy + 23);
    ctx.fillStyle = "rgba(232,234,245,0.92)"; ctx.fillText(s.name, cx, cy + 22);
  }

  // outlined limb/box helper
  function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  }

  function shade(hex: string, amt: number) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function drawHead(ctx: CanvasRenderingContext2D, cx: number, top: number, dir: Dir) {
    ctx.fillStyle = "#0a0d16"; ctx.beginPath(); ctx.arc(cx, top, 5.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0d4ad"; ctx.beginPath(); ctx.arc(cx, top, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a2118"; ctx.beginPath(); ctx.arc(cx, top - 0.5, 5, Math.PI, Math.PI * 2); ctx.fill(); // hair
    if (dir === "up") { ctx.fillStyle = "#2a2118"; ctx.beginPath(); ctx.arc(cx, top + 0.5, 5, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.fillStyle = "#15110c";
    const ey = top + 0.5;
    if (dir === "left") ctx.fillRect(cx - 4, ey, 1.8, 1.8);
    else if (dir === "right") ctx.fillRect(cx + 2.2, ey, 1.8, 1.8);
    else { ctx.fillRect(cx - 3.2, ey, 1.6, 1.8); ctx.fillRect(cx + 1.6, ey, 1.6, 1.8); }
  }

  function drawStanding(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: Sprite, moving: boolean) {
    const top = cy - 13;
    const swing = moving ? (s.frame === 1 ? 2 : s.frame === 3 ? -2 : 0) : 0;
    // legs
    box(ctx, cx - 4, top + 14, 3, 6 + swing, "#23304e");
    box(ctx, cx + 1, top + 14, 3, 6 - swing, "#23304e");
    // body
    box(ctx, cx - 6, top + 6, 12, 10, s.color);
    ctx.fillStyle = shade(s.color, -28); ctx.fillRect(cx - 6, top + 12, 12, 4); // shading
    // arms
    box(ctx, cx - 8, top + 7, 2.5, 7 - swing, shade(s.color, 18));
    box(ctx, cx + 5.5, top + 7, 2.5, 7 + swing, shade(s.color, 18));
    drawHead(ctx, cx, top + 2, s.dir);
  }

  function drawSeated(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: Sprite, typing: boolean, t: number) {
    // nudge toward the desk a little
    const dxn = (s.deskX - s.homeX) * 4, dyn = (s.deskY - s.homeY) * 4;
    const bx = cx + dxn, by = cy + dyn;
    const top = by - 11;
    // body (no visible legs — tucked under desk)
    box(ctx, bx - 6, top + 6, 12, 10, s.color);
    ctx.fillStyle = shade(s.color, -28); ctx.fillRect(bx - 6, top + 12, 12, 4);
    // typing arms reaching toward desk
    const tap = typing ? Math.sin(t / 90) * 1.5 : 0;
    if (s.dir === "up") {
      box(ctx, bx - 5, top + 4 - 3, 2.5, 6, shade(s.color, 18));
      box(ctx, bx + 2.5, top + 4 - 3 + tap, 2.5, 6, shade(s.color, 18));
    } else {
      box(ctx, bx - 8, top + 7 + tap, 2.5, 6, shade(s.color, 18));
      box(ctx, bx + 5.5, top + 7 - tap, 2.5, 6, shade(s.color, 18));
    }
    drawHead(ctx, bx, top + 2, s.dir);
  }

  function bubble(ctx: CanvasRenderingContext2D, cx: number, cy: number, txt: string, color: string) {
    ctx.fillStyle = "#0f1424"; ctx.strokeStyle = color; ctx.lineWidth = 1;
    roundRect(ctx, cx - 8, cy - 9, 16, 13, 4); ctx.fill(); ctx.stroke();
    ctx.font = "9px sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = color;
    ctx.fillText(txt, cx, cy + 1);
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ── interaction ──
  // effective on-screen size of one tile (accounts for CSS zoom on the wrapper)
  function scale(r: DOMRect) { return r.width / (officeRef.current.cols * TILE); }
  function tileAt(e: React.MouseEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    const tw = TILE * scale(r);
    return { x: Math.floor((e.clientX - r.left) / tw), y: Math.floor((e.clientY - r.top) / tw) };
  }
  function agentAt(e: React.MouseEvent): string | null {
    const r = canvasRef.current!.getBoundingClientRect();
    const z = scale(r);
    const mx = (e.clientX - r.left) / z, my = (e.clientY - r.top) / z; // back to logical px
    let hit: string | null = null, best = 999;
    for (const s of sprites.current.values()) {
      const cx = s.px * TILE + TILE / 2, cy = s.py * TILE + TILE / 2;
      const d = Math.hypot(mx - cx, my - cy);
      if (d < 18 && d < best) { best = d; hit = s.id; }
    }
    return hit;
  }
  function onDown(e: React.MouseEvent) {
    const { editMode: em, editTool: tool } = editRef.current;
    if (em && tool === "move") { const id = agentAt(e); if (id) { dragging.current = id; return; } }
    if (em && tool !== "move") { const { x, y } = tileAt(e); onPaintTile(x, y, tool); return; }
    if (!em) { const id = agentAt(e); if (id) onAgentClick(id); }
  }
  function onMove(e: React.MouseEvent) {
    const { editMode: em, editTool: tool } = editRef.current;
    if (dragging.current) {
      const { x, y } = tileAt(e); const s = sprites.current.get(dragging.current);
      const o = officeRef.current;
      if (s && x >= 0 && y >= 0 && x < o.cols && y < o.rows) { s.px = x; s.py = y; s.tx = x; s.ty = y; s.path = []; }
      return;
    }
    if (em && tool !== "move" && e.buttons === 1) { const { x, y } = tileAt(e); onPaintTile(x, y, tool); }
  }
  function onUp() {
    if (dragging.current) {
      const s = sprites.current.get(dragging.current);
      if (s) onMoveAgent(s.id, Math.round(s.px), Math.round(s.py));
      dragging.current = null;
    }
  }

  const cursor = editMode ? (editTool === "move" ? "grab" : "crosshair") : "pointer";
  return (
    <div className="inline-block rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}>
      <canvas ref={canvasRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        style={{ display: "block", imageRendering: "pixelated", cursor }} />
    </div>
  );
}

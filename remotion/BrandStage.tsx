// A small animated scene for a popular name (a video player with a subscribe button for YouTube, an equalizer for
// TikTok, a chat for WhatsApp, a paper plane for Telegram, …). Each is a pure function of the frame number `f`
// (frames since it was triggered), drawn in SVG with the name's own colour; no clocks and no randomness.
import React from "react";
import { Bell, Car, CheckCheck, FaceSlightlySmiling, Flame, Heart, MapPin, Mic, Music2, Search, Send, ShoppingBag, Sparkles, Tag, ThumbsUp, Users, type IconNode } from "lucide";
import { barHeights, curvePoint, easeOut, floater, progress, ring, wave } from "../lib/brand-motion";
import { brandStyle } from "../lib/brand-style";
import { TYPE } from "../lib/layout";

export const STAGE_W = 620;
export const STAGE_H = 190;
const SOFT = "#ffffff1f";
const LINE = "#ffffff59";

/** A 24-unit icon drawn in place inside an SVG: centre (x, y), size in px. */
function Glyph({ node, x, y, size, color, sw = 1.8, rotate = 0, scale = 1, opacity = 1 }: { node: IconNode; x: number; y: number; size: number; color: string; sw?: number; rotate?: number; scale?: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${(size / 24) * scale}) translate(-12 -12)`} opacity={opacity} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {node.map(([tag, attrs], i) => React.createElement(tag, { ...(attrs as Record<string, string>), key: i }))}
    </g>
  );
}

const pop = (f: number, start: number, dur = 12) => easeOut(progress(f, start, dur));
const Skeleton = ({ x, y, w, h = 9, color = LINE, o = 1 }: { x: number; y: number; w: number; h?: number; color?: string; o?: number }) => <rect x={x} y={y} width={Math.max(0, w)} height={h} rx={h / 2} fill={color} opacity={o} />;
const Label = ({ x, y, text, size = 24, color, anchor = "middle" }: { x: number; y: number; text: string; size?: number; color: string; anchor?: "start" | "middle" | "end" }) => (
  <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={TYPE.sans} fontWeight={800} fontSize={size} letterSpacing={2} fill={color}>{text}</text>
);

type P = { f: number; c: string; c2: string; node: IconNode };

/** YouTube: a player with a growing progress bar, then a subscribe button that is pressed and rings the bell. */
function Player({ f, c, c2 }: P) {
  const p = progress(f, 6, 100);
  const pulse = 1 + 0.07 * wave(f, 28);
  const pill = pop(f, 24);
  const press = f >= 78 && f < 90 ? 1 - 0.1 * Math.sin((Math.PI * (f - 78)) / 12) : 1;
  const done = f >= 84;
  return (
    <g>
      <rect x={4} y={8} width={330} height={174} rx={24} fill="#00000066" stroke={c} strokeWidth={4} />
      <g transform={`translate(169 82) scale(${pulse})`}><path d="M-17 -24 L29 0 L-17 24 Z" fill={c} /></g>
      <rect x={28} y={148} width={282} height={8} rx={4} fill={SOFT} />
      <rect x={28} y={148} width={282 * p} height={8} rx={4} fill={c} />
      <circle cx={28 + 282 * p} cy={152} r={10} fill={c} />
      <g transform={`translate(486 96) scale(${pill * press}) translate(-120 -32)`} opacity={pill}>
        <rect width={240} height={64} rx={32} fill={done ? "none" : c} stroke={c} strokeWidth={4} />
        <Label x={120} y={32} text={done ? "TERLANGGANAN" : "SUBSCRIBE"} size={done ? 20 : 25} color={done ? c : "#111111"} />
      </g>
      {done ? <Glyph node={Bell} x={594} y={34} size={38} color={c2} rotate={Math.sin(f / 2.5) * 20 * (1 - progress(f, 84, 40))} /> : null}
    </g>
  );
}

/** TikTok / Spotify: an equalizer; TikTok adds floating notes, Spotify a progress bar. */
function Equalizer({ f, c, c2, id }: P & { id: string }) {
  const bars = barHeights(f, 9);
  const spot = id === "spotify";
  return (
    <g>
      {bars.map((h, i) => <rect key={i} x={i * 38} y={(spot ? 150 : 180) - 150 * h * (spot ? 0.95 : 1)} width={26} height={150 * h * (spot ? 0.95 : 1)} rx={8} fill={i % 2 ? c2 : c} opacity={0.95} />)}
      {spot ? (
        <g><rect x={0} y={170} width={342} height={8} rx={4} fill={SOFT} /><rect x={0} y={170} width={342 * progress(f, 4, 120)} height={8} rx={4} fill={c} /></g>
      ) : [0, 1, 2, 3].map(i => { const q = floater(f, i, 4); return <Glyph key={i} node={Music2} x={400 + q.x * 200} y={STAGE_H - 10 - q.y * (STAGE_H - 30)} size={46} color={i % 2 ? c2 : c} opacity={q.opacity} scale={q.scale} rotate={Math.sin((f + i * 9) / 9) * 14} sw={2} />; })}
    </g>
  );
}

/** Instagram: a heart that pops with a burst of rings and sparkles, and small hearts floating away. */
function Hearts({ f, c, c2 }: P) {
  const s = 0.35 + 0.8 * pop(f, 0, 14) + 0.06 * wave(f, 24);
  const r = ring(f - 8, 0, 1, 42);
  return (
    <g>
      {f > 8 ? <circle cx={100} cy={95} r={30 + 100 * r.r} fill="none" stroke={c2} strokeWidth={4} opacity={r.opacity * 0.8} /> : null}
      <Glyph node={Heart} x={100} y={95} size={120} color={c} sw={2} scale={Math.min(1.12, s)} />
      {[[40, 30], [170, 40], [175, 150]].map(([x, y], i) => <Glyph key={i} node={Sparkles} x={x} y={y} size={34} color={c2} scale={0.5 + 0.7 * wave(f + i * 11, 26)} opacity={pop(f, 8 + i * 5)} />)}
      {[0, 1, 2, 3, 4].map(i => { const q = floater(f - 12, i, 5, 80); return f < 12 ? null : <Glyph key={i} node={Heart} x={290 + q.x * 310} y={STAGE_H - 10 - q.y * (STAGE_H - 30)} size={40} color={i % 2 ? c2 : c} opacity={q.opacity} scale={q.scale} sw={2.2} />; })}
    </g>
  );
}

/** Facebook: a thumbs-up, then reactions bounce in one after another. */
function Reactions({ f, c, c2 }: P) {
  const tilt = (1 - pop(f, 0, 12)) * -25;
  return (
    <g>
      <Glyph node={ThumbsUp} x={90} y={96} size={116} color={c} rotate={tilt} scale={0.4 + 0.6 * pop(f, 0, 12)} sw={2} />
      {[Heart, FaceSlightlySmiling, Flame].map((n, i) => {
        const p = pop(f, 16 + i * 8, 10);
        const bob = Math.sin((f + i * 8) / 6) * 6 * p;
        return (
          <g key={i} opacity={p}>
            <circle cx={250 + i * 110} cy={96 - bob} r={42 * p} fill="#00000066" stroke={i === 0 ? c2 : c} strokeWidth={3.5} />
            <Glyph node={n} x={250 + i * 110} y={96 - bob} size={46} color={i === 0 ? c2 : c} sw={2} />
          </g>
        );
      })}
    </g>
  );
}

/** WhatsApp: a message arrives, a reply with double ticks, and the other person is typing. */
function Chat({ f, c, c2 }: P) {
  const a = pop(f, 0), b = pop(f, 22), t = pop(f, 60);
  return (
    <g>
      <g transform={`translate(0 6) scale(${a})`} opacity={a}>
        <rect width={300} height={62} rx={20} fill={SOFT} stroke={LINE} strokeWidth={2} />
        <Skeleton x={22} y={16} w={210} /><Skeleton x={22} y={36} w={140} />
      </g>
      <g transform={`translate(${250 + (1 - b) * 40} 78)`} opacity={b}>
        <rect width={300} height={62} rx={20} fill={c} opacity={0.28} stroke={c} strokeWidth={2.5} />
        <Skeleton x={22} y={16} w={230} color={c2} o={0.9} /><Skeleton x={22} y={36} w={120} color={c2} o={0.9} />
      </g>
      <Glyph node={CheckCheck} x={520} y={124} size={28} color={c2} opacity={pop(f, 44, 8)} sw={2.6} />
      <g opacity={t}>
        <rect x={0} y={148} width={116} height={38} rx={19} fill={SOFT} stroke={LINE} strokeWidth={2} />
        {[0, 1, 2].map(i => <circle key={i} cx={30 + i * 28} cy={167 - 7 * wave(f, 20, i * 1.3)} r={6} fill={c} />)}
      </g>
    </g>
  );
}

/** Telegram: a paper plane flies along a curve and leaves a dotted trail, then "sent". */
function Plane({ f, c, c2 }: P) {
  const a = { x: 30, y: 160 }, mid = { x: 300, y: -30 }, b = { x: 560, y: 70 };
  const t = easeOut(progress(f, 4, 56));
  const pt = curvePoint(t, a, mid, b);
  const trail = Array.from({ length: 24 }, (_, i) => curvePoint((i / 23) * t, a, mid, b)).map((q, i) => `${i ? "L" : "M"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
  const sent = pop(f, 62, 10);
  return (
    <g>
      <path d={trail} fill="none" stroke={c} strokeWidth={4} strokeDasharray="2 14" strokeLinecap="round" opacity={0.8} />
      <Glyph node={Send} x={pt.x} y={pt.y} size={66} color={c} rotate={pt.angle + 45} sw={2} />
      <g opacity={sent} transform={`translate(430 ${128 + (1 - sent) * 16})`}>
        <rect width={176} height={46} rx={23} fill="#00000066" stroke={c2} strokeWidth={3} />
        <Label x={66} y={23} text="TERKIRIM" size={19} color={c2} />
        <Glyph node={CheckCheck} x={146} y={23} size={26} color={c} sw={2.6} />
      </g>
    </g>
  );
}

/** Google: a search bar is typed into, then suggestions appear. */
function SearchBar({ f, c, c2 }: P) {
  const typed = 380 * easeOut(progress(f, 6, 52));
  return (
    <g>
      <rect x={2} y={14} width={560} height={78} rx={39} fill={SOFT} stroke={c} strokeWidth={3.5} />
      <Glyph node={Search} x={52} y={53} size={40} color={c} sw={2.4} />
      <Skeleton x={96} y={48} w={typed} h={11} color={c2} o={0.95} />
      {wave(f, 18) > 0.5 || typed < 380 ? <rect x={96 + typed + 6} y={36} width={4} height={34} rx={2} fill={c} /> : null}
      {[300, 220].map((w, i) => { const p = pop(f, 58 + i * 8); return <g key={i} opacity={p}><circle cx={44} cy={126 + i * 36} r={10} fill="none" stroke={LINE} strokeWidth={3} /><Skeleton x={74} y={121 + i * 36} w={w * p} h={10} color={i ? LINE : c} o={0.9} /></g>; })}
    </g>
  );
}

/** Netflix: the N draws itself, then a row of thumbnails slides in. */
function Ribbon({ f, c }: P) {
  const d = progress(f, 0, 34);
  return (
    <g>
      <g transform="translate(40 14) scale(6.2)" fill="none" stroke={c} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.5 + 0.5 * wave(f, 50)}>
        <path d="M6 21V3l12 18V3" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
      </g>
      {[0, 1, 2].map(i => { const p = pop(f, 30 + i * 8, 12); return <g key={i} opacity={p} transform={`translate(${250 + i * 128} ${50 + (1 - p) * 30})`}><rect width={112} height={84} rx={12} fill={c} opacity={0.16 + 0.1 * i} stroke={c} strokeWidth={2.5} /><g transform="translate(56 42)"><path d="M-10 -14 L16 0 L-10 14 Z" fill={c} opacity={0.9} /></g></g>; })}
    </g>
  );
}

/** Podcast: a microphone with sound rings and a waveform. */
function Waves({ f, c, c2 }: P) {
  const bars = barHeights(f, 17, 0.12);
  return (
    <g>
      {[0, 1, 2].map(i => { const r = ring(f, i, 3, 60); return <circle key={i} cx={100} cy={95} r={40 + 70 * r.r} fill="none" stroke={c} strokeWidth={3} opacity={r.opacity * 0.7} />; })}
      <Glyph node={Mic} x={100} y={95} size={104} color={c2} sw={2} scale={0.7 + 0.3 * pop(f, 0, 10)} />
      {bars.map((h, i) => <rect key={i} x={250 + i * 22} y={95 - 70 * h} width={12} height={140 * h} rx={6} fill={i % 3 ? c : c2} opacity={0.9} />)}
    </g>
  );
}

/** Shops: a shopping bag bounces while tags and sparkles pop around it. */
function Cart({ f, c, c2 }: P) {
  const p = pop(f, 0, 12);
  const bounce = f > 12 ? -Math.abs(Math.sin(f / 7)) * 16 : 0;
  return (
    <g>
      <Glyph node={ShoppingBag} x={130} y={104 + bounce} size={128} color={c} sw={2} scale={p} />
      <Glyph node={Tag} x={300} y={62} size={64} color={c2} rotate={360 * pop(f, 14, 24) - 25} scale={pop(f, 14, 12)} sw={2.2} />
      <Glyph node={Tag} x={420} y={130} size={52} color={c} rotate={20} scale={pop(f, 26, 12)} sw={2.2} />
      {[[500, 50], [560, 120], [210, 30]].map(([x, y], i) => <Glyph key={i} node={Sparkles} x={x} y={y} size={38} color={c2} scale={(0.4 + 0.7 * wave(f + i * 13, 24)) * pop(f, 30 + i * 6)} />)}
    </g>
  );
}

/** Ride apps: a car drives in along the road, speed lines behind it, and a pin drops at the destination. */
function Road({ f, c, c2 }: P) {
  const x = -60 + 400 * easeOut(progress(f, 0, 44));
  const pin = pop(f, 34, 10);
  return (
    <g>
      <line x1={0} y1={156} x2={STAGE_W} y2={156} stroke={LINE} strokeWidth={4} strokeDasharray="26 22" strokeDashoffset={-f * 7} />
      {[0, 1, 2].map(i => <rect key={i} x={x - 120 - i * 18} y={70 + i * 24} width={70 - i * 14} height={6} rx={3} fill={c} opacity={0.6 * (1 - progress(f, 40, 12))} />)}
      <Glyph node={Car} x={x} y={106} size={110} color={c} sw={2} />
      <g opacity={pin}><circle cx={540} cy={156} r={16 * pin} fill="none" stroke={c2} strokeWidth={3} /><Glyph node={MapPin} x={540} y={92 + (1 - pin) * -50} size={76} color={c2} sw={2.2} /></g>
    </g>
  );
}

/** AI assistants: sparkles twinkle, a prompt is typed and the answer's lines grow. */
function Sparkle({ f, c, c2 }: P) {
  return (
    <g>
      <Glyph node={Sparkles} x={90} y={96} size={112} color={c} sw={2} scale={(0.8 + 0.2 * wave(f, 30)) * pop(f, 0, 12)} />
      <Glyph node={Sparkles} x={170} y={36} size={44} color={c2} scale={(0.5 + 0.7 * wave(f + 9, 22)) * pop(f, 8)} />
      <Glyph node={Sparkles} x={176} y={158} size={34} color={c2} scale={(0.5 + 0.7 * wave(f + 17, 26)) * pop(f, 14)} />
      {[300, 250, 170].map((w, i) => { const p = easeOut(progress(f, 18 + i * 16, 22)); return <g key={i}><Skeleton x={250} y={36 + i * 42} w={w * p} h={12} color={i ? c2 : c} o={0.9} />{p > 0 && p < 1 ? <rect x={250 + w * p + 6} y={30 + i * 42} width={4} height={24} rx={2} fill={c} /> : null}</g>; })}
    </g>
  );
}

/** LinkedIn / GitHub: nodes connect one by one into a network. */
function Network({ f, c, c2 }: P) {
  const nodes = [{ x: 70, y: 100 }, { x: 230, y: 40 }, { x: 230, y: 160 }, { x: 400, y: 100 }, { x: 550, y: 44 }, { x: 550, y: 156 }];
  const links: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5]];
  return (
    <g>
      {links.map(([a, b], i) => { const p = easeOut(progress(f, 8 + i * 8, 14)); const A = nodes[a], B = nodes[b]; return <line key={i} x1={A.x} y1={A.y} x2={A.x + (B.x - A.x) * p} y2={A.y + (B.y - A.y) * p} stroke={c} strokeWidth={4} strokeLinecap="round" opacity={0.8} />; })}
      {nodes.map((n, i) => { const p = pop(f, i * 8, 10); return <g key={i} opacity={p}><circle cx={n.x} cy={n.y} r={(i === 0 ? 30 : 20) * p} fill="#101010" stroke={i % 3 === 0 ? c2 ?? c : c} strokeWidth={4} /><circle cx={n.x} cy={n.y} r={7 * p} fill={i % 3 === 0 ? c2 ?? c : c} /></g>; })}
    </g>
  );
}

/** Live platforms and meetings: a LIVE badge with a pulsing dot, viewers, and chat lines scrolling up. */
function Live({ f, c, c2 }: P) {
  return (
    <g>
      <g opacity={pop(f, 0, 10)}>
        <rect x={0} y={10} width={150} height={52} rx={26} fill={c2} />
        <circle cx={32} cy={36} r={9 + 3 * wave(f, 20)} fill="#ffffff" />
        <Label x={92} y={36} text="LIVE" size={26} color="#111111" />
      </g>
      <g opacity={pop(f, 12, 10)}><Glyph node={Users} x={34} y={110} size={44} color={c} sw={2.2} /><Skeleton x={66} y={104} w={90 + 16 * wave(f, 40)} h={12} color={c} /></g>
      {[0, 1, 2, 3].map(i => { const age = ((f + i * 18) % 72) / 72; const y = 170 - age * 150; return <g key={i} opacity={Math.sin(Math.PI * age)}><circle cx={236} cy={y} r={13} fill={i % 2 ? c : c2} opacity={0.9} /><Skeleton x={262} y={y - 5} w={150 + (i * 53) % 130} h={10} color={LINE} /></g>; })}
    </g>
  );
}

/** X: the two strokes are drawn, then posts appear with small hearts. */
function Cross({ f, c }: P) {
  const a = progress(f, 0, 14), b = progress(f, 12, 14);
  return (
    <g>
      <g transform="translate(92 96)">
        <line x1={-46} y1={-46} x2={-46 + 92 * a} y2={-46 + 92 * a} stroke={c} strokeWidth={14} strokeLinecap="round" />
        <line x1={46} y1={-46} x2={46 - 92 * b} y2={-46 + 92 * b} stroke={c} strokeWidth={14} strokeLinecap="round" />
      </g>
      {[0, 1, 2].map(i => { const p = pop(f, 26 + i * 10); return <g key={i} opacity={p} transform={`translate(${220 + (1 - p) * 30} ${14 + i * 56})`}><circle cx={18} cy={18} r={16} fill="none" stroke={c} strokeWidth={3} /><Skeleton x={48} y={6} w={260} h={9} color={LINE} /><Skeleton x={48} y={26} w={180 - i * 30} h={9} color={LINE} /><Glyph node={Heart} x={400} y={20} size={28} color={c} scale={pop(f, 40 + i * 10, 8)} sw={2.2} /></g>; })}
    </g>
  );
}

/** Any other name: its own icon with rings and small copies floating away. */
function Generic({ f, c, c2, node }: P) {
  return (
    <g>
      {[0, 1].map(i => { const r = ring(f, i, 2, 56); return <circle key={i} cx={100} cy={95} r={44 + 56 * r.r} fill="none" stroke={c} strokeWidth={3} opacity={r.opacity * 0.7} />; })}
      <Glyph node={node} x={100} y={95} size={110} color={c} sw={1.9} scale={0.4 + 0.6 * pop(f, 0, 12)} />
      {[0, 1, 2, 3, 4].map(i => { const q = floater(f - 10, i, 5, 80); return f < 10 ? null : <Glyph key={i} node={node} x={250 + q.x * 340} y={STAGE_H - 12 - q.y * (STAGE_H - 36)} size={34} color={i % 2 ? c2 : c} opacity={q.opacity * 0.9} scale={q.scale} sw={2.2} />; })}
    </g>
  );
}

/** The animated scene of a popular name, `f` frames after it was triggered (nothing before). */
export function BrandStage({ id, node, f }: { id: string; node: IconNode; f: number }) {
  if (f < 0) return null;
  const st = brandStyle(id);
  const p: P = { f, c: st.color, c2: st.color2 ?? st.color, node };
  const body = (() => {
    switch (st.stage) {
      case "player": return <Player {...p} />;
      case "equalizer": return <Equalizer {...p} id={id} />;
      case "hearts": return <Hearts {...p} />;
      case "reactions": return <Reactions {...p} />;
      case "chat": return <Chat {...p} />;
      case "plane": return <Plane {...p} />;
      case "search": return <SearchBar {...p} />;
      case "ribbon": return <Ribbon {...p} />;
      case "waves": return <Waves {...p} />;
      case "cart": return <Cart {...p} />;
      case "road": return <Road {...p} />;
      case "sparkle": return <Sparkle {...p} />;
      case "network": return <Network {...p} />;
      case "live": return <Live {...p} />;
      case "cross": return <Cross {...p} />;
      default: return <Generic {...p} />;
    }
  })();
  return <svg width={STAGE_W} height={STAGE_H} viewBox={`0 0 ${STAGE_W} ${STAGE_H}`} style={{ overflow: "visible", display: "block" }} data-stage={st.stage} data-brand-stage={id}>{body}</svg>;
}


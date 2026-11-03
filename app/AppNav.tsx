import Link from "next/link";

const ITEMS = [
  { href: "/", key: "clipper", label: "Potong video", hint: "Ambil bagian terbaik dari video panjang" },
  { href: "/motion", key: "studio", label: "Studio kreatif", hint: "Subtitle, motion, film sinematik, suara" },
  { href: "/hub", key: "library", label: "Library", hint: "Hasil dan catatan tersimpan" },
] as const;

/** The same four places on every page, with what each is for; the current one is marked. */
export default function AppNav({ current }: { current: (typeof ITEMS)[number]["key"] }) {
  return <nav className="app-nav" aria-label="Menu utama" data-testid="app-nav">
    {ITEMS.map(i => <Link key={i.key} href={i.href} title={i.hint} aria-current={i.key === current ? "page" : undefined} data-testid={`nav-${i.key}`}><b>{i.label}</b><small>{i.hint}</small></Link>)}
  </nav>;
}

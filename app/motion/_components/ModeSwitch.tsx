import type { Mode } from "./types";

type Props = {
  activeMode: Mode;
  chooseMode: (m: Mode) => void;
  videoMode: boolean;
};

export default function ModeSwitch({ activeMode, chooseMode, videoMode }: Props) {
  return (
    <section className="motion-intro compact">
        <div className="seg two mode-switch" role="radiogroup" aria-label="Jenis konten">
          <button role="radio" aria-checked={activeMode === "normal"} className={activeMode === "normal" ? "active" : ""} onClick={() => chooseMode("normal")} data-testid="mode-normal">Konten biasa</button>
          <button role="radio" aria-checked={activeMode === "affiliate"} className={activeMode === "affiliate" ? "active" : ""} disabled={videoMode} onClick={() => chooseMode("affiliate")} data-testid="mode-affiliate">Affiliate</button>
        </div>
        <p className="mode-hint" data-testid="mode-hint">{videoMode ? "Affiliate tidak tersedia saat mengedit di atas video sumber. Lepas videonya (Ganti video) untuk memakainya."
          : activeMode === "affiliate" ? "Isi data produk, AI menulis naskah dari data itu, dan klaim berisiko ditandai. Naskah dan pengaturan tetap ada saat Anda pindah ke Konten biasa."
          : "Tulis naskah sendiri, atau mulai dari video sumber. Naskah dan pengaturan tetap ada saat Anda pindah ke Affiliate."}</p>
      </section>
  );
}

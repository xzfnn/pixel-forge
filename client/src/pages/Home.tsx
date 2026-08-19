/**
 * Pixel Forge — Fluorescent Drafting Board.
 * A single full-featured Botlab page; image flashcards live inside the sticker workflow.
 */
import { Botlab } from "@/components/BotlabComplete";

export default function Home() {
  return (
    <div className="botlab-shell">
      <header className="topbar botlab-topbar">
        <a className="brand" href="#botlab" aria-label="Pixel Forge Botlab">
          <span className="brand-forge-mark" aria-hidden="true"><i /><b /></span>
          <span>PIXEL<i className="brand-pixel" />FORGE</span>
          <i>bot lab</i>
        </a>
        <div className="topbar-center"><span className="signal" />sprite constructor <span className="topbar-dot">/</span> image flashcards · png · gif · svg</div>
        <div className="topbar-actions"><span className="header-link">local-only</span></div>
      </header>
      <main id="botlab" className="botlab-mode"><Botlab /></main>
    </div>
  );
}

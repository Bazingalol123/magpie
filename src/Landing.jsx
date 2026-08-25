import { useEffect, useRef } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUpRight,
  Briefcase,
  Bug,
  Camera,
  Check,
  ChefHat,
  Download,
  Eye,
  Home,
  Layers3,
  Linkedin,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  MousePointerClick,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wand2,
} from "lucide-react";
import magpieMarkSrc from "./icon/magpie-mark.png";

function Mark({ size = 30 }) {
  return <img src={magpieMarkSrc} alt="" className="magpie-mark" width={size} height={size} />;
}

export default function Landing({ isSigningIn, onSignIn }) {
  const heroRef = useRef(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.16 });
    document.querySelectorAll("[data-reveal]").forEach((element) => {
      if (reduceMotion) element.classList.add("in-view");
      else observer.observe(element);
    });

    const hero = heroRef.current;
    let frame = 0;
    const onPointerMove = (event) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const rect = hero.getBoundingClientRect();
        const px = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const py = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
        hero.style.setProperty("--px", px.toFixed(3));
        hero.style.setProperty("--py", py.toFixed(3));
      });
    };
    if (hero && !reduceMotion) hero.addEventListener("pointermove", onPointerMove);
    return () => {
      observer.disconnect();
      if (hero) hero.removeEventListener("pointermove", onPointerMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <main className="ld-shell">
      <header className="ld-topbar">
        <div className="brand-lockup"><Mark size={30} /><span>magpie</span></div>
        <button className="ld-signin-mini" onClick={onSignIn} disabled={isSigningIn}>Sign in</button>
      </header>

      <section className="ld-hero" ref={heroRef}>
        <div className="ld-hero-copy">
          <div className="eyebrow"><Sparkles size={13} /> clip, organize, stay current</div>
          <h1>Turn the messy web into <em>living, structured collections.</em></h1>
          <p>Clip any listing, product, job, or recipe. Magpie understands what it is, files it with its siblings, and keeps watching the source so your research never goes stale.</p>
          <button className="primary-button ld-cta" onClick={onSignIn} disabled={isSigningIn} aria-label="Sign in to start using Magpie">
            {isSigningIn ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
            Sign in to start
          </button>
          <div className="ld-hero-links">
            <a className="ld-docs-link" href="/docs/getting-started" target="_blank" rel="noopener">How it works, and how to install the extension →</a>
            <a className="ld-docs-link" href="https://github.com/Bazingalol123/magpie/releases/latest" target="_blank" rel="noreferrer"><Download size={13} /> Download extension</a>
          </div>
          <div className="ld-hero-trust"><ShieldCheck size={14} /> The extension can write clips — it can never read your data.</div>
        </div>

        <div className="ld-scene ld-mechanism" aria-hidden="true">
          <div className="ld-source-page">
            <div className="ld-browser-bar"><i /><i /><i /><span>camera-market.example/listing</span></div>
            <div className="ld-source-content">
              <div className="ld-source-image"><Camera size={38} /></div>
              <div className="ld-source-copy"><small>Used mirrorless camera</small><b>Sony Alpha 6600</b><span>Excellent condition · Tel Aviv</span><strong>₪6,850</strong></div>
              <div className="ld-source-selection"><MousePointerClick size={12} /> captured</div>
            </div>
          </div>
          <div className="ld-mechanism-rail"><span>page</span><i /><Sparkles size={16} /><i /><span>fields</span></div>
          <div className="ld-extracted-card">
            <div className="ld-card-head"><Camera size={13} /> Cameras <em>live</em></div>
            <b>Sony Alpha 6600</b>
            <div className="ld-extracted-fields"><span>Type <strong>Mirrorless</strong></span><span>Condition <strong>Excellent</strong></span><span>Location <strong>Tel Aviv</strong></span></div>
            <div className="ld-moving-price"><span>Price</span><del>₪6,850</del><ArrowRightLeft size={13} /><strong>₪6,415</strong><i><TrendingDown size={10} /> changed</i></div>
          </div>
        </div>

        <div className="ld-scroll-hint"><ArrowDown size={14} /> see how it works</div>
      </section>

      <section className="ld-steps">
        <div className="ld-step" data-reveal style={{ "--d": "0ms" }}>
          <span className="ld-step-number"><MousePointerClick size={19} /></span>
          <h3>1 · Install and sign in</h3>
          <p>Install the Chrome extension, then sign in to create your private workspace. Magpie never assumes pairing or installation is already complete.</p>
        </div>
        <div className="ld-step" data-reveal style={{ "--d": "110ms" }}>
          <span className="ld-step-number"><Wand2 size={19} /></span>
          <h3>2 · Clip anything</h3>
          <p>Point at the part of the page that matters — an element, selection, image, or the whole page — and press one key. No folders, no forms.</p>
        </div>
        <div className="ld-step" data-reveal style={{ "--d": "220ms" }}>
          <span className="ld-step-number"><RefreshCw size={19} /></span>
          <h3>3 · Organize and review</h3>
          <p>Magpie organizes what you captured, asks when it is unsure, and keeps changes visible with evidence and history.</p>
        </div>
      </section>

      <section className="ld-story">
        <div className="ld-story-intro" data-reveal>
          <div className="eyebrow"><Layers3 size={13} /> one journey, real structure</div>
          <h2>Moving to Berlin? Watch it become a workspace.</h2>
        </div>

        <div className="ld-scene-row" data-reveal>
          <div className="ld-scene-copy">
            <h3>Clip an apartment from any listing site</h3>
            <p>Hover, press <kbd>C</kbd>, done. The original page, screenshot, and selected evidence travel with the capture.</p>
          </div>
          <div className="ld-mock ld-mock-capture">
            <div className="ld-mock-page">
              <div className="ld-mock-line w80" /><div className="ld-mock-line w60" />
              <div className="ld-mock-highlight">
                <b>Altbau 2-Zimmer · Kreuzberg</b>
                <span>€1,340 warm · 58 m² · available Oct 1</span>
              </div>
              <div className="ld-mock-line w70" /><div className="ld-mock-line w40" />
            </div>
            <div className="ld-mock-toast"><span className="ld-dot" /> Saved — Magpie created “Apartments”.</div>
          </div>
        </div>

        <div className="ld-scene-row reverse" data-reveal>
          <div className="ld-scene-copy">
            <h3>Collections build themselves</h3>
            <p>Apartments, Neighborhoods, Moving companies — each capture lands as a structured row you can actually compare.</p>
          </div>
          <div className="ld-mock ld-mock-table">
            <div className="ld-mock-tabhead"><span>Apartments</span><i>live</i></div>
            <div className="ld-mock-trow head"><span>Source</span><span>Rent</span><span>Rooms</span><span>m²</span></div>
            <div className="ld-mock-trow"><span>immoscout…</span><span>€1,340</span><span>2</span><span>58</span></div>
            <div className="ld-mock-trow"><span>kleinanzei…</span><span>€1,190</span><span>2</span><span>54</span></div>
            <div className="ld-mock-trow new"><span>wg-gesucht…</span><span>€1,420</span><span>3</span><span>67</span></div>
          </div>
        </div>

        <div className="ld-scene-row" data-reveal>
          <div className="ld-scene-copy">
            <h3>The web moves. Your data follows.</h3>
            <p>A rent changes, a listing disappears, a deadline shifts — Magpie updates the right Item and keeps the evidence-backed history.</p>
          </div>
          <div className="ld-mock ld-mock-history">
            <div className="ld-history-row"><span className="ld-pulse"><Check size={10} /></span><div><b>rent</b> changed <del>€1,420</del> → <strong>€1,340</strong><small>2 hours ago</small></div></div>
            <div className="ld-history-row"><span className="ld-pulse"><Check size={10} /></span><div><b>availability</b> changed <del>Oct 1</del> → <strong>Nov 1</strong><small>yesterday</small></div></div>
            <div className="ld-history-row muted"><span className="ld-pulse warn"><LockKeyhole size={10} /></span><div>a source now requires sign-in — <strong>watch paused, nothing invented</strong><small>evidence preserved</small></div></div>
          </div>
        </div>
      </section>

      <section className="ld-ai">
        <div className="ld-ai-intro" data-reveal>
          <div className="eyebrow"><Sparkles size={13} /> what the AI actually does</div>
          <h2>AI does the thinking. Code decides what gets written.</h2>
          <p>Magpie isn't a folder you file things into by hand. An AI layer proposes, reads, and explains — every write is still validated by ordinary server code, never invented from a hunch.</p>
        </div>
        <div className="ld-usecase-grid">
          <div className="ld-usecase" data-reveal style={{ "--d": "0ms" }}><Wand2 size={17} /><b>Decides where things go</b><p>Every capture is auto-routed to the right Collection by a bounded AI proposal — deterministic code validates it before anything is written.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "90ms" }}><ArrowRightLeft size={17} /><b>Compares your Items</b><p>Ask which apartment fits the budget or which camera has the better sensor — grounded in what you actually captured, never invented.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "180ms" }}><MessageCircle size={17} /><b>Explains its own reasoning</b><p>Ask why something landed where it did and get the real decision trail — not a black box.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "270ms" }}><Eye size={17} /><b>Configures your watches</b><p>Tell Magpie what to watch for in plain language — a price drop, a deadline — and it sets up the monitoring.</p></div>
        </div>
      </section>

      <section className="ld-trust" data-reveal>
        <div className="ld-trust-icon"><LockKeyhole size={22} /></div>
        <div>
          <h2>Built untrusted by design</h2>
          <p>The browser extension holds one write-only pairing token. It can submit captures — it cannot read your Collections, your Items, or anything else. Owner isolation is enforced on the server, not promised in the client.</p>
          <ul>
            <li><Check size={13} /> Write-only capture client</li>
            <li><Check size={13} /> Server-validated AI proposals</li>
            <li><Check size={13} /> No crawling of pages you didn't clip</li>
          </ul>
        </div>
      </section>

      <section className="ld-usecases">
        <h2 data-reveal>One clipper, every kind of research</h2>
        <div className="ld-usecase-grid">
          <div className="ld-usecase" data-reveal style={{ "--d": "0ms" }}><Camera size={17} /><b>Compare products</b><p>Specs and prices, side by side.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "90ms" }}><Home size={17} /><b>Hunt apartments</b><p>Every listing, one live table.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "180ms" }}><Briefcase size={17} /><b>Track applications</b><p>Roles, deadlines, and changes.</p></div>
          <div className="ld-usecase" data-reveal style={{ "--d": "270ms" }}><ChefHat size={17} /><b>Collect anything</b><p>Recipes, tools, places, articles.</p></div>
        </div>
      </section>

      <section className="ld-final" data-reveal>
        <Mark size={44} />
        <h2>Stop losing what you find.</h2>
        <button className="primary-button ld-cta" onClick={onSignIn} disabled={isSigningIn}>
          {isSigningIn ? <LoaderCircle className="spin" size={17} /> : <ArrowUpRight size={17} />}
          Start clipping — it's free
        </button>
      </section>

      <footer className="ld-footer">
        <div className="brand-lockup"><Mark size={22} /><span>magpie</span></div>
        <span>Built on Base44 · owner-scoped by design</span>
        <div className="ld-footer-links">
          <a className="ld-docs-link" href="/about.html">About Magpie</a>
          <a className="ld-docs-link" href="/trust.html">Trust &amp; security</a>
          <a className="ld-docs-link" href="/privacy.html">Privacy overview</a>
          <a className="ld-docs-link" href="https://www.linkedin.com/company/magpie-or-else" target="_blank" rel="noreferrer"><Linkedin size={13} /> LinkedIn</a>
          <a className="ld-docs-link" href="https://github.com/Bazingalol123/magpie/issues/new" target="_blank" rel="noreferrer"><Bug size={13} /> Found a bug?</a>
        </div>
      </footer>
    </main>
  );
}

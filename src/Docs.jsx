import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ArrowUpRight, Book, LoaderCircle } from "lucide-react";
import magpieMarkSrc from "./icon/magpie-mark.png";
import { parseDocsLocation } from "./docs-navigation.js";
import gettingStartedMd from "../docs/GETTING_STARTED.md?raw";
import productGuideMd from "../docs/PRODUCT_GUIDE.md?raw";
import apiMd from "../docs/API.md?raw";
import releaseNotesMd from "../docs/RELEASE_NOTES.md?raw";

const SECTIONS = [
  { file: "GETTING_STARTED.md", slug: "getting-started", label: "Getting started", content: gettingStartedMd },
  { file: "PRODUCT_GUIDE.md", slug: "product-guide", label: "Product guide", content: productGuideMd },
  { file: "API.md", slug: "api", label: "API reference", content: apiMd },
  { file: "RELEASE_NOTES.md", slug: "release-notes", label: "Release notes", content: releaseNotesMd },
];

const SLUG_TO_FILE = Object.fromEntries(SECTIONS.map((section) => [section.slug, section.file]));
const FILE_TO_SLUG = Object.fromEntries(SECTIONS.map((section) => [section.file, section.slug]));

export default function Docs({ initialSlug, isSignedIn, onSignIn, isSigningIn }) {
  const [activeFile, setActiveFile] = useState(SLUG_TO_FILE[initialSlug] || SECTIONS[0].file);
  const active = SECTIONS.find((section) => section.file === activeFile) || SECTIONS[0];

  const goToSection = (file, hash) => {
    setActiveFile(file);
    const slug = FILE_TO_SLUG[file] || SECTIONS[0].slug;
    window.history.replaceState(null, "", `/docs/${slug}${hash || ""}`);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = hash ? document.getElementById(hash.replace(/^#/, "")) : null;
      (target || document.querySelector(".docs-content"))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  };

  useEffect(() => {
    const { hash } = parseDocsLocation(window.location.href);
    if (!hash) return undefined;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    return () => cancelAnimationFrame(frame);
  }, [active.file]);

  const docLink = (props) => {
    const href = props.href || "";
    const match = href.match(/^(GETTING_STARTED\.md|PRODUCT_GUIDE\.md|API\.md|RELEASE_NOTES\.md)(#.*)?$/);
    if (match) {
      return (
        <a
          {...props}
          href={`/docs/${FILE_TO_SLUG[match[1]]}${match[2] || ""}`}
          onClick={(event) => {
            event.preventDefault();
            goToSection(match[1], match[2]);
          }}
        />
      );
    }
    return <a {...props} target="_blank" rel="noreferrer" />;
  };

  return (
    <main className="docs-shell">
      <header className="docs-topbar">
        <a className="brand-lockup" href="/"><img src={magpieMarkSrc} alt="" className="magpie-mark" width={28} height={28} /><span>magpie</span></a>
        <div className="docs-topbar-actions">
          <a className="text-button" href="/"><ArrowLeft size={14} /> Back to Magpie</a>
          {isSignedIn ? (
            <a className="secondary-button" href="/">Open dashboard</a>
          ) : (
            <button className="primary-button docs-cta" onClick={onSignIn} disabled={isSigningIn}>
              {isSigningIn ? <LoaderCircle className="spin" size={15} /> : <ArrowUpRight size={15} />}
              Continue with Google
            </button>
          )}
        </div>
      </header>

      <div className="docs-body">
        <nav className="docs-nav">
          <div className="docs-nav-heading"><Book size={13} /> Documentation</div>
          {SECTIONS.map((section) => (
            <button
              key={section.file}
              className={`docs-nav-item ${section.file === active.file ? "active" : ""}`}
              onClick={() => goToSection(section.file)}
            >
              {section.label}
            </button>
          ))}
        </nav>

        <article className="docs-content agent-md">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: docLink, table: (props) => <div className="md-table-scroll"><table {...props} /></div> }}
          >
            {active.content}
          </ReactMarkdown>
        </article>
      </div>
    </main>
  );
}

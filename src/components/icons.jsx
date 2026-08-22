// Custom marks for concepts specific to Magpie, styled to sit next to
// lucide-react (24x24 viewBox, 2px round stroke) without clashing. Lucide
// stays for everything generic -- these exist only for recurring,
// brand-specific moments: the three capture modes, pairing/connection,
// the Magpie agent, and the empty-Collection state. See docs/DECISIONS.md
// "De-templating pass, Phase 2".

function IconBase({ size = 16, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

// Shared "viewport" frame the three capture-mode marks build on, so they
// read as one family: the page, then what's marked inside it.
function ViewportFrame() {
  return (
    <>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 8.5h16" />
    </>
  );
}

export function ClipElementIcon(props) {
  return (
    <IconBase {...props}>
      <ViewportFrame />
      <circle cx="12" cy="13.5" r="2.4" />
      <path d="M12 9.7v1.4M12 15.9v1.4M8.2 13.5h1.4M14.4 13.5h1.4" />
    </IconBase>
  );
}

export function SnipAreaIcon(props) {
  return (
    <IconBase {...props}>
      <ViewportFrame />
      <rect x="8" y="10.5" width="8" height="6" rx="0.5" strokeDasharray="2 2" />
      <circle cx="8" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16.5" r="1" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function SavePageIcon(props) {
  return (
    <IconBase {...props}>
      <ViewportFrame />
      <rect x="6" y="10.5" width="12" height="6" rx="1" fill="currentColor" fillOpacity="0.22" stroke="none" />
    </IconBase>
  );
}

// Two connected nodes with a pulse between them -- pairing is a device
// link, not a credential, so this reads more accurately than a key would.
export function PairingIcon(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <rect x="15" y="9" width="6" height="6" rx="1" />
      <path d="M9 12h2.2M12.8 12H15" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

// A minimal bird-in-flight silhouette (the classic two-stroke gull mark)
// for Magpie's own automatic/agent behavior, instead of the generic "AI
// sparkle" every other AI tool uses.
export function AgentIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 14c3.5-5.5 7-5.5 9-1.3" />
      <path d="M12 12.7c2-4.2 5.5-4.2 9 1.3" />
    </IconBase>
  );
}

// An empty nest for the empty-Collection state -- ties the illustration
// back to the brand instead of a generic inbox tray.
export function EmptyNestIcon(props) {
  return (
    <IconBase {...props}>
      <path d="M3 13.5a9 5 0 0 0 18 0" />
      <path d="M6.5 13 9.5 11M10 13.3l3.5-2.5M14 13 17 11" />
    </IconBase>
  );
}

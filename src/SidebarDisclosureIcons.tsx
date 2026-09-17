export function ProjectDisclosureIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="project-disclosure-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.7 12.9V6.2c0-1.15.93-2.08 2.08-2.08h2.14c.45 0 .89.15 1.24.42l1.02.78c.36.27.79.42 1.24.42h4.8c1.15 0 2.08.93 2.08 2.08v.8" />
      <path d="M5.1 8.75h11.48c.65 0 1.11.64.9 1.25l-1.44 4.3a2.08 2.08 0 0 1-1.97 1.42H4.76a2.08 2.08 0 0 1-1.98-2.72l1.06-3.24A1.32 1.32 0 0 1 5.1 8.75Z" />
    </svg>
  ) : (
    <svg className="project-disclosure-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.7 6.2c0-1.15.93-2.08 2.08-2.08h2.14c.45 0 .89.15 1.24.42l1.02.78c.36.27.79.42 1.24.42h4.8c1.15 0 2.08.93 2.08 2.08v5.94c0 1.15-.93 2.08-2.08 2.08H4.78A2.08 2.08 0 0 1 2.7 13.76V6.2Z" />
    </svg>
  );
}

export function WorkspaceDisclosureIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="workspace-disclosure-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="13" height="12" rx="2" />
      <path d="M2.8 7h12.4M7 7v7.6" />
    </svg>
  ) : (
    <svg className="workspace-disclosure-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3" y="4.5" width="11" height="9.5" rx="1.8" />
      <path d="M5 2.75h8.2c1.1 0 2 .9 2 2v6.5" />
    </svg>
  );
}

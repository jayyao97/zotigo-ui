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

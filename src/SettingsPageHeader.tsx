import type { ReactNode } from "react";

/** A settings page title with an optional subtitle and a control aligned to its right, such as a host picker. */
export function SettingsPageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return <header className="settings-page-header">
    <div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
    {children}
  </header>;
}

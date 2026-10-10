import { useEffect, useState } from "react";
import { useClient } from "./ClientContext";
import type { RuntimeProfile } from "../shared/zotigod";

export function TranslationProfileSettings({ value, onChange }: { value: string; onChange: (profile: string) => void }) {
  const { api } = useClient();
  const [profiles, setProfiles] = useState<RuntimeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setProfiles([]);
    void api.getProfiles(undefined, "global").then(result => { if (active) setProfiles(result.profiles); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load profiles."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, retry]);
  return <>
    <label className="settings-row">
      <span><strong>Translation profile</strong><small>Use a custom API profile for translation. A fast model with thinking disabled is usually best.</small></span>
      <select aria-label="Translation profile" value={value} disabled={loading || !!error} onChange={event => onChange(event.target.value)}>
        <option value="">Use session profile</option>
        {value && !profiles.some(profile => profile.name === value) && <option value={value}>{value}{!loading && !error ? " (unavailable)" : ""}</option>}
        {profiles.map(profile => <option key={profile.name} value={profile.name}>{profile.name} · {profile.model}</option>)}
      </select>
    </label>
    {loading && <p role="status">Loading translation profiles…</p>}
    {error && <p role="alert">{error} <button type="button" className="settings-secondary-button" onClick={() => setRetry(value => value + 1)}>Retry</button></p>}
  </>;
}

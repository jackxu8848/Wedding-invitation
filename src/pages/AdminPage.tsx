import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Papa from "papaparse";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";

type Invitee = { name: string; email: string };

function rowNameEmail(row: Record<string, unknown>): Invitee | null {
  const keys = Object.keys(row);
  let name = "";
  let email = "";
  for (const k of keys) {
    const lower = k.toLowerCase().trim();
    const v = String(row[k] ?? "").trim();
    if (!v) continue;
    if (lower === "name" || lower === "full name" || lower === "fullname") {
      name = v;
    }
    if (lower === "email" || lower === "e-mail" || lower === "email address") {
      email = v;
    }
  }
  if (!email) return null;
  return { name, email };
}

export default function AdminPage() {
  const [adminSecret, setAdminSecret] = useState("");
  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [parseError, setParseError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState<{
    sent: number;
    failed: { name: string; email?: string; reason: string }[];
  } | null>(null);
  const [sending, setSending] = useState(false);

  const onFile = (file: File | null) => {
    setParseError("");
    setSendResult(null);
    if (!file) {
      setInvitees([]);
      return;
    }
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const list: Invitee[] = [];
        for (const row of result.data) {
          const inv = rowNameEmail(row);
          if (inv) list.push(inv);
        }
        if (list.length === 0) {
          setParseError(
            "No rows with an email column found. Use headers like “name” and “email”."
          );
          setInvitees([]);
          return;
        }
        setInvitees(list);
      },
      error: (err) => {
        setParseError(err.message);
        setInvitees([]);
      },
    });
  };

  const onSend = async (ev: FormEvent) => {
    ev.preventDefault();
    setSendError("");
    setSendResult(null);
    if (!adminSecret.trim()) {
      setSendError("Enter the admin secret from your server .env (ADMIN_SECRET).");
      return;
    }
    if (invitees.length === 0) {
      setSendError("Upload a CSV with at least one email.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch(`${apiBase}/api/send-invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminSecret.trim(),
        },
        body: JSON.stringify({ invitees }),
      });
      const data = (await res.json()) as {
        error?: string;
        sent?: number;
        failed?: { name: string; email?: string; reason: string }[];
      };
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }
      setSendResult({
        sent: data.sent ?? 0,
        failed: data.failed ?? [],
      });
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app admin-app">
      <header className="hero">
        <p className="hero-ornament">—</p>
        <h1 className="hero-names admin-title">Invitation sender</h1>
        <p className="hero-tagline">
          <Link to="/">← Back to invitation</Link>
        </p>
      </header>

      <section className="card">
        <h2 className="admin-h2">1. Upload invite list (CSV)</h2>
        <p className="rsvp-intro">
          Include a header row with columns for name and email (any common
          spelling, e.g. <code>name</code>, <code>email</code>).
        </p>
        <div className="field">
          <label className="field-label" htmlFor="csv-file">
            CSV file
          </label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {parseError ? (
          <div className="notice notice-info" role="alert">
            {parseError}
          </div>
        ) : null}

        {invitees.length > 0 ? (
          <div className="admin-preview">
            <h3 className="admin-preview-title">
              Preview ({invitees.length} invite{invitees.length === 1 ? "" : "s"}
              )
            </h3>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {invitees.slice(0, 50).map((r, i) => (
                    <tr key={`${r.email}-${i}`}>
                      <td>{r.name || "—"}</td>
                      <td>{r.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invitees.length > 50 ? (
                <p className="field-hint">Showing first 50 rows.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 className="admin-h2">2. Send invitations</h2>
        <form onSubmit={onSend}>
          <div className="field">
            <label className="field-label" htmlFor="admin-secret">
              Admin secret
            </label>
            <input
              id="admin-secret"
              type="password"
              autoComplete="off"
              value={adminSecret}
              onChange={(e) => setAdminSecret(e.target.value)}
              placeholder="ADMIN_SECRET from server environment"
            />
            <p className="field-hint">
              This stays in your browser until you leave the page. It must match
              the value on your server.
            </p>
          </div>
          {sendError ? (
            <div className="notice notice-info" role="alert">
              {sendError}
            </div>
          ) : null}
          {sendResult ? (
            <div className="notice notice-success" role="status">
              <p style={{ margin: "0 0 0.5rem" }}>
                Sent: <strong>{sendResult.sent}</strong>
              </p>
              {sendResult.failed.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {sendResult.failed.map((f, i) => (
                    <li key={i}>
                      {f.name || f.email || "row"}: {f.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="form-footer">
            <button
              type="submit"
              className="btn"
              disabled={sending || invitees.length === 0}
            >
              {sending ? "Sending…" : "Send invitation emails"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

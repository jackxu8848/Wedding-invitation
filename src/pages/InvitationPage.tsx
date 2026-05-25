import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { WEDDING } from "../wedding";

const apiBase = import.meta.env.VITE_API_BASE_URL || "";
const saveDatePhotoImg = new URL("../../14999.JPG", import.meta.url).href;
const venuePhotoImg = new URL("../../15000.png", import.meta.url).href;

type Attending = "yes" | "no" | "";

type GuestKind = "adult" | "child" | "";

type GuestRow = {
  name: string;
  kind: GuestKind;
  age: string;
};

function syncGuests(prev: GuestRow[], size: number): GuestRow[] {
  const next = prev.slice(0, size);
  while (next.length < size) next.push({ name: "", kind: "", age: "" });
  return next;
}

export default function InvitationPage() {
  const [searchParams] = useSearchParams();
  const inviteName = useMemo(() => {
    const raw = searchParams.get("name");
    if (raw == null || raw === "") return "";
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  }, [searchParams]);

  const inviteEmailParam = useMemo(() => {
    const raw = searchParams.get("email");
    if (raw == null || raw === "") return "";
    try {
      return decodeURIComponent(raw).trim();
    } catch {
      return raw.trim();
    }
  }, [searchParams]);

  const contactEmail = inviteEmailParam;
  const july2026Days = useMemo(() => {
    const year = 2026;
    const monthIndex = 6;
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const mondayFirstOffset = (firstDay + 6) % 7;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const cells: Array<number | null> = [];
    for (let i = 0; i < mondayFirstOffset; i += 1) cells.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
    while (cells.length < 42) cells.push(null);
    return cells;
  }, []);

  const [attending, setAttending] = useState<Attending>("");
  const [partySize, setPartySize] = useState(1);
  const [guests, setGuests] = useState<GuestRow[]>([
    { name: "", kind: "", age: "" },
  ]);
  const [allergies, setAllergies] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const showGuestSection = attending === "yes";
  const onPartySizeChange = (n: number) => {
    const size = Math.max(1, Math.min(20, n));
    setPartySize(size);
    setGuests((g) => syncGuests(g, size));
  };

  const setGuestField = (
    index: number,
    field: keyof GuestRow,
    value: string
  ) => {
    setGuests((g) =>
      g.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        if (field === "kind" && value === "adult") next.age = "";
        return next;
      })
    );
  };

  const validate = useCallback((): string[] => {
    const e: string[] = [];
    if (!attending) e.push("Please let us know if you can attend.");
    if (attending === "yes") {
      if (partySize < 1) e.push("Party size must be at least 1.");
      guests.forEach((row, i) => {
        if (!row.name.trim())
          e.push(`Please enter a full name for guest ${i + 1}.`);
        if (!row.kind) e.push(`Please choose Adult or Child for guest ${i + 1}.`);
        if (row.kind === "child" && !row.age.trim())
          e.push(`Please enter an age for child guest ${i + 1}.`);
      });
    }
    return e;
  }, [attending, partySize, guests, contactEmail]);

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    setErrors([]);
    const e = validate();
    if (e.length) {
      setErrors(e);
      return;
    }

    setSubmitting(true);
    try {
      const attendingBool = attending === "yes";
      const res = await fetch(`${apiBase}/api/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attending: attendingBool,
          inviteeEmail: contactEmail,
          inviteeName: inviteName,
          allergies: allergies.trim(),
          guests: attendingBool
            ? guests.map((g) => ({
                fullName: g.name.trim(),
                childOrAdult: g.kind === "child" ? "Child" : "Adult",
                age: g.kind === "child" ? g.age.trim() : "",
              }))
            : [],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not send RSVP. Please try again.");
      }
      setSubmitted(true);
    } catch (err) {
      setErrors([
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="app">
        <header className="hero">
          <h1 className="hero-names">
            {WEDDING.partner1}
            <div className="hero-ampersand">&</div>
            {WEDDING.partner2}
          </h1>
        </header>
        <div className="card">
          <div className="success-panel">
            <h3>Thank you</h3>
            <p>We received your RSVP.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="hero">
        {inviteName ? (
          <p className="personal-greeting">Dear {inviteName},</p>
        ) : null}
        <h1 className="hero-names">
          {WEDDING.partner1}
          <div className="hero-ampersand">&</div>
          {WEDDING.partner2}
        </h1>
        <p className="hero-tagline">invite you to their wedding celebration</p>
        <section className="save-date-showcase" aria-label="Save the date calendar">
          <div className="save-photo-panel">
            <div className="save-photo-frame">
              <img
                src={saveDatePhotoImg}
                alt="Elena and Jack"
                loading="lazy"
              />
            </div>
          </div>
          <div className="save-calendar-panel">
            <p className="save-date-title">Save Our Date</p>
            <p className="save-date-names">
              {WEDDING.partner1} &amp; {WEDDING.partner2}
            </p>
            <p className="save-date-line">{WEDDING.date} | {WEDDING.time}</p>
            <p className="save-month-title">July 2026</p>
            <div className="calendar-weekdays">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((w) => (
                <span key={w}>{w}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {july2026Days.map((day, index) => (
                <span
                  key={`${day ?? "empty"}-${index}`}
                  className={`calendar-cell${day === 23 ? " wedding-day" : ""}${day == null ? " empty-day" : ""}`}
                >
                  {day === 23 ? (
                    <>
                      <span className="calendar-day-number">23</span>
                      <span className="calendar-heart-mark" aria-hidden="true">❤</span>
                    </>
                  ) : (
                    day
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>
      </header>

      <section className="card" aria-labelledby="details-heading">
        <h2 id="details-heading">The details</h2>
        <div className="detail-row">
          <span className="detail-label">When</span>
          <div className="detail-value">{WEDDING.date}</div>
          <div className="detail-sub">{WEDDING.time}</div>
        </div>
        <div className="detail-row">
          <span className="detail-label">Where</span>
          <div className="detail-value">{WEDDING.venue}</div>
          <div className="detail-sub">
            <a
              href={WEDDING.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {WEDDING.address}
            </a>
          </div>
          <figure className="venue-photo">
            <img
              src={venuePhotoImg}
              alt="Spencer's at the Waterfront venue"
              loading="lazy"
            />
          </figure>
        </div>
      </section>

      <section className="card order-card" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="order-title">Order of Events</h2>
        <div className="timeline" aria-label="Wedding day timeline">
          {[
            { time: "3:30 PM", title: "WELCOME!", icon: "📍" },
            { time: "4:30 PM", title: "Ceremony", icon: "💍" },
            { time: "5:00 PM", title: "Cocktail Reception", icon: "🥂" },
            { time: "7:00 PM", title: "Dinner", icon: "🍽️" },
            { time: "9:00 PM", title: "After Party", icon: "🎉" },
          ].map((item, index) => (
            <div
              key={`${item.time}-${item.title}`}
              className={`timeline-row ${index % 2 === 0 ? "left" : "right"}`}
            >
              <div className="timeline-side timeline-side-left">
                {index % 2 === 0 ? (
                  <div className="timeline-entry">
                    <div className="timeline-time">{item.time}</div>
                    <div className="timeline-event">{item.title}</div>
                  </div>
                ) : (
                  <div className="timeline-icon" aria-hidden="true">{item.icon}</div>
                )}
              </div>
              <div className="timeline-center" aria-hidden="true">
                <span className="timeline-mark" />
              </div>
              <div className="timeline-side timeline-side-right">
                {index % 2 === 0 ? (
                  <div className="timeline-icon" aria-hidden="true">{item.icon}</div>
                ) : (
                  <div className="timeline-entry">
                    <div className="timeline-time">{item.time}</div>
                    <div className="timeline-event">{item.title}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="rsvp-heading">
        <h2 id="rsvp-heading">RSVP</h2>
        <p className="rsvp-intro">
          Please respond by early July so we can finalize our guest list and
          seating. If you have questions, reach out to us directly.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <span className="field-label">Will you attend?</span>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="attending"
                  value="yes"
                  checked={attending === "yes"}
                  onChange={() => {
                    setAttending("yes");
                    setGuests((g) => syncGuests(g, partySize));
                  }}
                />
                Joyfully accepts
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="attending"
                  value="no"
                  checked={attending === "no"}
                  onChange={() => {
                    setAttending("no");
                    setAllergies("");
                  }}
                />
                Regretfully declines
              </label>
            </div>
          </div>

          {showGuestSection && (
            <>
              <div className="field">
                <label className="field-label" htmlFor="party-size">
                  How many people are in your party?
                </label>
                <select
                  id="party-size"
                  value={partySize}
                  onChange={(e) => onPartySizeChange(Number(e.target.value))}
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? "person" : "people"}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Include everyone attending with you, yourself included.
                </p>
              </div>

              {guests.map((g, i) => (
                <div key={i} className="guest-block">
                  <div className="guest-block-title">Guest {i + 1}</div>
                  <div className="guest-fields-vertical">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field-label" htmlFor={`name-${i}`}>
                        Full name
                      </label>
                      <input
                        id={`name-${i}`}
                        type="text"
                        autoComplete="name"
                        value={g.name}
                        onChange={(e) =>
                          setGuestField(i, "name", e.target.value)
                        }
                        placeholder="Name as it should appear"
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <span className="field-label">Guest type</span>
                      <div className="radio-group">
                        <label className="radio-option">
                          <input
                            type="radio"
                            name={`guest-kind-${i}`}
                            checked={g.kind === "adult"}
                            onChange={() => setGuestField(i, "kind", "adult")}
                          />
                          Adult
                        </label>
                        <label className="radio-option">
                          <input
                            type="radio"
                            name={`guest-kind-${i}`}
                            checked={g.kind === "child"}
                            onChange={() => setGuestField(i, "kind", "child")}
                          />
                          Child
                        </label>
                      </div>
                    </div>
                    {g.kind === "child" && (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label" htmlFor={`age-${i}`}>
                          Age
                        </label>
                        <input
                          id={`age-${i}`}
                          type="text"
                          inputMode="numeric"
                          value={g.age}
                          onChange={(e) =>
                            setGuestField(i, "age", e.target.value)
                          }
                          placeholder="e.g. 8"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {showGuestSection && (
            <div className="field">
              <label className="field-label" htmlFor="allergies">
                Allergies or dietary restrictions
              </label>
              <textarea
                id="allergies"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Let us know about any food allergies or dietary needs for anyone in your party. If none, you can leave this blank."
              />
            </div>
          )}

          {errors.length > 0 && (
            <div className="notice notice-info" role="alert">
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                {errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="form-footer">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? "Sending…" : "Submit RSVP"}
            </button>
          </div>
        </form>
      </section>

      <p className="footer-note">
        With love — {WEDDING.partner1} & {WEDDING.partner2}
      </p>
    </div>
  );
}

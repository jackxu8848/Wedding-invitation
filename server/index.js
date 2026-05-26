import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT) || 8787;

const WEDDING_TITLE = "Elena Han & Jack Xu";
const WEDDING_DATE = "July 23, 2026";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getSheetsClient() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath || !fs.existsSync(keyPath)) return null;
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

function sheetRange(sheetName, a1) {
  const escaped =
    /[^A-Za-z0-9_]/.test(sheetName) ? `'${sheetName.replace(/'/g, "''")}'` : sheetName;
  return `${escaped}!${a1}`;
}

function guestDietary(guest) {
  if (typeof guest.allergies === "string") return guest.allergies.trim();
  if (typeof guest.dietary === "string") return guest.dietary.trim();
  if (typeof guest.dietaryRestrictions === "string") {
    return guest.dietaryRestrictions.trim();
  }
  return "";
}

async function appendDeclineRow(sheets, spreadsheetId, sheetName, name) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName, "A:F"),
  });
  const row = (existing.data.values ?? []).length + 1;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: sheetRange(sheetName, `A${row}`),
          values: [[name]],
        },
        {
          range: sheetRange(sheetName, `F${row}`),
          values: [["No"]],
        },
      ],
    },
  });
}

async function appendRsvpRows(sheets, spreadsheetId, sheetName, rows) {
  const normalized = rows.map((row) => {
    const next = Array.isArray(row) ? [...row] : [];
    while (next.length < 6) next.push("");
    return next.slice(0, 6);
  });

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(sheetName, "A:F"),
  });
  const existingRows = existing.data.values ?? [];
  const startRow = existingRows.length + 1;
  const endRow = startRow + normalized.length - 1;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: sheetRange(sheetName, `A${startRow}:D${endRow}`),
          values: normalized.map((row) => row.slice(0, 4)),
        },
        {
          range: sheetRange(sheetName, `E${startRow}:E${endRow}`),
          values: normalized.map((row) => [row[4] ?? ""]),
        },
        {
          range: sheetRange(sheetName, `F${startRow}:F${endRow}`),
          values: normalized.map((row) => [row[5] ?? ""]),
        },
      ],
    },
  });
}

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    console.warn(
      "[wedding-server] ADMIN_SECRET is not set; refusing /api/send-invitations"
    );
    return res.status(503).json({
      error:
        "Server is not configured with ADMIN_SECRET. Set it in your environment.",
    });
  }
  if (req.get("x-admin-secret") !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.post("/api/rsvp", async (req, res) => {
  try {
    const { attending, inviteeEmail, inviteeName, guests } = req.body;
    const inviteeEmailValue =
      typeof inviteeEmail === "string" ? inviteeEmail.trim() : "";
    const inviteeNameValue =
      typeof inviteeName === "string" ? inviteeName.trim() : "";

    if (typeof attending !== "boolean") {
      return res.status(400).json({ error: "Invalid attending value" });
    }

    const spreadsheetId = process.env.SPREADSHEET_ID;
    const sheetName = process.env.SHEET_NAME || "Sheet1";
    if (!spreadsheetId) {
      return res.status(503).json({
        error:
          "Spreadsheet is not configured (SPREADSHEET_ID). Ask the host to set it up.",
      });
    }

    const sheets = getSheetsClient();
    if (!sheets) {
      return res.status(503).json({
        error:
          "Google Sheets credentials missing. Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file path.",
      });
    }

    const rows = [];

    if (attending) {
      if (!Array.isArray(guests) || guests.length === 0) {
        return res.status(400).json({ error: "Missing guest list" });
      }

      for (const g of guests) {
        const fullName = String(g.fullName || "").trim();
        const childOrAdult = g.childOrAdult === "Child" ? "Child" : "Adult";
        const age =
          childOrAdult === "Child" ? String(g.age || "").trim() : "";
        if (!fullName) {
          return res.status(400).json({ error: "Each guest needs a full name" });
        }
        if (childOrAdult === "Child" && !age) {
          return res.status(400).json({
            error: `Age is required for child guest: ${fullName}`,
          });
        }
        const dietary = guestDietary(g);
        rows.push([
          fullName,
          inviteeEmailValue,
          childOrAdult,
          age,
          dietary,
          "Yes",
        ]);
      }
    } else {
      if (!inviteeNameValue) {
        return res.status(400).json({ error: "Please enter your name" });
      }
      await appendDeclineRow(
        sheets,
        spreadsheetId,
        sheetName,
        inviteeNameValue
      );
      return res.json({ ok: true });
    }

    await appendRsvpRows(sheets, spreadsheetId, sheetName, rows);

    res.json({ ok: true });
  } catch (err) {
    console.error("[rsvp]", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "RSVP failed",
    });
  }
});

app.post("/api/send-invitations", requireAdmin, async (req, res) => {
  try {
    const { invitees } = req.body;
    if (!Array.isArray(invitees) || invitees.length === 0) {
      return res.status(400).json({ error: "invitees array required" });
    }

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    const baseUrl = (process.env.INVITATION_BASE_URL || "").replace(/\/$/, "");

    if (!user || !pass) {
      return res.status(503).json({
        error:
          "Gmail is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD.",
      });
    }
    if (!baseUrl) {
      return res.status(503).json({
        error: "INVITATION_BASE_URL is not set (public site URL for links).",
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });

    const results = { sent: 0, failed: [] };

    for (const row of invitees) {
      const name = String(row.name || "").trim();
      const email = String(row.email || "").trim();
      if (!email) {
        results.failed.push({ name, reason: "missing email" });
        continue;
      }

      const link = `${baseUrl}/?name=${encodeURIComponent(name || "Friend")}&email=${encodeURIComponent(email)}`;
      const greeting = name ? `Dear ${escapeHtml(name)},` : "Dear friends,";

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Georgia, serif; color: #2c2825; line-height: 1.6;">
  <p>${greeting}</p>
  <p>You are warmly invited to celebrate the wedding of <strong>${escapeHtml(WEDDING_TITLE)}</strong> on <strong>${escapeHtml(WEDDING_DATE)}</strong>.</p>
  <p><a href="${link}" style="color: #8b7355;">Open your invitation & RSVP</a></p>
  <p style="font-size: 0.9em; color: #6b6560;">If the button does not work, copy this link into your browser:<br/>${escapeHtml(link)}</p>
  <p>With love,<br/>Elena Han & Jack Xu</p>
</body>
</html>`.trim();

      try {
        await transporter.sendMail({
          from: `"Elena Han & Jack Xu" <${user}>`,
          to: email,
          subject: `You're invited — ${WEDDING_TITLE}`,
          html,
        });
        results.sent += 1;
      } catch (e) {
        results.failed.push({
          name,
          email,
          reason: e instanceof Error ? e.message : "send failed",
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error("[send-invitations]", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Send failed",
    });
  }
});

if (isProd) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(
    express.static(dist, {
      index: false,
      fallthrough: true,
    })
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(dist, "index.html"), (err) => (err ? next(err) : undefined));
  });
}

app.listen(PORT, () => {
  console.log(`[wedding-server] http://localhost:${PORT}${isProd ? " (production)" : ""}`);
});

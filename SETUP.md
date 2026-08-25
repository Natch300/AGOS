# AGOS Banking App — Setup Guide

## Tech Stack
- **Frontend:** Pure HTML, CSS, JavaScript (ES Modules via CDN)
- **Backend:** Supabase (Auth, PostgreSQL, Realtime, Row Level Security)

---

## Step 1 — Run the Database SQL

1. Log in to [supabase.com](https://supabase.com) and open your project dashboard.
2. Go to **SQL Editor** → **New Query**.
3. Open `agos/supabase_setup.sql` and paste the entire contents.
4. Click **Run**.

This creates all tables, functions, RLS policies, indexes, triggers, and seed data (billers, fraud rules).

---

## Step 2 — Create Your First Admin User

1. Go to **Authentication → Users → Invite User** (or use the sign-up form on the app).
2. Create a user with your admin email.
3. Go to **Table Editor → profiles**.
4. Find the row for your admin user and set:
   - `is_admin` = `true`
   - `is_active` = `true`
5. That account can now log in and access the admin panel at `admin/index.html`.

---

## Step 3 — Set the System Fund

1. Log in as admin.
2. Go to **Admin → Fund Allocation**.
3. Set the total system fund amount (e.g. ₱1,000,000 for testing).
4. Click **Update System Fund**.
5. Use **Allocate Funds to User** to load individual user balances.

---

## Step 4 — Serve the App

Since this is pure HTML/CSS/JS, you can serve it with any static file server.

### Option A — VS Code Live Server
- Right-click `agos/index.html` → **Open with Live Server**

### Option B — Python (quick local server)
```bash
cd agos
python -m http.server 3000
```
Then open: `http://localhost:3000`

### Option C — Node http-server
```bash
npx http-server agos -p 3000 -o
```

> **Important:** The app uses ES Modules (`type="module"` scripts), which require
> a proper HTTP server. Opening `index.html` directly as a `file://` URL will not work.

---

## File Structure

```
agos/
├── index.html              # Login page
├── supabase_setup.sql      # Run this in Supabase SQL Editor
├── SETUP.md                # This file
│
├── css/
│   ├── variables.css       # Design tokens, high-contrast theme
│   ├── global.css          # All shared component styles
│   ├── login.css           # Login page styles
│   └── dashboard.css       # Dashboard card styles
│
├── js/
│   ├── lib/
│   │   ├── supabase.js     # Supabase client
│   │   ├── auth.js         # Auth helpers, session guard
│   │   ├── shell.js        # App shell (sidebar + header)
│   │   ├── toast.js        # Toast notification helper
│   │   └── utils.js        # Formatting, receipt generator
│   └── pages/
│       ├── login.js
│       ├── dashboard.js
│       ├── send.js
│       ├── receive.js
│       ├── bills.js
│       ├── history.js
│       ├── contacts.js
│       ├── notifications.js
│       ├── support.js
│       └── settings.js
│
├── pages/
│   ├── dashboard.html
│   ├── send.html
│   ├── receive.html
│   ├── bills.html
│   ├── history.html
│   ├── contacts.html
│   ├── notifications.html
│   ├── support.html
│   └── settings.html
│
└── admin/
    ├── index.html          # Admin dashboard
    ├── users.html          # User management
    ├── funds.html          # Fund allocation
    ├── transactions.html   # All transactions + flag review
    ├── tickets.html        # Support ticket replies
    ├── billers.html        # Biller management
    ├── css/
    │   └── admin.css
    └── js/
        ├── admin-shell.js  # Admin sidebar + auth guard
        ├── dashboard.js
        ├── users.js
        ├── funds.js
        ├── transactions.js
        ├── tickets.js
        └── billers.js
```

---

## Supabase Keys

This project uses the **new Supabase key format** (`sb_publishable_...` / `sb_secret_...`).

| Key | Where used |
|---|---|
| `sb_publishable_...` | Browser/client-side — safe to expose. Used in `index.html` and `js/lib/config.js` |
| `sb_secret_...` | Server-side only — never put in frontend code |

The legacy `eyJ...` anon key is no longer needed if you use the publishable key.

---

## PIN Login Flow

- On **registration**, the user sets a 6-digit PIN.
- The PIN is stored as a Supabase Auth password in the format: `AGOS_PIN_<pin>` (e.g. `AGOS_PIN_123456`).
- On **PIN login**, the app signs in with email + `AGOS_PIN_<entered_pin>`.
- Password login uses the full password set during registration.

> Note: Because Supabase Auth only supports one password per user, PIN login **replaces** the password. If users want both, they can change back via Settings → Change PIN, or use the password reset flow to restore a full password.

---

## Key Features Summary

| Feature | Where |
|---|---|
| PIN keypad login | `index.html` |
| Large text / high-contrast / language | `pages/settings.html` |
| Send money (4-step + fraud detection) | `pages/send.html` |
| Receive money + account card | `pages/receive.html` |
| Pay bills (biller grid) | `pages/bills.html` |
| Transaction history + receipt download | `pages/history.html` |
| Saved contacts | `pages/contacts.html` |
| Realtime notifications | `pages/notifications.html` |
| Support tickets + call button | `pages/support.html` |
| Trusted family view access | `pages/settings.html` |
| Admin: system fund pool | `admin/funds.html` |
| Admin: credit/debit users | `admin/funds.html` |
| Admin: flag review | `admin/transactions.html` |
| Admin: ticket replies | `admin/tickets.html` |
| Admin: user activate/deactivate | `admin/users.html` |
| Admin: biller management | `admin/billers.html` |

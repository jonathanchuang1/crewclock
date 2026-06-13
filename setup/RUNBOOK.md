# CrewClock — "do it all" runbook

I (Claude) have done everything that doesn't require *your* logins. Three things need your Google account, and I've automated all but a couple of clicks. Total hands-on time: **~5 minutes.**

## Step 1 — run the setup script (creates the Sheet + Form for you)
1. Open <https://script.google.com> → **New project**.
2. Select all in the code editor, delete it, and paste the entire contents of
   [`setup/CrewClock_Setup.gs`](CrewClock_Setup.gs).
3. Make sure the function dropdown shows **`setupCrewClock`**, click **Run** (▶).
4. Approve the permission prompt (it's your own script editing your own Drive):
   *Review permissions → your account → Advanced → Go to project (unsafe) → Allow.*
5. When it finishes, open **Execution log** and **copy the block** between
   `===== COPY BELOW =====` and `===== COPY ABOVE =====`.

## Step 2 — publish the config sheet (2 clicks)
The log gives you a link to the **CrewClock — App Config** sheet. Open it →
**File → Share → Publish to web → Publish**. Then in that dialog pick the
**EmployeesConfig** tab and **CSV** format, and copy that one link.

## Step 3 — paste both back to me
Paste (a) the copied COPY-BELOW block and (b) the one published CSV link.
That's everything I need — I'll write `src/config.js` for you (form URL, all 18
entry IDs, and all four CSV URLs) and confirm demo mode is off.

## Step 4 — deploy (I'll handle the setup; you click "deploy")
Tell me your host preference and I'll configure it. Then your crew gets links like
`https://your-site/?t=THEIR_TOKEN`.

---

### What the script builds for you
- **CrewClock — Admin** spreadsheet: all 10 tabs, headers, sample data, rates kept private.
- **CrewClock — App Config** spreadsheet: 4 sanitized tabs (no rates/PII), shared read-only.
- **CrewClock Events** form: 18 questions in order, linked into the `ClockEvents` tab.

### Three real test tokens are pre-loaded
After setup, you can immediately open `?t=1AF75ymkw8ASGmQY37QwiDTYwsAtSYmd`
(Alex Rivera) and clock in for real. Replace the sample rows with your real crew
and jobs whenever you're ready — just edit the Sheet, no redeploy needed.

# Google Form setup (the free write endpoint)

The app submits every clock event to a Google Form. The form pipes responses into your `ClockEvents` sheet. Anyone can POST to a form anonymously — that's exactly what we want, and no credentials live in the app.

---

## 1. Create the form

1. Go to <https://forms.google.com> → **Blank form**. Name it **CrewClock Events**.
2. Add **one "Short answer" question per ClockEvents field**, in this order (the order becomes the column order in the sheet):

   `event_id, employee_id, employee_name, employee_token_identifier, event_type, job_id, job_name, job_address, note_text, todo_id, todo_status, todo_completion_note, timestamp_local, timestamp_utc, timezone, device_info, user_agent, duplicate_check_key`

   - Make **none** of them required (the app sends only the fields relevant to each event).
   - For `note_text` / `completion_note` you may use "Paragraph" instead of "Short answer". Type doesn't affect submission.
3. **Settings → Responses → Collect email addresses: OFF**. Limit to 1 response: **OFF**. (Both must be off for anonymous repeat submissions.)

## 2. Link the form to your Admin sheet

Form → **Responses** tab → green Sheets icon → **Select existing spreadsheet** → your **Admin** workbook. Rename the created tab to **ClockEvents** (or point reports at it). The header row will match your question order.

---

## 3. Find the entry IDs (two easy ways)

Each question has a hidden id like `entry.123456789`. You need them for `src/config.js`.

**Way A — prefilled link (recommended):**
1. Form → ⋮ (top right) → **Get pre-filled link**.
2. Type a recognizable dummy value into each field — use the **field name itself** (type `event_id` into the event_id box, `employee_id` into the next, etc.).
3. Click **Get link** → **Copy link**. It looks like:
   ```
   .../viewform?usp=pp_url&entry.111111=event_id&entry.222222=employee_id&entry.333333=employee_name...
   ```
4. Each `entry.NNNN=<fieldname>` tells you the mapping. Copy each `entry.NNNN` to the matching key in `FORM.fields`.

**Way B — inspect the page:** open the live form, right-click → View source, search for `entry.` — but Way A is far faster and unambiguous.

## 4. Get the submit (action) URL

The form's view URL is `.../forms/d/e/FORM_ID/viewform`. The **submit** URL is the same with `formResponse`:
```
https://docs.google.com/forms/d/e/FORM_ID/formResponse
```
Put this in `src/config.js` → `FORM.actionUrl`.

---

## 5. Fill in `src/config.js`

```js
export const FORM = {
  actionUrl: "https://docs.google.com/forms/d/e/FORM_ID/formResponse",
  fields: {
    event_id: "entry.111111",
    employee_id: "entry.222222",
    employee_name: "entry.333333",
    // ...one line per question...
    duplicate_check_key: "entry.999999",
  },
};
```
As soon as `actionUrl` and the CSV URLs no longer contain `REPLACE`, demo mode switches off and the app submits for real.

---

## 6. Test a submission

**Manual test (no app):** open the prefilled link from step 3 in a browser and click **Submit** — confirm a row appears in `ClockEvents`.

**App test:** with config filled in, `npm run dev`, open `?t=<a real token>`, tap **Clock In**. Within a few seconds a `clock_in` row should land in the sheet. Because the form responds with an *opaque* (`no-cors`) response, the app can't read success directly — it assumes delivery once the request leaves the device and relies on `event_id` for de-duplication. The truth is always the sheet.

**Curl test (optional):**
```bash
curl -i "https://docs.google.com/forms/d/e/FORM_ID/formResponse" \
  --data-urlencode "entry.111111=test-event-id" \
  --data-urlencode "entry.222222=E001"
```
A `200`/`302` and a new sheet row mean it works.

---

## How the app submits (already implemented in `src/lib/sync.js`)

```js
await fetch(FORM.actionUrl, {
  method: "POST",
  mode: "no-cors",                       // Forms send no CORS headers
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ "entry.111111": eventId, ... }).toString(),
});
```
- `mode: "no-cors"` lets the browser send the POST even though Google won't return CORS headers. The response is opaque (we can't read status), which is fine: we treat "request sent" as success and de-dupe in the sheet.
- If `fetch` **rejects** (offline), the event stays in the queue and is retried automatically.

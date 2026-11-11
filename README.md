# Fiber Billing

A simple billing app for fiber splicing work. Track your work by **project → task → billing codes**, then generate an invoice to send to your contractor.

## How it works

1. **Add a project** – e.g. "Scarborough St".
2. **Add a task** for every splice case or terminal – e.g. "Splice Case 1 @ 123 Scarborough St".
3. **Add billing codes** to each task – tap a code to add it, tap again to bump the quantity (handy for `S120` fusion splices). Use the +/− buttons or type a number to adjust.
4. When the job is done, set the project to **Complete** and tap **Invoice** in the bottom bar.
5. On the invoice page tap **Print / PDF** to get a PDF to send to your contractor, or **CSV** for a spreadsheet.

The invoice shows a summary of every billing code (qty × rate) plus an optional task-by-task breakdown.

## Billing codes

The default codes come from the Community Fiber Solutions rate sheet (S105–S124). You can edit rates or add codes in **Settings**. Changing a rate only affects codes added afterwards – codes already on tasks keep the price they were added at.

## Settings

- Your name, business, phone, email and address (shown at the top of the invoice)
- Contractor name/address (the "Bill To")
- Payment terms and the next invoice number (auto-increments)

## Your data

Everything is saved in your browser on your device – no account or server needed, and it works offline. Use **Settings → Download backup** regularly, and **Restore from backup** to move data to another phone or computer. Clearing your browser data will erase it, so keep a backup.

## Running it

It's a plain static website (no build step).

- **On your phone (recommended):** enable GitHub Pages for this repo (Settings → Pages → Deploy from branch → `main` / root). Open the URL on your phone and use "Add to Home Screen" so it works like an app.
- **On a computer:** just open `index.html` in a browser, or run `python3 -m http.server` in this folder and visit http://localhost:8000.

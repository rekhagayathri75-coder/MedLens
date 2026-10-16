# SafeCircle - Living-Alone Check-In Circle

A consent-based check-in prototype. You set a daily check-in time, choose trusted
contacts, tap **I'm Okay**, and decide what should happen if you miss a check-in.

**Important:** every reminder and escalation step is **simulated**. SafeCircle never
sends a message, never tracks location, collects no health data, and is **not** an
emergency service. A missed check-in is not treated as proof that anyone is unsafe.

## Run it on Windows

Open **Command Prompt** (not PowerShell, to avoid script-permission issues) in this folder:

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

The app opens at http://localhost:8501. Next time, you only need:

```
venv\Scripts\activate
streamlit run app.py
```

(If `python` is not found, try `py` instead, e.g. `py -m venv venv`.)

## Run the automated tests

```
python -m unittest -v
```

## Files

| File | Job |
|---|---|
| `app.py` | The screens (Streamlit): dashboard, schedule, contacts, privacy, history, demo |
| `logic.py` | The rules: state flow, check-in, contacts, demo mode |
| `db.py` | SQLite tables and small read/write helpers |
| `test_logic.py` | Automated tests for `logic.py` and `db.py` |
| `.streamlit/config.toml` | Light theme and colours |
| `safecircle.db` | Created automatically on first run |

## The state flow

Upcoming -> Due -> Overdue (first reminder) -> Second confirmation prompt ->
Your chosen next action -> Checked in / resolved.

Timings come from your settings: grace period, and the gap between steps.

## Demo (no waiting)

1. **Demo mode** page -> *Reset demo data* (fictional contacts, clock set to 7:30 AM).
2. Scenario 1: Dashboard -> *I'm Okay* -> look at the timestamp and *Activity history*.
3. Scenario 2: *Simulate missed check-in* -> *Test next escalation step* (twice) ->
   open *Privacy & consent* and *Activity history* -> *I'm Okay* to resolve.

The "demo clock" only shifts the app's own idea of "now". Your computer's clock is untouched.

## Known limitations

- Reminders appear only inside the app, and only while the page is open. There are no
  push notifications, emails or SMS, by design.
- One user, one device, no login. Anyone with access to this computer can open the app.
- While the demo clock is on, timestamps in history use the demo clock.

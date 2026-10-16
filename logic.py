"""
logic.py - the "brain" of SafeCircle.

This file decides things like "what state is the check-in in right now?" and
"what happens when the user taps I'm Okay?". It never draws anything on the
screen (that is app.py's job) and never writes SQL (that is db.py's job).

The escalation stages
---------------------
    0  Upcoming                      (before the due time)
    1  Due                           (due time reached)
    2  Overdue - first reminder      (grace period has passed)
    3  Second confirmation prompt    ("are you okay?")
    4  Configured next action        (what the user chose)
    -  Checked in / resolved         (user tapped I'm Okay)

Every reminder here is SIMULATED: nothing is ever sent to anyone.
"""

from datetime import date, datetime, timedelta

import db

# ------------------------------------------------------------------ constants
STAGE_NAMES = [
    "Upcoming",
    "Due",
    "Overdue - first reminder",
    "Second confirmation prompt",
    "Your chosen next action",
]
FINAL_STAGE = 4

NEXT_ACTIONS = {
    "keep_reminding": "Keep reminding me in the app (nobody else is contacted)",
    "notify_contacts": "Prepare a gentle heads-up for my selected trusted contacts (simulated)",
    "stop_quietly": "Stop reminding me and contact nobody",
}

STATUS_BY_STAGE = {0: "upcoming", 1: "due", 2: "overdue", 3: "second_prompt", 4: "next_action"}

# status -> (label shown to the user, colour tone used by the UI)
STATUS_INFO = {
    "checked_in": ("Checked in", "ok"),
    "paused": ("Paused", "paused"),
    "resumed": ("Resumed - next check-in tomorrow", "info"),
    "upcoming": ("Upcoming", "info"),
    "due": ("Due now", "due"),
    "overdue": ("Overdue - first reminder", "alert"),
    "second_prompt": ("Second confirmation", "alert"),
    "next_action": ("Next action (simulated)", "alert"),
}


# ------------------------------------------------------------------ time helpers
def real_now():
    """The real clock. Tests replace this function with a fixed time."""
    return datetime.now().replace(microsecond=0)


def app_now(settings):
    """The app's clock = real clock + demo offset (0 when not demoing)."""
    return real_now() + timedelta(minutes=settings["demo_offset_minutes"])


def parse_time(text):
    return datetime.strptime(text, "%H:%M").time()


def due_datetime(settings, day):
    return datetime.combine(day, parse_time(settings["checkin_time"]))


def fmt_clock(dt):
    """09:05 -> '9:05 AM'"""
    return dt.strftime("%I:%M %p").lstrip("0")


def fmt_dt(dt):
    """Friday 16 Oct, 9:05 AM"""
    return f"{dt:%a %d %b}, {fmt_clock(dt)}"


def parse_ts(text):
    return datetime.strptime(text, db.TS_FORMAT)


def fmt_delta(delta):
    """Turn a time difference into friendly words: '1 h 30 min'."""
    minutes = int(abs(delta.total_seconds()) // 60)
    hours, mins = divmod(minutes, 60)
    if hours and mins:
        return f"{hours} h {mins} min"
    if hours:
        return f"{hours} h"
    return f"{mins} min"


def _time_stage(settings, due, now):
    """Which stage would we be in purely because of the clock?"""
    grace = timedelta(minutes=settings["grace_minutes"])
    gap = timedelta(minutes=settings["prompt_gap_minutes"])
    if now < due:
        return 0
    if now < due + grace:
        return 1
    if now < due + grace + gap:
        return 2
    if now < due + grace + 2 * gap:
        return 3
    return 4


# ------------------------------------------------------------------ activity log
def _log(conn, when, kind, message):
    db.log_activity(conn, when.strftime(db.TS_FORMAT), kind, message)


def _stage_message(conn, settings, stage):
    """The (kind, text) we write to history when a stage is reached."""
    if stage == 1:
        return "reminder", "Check-in is due now. A gentle reminder is shown in the app (simulated)."
    if stage == 2:
        return "reminder", (
            f"First reminder: the {settings['grace_minutes']}-minute grace period has passed. "
            "Shown in the app only (simulated)."
        )
    if stage == 3:
        return "reminder", 'Second confirmation prompt shown: "Just checking - are you okay?" (simulated).'
    # stage 4: depends on what the user configured
    action = settings["next_action"]
    if action == "notify_contacts":
        names = [c["name"] for c in list_selected_contacts(conn)]
        if names:
            return "escalation", (
                "Configured next action: a gentle heads-up would be prepared for "
                + ", ".join(names)
                + ". SIMULATED - nothing was sent to anyone."
            )
        return "escalation", (
            "Configured next action: prepare a heads-up for trusted contacts, but none are selected, "
            "so nobody would be contacted. SIMULATED."
        )
    if action == "keep_reminding":
        return "escalation", "Configured next action: keep reminding you in the app. Nobody else is contacted (simulated)."
    return "escalation", "Configured next action: stop reminding you. Nobody is contacted (simulated)."


def _advance_to(conn, settings, new_stage, now):
    """Log every stage between the stored one and new_stage, then store new_stage."""
    for stage in range(settings["escalation_stage"] + 1, new_stage + 1):
        kind, text = _stage_message(conn, settings, stage)
        _log(conn, now, kind, text)
    db.update_settings(conn, escalation_stage=new_stage)


def _close_old_cycle(conn, settings, now):
    """A new day started. If yesterday's alert never ended, note that in history once."""
    old_day = settings["cycle_date"]
    if not old_day or settings["escalation_stage"] < 2:
        return
    if db.get_checkin_for_date(conn, old_day):
        return
    _log(conn, now, "missed", (
        f"The check-in for {old_day} ended without a response. "
        "A missed check-in is not treated as a sign that anything is wrong."
    ))


# ------------------------------------------------------------------ contacts (read)
def list_selected_contacts(conn):
    return [c for c in db.list_contacts(conn) if c["include_in_escalation"]]


def draft_message(user_name):
    return (
        f"Hi! This is a gentle heads-up from {user_name}'s SafeCircle check-in routine. "
        f"{user_name} chose to let you know when a check-in is missed. They have not checked in "
        "yet today, which may simply mean they are busy. If it is convenient, a quick call or "
        "message to say hello would be kind. This is not an emergency alert."
    )


# ------------------------------------------------------------------ the main state function
def sync_state(conn):
    """
    Work out where the check-in flow is RIGHT NOW and return it as a dictionary.

    This runs on every Streamlit rerun. It is safe to call many times: it only
    writes to the database when something truly changed (a new stage was reached,
    or a new day started), so reruns never create duplicate history entries.
    """
    settings = db.get_settings(conn)
    now = app_now(settings)
    today_date = now.date()
    today_due = due_datetime(settings, today_date)
    yesterday_date = today_date - timedelta(days=1)
    yesterday_due = due_datetime(settings, yesterday_date)

    grace = timedelta(minutes=settings["grace_minutes"])
    gap = timedelta(minutes=settings["prompt_gap_minutes"])
    escalation_window = grace + 2 * gap

    # Determine if yesterday's check-in extends past midnight and is the active cycle
    if yesterday_due + escalation_window >= datetime.combine(today_date, datetime.min.time()) and now < yesterday_due + escalation_window + timedelta(hours=2):
        active_day = yesterday_date.isoformat()
        due = yesterday_due
        next_due_after_checkin = today_due
    else:
        active_day = today_date.isoformat()
        due = today_due
        next_due_after_checkin = due_datetime(settings, today_date + timedelta(days=1))

    # A new day or cycle? Close the old one and start fresh.
    if settings["cycle_date"] != active_day:
        first_run = settings["cycle_date"] is None  # brand-new install, or data was erased
        _close_old_cycle(conn, settings, now)
        db.update_settings(conn, cycle_date=active_day, escalation_stage=0)
        if first_run and due <= now:
            # Don't count a time that passed before the routine even existed as "missed".
            db.update_settings(conn, skip_date=active_day)
        settings = db.get_settings(conn)

    checkin = db.get_checkin_for_date(conn, active_day)
    stage = 0

    if checkin:
        status = "checked_in"
    elif settings["paused"]:
        status = "paused"
    elif settings["skip_date"] == active_day:
        status = "resumed"
    else:
        # The stage is whichever is further along: the clock, or a manual "test next step".
        stage = max(_time_stage(settings, due, now), settings["escalation_stage"])
        if stage > settings["escalation_stage"]:
            _advance_to(conn, settings, stage, now)
            settings = db.get_settings(conn)
        status = STATUS_BY_STAGE[stage]

    # When is the next check-in due?
    if checkin or status == "resumed" or (status == "paused" and due <= now):
        next_due = next_due_after_checkin
    else:
        next_due = due

    contacts = db.list_contacts(conn)
    label, tone = STATUS_INFO[status]
    return {
        "settings": settings,
        "now": now,
        "status": status,
        "label": label,
        "tone": tone,
        "stage": stage,
        "due": due,
        "next_due": next_due,
        "checkin": checkin,
        "last_checkin": db.get_last_checkin(conn),
        "contacts": contacts,
        "selected_contacts": [c for c in contacts if c["include_in_escalation"]],
        "demo_clock_on": settings["demo_offset_minutes"] != 0,
        "active_day": active_day,
    }


# ------------------------------------------------------------------ actions
def check_in(conn):
    """The "I'm Okay" button. Returns (success, message)."""
    state = sync_state(conn)
    now = state["now"]
    active_day = state.get("active_day", now.date().isoformat())

    saved = db.insert_checkin(conn, active_day, now.strftime(db.TS_FORMAT))
    if not saved:
        existing = state["checkin"]
        when = fmt_clock(parse_ts(existing["checked_at"])) if existing else "earlier"
        return False, f"You already checked in today at {when}. No duplicate was saved."

    _log(conn, now, "checkin", "Checked in - tapped \"I'm Okay\".")
    if state["stage"] >= 2:
        _log(conn, now, "resolved", "Alert resolved: you checked in, so the reminder flow was reset.")
    db.update_settings(conn, escalation_stage=0, skip_date=None, cycle_date=active_day)

    new_state = sync_state(conn)
    next_due = new_state["next_due"]
    name = state["settings"]["user_name"]
    return True, f"Thanks, {name}! You're checked in at {fmt_clock(now)}. Next check-in: {fmt_dt(next_due)}."


def set_schedule(conn, time_text, grace, gap, next_action, user_name):
    """Validate and save schedule settings. Raises ValueError with a friendly message."""
    try:
        parse_time(time_text)
    except (ValueError, TypeError):
        raise ValueError("Please choose a valid check-in time.")
    try:
        grace, gap = int(grace), int(gap)
    except (ValueError, TypeError):
        raise ValueError("Grace period and prompt gap must be whole numbers of minutes.")
    if not 1 <= grace <= 240:
        raise ValueError("Grace period must be between 1 and 240 minutes.")
    if not 1 <= gap <= 120:
        raise ValueError("Time between prompts must be between 1 and 120 minutes.")
    if next_action not in NEXT_ACTIONS:
        raise ValueError("Please choose one of the available next actions.")
    user_name = " ".join((user_name or "").split())
    if not user_name:
        raise ValueError("Please enter your first name.")
    if len(user_name) > 40:
        raise ValueError("Please keep your name under 40 characters.")

    old = db.get_settings(conn)
    now = app_now(old)
    changes = []
    if old["checkin_time"] != time_text:
        changes.append(f"Check-in time changed from {old['checkin_time']} to {time_text}.")
    if old["grace_minutes"] != grace:
        changes.append(f"Grace period changed from {old['grace_minutes']} to {grace} minutes.")
    if old["prompt_gap_minutes"] != gap:
        changes.append(f"Time between prompts changed from {old['prompt_gap_minutes']} to {gap} minutes.")
    if old["next_action"] != next_action:
        changes.append(f"Next action after the second prompt changed to: {NEXT_ACTIONS[next_action]}.")
    if old["user_name"] != user_name:
        changes.append("Your display name was changed.")
    if not changes:
        return []

    db.update_settings(
        conn, checkin_time=time_text, grace_minutes=grace, prompt_gap_minutes=gap,
        next_action=next_action, user_name=user_name,
    )

    # If the new time is already in the past today, don't instantly flag "overdue".
    if old["checkin_time"] != time_text:
        new = db.get_settings(conn)
        today = now.date().isoformat()
        if not db.get_checkin_for_date(conn, today) and not new["paused"]:
            already_past = due_datetime(new, now.date()) <= now
            db.update_settings(
                conn, skip_date=today if already_past else None, escalation_stage=0
            )
    for text in changes:
        _log(conn, now, "settings", text)
    return changes


def set_paused(conn, paused):
    settings = db.get_settings(conn)
    now = app_now(settings)
    if bool(settings["paused"]) == bool(paused):
        return
    if paused:
        db.update_settings(conn, paused=1)
        _log(conn, now, "settings", "Check-ins paused. No reminders will appear and nobody will be contacted.")
        return
    # Resuming: start clean, and don't punish the user for time spent paused.
    db.update_settings(conn, paused=0, escalation_stage=0)
    today = now.date().isoformat()
    new = db.get_settings(conn)
    if not db.get_checkin_for_date(conn, today) and due_datetime(new, now.date()) <= now:
        db.update_settings(conn, skip_date=today)
    _log(conn, now, "settings", "Check-ins resumed.")


# ------------------------------------------------------------------ contacts (write)
def _clean_contact(conn, name, method, exclude_id=None):
    name = " ".join((name or "").split())
    method = " ".join((method or "").split())
    if not name:
        raise ValueError("Please enter a name for the contact.")
    if len(name) > 60:
        raise ValueError("Please keep the name under 60 characters.")
    if len(method) > 100:
        raise ValueError("Please keep the contact method under 100 characters.")
    if db.find_contact_by_name(conn, name, exclude_id):
        raise ValueError(f"You already have a contact named {name}.")
    return name, method


def add_contact(conn, name, method, include=True):
    name, method = _clean_contact(conn, name, method)
    db.insert_contact(conn, name, method, include)
    _log(conn, app_now(db.get_settings(conn)), "contacts", f"Trusted contact added: {name}.")


def edit_contact(conn, contact_id, name, method, include):
    if not db.get_contact(conn, contact_id):
        raise ValueError("That contact no longer exists.")
    name, method = _clean_contact(conn, name, method, exclude_id=contact_id)
    db.update_contact(conn, contact_id, name, method, include)
    _log(conn, app_now(db.get_settings(conn)), "contacts", f"Trusted contact updated: {name}.")


def remove_contact(conn, contact_id):
    contact = db.get_contact(conn, contact_id)
    if not contact:
        raise ValueError("That contact no longer exists.")
    db.delete_contact(conn, contact_id)
    _log(conn, app_now(db.get_settings(conn)), "contacts", f"Trusted contact removed: {contact['name']}.")


# ------------------------------------------------------------------ demo mode
def simulate_missed(conn):
    """Jump the app clock to just after the grace period so the check-in is overdue."""
    settings = db.get_settings(conn)
    now = app_now(settings)

    due = due_datetime(settings, now.date())
    target = due + timedelta(minutes=settings["grace_minutes"] + 1)

    note = ""
    if db.delete_checkin_for_date(conn, due.date().isoformat()):
        note = " Today's check-in was cleared so the scenario can be shown."

    offset = round((target - real_now()).total_seconds() / 60)

    db.update_settings(
        conn, demo_offset_minutes=offset, escalation_stage=0, cycle_date=due.date().isoformat(),
        skip_date=None, paused=0,
    )
    _log(conn, target, "simulation", "DEMO: simulated a missed check-in by moving the demo clock forward." + note)
    sync_state(conn)  # logs the reminder steps that are now reached
    return "Simulated a missed check-in. The demo clock moved forward - no real time had to pass."


def advance_escalation(conn):
    """The "Test next escalation step" button. Returns (success, message)."""
    state = sync_state(conn)
    if state["status"] == "checked_in":
        return False, "Already checked in today. Use 'Simulate missed check-in' to start the missed flow."
    if state["status"] == "paused":
        return False, "Check-ins are paused. Resume them first."
    if state["status"] == "resumed":
        return False, "No check-in is required right now. Use 'Simulate missed check-in' to start the missed flow."
    if state["stage"] >= FINAL_STAGE:
        return False, "Already at the final step. Tap I'm Okay to resolve it, or simulate again."
    _advance_to(conn, state["settings"], state["stage"] + 1, state["now"])
    return True, f"Moved to: {STAGE_NAMES[state['stage'] + 1]} (simulated)."


def reset_demo(conn):
    """Wipe everything and load fictional sample data. Clock set to 7:30 AM today."""
    db.wipe_all(conn)
    real = real_now()
    sim_now = real.replace(hour=7, minute=30, second=0)
    offset = round((sim_now - real).total_seconds() / 60)

    db.update_settings(
        conn, user_name="Alex", checkin_time="09:00", paused=0, grace_minutes=30,
        prompt_gap_minutes=15, next_action="notify_contacts", demo_offset_minutes=offset,
        cycle_date=sim_now.date().isoformat(), escalation_stage=0, skip_date=None,
    )
    db.insert_contact(conn, "Maya (sister)", "maya@example.com (fictional)", True)
    db.insert_contact(conn, "Sam (neighbour)", "555-0101 (fictional)", True)
    db.insert_contact(conn, "Priya (friend)", "", False)

    for days_ago, clock in ((3, "08:41:00"), (2, "09:03:00"), (1, "08:52:00")):
        day = (sim_now - timedelta(days=days_ago)).date().isoformat()
        db.insert_checkin(conn, day, f"{day} {clock}")
        db.log_activity(conn, f"{day} {clock}", "checkin", "Checked in - tapped \"I'm Okay\".")
    _log(conn, sim_now, "simulation", "DEMO: sample data with fictional contacts was loaded.")
    return "Demo data reloaded. The demo clock is set to 7:30 AM today."


def return_to_real_time(conn):
    settings = db.get_settings(conn)
    if settings["demo_offset_minutes"] == 0:
        return "The app is already using the real clock."
    _log(conn, app_now(settings), "simulation", "DEMO: the demo clock was switched back to real time.")
    db.update_settings(conn, demo_offset_minutes=0)
    sync_state(conn)
    return "Back on the real clock."


def erase_all_data(conn):
    """Privacy control: delete everything this app has stored."""
    db.wipe_all(conn)


# ------------------------------------------------------------------ preview for the privacy page
def timeline_preview(settings):
    """Show when each step would happen, based on the user's own settings."""
    base = datetime.combine(date.today(), parse_time(settings["checkin_time"]))
    grace = timedelta(minutes=settings["grace_minutes"])
    gap = timedelta(minutes=settings["prompt_gap_minutes"])
    steps = [
        ("Check-in is due", base),
        ("First reminder (in the app)", base + grace),
        ("Second confirmation prompt", base + grace + gap),
        ("Your chosen next action", base + grace + 2 * gap),
    ]
    return [(label, fmt_clock(when) + (" (next day)" if when.date() != base.date() else ""))
            for label, when in steps]

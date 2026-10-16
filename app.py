"""
app.py - the SCREEN of SafeCircle (built with Streamlit).

Run it with:   streamlit run app.py

How Streamlit works (the one thing to know): every time you click a button,
Streamlit re-runs this whole file from top to bottom. That is why all the
important information lives in the database (db.py) and not in variables.
"""

import html
import sqlite3

import streamlit as st

import db
import logic

st.set_page_config(page_title="SafeCircle", page_icon="🤝", layout="wide")

PAGES = [
    "Dashboard",
    "Schedule",
    "Trusted contacts",
    "Privacy & consent",
    "Activity history",
    "Demo mode",
]

CSS = """
<style>
.block-container {max-width: 1100px; padding-top: 2rem;}
.sc-title {font-size: 2rem; font-weight: 700; color: #173B3E; margin-bottom: 0;}
.sc-subtitle {color: #4A6567; margin-bottom: 1.2rem;}

.sc-card {background: #FFFFFF; border: 1px solid #DCE8E8; border-radius: 16px;
          padding: 1rem 1.2rem; box-shadow: 0 1px 3px rgba(20,60,60,.07); min-height: 8.5rem;}
.sc-card .label {font-size: .8rem; text-transform: uppercase; letter-spacing: .05em;
                 color: #3F5B5D; font-weight: 600;}
.sc-card .value {font-size: 1.4rem; font-weight: 700; color: #173B3E; margin: .3rem 0;}
.sc-card .sub {font-size: .9rem; color: #3F5B5D;}
.tone-ok {border-top: 6px solid #2E8B57;}
.tone-info {border-top: 6px solid #1F6F78;}
.tone-due {border-top: 6px solid #D99A1E;}
.tone-alert {border-top: 6px solid #D9776A;}
.tone-paused {border-top: 6px solid #7A8A94;}

.sc-banner {border-radius: 14px; padding: .9rem 1.2rem; margin: .5rem 0 1rem 0; font-size: 1.05rem;}
.banner-ok {background: #E4F3EA; color: #155236;}
.banner-info {background: #E3F0F2; color: #124C54;}
.banner-due {background: #FFF3D6; color: #6B4A06;}
.banner-alert {background: #FCE9E5; color: #7A2E22;}
.banner-paused {background: #ECEFF1; color: #3C4A53;}
.banner-demo {background: #EDE7F6; color: #43306B; font-size: .95rem;}

.sc-steps {display: flex; flex-wrap: wrap; gap: .5rem; margin: .5rem 0 1rem 0;}
.sc-step {padding: .4rem .9rem; border-radius: 999px; background: #E3ECEC; color: #35585A; font-size: .88rem;}
.sc-step.done {background: #D3EBDB; color: #1B5A38;}
.sc-step.current {background: #1F6F78; color: #FFFFFF; font-weight: 700;}

.sc-simbox {background: #FFFFFF; border: 2px dashed #9DB8BA; border-radius: 14px; padding: 1rem 1.2rem; color: #173B3E;}
.sc-simtag {display: inline-block; background: #43306B; color: #FFFFFF; font-size: .75rem; font-weight: 700;
            padding: .1rem .6rem; border-radius: 999px; margin-bottom: .5rem; letter-spacing: .04em;}

.sc-row {background: #FFFFFF; border: 1px solid #DCE8E8; border-radius: 12px; padding: .7rem 1rem; margin-bottom: .5rem;}
.sc-row .when {font-size: .82rem; color: #4A6567;}
.sc-row .msg {color: #173B3E; margin-top: .2rem;}
.sc-badge {display: inline-block; font-size: .75rem; font-weight: 700; padding: .1rem .6rem;
           border-radius: 999px; margin-right: .5rem; background: #E3ECEC; color: #35585A;}
.b-checkin, .b-resolved {background: #D3EBDB; color: #1B5A38;}
.b-reminder {background: #FFF0CC; color: #6B4A06;}
.b-escalation, .b-missed {background: #FBDDD7; color: #7A2E22;}
.b-simulation {background: #EDE7F6; color: #43306B;}

/* Big, friendly "I'm Okay" button (the only primary button in the app) */
button[kind="primary"], button[data-testid="stBaseButton-primary"] {
    background: #1F7A4D !important; color: #FFFFFF !important; border: none !important;
    font-size: 1.7rem !important; font-weight: 700 !important; border-radius: 20px !important;
    min-height: 4.5rem; box-shadow: 0 4px 10px rgba(31,122,77,.28);
}
button[kind="primary"]:hover, button[data-testid="stBaseButton-primary"]:hover {background: #186540 !important;}
button[kind="primary"]:disabled, button[data-testid="stBaseButton-primary"]:disabled {opacity: .55;}
div.stButton > button {width: 100%;}
</style>
"""


# ============================================================ small helpers
def esc(value):
    """Make text safe to place inside our HTML (stops stray < > & characters)."""
    return html.escape(str(value))


def run(fn, *args, **kwargs):
    """Open the database, call one logic function, save, close."""
    with db.connect() as conn:
        return fn(conn, *args, **kwargs)


def flash(kind, text):
    """Remember a message to show after the next rerun. kind: success/info/warning/error."""
    st.session_state["flash"] = (kind, text)


def show_flash():
    message = st.session_state.pop("flash", None)
    if message:
        kind, text = message
        getattr(st, kind)(text)


def card(label, value, sub="", tone="info"):
    return (
        f'<div class="sc-card tone-{tone}"><div class="label">{esc(label)}</div>'
        f'<div class="value">{esc(value)}</div><div class="sub">{esc(sub)}</div></div>'
    )


def banner(text, tone="info"):
    st.markdown(f'<div class="sc-banner banner-{tone}">{text}</div>', unsafe_allow_html=True)


def empty_state(icon, title, text):
    st.markdown(
        f'<div class="sc-card tone-info" style="text-align:center;min-height:0">'
        f'<div style="font-size:2rem">{icon}</div><div class="value">{esc(title)}</div>'
        f'<div class="sub">{esc(text)}</div></div>',
        unsafe_allow_html=True,
    )


def stepper(state):
    """The six-step flow, with the current step highlighted."""
    names = logic.STAGE_NAMES + ["Checked in / resolved"]
    if state["status"] == "checked_in":
        current = 5
    elif state["status"] in ("paused", "resumed"):
        current = -1
    else:
        current = state["stage"]
    parts = []
    for i, name in enumerate(names):
        css = "sc-step"
        if i == current:
            css += " current"
        elif 0 <= current and i < current:
            css += " done"
        parts.append(f'<span class="{css}">{i + 1}. {esc(name)}</span>')
    st.markdown(f'<div class="sc-steps">{"".join(parts)}</div>', unsafe_allow_html=True)


# ============================================================ shared pieces
def demo_clock_banner(state):
    if state["demo_clock_on"]:
        banner(
            f"🎬 <b>Demo clock is on.</b> The app thinks it is "
            f"<b>{esc(logic.fmt_dt(state['now']))}</b>. Use <i>Return to real time</i> on the Demo page to switch it off.",
            "demo",
        )


if hasattr(st, "dialog"):
    @st.dialog("Confirm Demo Data Reset")
    def confirm_reset_dialog():
        st.warning(
            "⚠️ **Warning:** Resetting demo data will erase all current settings, contacts, "
            "check-ins, and activity history, replacing them with fictional sample data."
        )
        st.write("Are you sure you want to proceed?")
        c1, c2 = st.columns(2)
        with c1:
            if st.button("Yes, reset demo data", type="primary", key="dialog_confirm_reset_yes"):
                flash("success", run(logic.reset_demo))
                st.rerun()
        with c2:
            if st.button("Cancel", key="dialog_cancel_reset_no"):
                st.rerun()


def demo_controls(prefix):
    """The four demo buttons. 'prefix' keeps their keys unique when shown on two pages."""
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        if st.button("🔄 Reset demo data", key=f"{prefix}_reset"):
            if hasattr(st, "dialog"):
                confirm_reset_dialog()
            else:
                st.session_state[f"show_reset_{prefix}"] = True
    with c2:
        if st.button("⏰ Simulate missed check-in", key=f"{prefix}_missed"):
            flash("info", run(logic.simulate_missed))
            st.rerun()
    with c3:
        if st.button("⏭ Test next escalation step", key=f"{prefix}_next"):
            ok, msg = run(logic.advance_escalation)
            flash("info" if ok else "warning", msg)
            st.rerun()
    with c4:
        if st.button("🕒 Return to real time", key=f"{prefix}_real"):
            flash("info", run(logic.return_to_real_time))
            st.rerun()

    # Fallback confirmation for environments where st.dialog is not available
    if not hasattr(st, "dialog") and st.session_state.get(f"show_reset_{prefix}"):
        st.warning(
            "⚠️ **Warning:** Resetting demo data will erase all current settings, contacts, "
            "check-ins, and activity history, replacing them with fictional sample data."
        )
        conf_a, conf_b = st.columns(2)
        with conf_a:
            if st.button("Yes, reset demo data", type="primary", key=f"{prefix}_confirm_reset_action"):
                st.session_state[f"show_reset_{prefix}"] = False
                flash("success", run(logic.reset_demo))
                st.rerun()
        with conf_b:
            if st.button("Cancel", key=f"{prefix}_cancel_reset_action"):
                st.session_state[f"show_reset_{prefix}"] = False
                st.rerun()


# ============================================================ pages
def page_dashboard(state):
    s = state["settings"]
    st.markdown(f'<div class="sc-title">Hello, {esc(s["user_name"])} 👋</div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="sc-subtitle">A gentle check-in routine. You decide who is included, '
        "and what happens if a check-in is missed.</div>",
        unsafe_allow_html=True,
    )
    demo_clock_banner(state)

    # --- The big button, right at the top
    if state["status"] == "checked_in":
        when = logic.fmt_clock(logic.parse_ts(state["checkin"]["checked_at"]))
        banner(f"✅ You checked in today at <b>{esc(when)}</b>. Nothing else to do - have a good day!", "ok")
        st.button("✅ Checked in for today", type="primary", disabled=True, key="okay_done")
    else:
        if st.button("✅ I'm Okay", type="primary", key="okay_main"):
            ok, msg = run(logic.check_in)
            flash("success" if ok else "info", msg)
            st.rerun()

    st.write("")

    # --- Five status cards
    c1, c2, c3, c4 = st.columns(4)
    with c1:
        sub = {
            "checked_in": "Nice and easy.",
            "paused": "Reminders are switched off.",
            "resumed": "No check-in needed until tomorrow.",
        }.get(state["status"], f"Due at {logic.fmt_clock(state['due'])}")
        st.markdown(card("Today's check-in", state["label"], sub, state["tone"]), unsafe_allow_html=True)
    with c2:
        if state["status"] == "paused":
            value, sub = "Paused", f"Would be {logic.fmt_dt(state['next_due'])}"
        else:
            value = logic.fmt_dt(state["next_due"])
            delta = state["next_due"] - state["now"]
            sub = f"in {logic.fmt_delta(delta)}" if delta.total_seconds() > 0 else f"{logic.fmt_delta(delta)} ago"
        st.markdown(card("Next scheduled check-in", value, sub, "info"), unsafe_allow_html=True)
    with c3:
        last = state["last_checkin"]
        if last:
            when = logic.parse_ts(last["checked_at"])
            st.markdown(card("Last successful check-in", logic.fmt_dt(when), "Saved on this computer", "ok"),
                        unsafe_allow_html=True)
        else:
            st.markdown(card("Last successful check-in", "None yet", "Tap I'm Okay to start", "info"),
                        unsafe_allow_html=True)
    with c4:
        total, chosen = len(state["contacts"]), len(state["selected_contacts"])
        sub = "Nobody is messaged automatically in this prototype"
        st.markdown(card("Trusted contacts", f"{total}", f"{chosen} selected for escalation. {sub}", "info"),
                    unsafe_allow_html=True)

    # --- Reminder / escalation status
    col_stat_title, col_stat_ref = st.columns([3, 1])
    with col_stat_title:
        st.subheader("Reminder & escalation status")
    with col_stat_ref:
        if st.button("🔄 Refresh status", key="dash_refresh_btn", use_container_width=True):
            st.rerun()
    stepper(state)
    render_escalation_panel(state)

    st.subheader("Demo controls")
    st.caption("For presenters. Everything here is simulated; no real time has to pass.")
    demo_controls("dash")


def render_escalation_panel(state):
    s, status = state["settings"], state["status"]
    if status == "checked_in":
        banner("Today's check-in is done. The reminder flow is reset.", "ok")
    elif status == "paused":
        banner("⏸ Your routine is paused. No reminders will appear and nobody will be contacted.", "paused")
    elif status == "resumed":
        banner("Your routine is back on. The next check-in is tomorrow.", "info")
    elif status == "upcoming":
        banner(f"Nothing needed yet. Your check-in is due at <b>{esc(logic.fmt_clock(state['due']))}</b>.", "info")
    elif status == "due":
        banner("🔔 Your check-in is due now. Tap <b>I'm Okay</b> whenever you're ready.", "due")
    elif status == "overdue":
        banner(
            "🔔 <b>Gentle reminder:</b> you haven't checked in yet. This doesn't mean anything is wrong "
            "- tap <b>I'm Okay</b> to clear this reminder. <i>(Simulated, in-app only.)</i>",
            "alert",
        )
    elif status == "second_prompt":
        banner(
            "💬 <b>Just checking - are you okay?</b> Tap <b>I'm Okay</b> to end this. If there's no response, "
            "your chosen next action happens next. <i>(Simulated.)</i>",
            "alert",
        )
    else:  # next_action
        render_next_action(state)


def render_next_action(state):
    s = state["settings"]
    action = s["next_action"]
    st.markdown(
        '<div class="sc-simbox"><span class="sc-simtag">SIMULATED - NOTHING WAS SENT</span><br>'
        f"<b>Your chosen next action:</b> {esc(logic.NEXT_ACTIONS[action])}</div>",
        unsafe_allow_html=True,
    )
    st.write("")
    if action == "notify_contacts":
        selected = state["selected_contacts"]
        if selected:
            names = ", ".join(c["name"] for c in selected)
            st.markdown(f"**Would be prepared for:** {esc(names)}")
            st.text_area("Draft heads-up (this is only a preview; SafeCircle never sends it)",
                         value=logic.draft_message(s["user_name"]), height=150, disabled=True)
        else:
            st.warning("You chose to prepare a heads-up for trusted contacts, but none are selected. "
                       "So nobody would be contacted. You can choose contacts on the Trusted contacts page.")
    elif action == "keep_reminding":
        st.info("In this mode the app would keep showing reminders to you. Nobody else is contacted.")
    else:
        st.info("In this mode the reminders stop and nobody is contacted. Check in whenever you're ready.")
    st.caption("A missed check-in is not proof that anyone is unsafe. SafeCircle is not an emergency service.")


def page_schedule(state):
    s = state["settings"]
    st.header("Check-in schedule")
    demo_clock_banner(state)

    c1, c2, c3 = st.columns(3)
    with c1:
        due_text = logic.fmt_clock(logic.due_datetime(s, state["now"].date()))
        st.markdown(card("Daily check-in time", due_text, f"Grace period: {s['grace_minutes']} min", "info"),
                    unsafe_allow_html=True)
    with c2:
        if state["status"] == "paused":
            st.markdown(card("Next check-in due", "Paused", f"Would be {logic.fmt_dt(state['next_due'])}", "paused"),
                        unsafe_allow_html=True)
        else:
            st.markdown(card("Next check-in due", logic.fmt_dt(state["next_due"]), state["label"], state["tone"]),
                        unsafe_allow_html=True)
    with c3:
        st.markdown(card("After the second prompt", logic.NEXT_ACTIONS[s["next_action"]].split(" (")[0], "", "info"),
                    unsafe_allow_html=True)

    st.write("")
    if s["paused"]:
        st.warning("Your routine is paused. No reminders will appear and nobody will be contacted.")
        if st.button("▶ Resume check-ins", key="resume"):
            run(logic.set_paused, False)
            flash("success", "Check-ins resumed.")
            st.rerun()
    else:
        if st.button("⏸ Pause check-ins", key="pause"):
            run(logic.set_paused, True)
            flash("info", "Check-ins paused. You can resume any time.")
            st.rerun()

    st.subheader("Change your routine")
    if s["next_action"] == "notify_contacts" and not state["selected_contacts"]:
        st.warning("Your next action is to prepare a heads-up for trusted contacts, but none are selected yet. "
                   "Until you select some, nobody would be contacted.")
    with st.form("schedule_form"):
        name = st.text_input("Your first name (used in the draft message)", value=s["user_name"], max_chars=40)
        check_time = st.time_input("Daily check-in time", value=logic.parse_time(s["checkin_time"]))
        grace = st.number_input("Grace period (minutes after the due time before the first reminder)",
                                min_value=1, max_value=240, value=int(s["grace_minutes"]), step=5)
        gap = st.number_input("Minutes between the first reminder, second prompt and next action",
                              min_value=1, max_value=120, value=int(s["prompt_gap_minutes"]), step=5)
        keys = list(logic.NEXT_ACTIONS)
        action = st.selectbox("What should happen after the second prompt?", options=keys,
                              index=keys.index(s["next_action"]), format_func=lambda k: logic.NEXT_ACTIONS[k])
        submitted = st.form_submit_button("Save schedule")
    if submitted:
        try:
            changes = run(logic.set_schedule, check_time.strftime("%H:%M"), grace, gap, action, name)
        except ValueError as err:
            st.error(str(err))
        else:
            flash("success" if changes else "info",
                  "Schedule saved." if changes else "Nothing changed - those settings were already saved.")
            st.rerun()


def page_contacts(state):
    st.header("Trusted contacts")
    demo_clock_banner(state)
    st.info(
        "**Adding a contact does not send them anything.** SafeCircle never messages anyone automatically. "
        "A contact only appears in the *simulated* next-action step if you tick “include in escalation”. "
        "We store just a name and an optional contact method that you type."
    )

    st.subheader("Add a contact")
    with st.form("add_contact_form", clear_on_submit=True):
        name = st.text_input("Name", max_chars=60, placeholder="e.g. Maya (sister)")
        method = st.text_input("Contact method (optional)", max_chars=100, placeholder="e.g. a phone number or email")
        include = st.checkbox("Include in escalation (the simulated next-action step)", value=True)
        added = st.form_submit_button("Add contact")
    if added:
        try:
            run(logic.add_contact, name, method, include)
        except ValueError as err:
            st.error(str(err))
        else:
            flash("success", "Contact added. Nobody has been notified.")
            st.rerun()

    st.subheader("Your contacts")
    contacts = state["contacts"]
    if not contacts:
        empty_state("👥", "No trusted contacts yet",
                    "Add someone above if you'd like them in your circle. You can leave this empty too.")
        return
    for c in contacts:
        badge = "included in escalation" if c["include_in_escalation"] else "not included in escalation"
        with st.expander(f"{c['name']}  -  {badge}"):
            with st.form(f"edit_contact_{c['id']}"):
                new_name = st.text_input("Name", value=c["name"], max_chars=60)
                new_method = st.text_input("Contact method (optional)", value=c["method"], max_chars=100)
                new_include = st.checkbox("Include in escalation", value=bool(c["include_in_escalation"]))
                col_a, col_b = st.columns(2)
                with col_a:
                    save = st.form_submit_button("Save changes")
                with col_b:
                    remove = st.form_submit_button("Remove contact")
            if save:
                try:
                    run(logic.edit_contact, c["id"], new_name, new_method, new_include)
                except ValueError as err:
                    st.error(str(err))
                else:
                    flash("success", "Contact updated.")
                    st.rerun()
            if remove:
                try:
                    run(logic.remove_contact, c["id"])
                except ValueError as err:
                    st.error(str(err))
                else:
                    flash("success", f"{c['name']} was removed.")
                    st.rerun()


def page_privacy(state):
    s = state["settings"]
    st.header("Privacy & consent")
    demo_clock_banner(state)
    st.write("SafeCircle is built around your choices. Here is exactly what it does and doesn't do.")

    st.subheader("1. What information is stored")
    st.markdown(
        "Everything is kept in one file on **this computer** (`safecircle.db`). No account, no internet service.\n\n"
        "| Stored | Why |\n|---|---|\n"
        "| Your first name | To personalise messages |\n"
        "| Your check-in time, grace period and chosen next action | To run your routine |\n"
        "| The date and time of each check-in | To show your history |\n"
        "| Each trusted contact's name and optional contact method you typed | So you can choose who is in your circle |\n"
        "| An activity history (check-ins, reminder steps, settings changes) | So everything is visible to you |"
    )
    st.markdown(
        "**Not collected:** your location, health information, phone contacts, device identifiers, "
        "or the content of any messages. Nothing runs in the background, and nothing is tracked."
    )

    st.subheader("2. Trusted contacts you selected")
    if not state["contacts"]:
        st.write("You haven't added any contacts, so nobody is part of your circle.")
    else:
        for c in state["contacts"]:
            mark = "✅ Selected" if c["include_in_escalation"] else "⬜ Not selected"
            st.markdown(f"- **{esc(c['name'])}** - {mark}")
        st.caption("Adding a contact never sends them anything. In this prototype nobody is ever messaged.")

    st.subheader("3. What happens after a missed check-in")
    st.write("Based on your current settings (times shown for a normal day):")
    for label, when in logic.timeline_preview(s):
        st.markdown(f"- **{when}** - {label}")
    st.markdown(f"**Your chosen next action:** {esc(logic.NEXT_ACTIONS[s['next_action']])}")
    st.info(
        "All reminders are **simulated** in this prototype: nothing is really sent. "
        "A missed check-in is **not** treated as proof that you are unsafe, and SafeCircle is **not** an "
        "emergency service. In an emergency, contact your local emergency number."
    )

    st.subheader("4. Your controls")
    st.markdown(
        "- **Pause or resume** the routine on the *Schedule* page (pausing switches off all reminders).\n"
        "- **Change** your time, grace period or next action on the *Schedule* page.\n"
        "- **Add, edit or remove** contacts on the *Trusted contacts* page.\n"
        "- **See everything** that happened on the *Activity history* page."
    )
    status_text = "paused" if s["paused"] else "active"
    st.write(f"Your routine is currently **{status_text}**.")

    st.markdown("**Erase everything SafeCircle has stored about you**")
    with st.form("erase_form", clear_on_submit=True):
        confirm = st.checkbox("I understand this deletes my schedule, contacts, check-ins and history.")
        erase = st.form_submit_button("Erase all my data")
    if erase:
        if confirm:
            run(logic.erase_all_data)
            flash("success", "All data erased. SafeCircle is back to a clean start.")
            st.rerun()
        else:
            st.warning("Please tick the box first to confirm.")


def page_history(state):
    st.header("Activity history")
    demo_clock_banner(state)
    labels = {
        "checkin": "Check-in", "resolved": "Resolved", "reminder": "Reminder step",
        "escalation": "Next action", "missed": "Missed check-in", "simulation": "Demo",
        "settings": "Settings", "contacts": "Contacts",
    }
    entries = run(db.get_activity, 200)
    choice = st.selectbox("Show", ["Everything"] + list(labels.values()))
    if choice != "Everything":
        entries = [e for e in entries if labels.get(e["kind"]) == choice]
    if not entries:
        empty_state("📜", "Nothing here yet",
                    "Your check-ins, reminder steps and settings changes will appear here with timestamps.")
        return
    st.caption("Newest first. Entries marked “simulated” never contacted anyone.")
    for e in entries:
        when = logic.fmt_dt(logic.parse_ts(e["ts"]))
        label = labels.get(e["kind"], e["kind"])
        st.markdown(
            f'<div class="sc-row"><div class="when">{esc(when)}</div>'
            f'<span class="sc-badge b-{esc(e["kind"])}">{esc(label)}</span>'
            f'<span class="msg">{esc(e["message"])}</span></div>',
            unsafe_allow_html=True,
        )


def page_demo(state):
    st.header("Demo mode")
    demo_clock_banner(state)
    st.write(
        "Run the whole story without waiting for real time to pass. "
        "The *demo clock* simply shifts the app's idea of “now”; it never touches your computer's clock."
    )
    demo_controls("demo")
    st.subheader("Scenario 1 - successful check-in")
    st.markdown(
        "1. Press **Reset demo data** (fictional contacts, clock set to 7:30 AM).\n"
        "2. Open **Dashboard** and **Schedule** to show the routine.\n"
        "3. Tap **I'm Okay**.\n"
        "4. Show the new timestamp on the Dashboard, then open **Activity history**."
    )
    st.subheader("Scenario 2 - missed check-in")
    st.markdown(
        "1. Press **Simulate missed check-in** - the first reminder appears.\n"
        "2. Press **Test next escalation step** - the second confirmation prompt appears.\n"
        "3. Press it again - your configured next action appears, clearly labelled *simulated*.\n"
        "4. Open **Privacy & consent** and **Activity history**.\n"
        "5. Tap **I'm Okay** to show the alert being resolved."
    )
    st.caption("Everything on this page is simulated. No messages, notifications or location lookups exist in this app.")


# ============================================================ main
def main():
    st.markdown(CSS, unsafe_allow_html=True)
    try:
        db.init_db()
        state = run(logic.sync_state)

        with st.sidebar:
            st.markdown("### 🤝 SafeCircle")
            page = st.radio("Go to", PAGES, key="page")
            st.write("")
            if st.button("🔄 Refresh status", key="sidebar_refresh", use_container_width=True):
                st.rerun()
            auto_live = st.checkbox("Live auto-refresh (every 10s)", value=False, key="auto_refresh_toggle")
            st.caption("🔒 Your data stays on this computer. Nobody is contacted automatically.")

        # Non-intrusive live auto-refresh for overview screens (Dashboard and Demo)
        if auto_live and page in ("Dashboard", "Demo mode"):
            import streamlit.components.v1 as components
            components.html(
                """
                <script>
                setTimeout(function() {
                    window.parent.location.reload();
                }, 10000);
                </script>
                """,
                height=0,
                width=0,
            )

        show_flash()
        {
            "Dashboard": page_dashboard,
            "Schedule": page_schedule,
            "Trusted contacts": page_contacts,
            "Privacy & consent": page_privacy,
            "Activity history": page_history,
            "Demo mode": page_demo,
        }[page](state)
    except Exception as err:
        st.markdown('<div class="sc-title">SafeCircle 🤝</div>', unsafe_allow_html=True)
        st.error(
            "**Database Startup Issue:** Something went wrong with the local database (`safecircle.db`). "
            "The database could not be opened or initialized properly."
        )
        st.caption(f"Technical details: {err}")
        st.write("")
        st.info(
            "Your data stays on this computer. If the database file is corrupted or unreadable, "
            "you can delete the local database and start fresh with a clean database:"
        )
        col_wipe, _ = st.columns([1, 2])
        with col_wipe:
            if st.button("🗑 Delete local data and start fresh", type="primary", key="startup_reset_data"):
                try:
                    if db.DB_PATH.exists():
                        db.DB_PATH.unlink()
                    db.init_db()
                    st.success("Local data deleted. Starting fresh with clean database...")
                    st.rerun()
                except Exception as reset_err:
                    st.error(f"Could not automatically delete the file: {reset_err}")
                    st.warning(f"Please manually delete the file: {db.DB_PATH}")


main()

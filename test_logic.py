"""
Automated checks for SafeCircle's logic. Run with:   python -m unittest -v

These tests use a temporary database and a fixed "real" clock, so they never
touch your real data and never depend on what time it is when you run them.
"""

import os
import tempfile
import unittest
from datetime import datetime, timedelta

import db
import logic

FIXED_NOW = {"value": datetime(2026, 10, 16, 12, 0, 0)}


class SafeCircleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        db.DB_PATH = os.path.join(self.tmp.name, "test.db")
        FIXED_NOW["value"] = datetime(2026, 10, 16, 12, 0, 0)
        logic.real_now = lambda: FIXED_NOW["value"]
        db.init_db()
        with db.connect() as conn:
            logic.reset_demo(conn)

    def tearDown(self):
        self.tmp.cleanup()

    # small helpers -------------------------------------------------------
    def state(self):
        with db.connect() as conn:
            return logic.sync_state(conn)

    def history(self):
        with db.connect() as conn:
            return db.get_activity(conn)

    def run_logic(self, fn, *args):
        with db.connect() as conn:
            return fn(conn, *args)

    # tests ---------------------------------------------------------------
    def test_tables_created_automatically(self):
        os.remove(db.DB_PATH)
        db.init_db()
        with db.connect() as conn:
            names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue({"settings", "contacts", "checkins", "activity"} <= names)

    def test_demo_start_state(self):
        s = self.state()
        self.assertEqual(s["status"], "upcoming")
        self.assertEqual(len(s["contacts"]), 3)
        self.assertEqual(len(s["selected_contacts"]), 2)
        self.assertEqual(s["now"].strftime("%H:%M"), "07:30")
        self.assertEqual(s["last_checkin"]["checkin_date"], "2026-10-15")
        self.assertEqual(s["next_due"], datetime(2026, 10, 16, 9, 0))

    def test_successful_check_in(self):
        ok, msg = self.run_logic(logic.check_in)
        self.assertTrue(ok)
        s = self.state()
        self.assertEqual(s["status"], "checked_in")
        self.assertEqual(s["last_checkin"]["checkin_date"], "2026-10-16")
        self.assertEqual(s["next_due"], datetime(2026, 10, 17, 9, 0))
        self.assertEqual(self.history()[0]["kind"], "checkin")

    def test_no_duplicate_check_in(self):
        self.run_logic(logic.check_in)
        ok, msg = self.run_logic(logic.check_in)
        self.assertFalse(ok)
        self.assertIn("already", msg)
        with db.connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM checkins WHERE checkin_date='2026-10-16'").fetchone()[0]
        self.assertEqual(count, 1)
        self.assertEqual(sum(1 for h in self.history() if h["kind"] == "checkin"), 4)  # 3 seeds + 1

    def test_rerun_does_not_duplicate_history(self):
        self.run_logic(logic.simulate_missed)
        before = len(self.history())
        for _ in range(10):
            self.state()
        self.assertEqual(len(self.history()), before)

    def test_missed_check_in_flow(self):
        self.run_logic(logic.simulate_missed)
        s = self.state()
        self.assertEqual(s["status"], "overdue")
        self.assertEqual(s["stage"], 2)
        kinds = [h["kind"] for h in self.history()]
        self.assertEqual(kinds.count("reminder"), 2)  # stage 1 + stage 2

        ok, _ = self.run_logic(logic.advance_escalation)
        self.assertTrue(ok)
        self.assertEqual(self.state()["status"], "second_prompt")

        ok, _ = self.run_logic(logic.advance_escalation)
        self.assertTrue(ok)
        s = self.state()
        self.assertEqual(s["status"], "next_action")
        latest = self.history()[0]
        self.assertEqual(latest["kind"], "escalation")
        self.assertIn("SIMULATED", latest["message"])
        self.assertIn("Maya", latest["message"])
        self.assertNotIn("Priya", latest["message"])  # not selected

        ok, _ = self.run_logic(logic.advance_escalation)
        self.assertFalse(ok)  # already final step

    def test_check_in_resolves_alert(self):
        self.run_logic(logic.simulate_missed)
        self.run_logic(logic.advance_escalation)
        ok, _ = self.run_logic(logic.check_in)
        self.assertTrue(ok)
        s = self.state()
        self.assertEqual(s["status"], "checked_in")
        self.assertEqual(s["settings"]["escalation_stage"], 0)
        kinds = [h["kind"] for h in self.history()]
        self.assertIn("resolved", kinds)

    def test_simulate_missed_after_check_in_clears_todays_record(self):
        self.run_logic(logic.check_in)
        self.run_logic(logic.simulate_missed)
        s = self.state()
        self.assertEqual(s["status"], "overdue")
        self.assertIsNone(s["checkin"])

    def test_clock_alone_escalates(self):
        self.run_logic(logic.simulate_missed)
        # Real time passes by 20 minutes -> past the second-prompt threshold.
        FIXED_NOW["value"] += timedelta(minutes=20)
        self.assertEqual(self.state()["status"], "second_prompt")
        FIXED_NOW["value"] += timedelta(minutes=15)
        self.assertEqual(self.state()["status"], "next_action")

    def test_pause_and_resume(self):
        self.run_logic(logic.set_paused, True)
        self.run_logic(logic.simulate_missed)  # un-pauses by design; pause again
        self.run_logic(logic.set_paused, True)
        s = self.state()
        self.assertEqual(s["status"], "paused")
        ok, _ = self.run_logic(logic.advance_escalation)
        self.assertFalse(ok)
        self.run_logic(logic.set_paused, False)
        s = self.state()
        # Resumed after today's due time with no check-in: not instantly overdue.
        self.assertEqual(s["status"], "resumed")
        self.assertEqual(s["next_due"].date(), datetime(2026, 10, 17).date())

    def test_resume_before_due_time_is_upcoming(self):
        self.run_logic(logic.set_paused, True)
        self.run_logic(logic.set_paused, False)
        self.assertEqual(self.state()["status"], "upcoming")

    def test_schedule_validation(self):
        bad_inputs = [
            ("9am", 30, 15, "keep_reminding", "Alex"),
            ("09:00", 0, 15, "keep_reminding", "Alex"),
            ("09:00", 30, 500, "keep_reminding", "Alex"),
            ("09:00", 30, 15, "call_police", "Alex"),
            ("09:00", 30, 15, "keep_reminding", "   "),
            ("09:00", "abc", 15, "keep_reminding", "Alex"),
        ]
        for args in bad_inputs:
            with self.assertRaises(ValueError, msg=str(args)):
                self.run_logic(logic.set_schedule, *args)

    def test_schedule_change_is_logged(self):
        changes = self.run_logic(logic.set_schedule, "08:30", 30, 15, "notify_contacts", "Alex")
        self.assertEqual(len(changes), 1)
        self.assertEqual(self.history()[0]["kind"], "settings")
        self.assertIn("08:30", self.history()[0]["message"])
        self.assertEqual(self.state()["next_due"], datetime(2026, 10, 16, 8, 30))
        # Saving identical values again changes nothing and logs nothing.
        count = len(self.history())
        self.assertEqual(self.run_logic(logic.set_schedule, "08:30", 30, 15, "notify_contacts", "Alex"), [])
        self.assertEqual(len(self.history()), count)

    def test_moving_time_into_the_past_does_not_trigger_overdue(self):
        self.run_logic(logic.set_schedule, "06:00", 30, 15, "notify_contacts", "Alex")  # now is 7:30
        s = self.state()
        self.assertEqual(s["status"], "resumed")
        self.assertEqual(s["next_due"], datetime(2026, 10, 17, 6, 0))

    def test_contacts_add_edit_remove(self):
        with self.assertRaises(ValueError):
            self.run_logic(logic.add_contact, "   ", "")
        with self.assertRaises(ValueError):
            self.run_logic(logic.add_contact, "maya (SISTER)", "")  # duplicate, case-insensitive
        self.run_logic(logic.add_contact, "  Jo   Lee ", "jo@example.com", True)
        contacts = self.state()["contacts"]
        jo = next(c for c in contacts if c["name"] == "Jo Lee")
        self.run_logic(logic.edit_contact, jo["id"], "Joanne Lee", "", False)
        jo = next(c for c in self.state()["contacts"] if c["id"] == jo["id"])
        self.assertEqual((jo["name"], jo["include_in_escalation"]), ("Joanne Lee", 0))
        self.run_logic(logic.remove_contact, jo["id"])
        self.assertEqual(len(self.state()["contacts"]), 3)
        with self.assertRaises(ValueError):
            self.run_logic(logic.remove_contact, jo["id"])  # already gone

    def test_notify_with_no_contacts_contacts_nobody(self):
        with db.connect() as conn:
            for c in db.list_contacts(conn):
                db.delete_contact(conn, c["id"])
        self.run_logic(logic.simulate_missed)
        self.run_logic(logic.advance_escalation)
        self.run_logic(logic.advance_escalation)
        self.assertIn("nobody would be contacted", self.history()[0]["message"])

    def test_other_next_actions_never_contact_anyone(self):
        for action in ("keep_reminding", "stop_quietly"):
            self.run_logic(logic.reset_demo)
            self.run_logic(logic.set_schedule, "09:00", 30, 15, action, "Alex")
            self.run_logic(logic.simulate_missed)
            self.run_logic(logic.advance_escalation)
            self.run_logic(logic.advance_escalation)
            self.assertIn("Nobody", self.history()[0]["message"])

    def test_unresolved_day_is_noted_once_without_alarm(self):
        self.run_logic(logic.simulate_missed)
        FIXED_NOW["value"] += timedelta(days=1)
        self.state()
        self.state()
        missed = [h for h in self.history() if h["kind"] == "missed"]
        self.assertEqual(len(missed), 1)
        self.assertIn("not treated as a sign", missed[0]["message"])

    def test_erase_all_data(self):
        self.run_logic(logic.erase_all_data)
        s = self.state()
        self.assertEqual(s["contacts"], [])
        self.assertIsNone(s["last_checkin"])
        self.assertEqual(self.history(), [])
        self.assertEqual(s["status"], "resumed")  # 9:00 had passed; not treated as missed
        ok, _ = self.run_logic(logic.check_in)  # app still works on an empty database
        self.assertTrue(ok)

    def test_fresh_install_is_not_instantly_overdue(self):
        os.remove(db.DB_PATH)
        db.init_db()  # brand-new database, real clock 12:00, default due time 09:00
        s = self.state()
        self.assertNotIn(s["status"], ("overdue", "second_prompt", "next_action"))
        self.assertEqual(self.history(), [])

    def test_return_to_real_time(self):
        self.run_logic(logic.return_to_real_time)
        self.assertFalse(self.state()["demo_clock_on"])
        self.assertEqual(self.state()["now"], FIXED_NOW["value"])

    def test_simulate_missed_near_midnight(self):
        for t in ("23:45", "23:59", "00:00", "00:05"):
            self.run_logic(logic.reset_demo)
            self.run_logic(logic.set_schedule, t, 30, 15, "notify_contacts", "Alex")
            self.run_logic(logic.simulate_missed)
            s = self.state()
            self.assertEqual(s["status"], "overdue", f"Failed status for {t}")
            self.assertEqual(s["stage"], 2, f"Failed stage for {t}")
            # Can also advance to second prompt and resolve
            ok, _ = self.run_logic(logic.advance_escalation)
            self.assertTrue(ok)
            self.assertEqual(self.state()["status"], "second_prompt")
            ok, _ = self.run_logic(logic.check_in)
            self.assertTrue(ok)
            self.assertEqual(self.state()["status"], "checked_in")


if __name__ == "__main__":
    unittest.main()

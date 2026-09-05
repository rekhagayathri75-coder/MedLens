import { useState, useEffect, useMemo, useCallback } from "react";
import {
  User, FileText, ClipboardList, MessageSquare, Clock, Pencil,
  Check, X, Download, AlertTriangle, Loader2, ArrowUp, ArrowDown, Minus,
  Trash2, ShieldAlert, Sparkles, ChevronRight
} from "lucide-react";

/* ---------------------------------------------------------------
   MedLens — token system
   Palette drawn from the paper ledger / lab-chart world: a warm
   parchment page, ink-teal text, a clinical teal accent, and the
   three status colors a chart actually uses (low / normal / high).
   Headings in a slab serif (chart register feel); data in mono
   (tabular test values); UI text in a plain sans.
------------------------------------------------------------------*/
const C = {
  page: "#F6F4EF",
  panel: "#FFFFFF",
  ink: "#20302E",
  inkSoft: "#5B6B67",
  hairline: "#DCD6C9",
  accent: "#2F6F6B",
  accentSoft: "#E4EEEC",
  low: "#3D6FA6",
  lowSoft: "#E8EFF6",
  high: "#B3562B",
  highSoft: "#F6E9E1",
  normal: "#3F7D52",
  normalSoft: "#E7F1E9",
  unknown: "#8B8378",
  unknownSoft: "#EEEAE0",
};

const serif = { fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace" };

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);

/* ---------------- API helpers ---------------- */
async function callClaude(system, userText) {
  const res = await fetch("http://localhost:3001/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) throw new Error("Request failed (" + res.status + ")");
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("\n");
}

function stripFence(s) {
  return s.replace(/```json/gi, "").replace(/```/g, "").trim();
}

const EXTRACT_SYSTEM = `You are a clinical data extraction engine. Extract ONLY information explicitly present in the medical report text the user gives you. Never infer, estimate, guess, or invent a reference range, unit, or value that is not written in the source text. If a reference range is not stated for a test, referenceRangeText, referenceMin and referenceMax must all be null.
Return ONLY strict JSON (no markdown fences, no commentary, no leading/trailing text) matching exactly this shape:
{"reportDate": string|null, "tests": [{"name": string, "value": string, "numericValue": number|null, "unit": string|null, "referenceRangeText": string|null, "referenceMin": number|null, "referenceMax": number|null, "observation": string|null, "confidence": "high"|"medium"|"low"}]}
confidence reflects how clearly and unambiguously that single test's name/value/unit were stated in the source text (low if handwriting-like, abbreviated, or ambiguous formatting is implied).`;

const SUMMARY_SYSTEM = `You write short, plain-language summaries of a patient's organized medical information for the patient themselves.
Rules you must follow:
- Do NOT diagnose any condition.
- Do NOT recommend treatment, medication changes, dosages, or next clinical steps beyond "discuss with your clinician".
- Do NOT state uncertain or incomplete information as settled fact.
- When a value falls outside its reference range, describe that neutrally (e.g. "X was above the reference range") without explaining medical causes or consequences.
- Plain sentence case, no headers, no bullet lists, under 170 words, warm but plain language.
- End with one short sentence encouraging the patient to review the full record with a clinician.`;

/* ---------------- status logic ---------------- */
function computeStatus(t) {
  if (t.numericValue == null || (t.referenceMin == null && t.referenceMax == null)) return "unknown";
  if (t.referenceMin != null && t.numericValue < t.referenceMin) return "low";
  if (t.referenceMax != null && t.numericValue > t.referenceMax) return "high";
  return "normal";
}
const STATUS_META = {
  low: { label: "Low", color: C.low, bg: C.lowSoft },
  high: { label: "High", color: C.high, bg: C.highSoft },
  normal: { label: "Normal", color: C.normal, bg: C.normalSoft },
  unknown: { label: "Range unavailable", color: C.unknown, bg: C.unknownSoft },
};

/* ---------------- small UI atoms ---------------- */
function Badge({ children, color, bg, style }) {
  return (
    <span
      style={{ color, background: bg, border: `1px solid ${color}33`, ...style }}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
    >
      {children}
    </span>
  );
}

function ProvenanceTag({ source }) {
  const map = {
    user_provided: { label: "Patient-reported", color: C.ink, bg: "#EFEAE0" },
    ai_extracted: { label: "AI-extracted", color: C.accent, bg: C.accentSoft },
    user_verified: { label: "Verified", color: C.normal, bg: C.normalSoft },
  };
  const m = map[source] || map.ai_extracted;
  return <Badge color={m.color} bg={m.bg}>{m.label}</Badge>;
}

function ConfidenceDot({ level }) {
  const map = { high: C.normal, medium: "#B08900", low: C.high };
  const label = { high: "High confidence", medium: "Medium confidence", low: "Low confidence — please verify" };
  return (
    <span title={label[level] || "Unknown confidence"} className="inline-flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: map[level] || C.unknown, display: "inline-block" }} />
      {label[level] || "Unknown confidence"}
    </span>
  );
}

function Field({ label, value, onChange, placeholder, textarea, half }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <label className={"flex flex-col gap-1 " + (half ? "" : "col-span-2")}>
      <span className="text-sm" style={{ color: C.inkSoft }}>{label}</span>
      <Comp
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={textarea ? 2 : undefined}
        className="w-full rounded px-3 py-2 text-sm outline-none"
        style={{ border: `1px solid ${C.hairline}`, background: C.page, color: C.ink }}
      />
    </label>
  );
}

function NavItem({ icon: Icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left rounded"
      style={{
        background: active ? C.accentSoft : "transparent",
        color: active ? C.accent : C.inkSoft,
        fontWeight: active ? 600 : 500,
      }}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

/* ---------------- main app ---------------- */
export default function MedLens() {
  const [tab, setTab] = useState("intake");
  const [patient, setPatient] = useState({
    name: "", age: "", sex: "", symptoms: "", conditions: "", allergies: "", medications: "", notes: "",
  });
  const [reports, setReports] = useState([]);
  const [draftText, setDraftText] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);

  /* load persisted record (browser localStorage) */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("medlens-record");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.patient) setPatient(parsed.patient);
        if (parsed.reports) setReports(parsed.reports);
      }
    } catch {
      /* no saved record yet */
    } finally {
      setLoaded(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persist = useCallback(async (next) => {
    try {
      localStorage.setItem("medlens-record", JSON.stringify(next));
    } catch (e) {
      console.error("save failed", e);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    persist({ patient, reports });
  }, [patient, reports, loaded, persist]);

  /* -------- extraction -------- */
  async function extractReport() {
    if (!draftText.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const raw = await callClaude(EXTRACT_SYSTEM, draftText);
      const parsed = JSON.parse(stripFence(raw));
      const tests = (parsed.tests || []).map((t) => ({
        id: uid(),
        name: t.name || "Unnamed test",
        value: t.value ?? "",
        numericValue: typeof t.numericValue === "number" ? t.numericValue : null,
        unit: t.unit ?? null,
        referenceRangeText: t.referenceRangeText ?? null,
        referenceMin: typeof t.referenceMin === "number" ? t.referenceMin : null,
        referenceMax: typeof t.referenceMax === "number" ? t.referenceMax : null,
        observation: t.observation ?? null,
        confidence: t.confidence || "medium",
        source: "ai_extracted",
      }));
      const report = {
        id: uid(),
        title: draftTitle.trim() || "Report " + (reports.length + 1),
        date: parsed.reportDate || todayStr(),
        rawText: draftText,
        tests,
        createdAt: new Date().toISOString(),
      };
      setReports((r) => [report, ...r]);
      setDraftText("");
      setDraftTitle("");
      setTab("record");
    } catch (e) {
      setErr("Couldn't extract structured data from that text. Try pasting the report again, or check the format. (" + e.message + ")");
    } finally {
      setBusy(false);
    }
  }

  function updateTest(reportId, testId, patch) {
    setReports((rs) =>
      rs.map((r) =>
        r.id !== reportId
          ? r
          : { ...r, tests: r.tests.map((t) => (t.id === testId ? { ...t, ...patch, source: "user_verified" } : t)) }
      )
    );
  }

  function deleteReport(id) {
    setReports((rs) => rs.filter((r) => r.id !== id));
  }

  /* -------- inconsistency detection (rule-based, no invented facts) -------- */
  const conflicts = useMemo(() => {
    const list = [];
    const allergyTerms = patient.allergies
      .split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const medTerms = patient.medications
      .split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    allergyTerms.forEach((a) => {
      medTerms.forEach((m) => {
        if (a && m && (m.includes(a) || a.includes(m))) {
          list.push(`Listed medication "${m}" overlaps with a listed allergy "${a}" — flag for clinician review.`);
        }
      });
    });
    // duplicate test names within a single report with differing values
    reports.forEach((r) => {
      const seen = {};
      r.tests.forEach((t) => {
        const key = t.name.toLowerCase();
        if (seen[key] && seen[key] !== t.value) {
          list.push(`"${r.title}" lists "${t.name}" twice with different values ("${seen[key]}" vs "${t.value}").`);
        }
        seen[key] = t.value;
      });
    });
    return list;
  }, [patient, reports]);

  /* -------- trends across reports -------- */
  const trends = useMemo(() => {
    const byName = {};
    [...reports].sort((a, b) => (a.date > b.date ? 1 : -1)).forEach((r) => {
      r.tests.forEach((t) => {
        if (t.numericValue == null) return;
        byName[t.name] = byName[t.name] || [];
        byName[t.name].push({ date: r.date, reportTitle: r.title, value: t.numericValue, unit: t.unit, status: computeStatus(t) });
      });
    });
    return Object.entries(byName).filter(([, v]) => v.length > 1);
  }, [reports]);

  /* -------- AI summary -------- */
  async function generateSummary() {
    setSummaryBusy(true);
    setErr(null);
    try {
      const payload = {
        patient: {
          age: patient.age, sex: patient.sex, symptoms: patient.symptoms,
          conditions: patient.conditions, allergies: patient.allergies, medications: patient.medications,
        },
        reports: reports.map((r) => ({
          title: r.title,
          date: r.date,
          tests: r.tests.map((t) => ({
            name: t.name, value: t.value, unit: t.unit,
            referenceRangeText: t.referenceRangeText, status: computeStatus(t),
          })),
        })),
      };
      const text = await callClaude(SUMMARY_SYSTEM, JSON.stringify(payload));
      setSummary(text.trim());
    } catch (e) {
      setErr("Couldn't generate the summary right now. (" + e.message + ")");
    } finally {
      setSummaryBusy(false);
    }
  }

  /* -------- export -------- */
  function exportRecord() {
    const lines = [];
    lines.push("MEDLENS — PATIENT RECORD EXPORT");
    lines.push("Generated " + new Date().toLocaleString());
    lines.push("");
    lines.push("PATIENT INFORMATION (patient-reported)");
    lines.push(`Name: ${patient.name || "—"}`);
    lines.push(`Age: ${patient.age || "—"}    Sex: ${patient.sex || "—"}`);
    lines.push(`Symptoms: ${patient.symptoms || "—"}`);
    lines.push(`Existing conditions: ${patient.conditions || "—"}`);
    lines.push(`Allergies: ${patient.allergies || "—"}`);
    lines.push(`Medications: ${patient.medications || "—"}`);
    lines.push(`Notes: ${patient.notes || "—"}`);
    lines.push("");
    reports.forEach((r) => {
      lines.push(`REPORT: ${r.title}  (date: ${r.date})`);
      r.tests.forEach((t) => {
        const st = STATUS_META[computeStatus(t)].label;
        lines.push(`  - ${t.name}: ${t.value}${t.unit ? " " + t.unit : ""} [${st}]` +
          (t.referenceRangeText ? ` (reference: ${t.referenceRangeText})` : " (reference range not provided)") +
          `  — source: ${t.source}`);
        if (t.observation) lines.push(`      note: ${t.observation}`);
      });
      lines.push("");
    });
    if (summary) {
      lines.push("AI-GENERATED PATIENT SUMMARY (not a diagnosis)");
      lines.push(summary);
      lines.push("");
    }
    lines.push("This export is for personal reference only and does not replace professional medical advice.");
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (patient.name ? patient.name.replace(/\s+/g, "_") : "medlens") + "_record.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalTests = reports.reduce((n, r) => n + r.tests.length, 0);
  const outOfRange = reports.reduce((n, r) => n + r.tests.filter((t) => ["low", "high"].includes(computeStatus(t))).length, 0);

  return (
    <div style={{ background: C.page, color: C.ink, minHeight: "100%" }} className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        * { font-family: 'Inter', system-ui, sans-serif; }
      `}</style>

      {/* header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${C.hairline}` }}>
        <div>
          <div style={{ ...serif, fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>MedLens</div>
          <div className="text-xs" style={{ color: C.inkSoft }}>Clinical information, organized — not a diagnosis</div>
        </div>
        <button
          onClick={exportRecord}
          disabled={!patient.name && reports.length === 0}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded"
          style={{ border: `1px solid ${C.hairline}`, color: C.ink, background: C.panel }}
        >
          <Download size={15} /> Export record
        </button>
      </div>

      <div className="flex" style={{ minHeight: 560 }}>
        {/* sidebar */}
        <div className="w-56 shrink-0 p-3 flex flex-col gap-1" style={{ borderRight: `1px solid ${C.hairline}` }}>
          <NavItem icon={User} label="Patient intake" active={tab === "intake"} onClick={() => setTab("intake")} />
          <NavItem icon={FileText} label="Add report" active={tab === "reports"} onClick={() => setTab("reports")} />
          <NavItem icon={ClipboardList} label="Structured record" active={tab === "record"} onClick={() => setTab("record")} />
          <NavItem icon={MessageSquare} label="AI summary" active={tab === "summary"} onClick={() => setTab("summary")} />
          <NavItem icon={Clock} label="History & trends" active={tab === "history"} onClick={() => setTab("history")} />

          <div className="mt-4 mx-1 p-3 rounded text-xs" style={{ background: C.accentSoft, color: C.accent }}>
            <div className="font-semibold mb-1">{totalTests} test value{totalTests === 1 ? "" : "s"} on file</div>
            <div>{outOfRange} outside reference range</div>
          </div>
          {conflicts.length > 0 && (
            <div className="mx-1 mt-2 p-3 rounded text-xs flex gap-2" style={{ background: C.highSoft, color: C.high }}>
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>{conflicts.length} item{conflicts.length === 1 ? "" : "s"} flagged for review</span>
            </div>
          )}
        </div>

        {/* content */}
        <div className="flex-1 p-6 max-w-3xl">
          {err && (
            <div className="mb-4 p-3 rounded text-sm flex items-start gap-2" style={{ background: C.highSoft, color: C.high, border: `1px solid ${C.high}33` }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {tab === "intake" && (
            <section>
              <h2 style={{ ...serif, fontSize: 19 }} className="mb-1">Patient intake</h2>
              <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
                Everything here is recorded exactly as entered and tagged <em>patient-reported</em> — MedLens never edits or infers these fields.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" half value={patient.name} onChange={(v) => setPatient((p) => ({ ...p, name: v }))} placeholder="Patient name" />
                <Field label="Age" half value={patient.age} onChange={(v) => setPatient((p) => ({ ...p, age: v }))} placeholder="e.g. 47" />
                <Field label="Sex" half value={patient.sex} onChange={(v) => setPatient((p) => ({ ...p, sex: v }))} placeholder="e.g. Female" />
                <div className="col-span-1" />
                <Field label="Symptoms" value={patient.symptoms} onChange={(v) => setPatient((p) => ({ ...p, symptoms: v }))} placeholder="What's going on, and since when" textarea />
                <Field label="Existing conditions" value={patient.conditions} onChange={(v) => setPatient((p) => ({ ...p, conditions: v }))} placeholder="e.g. hypertension, type 2 diabetes" textarea />
                <Field label="Allergies" value={patient.allergies} onChange={(v) => setPatient((p) => ({ ...p, allergies: v }))} placeholder="e.g. penicillin" textarea />
                <Field label="Current medications" value={patient.medications} onChange={(v) => setPatient((p) => ({ ...p, medications: v }))} placeholder="Name, dose, frequency" textarea />
                <Field label="Other notes" value={patient.notes} onChange={(v) => setPatient((p) => ({ ...p, notes: v }))} placeholder="Anything else worth recording" textarea />
              </div>
              {conflicts.length > 0 && (
                <div className="mt-4 p-3 rounded text-sm" style={{ background: C.highSoft, color: C.high }}>
                  <div className="font-semibold mb-1 flex items-center gap-2"><ShieldAlert size={15} /> Flagged for review</div>
                  <ul className="list-disc ml-5 space-y-1">
                    {conflicts.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </section>
          )}

          {tab === "reports" && (
            <section>
              <h2 style={{ ...serif, fontSize: 19 }} className="mb-1">Add a medical report</h2>
              <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
                Paste the report text below. MedLens extracts test names, values, units, reference ranges and observations exactly as written - it will not invent a reference range that isn't in the text.
              </p>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder='Report label, e.g. "CBC - Sept 2026"'
                className="w-full rounded px-3 py-2 text-sm mb-2 outline-none"
                style={{ border: `1px solid ${C.hairline}`, background: C.panel }}
              />
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                rows={10}
                placeholder="Paste raw lab report / prescription / clinical note text here..."
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ ...mono, fontSize: 12.5, border: `1px solid ${C.hairline}`, background: C.panel }}
              />
              <button
                onClick={extractReport}
                disabled={busy || !draftText.trim()}
                className="mt-3 flex items-center gap-2 text-sm px-4 py-2 rounded"
                style={{ background: C.accent, color: "#fff", opacity: busy || !draftText.trim() ? 0.6 : 1 }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {busy ? "Extracting…" : "Extract structured data"}
              </button>
            </section>
          )}

          {tab === "record" && (
            <section>
              <h2 style={{ ...serif, fontSize: 19 }} className="mb-1">Structured record</h2>
              <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
                Extracted values, organized by report. Edit any field to mark it as verified.
              </p>
              {reports.length === 0 && (
                <div className="text-sm p-4 rounded" style={{ background: C.panel, border: `1px dashed ${C.hairline}`, color: C.inkSoft }}>
                  No reports yet. Add one from "Add report" to see it structured here.
                </div>
              )}
              <div className="space-y-5">
                {reports.map((r) => (
                  <div key={r.id} className="rounded" style={{ border: `1px solid ${C.hairline}`, background: C.panel }}>
                    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.hairline}` }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.title}</div>
                        <div className="text-xs" style={{ color: C.inkSoft }}>{r.date}</div>
                      </div>
                      <button onClick={() => deleteReport(r.id)} className="text-xs flex items-center gap-1" style={{ color: C.inkSoft }}>
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                    <div className="divide-y" style={{ borderColor: C.hairline }}>
                      {r.tests.map((t) => (
                        <TestRow key={t.id} test={t} onSave={(patch) => updateTest(r.id, t.id, patch)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {tab === "summary" && (
            <section>
              <h2 style={{ ...serif, fontSize: 19 }} className="mb-1">AI-generated summary</h2>
              <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
                A plain-language overview of what's on file. This describes the record — it does not diagnose or recommend treatment.
              </p>
              <button
                onClick={generateSummary}
                disabled={summaryBusy || (reports.length === 0 && !patient.symptoms)}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded mb-4"
                style={{ background: C.accent, color: "#fff", opacity: summaryBusy ? 0.6 : 1 }}
              >
                {summaryBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {summaryBusy ? "Writing summary…" : summary ? "Regenerate summary" : "Generate summary"}
              </button>
              {summary && (
                <div className="p-4 rounded text-sm leading-relaxed" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge color={C.accent} bg={C.accentSoft}>AI-generated · not a diagnosis</Badge>
                  </div>
                  {summary}
                </div>
              )}
            </section>
          )}

          {tab === "history" && (
            <section>
              <h2 style={{ ...serif, fontSize: 19 }} className="mb-1">History & trends</h2>
              <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
                Values that appear in more than one report, compared over time.
              </p>
              {trends.length === 0 && (
                <div className="text-sm p-4 rounded" style={{ background: C.panel, border: `1px dashed ${C.hairline}`, color: C.inkSoft }}>
                  Add at least two reports sharing a test name to see a trend here.
                </div>
              )}
              <div className="space-y-4">
                {trends.map(([name, points]) => {
                  const first = points[0], last = points[points.length - 1];
                  const dir = last.value > first.value ? "up" : last.value < first.value ? "down" : "flat";
                  return (
                    <div key={name} className="p-4 rounded" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
                      <div className="flex items-center justify-between mb-2">
                        <div style={{ fontWeight: 600 }}>{name}</div>
                        <span className="flex items-center gap-1 text-xs" style={{ color: dir === "up" ? C.high : dir === "down" ? C.low : C.inkSoft }}>
                          {dir === "up" ? <ArrowUp size={13} /> : dir === "down" ? <ArrowDown size={13} /> : <Minus size={13} />}
                          {first.value}{first.unit ? " " + first.unit : ""} → {last.value}{last.unit ? " " + last.unit : ""}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {points.map((p, i) => {
                          const meta = STATUS_META[p.status];
                          return (
                            <div key={i} className="text-xs px-2 py-1 rounded" style={{ background: meta.bg, color: meta.color }}>
                              {p.date}: {p.value}{p.unit ? " " + p.unit : ""} ({meta.label})
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <h3 style={{ ...serif, fontSize: 16 }} className="mt-6 mb-2">All reports</h3>
              <div className="space-y-1">
                {reports.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm py-1.5" style={{ borderBottom: `1px solid ${C.hairline}` }}>
                    <Clock size={13} style={{ color: C.inkSoft }} />
                    <span style={{ color: C.inkSoft }}>{r.date}</span>
                    <ChevronRight size={13} style={{ color: C.inkSoft }} />
                    {r.title}
                    <span className="text-xs" style={{ color: C.inkSoft }}>({r.tests.length} values)</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="px-6 py-3 text-xs" style={{ borderTop: `1px solid ${C.hairline}`, color: C.inkSoft }}>
        MedLens organizes and explains medical information for reference only. It does not diagnose conditions, prescribe medication, or replace a clinician's judgment. Data in this demo is stored only for this session's use of the app.
      </div>
    </div>
  );
}

/* ---------------- editable test row ---------------- */
function TestRow({ test, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(test);
  const status = computeStatus(test);
  const meta = STATUS_META[status];

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setDraft(test), [test]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (editing) {
    return (
      <div className="px-4 py-3 grid grid-cols-6 gap-2 items-center text-sm">
        <input className="col-span-2 rounded px-2 py-1" style={{ border: `1px solid ${C.hairline}` }} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <input className="rounded px-2 py-1" style={{ border: `1px solid ${C.hairline}` }} value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value, numericValue: parseFloat(e.target.value) || null }))} placeholder="Value" />
        <input className="rounded px-2 py-1" style={{ border: `1px solid ${C.hairline}` }} value={draft.unit || ""} onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))} placeholder="Unit" />
        <input className="rounded px-2 py-1" style={{ border: `1px solid ${C.hairline}` }} value={draft.referenceRangeText || ""} onChange={(e) => setDraft((d) => ({ ...d, referenceRangeText: e.target.value }))} placeholder="Reference range" />
        <div className="flex gap-1 justify-end">
          <button onClick={() => { onSave(draft); setEditing(false); }} className="p-1.5 rounded" style={{ background: C.normalSoft, color: C.normal }}><Check size={14} /></button>
          <button onClick={() => { setDraft(test); setEditing(false); }} className="p-1.5 rounded" style={{ background: C.unknownSoft, color: C.inkSoft }}><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 grid grid-cols-6 gap-2 items-center text-sm">
      <div className="col-span-2">
        <div style={{ fontWeight: 500 }}>{test.name}</div>
        {test.observation && <div className="text-xs" style={{ color: C.inkSoft }}>{test.observation}</div>}
      </div>
      <div style={mono}>{test.value}</div>
      <div style={mono} className="text-xs" >{test.unit || "—"}</div>
      <div className="text-xs" style={{ color: C.inkSoft }}>
        {test.referenceRangeText || "not provided"}
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
        <div className="flex items-center gap-2">
          <ProvenanceTag source={test.source} />
          <ConfidenceDot level={test.confidence} />git commit -m "Initial MedLens prototype"
        </div>
      </div>
      <div className="col-span-6 flex justify-end -mt-1">git branch -M main
        <button onClick={() => setEditing(true)} className="text-xs flex items-center gap-1" style={{ color: C.accent }}>
          <Pencil size={12} /> Edit / verify
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { extractDocumentText } from "./lib/documentText";
import { cloudPersistenceEnabled, supabase } from "./lib/supabase";
import {
  SAMPLE_PATIENT,
  SAMPLE_REPORTS,
  SAMPLE_SUMMARY,
  SAMPLE_AUDIT_LOG,
  SAMPLE_RAW_REPORT_TEXT,
} from "./lib/sampleData";
import { parseReportTextLocally, generateLocalSummary } from "./lib/localParser";
import {
  User,
  FileText,
  ClipboardList,
  MessageSquare,
  Clock,
  Pencil,
  Check,
  X,
  Download,
  AlertTriangle,
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus,
  Trash2,
  ShieldAlert,
  Sparkles,
  ChevronRight,
  Printer,
  FileSpreadsheet,
  Search,
  Plus,
  UploadCloud,
  CheckCircle2,
  RotateCcw,
  Info,
} from "lucide-react";

/* ---------------------------------------------------------------
   MedLens — Design Tokens
   Warm parchment page, ink-teal text, clinical teal accent,
   and calibrated status colors (low / normal / high / critical).
------------------------------------------------------------------*/
const C = {
  page: "#F6F4EF",
  panel: "#FFFFFF",
  ink: "#20302E",
  inkSoft: "#5B6B67",
  hairline: "#DCD6C9",
  accent: "#2F6F6B",
  accentSoft: "#E4EEEC",
  accentHover: "#255956",
  low: "#2D68C4",
  lowSoft: "#EBF2FC",
  high: "#C25424",
  highSoft: "#FCEEE7",
  normal: "#2F7D4E",
  normalSoft: "#EAF5EE",
  unknown: "#7E786E",
  unknownSoft: "#EFECE4",
  critical: "#B91C1C",
  criticalSoft: "#FEE2E2",
};

const serif = { fontFamily: "'Source Serif 4', Georgia, 'Times New Roman', serif" };
const mono = { fontFamily: "'IBM Plex Mono', 'SFMono-Regular', Menlo, monospace" };

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);

/* ---------------- API Helpers ---------------- */
async function callClaude(system, userText) {
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const res = await fetch(`${apiBase}/api/claude`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || "").join("\n");
}

function stripFence(s) {
  return s.replace(/```json/gi, "").replace(/```/g, "").trim();
}

const EXTRACT_SYSTEM = `You are a clinical data extraction engine. Extract ONLY information explicitly present in the medical report text the user gives you. Never infer, estimate, guess, or invent a reference range, unit, or value that is not written in the source text. If a reference range is not stated for a test, referenceRangeText, referenceMin and referenceMax must all be null.
Return ONLY strict JSON (no markdown fences, no commentary, no leading/trailing text) matching exactly this shape:
{"reportDate": string|null, "tests": [{"name": string, "value": string, "numericValue": number|null, "unit": string|null, "referenceRangeText": string|null, "referenceMin": number|null, "referenceMax": number|null, "observation": string|null, "confidence": "high"|"medium"|"low"}]}
confidence reflects how clearly and unambiguously that single test's name/value/unit were stated in the source text.`;

const SUMMARY_SYSTEM = `You write short, plain-language summaries of a patient's organized medical information for the patient themselves.
Rules you must follow:
- Do NOT diagnose any condition.
- Do NOT recommend treatment, medication changes, dosages, or next clinical steps beyond "discuss with your clinician".
- Do NOT state uncertain or incomplete information as settled fact.
- When a value falls outside its reference range, describe that neutrally without explaining medical causes or consequences.
- Plain sentence case, no headers, no bullet lists, under 170 words, warm but clear language.
- End with one short sentence encouraging the patient to review the full record with a clinician.`;

/* ---------------- Clinical Status & Alerts ---------------- */
function computeStatus(t) {
  if (t.observation && /^(HIGH|H)$/i.test(t.observation.trim())) return "high";
  if (t.observation && /^(LOW|L)$/i.test(t.observation.trim())) return "low";
  if (t.numericValue == null) return "unknown";
  if (t.referenceMin != null && t.numericValue < t.referenceMin) return "low";
  if (t.referenceMax != null && t.numericValue > t.referenceMax) return "high";
  if (t.referenceMin != null || t.referenceMax != null) return "normal";
  return "unknown";
}

function checkCritical(t) {
  if (t.numericValue == null) return null;
  const name = (t.name || "").toLowerCase();
  const v = t.numericValue;
  if (name.includes("potassium") && (v < 2.8 || v > 6.0)) return `Critical Potassium (${v} ${t.unit || "mmol/L"})`;
  if (name.includes("glucose") && (v < 54 || v > 350)) return `Critical Glucose (${v} ${t.unit || "mg/dL"})`;
  if (name.includes("sodium") && (v < 120 || v > 155)) return `Critical Sodium (${v} ${t.unit || "mmol/L"})`;
  if (name.includes("platelet") && v < 50) return `Critical Thrombocytopenia (${v} ${t.unit || "K/uL"})`;
  if (name.includes("hemoglobin") && !name.includes("a1c") && v < 7.0) return `Critical Anemia (${v} ${t.unit || "g/dL"})`;
  return null;
}

const STATUS_META = {
  low: { label: "Low", color: C.low, bg: C.lowSoft },
  high: { label: "High", color: C.high, bg: C.highSoft },
  normal: { label: "Normal", color: C.normal, bg: C.normalSoft },
  unknown: { label: "Range unavailable", color: C.unknown, bg: C.unknownSoft },
};

/* ---------------- Visual Atoms ---------------- */
function Badge({ children, color, bg, style }) {
  return (
    <span
      style={{ color, background: bg, border: `1px solid ${color}33`, ...style }}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
    >
      {children}
    </span>
  );
}

function ProvenanceTag({ source }) {
  const map = {
    user_provided: { label: "Patient-reported", color: C.ink, bg: "#EFEAE0" },
    ai_extracted: { label: "AI-extracted", color: C.accent, bg: C.accentSoft },
    local_heuristic: { label: "Heuristic-parsed", color: "#6A5535", bg: "#F4EFE6" },
    user_verified: { label: "Verified", color: C.normal, bg: C.normalSoft },
  };
  const m = map[source] || map.ai_extracted;
  return <Badge color={m.color} bg={m.bg}>{m.label}</Badge>;
}

function ConfidenceDot({ level }) {
  const map = { high: C.normal, medium: "#B08900", low: C.high };
  const label = { high: "High confidence", medium: "Medium confidence", low: "Low confidence — verify" };
  const width = { high: "100%", medium: "66%", low: "33%" };
  return (
    <span title={label[level] || "Confidence"} className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.inkSoft }}>
      <span style={{ width: 24, height: 4, borderRadius: 999, background: C.hairline, display: "inline-block", overflow: "hidden" }}>
        <span style={{ width: width[level] || "33%", height: "100%", borderRadius: 999, background: map[level] || C.unknown, display: "block" }} />
      </span>
      <span className="hidden sm:inline">{label[level] || "Confidence"}</span>
    </span>
  );
}

/* ---------------- Reference Range Gauge Component ---------------- */
function RangeGauge({ value, min, max, unit }) {
  if (value == null || (min == null && max == null)) return null;

  let pos = 50;
  let status = "normal";

  if (min != null && max != null) {
    const span = max - min || 1;
    const lower = min - span * 0.35;
    const upper = max + span * 0.35;
    pos = Math.max(4, Math.min(96, ((value - lower) / (upper - lower)) * 100));
    if (value < min) status = "low";
    else if (value > max) status = "high";
  } else if (max != null) {
    // Range is e.g. < 100
    pos = Math.max(4, Math.min(96, (value / (max * 1.5)) * 100));
    if (value > max) status = "high";
  } else if (min != null) {
    // Range is e.g. > 60
    pos = Math.max(4, Math.min(96, (value / (min * 1.8)) * 100));
    if (value < min) status = "low";
  }

  const pinColor = status === "high" ? C.high : status === "low" ? C.low : C.normal;

  return (
    <div className="w-full max-w-[140px] flex flex-col gap-0.5 select-none" title={`Value: ${value} ${unit || ""} | Target range: ${min != null ? min : ""}${min != null && max != null ? " - " : ""}${max != null ? max : ""}`}>
      <div className="relative w-full h-2 rounded-full overflow-hidden flex" style={{ background: C.hairline }}>
        <div style={{ width: min != null && max != null ? "25%" : min != null ? "30%" : "0%", background: C.lowSoft }} />
        <div style={{ width: min != null && max != null ? "50%" : "70%", background: C.normalSoft }} />
        <div style={{ width: min != null && max != null ? "25%" : max != null ? "30%" : "0%", background: C.highSoft }} />
        <div
          className="absolute top-0 bottom-0 w-1.5 rounded-full shadow-sm"
          style={{
            left: `calc(${pos}% - 3px)`,
            background: pinColor,
            border: "1px solid #FFFFFF",
          }}
        />
      </div>
      <div className="flex justify-between items-center text-[10px]" style={{ color: C.inkSoft }}>
        <span>{min != null ? min : "<"}</span>
        <span style={{ color: pinColor, fontWeight: 600 }}>{value}</span>
        <span>{max != null ? max : ">"}</span>
      </div>
    </div>
  );
}

/* ---------------- Interactive SVG Trend Chart ---------------- */
function TrendChart({ points, title, unit }) {
  if (!points || points.length < 2) return null;

  const width = 440;
  const height = 120;
  const padding = { top: 20, right: 35, bottom: 25, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.value);
  const refMins = points.map((p) => p.referenceMin).filter((v) => typeof v === "number");
  const refMaxs = points.map((p) => p.referenceMax).filter((v) => typeof v === "number");

  const commonRefMin = refMins.length > 0 ? refMins[0] : null;
  const commonRefMax = refMaxs.length > 0 ? refMaxs[0] : null;

  let minBound = Math.min(...values, ...(commonRefMin != null ? [commonRefMin] : []));
  let maxBound = Math.max(...values, ...(commonRefMax != null ? [commonRefMax] : []));
  const diff = maxBound - minBound || 1;
  minBound -= diff * 0.15;
  maxBound += diff * 0.15;

  const getX = (idx) => padding.left + (idx / (points.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minBound) / (maxBound - minBound)) * chartH;

  const polylineCoords = points.map((p, i) => `${getX(i)},${getY(p.value)}`).join(" ");

  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const delta = lastPt.value - firstPt.value;
  const pctDelta = firstPt.value !== 0 ? ((delta / firstPt.value) * 100).toFixed(1) : 0;
  const deltaSign = delta > 0 ? "+" : "";

  // Ref range polygon if available
  let refBandY1 = null;
  let refBandY2 = null;
  if (commonRefMin != null && commonRefMax != null) {
    refBandY1 = getY(commonRefMax);
    refBandY2 = getY(commonRefMin);
  }

  return (
    <div className="p-4 rounded border" style={{ borderColor: C.hairline, background: C.panel }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
          <div className="text-xs" style={{ color: C.inkSoft }}>
            {points.length} measurements {unit ? `(${unit})` : ""}
            {commonRefMin != null && commonRefMax != null && ` · Ref: ${commonRefMin} - ${commonRefMax}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium"
            style={{
              background: delta === 0 ? C.unknownSoft : delta < 0 ? C.normalSoft : C.highSoft,
              color: delta === 0 ? C.inkSoft : delta < 0 ? C.normal : C.high,
            }}
          >
            {delta > 0 ? <ArrowUp size={12} /> : delta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
            {deltaSign}{delta.toFixed(2)} ({deltaSign}{pctDelta}%)
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32 select-none">
          {/* Normal Reference Band */}
          {refBandY1 != null && refBandY2 != null && (
            <rect
              x={padding.left}
              y={refBandY1}
              width={chartW}
              height={Math.max(2, refBandY2 - refBandY1)}
              fill={C.normalSoft}
              opacity={0.65}
            />
          )}

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={padding.top + chartH}
            x2={padding.left + chartW}
            y2={padding.top + chartH}
            stroke={C.hairline}
            strokeWidth={1}
          />
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left + chartW}
            y2={padding.top}
            stroke={C.hairline}
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />

          {/* Y Axis Min/Max Labels */}
          <text x={padding.left - 6} y={padding.top + 4} textAnchor="end" fontSize={9} fill={C.inkSoft} style={mono}>
            {maxBound.toFixed(1)}
          </text>
          <text x={padding.left - 6} y={padding.top + chartH} textAnchor="end" fontSize={9} fill={C.inkSoft} style={mono}>
            {minBound.toFixed(1)}
          </text>

          {/* Line connecting points */}
          <polyline
            fill="none"
            stroke={C.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylineCoords}
          />

          {/* Data points */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.value);
            const status = computeStatus(p);
            const meta = STATUS_META[status] || STATUS_META.normal;
            return (
              <g key={idx} className="cursor-pointer">
                <circle cx={cx} cy={cy} r={5} fill={meta.color} stroke="#FFFFFF" strokeWidth={2} />
                <text
                  x={cx}
                  y={cy - 8}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={C.ink}
                  style={mono}
                >
                  {p.value}
                </text>
                <text
                  x={cx}
                  y={padding.top + chartH + 15}
                  textAnchor="middle"
                  fontSize={9}
                  fill={C.inkSoft}
                >
                  {p.date ? p.date.slice(5) : `T${idx + 1}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ---------------- Form Field ---------------- */
function Field({ label, value, onChange, placeholder, textarea, half }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <label className={"flex flex-col gap-1 " + (half ? "col-span-2 sm:col-span-1" : "col-span-2")}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.inkSoft }}>{label}</span>
      <Comp
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={textarea ? 2 : undefined}
        className="w-full rounded px-3 py-2 text-sm outline-none transition-colors focus:ring-1"
        style={{ border: `1px solid ${C.hairline}`, background: C.page, color: C.ink }}
      />
    </label>
  );
}

function NavItem({ icon: Icon, label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left rounded-md transition-colors"
      style={{
        background: active ? C.accentSoft : "transparent",
        color: active ? C.accent : C.inkSoft,
        fontWeight: active ? 600 : 500,
      }}
    >
      <div className="flex items-center gap-3">
        <Icon size={16} />
        {label}
      </div>
      {badge != null && (
        <span
          className="text-xs px-1.5 py-0.2 rounded-full font-semibold"
          style={{ background: active ? C.accent : C.hairline, color: active ? "#fff" : C.ink }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ---------------- Editable Test Row ---------------- */
function TestRow({ test, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(test);
  const status = computeStatus(test);
  const meta = STATUS_META[status];
  const criticalAlert = checkCritical(test);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setDraft(test), [test]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (editing) {
    return (
      <div className="p-3.5 rounded bg-amber-50/50 border border-amber-200 grid grid-cols-1 sm:grid-cols-6 gap-2 items-center text-sm">
        <div className="sm:col-span-2">
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Test Name</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Value</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.value}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                value: e.target.value,
                numericValue: parseFloat(e.target.value) || null,
              }))
            }
          />
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Unit</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.unit || ""}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-1">
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-0.5">Reference Range</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.referenceRangeText || ""}
            onChange={(e) => setDraft((d) => ({ ...d, referenceRangeText: e.target.value }))}
          />
        </div>
        <div className="flex gap-1.5 justify-end items-center sm:pt-4">
          <button
            onClick={() => {
              onSave(draft);
              setEditing(false);
            }}
            title="Save changes"
            className="p-1.5 rounded flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 shadow-sm"
            style={{ background: C.normal, color: "#fff" }}
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={() => {
              setDraft(test);
              setEditing(false);
            }}
            title="Cancel"
            className="p-1.5 rounded text-xs px-2 py-1.5 bg-gray-200 text-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3 sm:px-4 sm:py-3 transition-colors hover:bg-black/[0.015] grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center text-sm border-b"
      style={{ borderColor: C.hairline }}
    >
      {/* Test Name & Observations */}
      <div className="sm:col-span-4">
        <div className="flex items-center gap-1.5">
          <span style={{ fontWeight: 600, color: C.ink }}>{test.name}</span>
          {criticalAlert && (
            <span
              className="text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider animate-pulse"
              style={{ background: C.criticalSoft, color: C.critical }}
              title={criticalAlert}
            >
              Critical
            </span>
          )}
        </div>
        {test.observation && (
          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
            {test.observation}
          </div>
        )}
      </div>

      {/* Numeric Value & Units */}
      <div className="sm:col-span-2 flex items-baseline gap-1">
        <span style={{ ...mono, fontSize: 14, fontWeight: 600, color: meta.color }}>
          {test.value}
        </span>
        <span style={mono} className="text-xs" style={{ color: C.inkSoft }}>
          {test.unit || ""}
        </span>
      </div>

      {/* Range text & Range Gauge */}
      <div className="sm:col-span-3">
        <div className="text-xs mb-1" style={{ color: C.inkSoft }}>
          {test.referenceRangeText ? `Ref: ${test.referenceRangeText}` : "No reference range"}
        </div>
        {test.numericValue != null && (
          <RangeGauge
            value={test.numericValue}
            min={test.referenceMin}
            max={test.referenceMax}
            unit={test.unit}
          />
        )}
      </div>

      {/* Status & Provenance */}
      <div className="sm:col-span-3 flex flex-wrap sm:flex-col items-start sm:items-end justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
          <ProvenanceTag source={test.source} />
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <ConfidenceDot level={test.confidence} />
          <button
            onClick={() => setEditing(true)}
            className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded hover:underline"
            style={{ color: C.accent }}
            title="Edit value or reference range"
          >
            <Pencil size={11} /> Edit
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-xs p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
              title="Delete this test entry"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Add Manual Test Modal ---------------- */
function AddTestModal({ isOpen, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [refRange, setRefRange] = useState("");
  const [observation, setObservation] = useState("");

  if (!isOpen) return null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !value.trim()) return;

    let min = null;
    let max = null;
    const rangeMatch = refRange.match(/([\d.]+)\s*[-to]\s*([\d.]+)/i);
    if (rangeMatch) {
      min = parseFloat(rangeMatch[1]);
      max = parseFloat(rangeMatch[2]);
    } else {
      const maxMatch = refRange.match(/<=\s*([\d.]+)/);
      if (maxMatch) max = parseFloat(maxMatch[1]);
      const minMatch = refRange.match(/>=\s*([\d.]+)/);
      if (minMatch) min = parseFloat(minMatch[1]);
    }

    onAdd({
      id: uid(),
      name: name.trim(),
      value: value.trim(),
      numericValue: parseFloat(value) || null,
      unit: unit.trim() || null,
      referenceRangeText: refRange.trim() || null,
      referenceMin: min,
      referenceMax: max,
      observation: observation.trim() || null,
      confidence: "high",
      source: "user_verified",
    });

    setName("");
    setValue("");
    setUnit("");
    setRefRange("");
    setObservation("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md p-6 rounded-lg shadow-xl" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ ...serif, fontSize: 18, fontWeight: 700 }}>Add Manual Test Result</h3>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Test Name *
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fasting Glucose" className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold uppercase text-gray-600">
              Value *
              <input required value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 98" className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} />
            </label>
            <label className="block text-xs font-semibold uppercase text-gray-600">
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mg/dL" className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} />
            </label>
          </div>
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Reference Range
            <input value={refRange} onChange={(e) => setRefRange(e.target.value)} placeholder="e.g. 70 - 99" className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} />
          </label>
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Observation / Notes
            <input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="e.g. Fasting 10 hrs" className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded border" style={{ borderColor: C.hairline }}>Cancel</button>
            <button type="submit" className="px-4 py-1.5 text-sm rounded font-medium text-white" style={{ background: C.accent }}>Add to Report</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- Auth Gate ---------------- */
function AuthGate({ mode, setMode, email, setEmail, password, setPassword, busy, error, onSubmit }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.page, color: C.ink }}>
      <form onSubmit={onSubmit} className="w-full max-w-sm p-6 rounded-lg shadow-sm" style={{ background: C.panel, border: `1px solid ${C.hairline}` }}>
        <div style={{ ...serif, fontSize: 26, fontWeight: 700 }}>MedLens</div>
        <p className="text-sm mt-1 mb-5" style={{ color: C.inkSoft }}>Clinical health ledger with cloud sync.</p>
        {error && <div className="mb-4 p-3 rounded text-sm" style={{ background: C.highSoft, color: C.high }}>{error}</div>}
        <label className="block text-xs font-semibold uppercase mb-3">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} /></label>
        <label className="block text-xs font-semibold uppercase mb-4">Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded px-3 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} /></label>
        <button disabled={busy} className="w-full rounded px-4 py-2 text-sm font-medium text-white transition-opacity" style={{ background: C.accent, opacity: busy ? 0.6 : 1 }}>{busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} className="w-full mt-3 text-xs text-center" style={{ color: C.accent }}>{mode === "sign-in" ? "Create a new account" : "I already have an account"}</button>
      </form>
    </div>
  );
}

/* ---------------- Toast Notification ---------------- */
function ToastNotification({ toast, onDismiss }) {
  if (!toast) return null;
  const isSuccess = toast.type === "success";
  const isError = toast.type === "error";
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-sm transition-all duration-300 border"
      style={{
        background: isError ? C.criticalSoft : isSuccess ? C.normalSoft : C.panel,
        color: isError ? C.critical : isSuccess ? C.normal : C.ink,
        borderColor: isError ? C.critical : isSuccess ? C.normal : C.hairline,
      }}
    >
      {isSuccess ? <CheckCircle2 size={16} /> : isError ? <AlertTriangle size={16} /> : <Info size={16} />}
      <span>{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

/* ---------------- Main MedLens Application ---------------- */
export default function MedLens() {
  const [tab, setTab] = useState("intake");
  const [patient, setPatient] = useState({
    name: "",
    age: "",
    sex: "",
    symptoms: "",
    conditions: "",
    allergies: "",
    medications: "",
    notes: "",
  });
  const [reports, setReports] = useState([]);
  const [draftText, setDraftText] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [draftFile, setDraftFile] = useState(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileStatusText, setFileStatusText] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("sign-in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState(null);

  // Search & Filter in Structured Record
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReportFilter, setSelectedReportFilter] = useState("all");

  // Modal for adding a manual test
  const [activeReportIdForAdd, setActiveReportIdForAdd] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = useCallback((message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast((curr) => (curr?.message === message ? null : curr)), 3500);
  }, []);

  /* Load persisted record */
  useEffect(() => {
    let active = true;
    async function loadRecord() {
      if (cloudPersistenceEnabled) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!active) return;
        setUser(session?.user || null);
        if (session?.user) {
          const { data } = await supabase
            .from("medlens_records")
            .select("record")
            .eq("user_id", session.user.id)
            .maybeSingle();
          const parsed = data?.record;
          if (parsed?.patient) setPatient(parsed.patient);
          if (parsed?.reports) setReports(parsed.reports);
          if (parsed?.summary) setSummary(parsed.summary);
          if (parsed?.auditLog) setAuditLog(parsed.auditLog);
        }
      } else {
        try {
          const raw = localStorage.getItem("medlens-record");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.patient) setPatient(parsed.patient);
            if (parsed.reports) setReports(parsed.reports);
            if (parsed.summary) setSummary(parsed.summary);
            if (parsed.auditLog) setAuditLog(parsed.auditLog);
          }
        } catch {
          /* no saved record yet */
        }
      }
      if (active) setLoaded(true);
    }
    loadRecord();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(async (next) => {
    try {
      localStorage.setItem("medlens-record", JSON.stringify(next));
    } catch (e) {
      console.error("Local save failed", e);
    }
  }, []);

  useEffect(() => {
    if (!loaded || (cloudPersistenceEnabled && !user)) return;
    const record = { patient, reports, summary, auditLog };
    if (cloudPersistenceEnabled) {
      supabase
        .from("medlens_records")
        .upsert({ user_id: user.id, record, updated_at: new Date().toISOString() });
    } else {
      persist(record);
    }
  }, [patient, reports, summary, auditLog, loaded, persist, user]);

  /* Load sample demo scenario */
  function loadSampleData() {
    setPatient(SAMPLE_PATIENT);
    setReports(SAMPLE_REPORTS);
    setSummary(SAMPLE_SUMMARY);
    setAuditLog(SAMPLE_AUDIT_LOG);
    setTab("record");
    showToast("Loaded sample clinical patient record (Eleanor Vance)", "success");
  }

  function insertSampleReportText() {
    setDraftText(SAMPLE_RAW_REPORT_TEXT);
    setDraftTitle("Routine Metabolic & Lipid Profile — Aug 2026");
    showToast("Sample report text inserted into intake box", "info");
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const result =
      authMode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword });
    if (result.error) setAuthError(result.error.message);
    else if (result.data.user) setUser(result.data.user);
    setAuthBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setPatient({ name: "", age: "", sex: "", symptoms: "", conditions: "", allergies: "", medications: "", notes: "" });
    setReports([]);
    setAuditLog([]);
  }

  /* Drag & Drop and File Upload Processing */
  async function processFile(file) {
    if (!file) return;
    setFileBusy(true);
    setFileStatusText(`Reading ${file.name} with OCR...`);
    setErr(null);
    setDraftFile(file);
    try {
      const text = await extractDocumentText(file);
      setDraftText(text);
      if (!draftTitle) {
        setDraftTitle(file.name.replace(/\.(pdf|png|jpe?g)$/i, ""));
      }
      showToast(`Document loaded: ${file.name}`, "success");
    } catch (e) {
      setErr("Couldn't read that document. Try a clearer PDF or image. (" + e.message + ")");
    } finally {
      setFileBusy(false);
      setFileStatusText("");
    }
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = "";
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  /* Extraction workflow (tries Claude first, falls back gracefully to Heuristic Parser) */
  async function extractReport() {
    if (!draftText.trim()) return;
    setBusy(true);
    setErr(null);
    let detectedTests = [];
    let detectedDate = todayStr();
    let extractionSource = "ai_extracted";

    try {
      // Attempt 1: Call Claude API backend proxy
      const raw = await callClaude(EXTRACT_SYSTEM, draftText);
      const parsed = JSON.parse(stripFence(raw));
      detectedTests = (parsed.tests || []).map((t) => ({
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
      if (parsed.reportDate) detectedDate = parsed.reportDate;
      extractionSource = "ai_extracted";
    } catch {
      // Fallback: Client-side heuristic parser
      const localResult = parseReportTextLocally(draftText);
      if (localResult.tests.length > 0) {
        detectedTests = localResult.tests.map((t) => ({
          ...t,
          id: uid(),
          source: "local_heuristic",
        }));
        if (localResult.reportDate) detectedDate = localResult.reportDate;
        extractionSource = "local_heuristic";
        showToast("Extracted using MedLens Local Heuristic Engine (Claude API offline)", "info");
      } else {
        setErr("Could not detect structured lab tests from the text. Please verify formatting.");
        setBusy(false);
        return;
      }
    }

    if (detectedTests.length === 0) {
      setErr("No valid laboratory values could be identified. Ensure the report includes test names and numeric values.");
      setBusy(false);
      return;
    }

    const newReport = {
      id: uid(),
      title: draftTitle.trim() || `Report ${reports.length + 1}`,
      date: detectedDate,
      rawText: draftText,
      tests: detectedTests,
      createdAt: new Date().toISOString(),
    };

    setReports((r) => [newReport, ...r]);
    setAuditLog((log) => [
      {
        id: uid(),
        at: new Date().toISOString(),
        action: "Report extracted",
        detail: `${newReport.title} (${detectedTests.length} tests, ${extractionSource})`,
      },
      ...log,
    ].slice(0, 100));

    setDraftText("");
    setDraftTitle("");
    setDraftFile(null);
    setBusy(false);
    setTab("record");
    showToast(`Successfully extracted ${detectedTests.length} test values!`, "success");
  }

  function updateTest(reportId, testId, patch) {
    const report = reports.find((item) => item.id === reportId);
    const test = report?.tests.find((item) => item.id === testId);
    setReports((rs) =>
      rs.map((r) =>
        r.id !== reportId
          ? r
          : { ...r, tests: r.tests.map((t) => (t.id === testId ? { ...t, ...patch, source: "user_verified" } : t)) }
      )
    );
    if (test) {
      setAuditLog((log) => [
        {
          id: uid(),
          at: new Date().toISOString(),
          action: "Value verified",
          detail: `${test.name}: ${test.value} → ${patch.value ?? test.value}`,
        },
        ...log,
      ].slice(0, 100));
      showToast(`Verified ${test.name}`, "success");
    }
  }

  function verifyAllTestsInReport(reportId) {
    const report = reports.find((item) => item.id === reportId);
    if (!report) return;
    setReports((rs) =>
      rs.map((r) =>
        r.id !== reportId
          ? r
          : { ...r, tests: r.tests.map((t) => ({ ...t, source: "user_verified" })) }
      )
    );
    setAuditLog((log) => [
      { id: uid(), at: new Date().toISOString(), action: "Batch verified", detail: `All tests in ${report.title}` },
      ...log,
    ].slice(0, 100));
    showToast(`All tests in "${report.title}" marked as verified`, "success");
  }

  function deleteTest(reportId, testId) {
    setReports((rs) =>
      rs.map((r) => (r.id !== reportId ? r : { ...r, tests: r.tests.filter((t) => t.id !== testId) }))
    );
    showToast("Test entry removed", "info");
  }

  function handleAddManualTest(newTest) {
    if (!activeReportIdForAdd) return;
    setReports((rs) =>
      rs.map((r) => (r.id !== activeReportIdForAdd ? r : { ...r, tests: [...r.tests, newTest] }))
    );
    setAuditLog((log) => [
      { id: uid(), at: new Date().toISOString(), action: "Test added manually", detail: newTest.name },
      ...log,
    ].slice(0, 100));
    showToast(`Added test "${newTest.name}"`, "success");
  }

  function deleteReport(id) {
    const report = reports.find((item) => item.id === id);
    if (!window.confirm(`Delete "${report?.title || "this report"}"?`)) return;
    setReports((rs) => rs.filter((r) => r.id !== id));
    if (report) {
      setAuditLog((log) => [
        { id: uid(), at: new Date().toISOString(), action: "Report removed", detail: report.title },
        ...log,
      ].slice(0, 100));
      showToast(`Removed "${report.title}"`, "info");
    }
  }

  /* Conflict & Safety Checker */
  const conflicts = useMemo(() => {
    const list = [];
    const allergyTerms = patient.allergies.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const medTerms = patient.medications.split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean);

    allergyTerms.forEach((a) => {
      medTerms.forEach((m) => {
        if (a && m && (m.includes(a) || a.includes(m))) {
          list.push(`Prescribed medication "${m}" may conflict with documented allergy "${a}".`);
        }
      });
    });

    reports.forEach((r) => {
      const seen = {};
      r.tests.forEach((t) => {
        const key = t.name.toLowerCase();
        if (seen[key] && seen[key] !== t.value) {
          list.push(`"${r.title}" lists "${t.name}" multiple times with conflicting values ("${seen[key]}" vs "${t.value}").`);
        }
        seen[key] = t.value;
      });
    });

    return list;
  }, [patient, reports]);

  /* Critical lab alerts across all records */
  const criticalAlerts = useMemo(() => {
    const alerts = [];
    reports.forEach((r) => {
      r.tests.forEach((t) => {
        const alertMsg = checkCritical(t);
        if (alertMsg) {
          alerts.push({ reportTitle: r.title, date: r.date, message: alertMsg });
        }
      });
    });
    return alerts;
  }, [reports]);

  /* Multi-report trends */
  const trends = useMemo(() => {
    const byName = {};
    [...reports]
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .forEach((r) => {
        r.tests.forEach((t) => {
          if (t.numericValue == null) return;
          byName[t.name] = byName[t.name] || [];
          byName[t.name].push({
            date: r.date,
            reportTitle: r.title,
            value: t.numericValue,
            unit: t.unit,
            referenceMin: t.referenceMin,
            referenceMax: t.referenceMax,
            status: computeStatus(t),
          });
        });
      });
    return Object.entries(byName).filter(([, v]) => v.length > 1);
  }, [reports]);

  /* AI Summary generation with local fallback */
  async function generateSummary() {
    setSummaryBusy(true);
    setErr(null);
    try {
      const payload = {
        patient: {
          age: patient.age,
          sex: patient.sex,
          symptoms: patient.symptoms,
          conditions: patient.conditions,
          allergies: patient.allergies,
          medications: patient.medications,
        },
        reports: reports.map((r) => ({
          title: r.title,
          date: r.date,
          tests: r.tests.map((t) => ({
            name: t.name,
            value: t.value,
            unit: t.unit,
            referenceRangeText: t.referenceRangeText,
            status: computeStatus(t),
          })),
        })),
      };
      const text = await callClaude(SUMMARY_SYSTEM, JSON.stringify(payload));
      setSummary(text.trim());
      showToast("Summary generated via Claude AI", "success");
    } catch {
      // Offline fallback summary
      const localSumm = generateLocalSummary(patient, reports);
      setSummary(localSumm);
      showToast("Generated summary using MedLens Clinical Synthesis Engine", "info");
    } finally {
      setSummaryBusy(false);
    }
  }

  /* Multi-Format Exports */
  function exportRecordText() {
    const lines = [
      "============================================================",
      "MEDLENS — PATIENT CLINICAL RECORD EXPORT",
      "Organized clinical information — not a medical diagnosis",
      `Exported: ${new Date().toLocaleString()}`,
      "============================================================",
      "",
      "PATIENT DEMOGRAPHICS (Patient-reported)",
      `Name: ${patient.name || "—"}`,
      `Age: ${patient.age || "—"}    Sex: ${patient.sex || "—"}`,
      `Reported Symptoms: ${patient.symptoms || "None listed"}`,
      `Documented Conditions: ${patient.conditions || "None listed"}`,
      `Documented Allergies: ${patient.allergies || "None listed"}`,
      `Active Medications: ${patient.medications || "None listed"}`,
      `Notes: ${patient.notes || "—"}`,
      "",
      "------------------------------------------------------------",
      "REPORTS & STRUCTURED TEST RESULTS",
      "------------------------------------------------------------",
    ];

    reports.forEach((r) => {
      lines.push(`\n[REPORT] ${r.title} (Date: ${r.date})`);
      r.tests.forEach((t) => {
        const st = STATUS_META[computeStatus(t)]?.label || "Unknown";
        lines.push(
          `  - ${t.name}: ${t.value} ${t.unit || ""} [${st}] (Ref: ${t.referenceRangeText || "none stated"}) [${t.source}]`
        );
      });
    });

    if (summary) {
      lines.push("\n------------------------------------------------------------");
      lines.push("CLINICAL OVERVIEW");
      lines.push("------------------------------------------------------------");
      lines.push(summary);
    }

    lines.push("\n============================================================");
    lines.push("Disclaimer: For personal health organization only. Discuss with a physician.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(patient.name || "medlens").replace(/\s+/g, "_")}_record.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded text record", "success");
  }

  function exportJsonRecord() {
    const data = {
      exportedAt: new Date().toISOString(),
      patient,
      reports,
      summary,
      auditLog,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(patient.name || "medlens").replace(/\s+/g, "_")}_record.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded JSON record", "success");
  }

  function exportCsvRecord() {
    const rows = [
      ["Report Title", "Report Date", "Test Name", "Result Value", "Numeric Value", "Unit", "Reference Range", "Status", "Observation", "Source"],
    ];

    reports.forEach((r) => {
      r.tests.forEach((t) => {
        rows.push([
          `"${r.title.replace(/"/g, '""')}"`,
          `"${r.date}"`,
          `"${t.name.replace(/"/g, '""')}"`,
          `"${t.value}"`,
          t.numericValue != null ? t.numericValue : "",
          `"${t.unit || ""}"`,
          `"${t.referenceRangeText || ""}"`,
          `"${computeStatus(t)}"`,
          `"${(t.observation || "").replace(/"/g, '""')}"`,
          `"${t.source}"`,
        ]);
      });
    });

    const csvContent = rows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(patient.name || "medlens").replace(/\s+/g, "_")}_labs.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded CSV table", "success");
  }

  function clearRecord() {
    if (!window.confirm("Clear this local record? All data will be reset.")) return;
    localStorage.removeItem("medlens-record");
    setPatient({ name: "", age: "", sex: "", symptoms: "", conditions: "", allergies: "", medications: "", notes: "" });
    setReports([]);
    setSummary("");
    setDraftText("");
    setDraftTitle("");
    setAuditLog([]);
    setErr(null);
    setTab("intake");
    showToast("Record reset", "info");
  }

  if (cloudPersistenceEnabled && !user && loaded) {
    return (
      <AuthGate
        mode={authMode}
        setMode={setAuthMode}
        email={authEmail}
        setEmail={setAuthEmail}
        password={authPassword}
        setPassword={setAuthPassword}
        busy={authBusy}
        error={authError}
        onSubmit={handleAuth}
      />
    );
  }

  /* Aggregates for badges & filters */
  const totalTests = reports.reduce((n, r) => n + r.tests.length, 0);
  const outOfRange = reports.reduce(
    (n, r) => n + r.tests.filter((t) => ["low", "high"].includes(computeStatus(t))).length,
    0
  );
  const unverifiedCount = reports.reduce(
    (n, r) => n + r.tests.filter((t) => t.source !== "user_verified").length,
    0
  );

  return (
    <div style={{ background: C.page, color: C.ink, minHeight: "100vh" }} className="w-full">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      `}</style>

      {/* ================= Printable Sheet (Doctor Handout) ================= */}
      <div className="print-only p-8 text-black bg-white">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 style={{ ...serif, fontSize: 26, fontWeight: 700 }}>MEDLENS CLINICAL SUMMARY</h1>
            <p className="text-xs text-gray-600 mt-1">
              Patient-Organized Health Dossier · Prepared for Clinical Consultation
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Printed: {new Date().toLocaleDateString()}</div>
            <div>MedLens v2.0</div>
          </div>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-3 gap-4 p-4 border border-gray-300 rounded mb-6 text-sm">
          <div>
            <span className="font-bold block text-xs uppercase text-gray-500">Patient</span>
            <span className="font-semibold">{patient.name || "Unnamed"}</span>
          </div>
          <div>
            <span className="font-bold block text-xs uppercase text-gray-500">Demographics</span>
            <span>{patient.age ? `${patient.age} yrs` : "—"} / {patient.sex || "—"}</span>
          </div>
          <div>
            <span className="font-bold block text-xs uppercase text-gray-500">Known Allergies</span>
            <span className="text-red-700 font-semibold">{patient.allergies || "NKDA"}</span>
          </div>
          <div className="col-span-2">
            <span className="font-bold block text-xs uppercase text-gray-500">Active Conditions</span>
            <span>{patient.conditions || "None reported"}</span>
          </div>
          <div>
            <span className="font-bold block text-xs uppercase text-gray-500">Current Medications</span>
            <span>{patient.medications || "None listed"}</span>
          </div>
        </div>

        {/* Lab Results Table */}
        <h2 style={{ ...serif, fontSize: 18, fontWeight: 700 }} className="mb-2">Laboratory Test Ledger</h2>
        <table className="w-full text-xs border-collapse border border-gray-300 mb-6">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="border border-gray-300 p-2">Report Date</th>
              <th className="border border-gray-300 p-2">Panel / Report</th>
              <th className="border border-gray-300 p-2">Test Name</th>
              <th className="border border-gray-300 p-2">Result</th>
              <th className="border border-gray-300 p-2">Reference Range</th>
              <th className="border border-gray-300 p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.flatMap((r) =>
              r.tests.map((t) => {
                const st = computeStatus(t);
                return (
                  <tr key={t.id} className={st === "high" || st === "low" ? "bg-amber-50 font-medium" : ""}>
                    <td className="border border-gray-300 p-2">{r.date}</td>
                    <td className="border border-gray-300 p-2">{r.title}</td>
                    <td className="border border-gray-300 p-2 font-medium">{t.name}</td>
                    <td className="border border-gray-300 p-2" style={mono}>
                      {t.value} {t.unit || ""}
                    </td>
                    <td className="border border-gray-300 p-2 text-gray-600">{t.referenceRangeText || "—"}</td>
                    <td className="border border-gray-300 p-2 uppercase font-semibold">
                      {st === "high" ? "HIGH" : st === "low" ? "LOW" : "Normal"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Summary Narrative */}
        {summary && (
          <div className="p-4 border border-gray-300 rounded mb-8">
            <h3 className="font-bold text-xs uppercase text-gray-500 mb-1">Clinical Overview</h3>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Doctor Signature Line */}
        <div className="pt-8 border-t border-gray-300 grid grid-cols-2 gap-8 text-xs text-gray-600">
          <div>Clinician Signature: ___________________________</div>
          <div className="text-right">Date: __________________</div>
        </div>
      </div>

      {/* ================= Header ================= */}
      <header
        className="no-print flex flex-wrap items-center justify-between gap-4 px-6 py-3.5 sticky top-0 z-30 shadow-xs backdrop-blur-md"
        style={{ borderBottom: `1px solid ${C.hairline}`, background: `${C.panel}F0` }}
      >
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span style={{ ...serif, fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", color: C.ink }}>
                MedLens
              </span>
              <span
                className="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider"
                style={{ background: C.accentSoft, color: C.accent }}
              >
                Intelligence v2.0
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: C.inkSoft }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: C.normal, display: "inline-block" }} />
              Clinical ledger · organized for reference, not a diagnosis
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Sample Data Loader */}
          {reports.length === 0 && !patient.name && (
            <button
              onClick={loadSampleData}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded shadow-xs transition-colors"
              style={{ background: C.accent, color: "#FFFFFF" }}
              title="Load full demo patient scenario"
            >
              <Sparkles size={14} /> Load Demo Record
            </button>
          )}

          {/* Export Actions */}
          <div className="flex items-center gap-1 rounded p-0.5 border" style={{ borderColor: C.hairline, background: C.page }}>
            <button
              onClick={exportRecordText}
              disabled={reports.length === 0 && !patient.name}
              title="Download clean plain-text file"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <FileText size={13} /> Text
            </button>
            <button
              onClick={exportCsvRecord}
              disabled={reports.length === 0}
              title="Download CSV table for Excel or Sheets"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <FileSpreadsheet size={13} /> CSV
            </button>
            <button
              onClick={exportJsonRecord}
              disabled={reports.length === 0 && !patient.name}
              title="Download full portable JSON"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <Download size={13} /> JSON
            </button>
            <button
              onClick={() => window.print()}
              disabled={reports.length === 0 && !patient.name}
              title="Printable Doctor Handout"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.accent }}
            >
              <Printer size={13} /> Print Sheet
            </button>
          </div>

          <button
            onClick={clearRecord}
            disabled={!patient.name && reports.length === 0}
            title="Reset record"
            className="p-1.5 rounded transition-colors hover:bg-red-50 disabled:opacity-30"
            style={{ border: `1px solid ${C.hairline}`, color: C.high }}
          >
            <RotateCcw size={14} />
          </button>

          {cloudPersistenceEnabled && (
            <button onClick={signOut} className="text-xs px-2 py-1 rounded" style={{ color: C.inkSoft }}>
              {user?.email?.split("@")[0]} · sign out
            </button>
          )}
        </div>
      </header>

      {/* ================= Main Layout ================= */}
      <div className="no-print flex flex-col md:flex-row min-h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside
          className="w-full md:w-64 shrink-0 p-4 flex flex-col gap-1 border-r"
          style={{ borderColor: C.hairline, background: C.panel }}
        >
          <NavItem icon={User} label="Patient Intake" active={tab === "intake"} onClick={() => setTab("intake")} />
          <NavItem
            icon={FileText}
            label="Add Report"
            active={tab === "reports"}
            badge={reports.length > 0 ? reports.length : undefined}
            onClick={() => setTab("reports")}
          />
          <NavItem
            icon={ClipboardList}
            label="Structured Record"
            active={tab === "record"}
            badge={totalTests > 0 ? totalTests : undefined}
            onClick={() => setTab("record")}
          />
          <NavItem
            icon={MessageSquare}
            label="Clinical Summary"
            active={tab === "summary"}
            badge={summary ? "Ready" : undefined}
            onClick={() => setTab("summary")}
          />
          <NavItem
            icon={Clock}
            label="History & Trends"
            active={tab === "history"}
            badge={trends.length > 0 ? `${trends.length} tracked` : undefined}
            onClick={() => setTab("history")}
          />

          {/* Quick Metrics Card */}
          <div className="mt-5 p-3.5 rounded-lg text-xs flex flex-col gap-2" style={{ background: C.page, border: `1px solid ${C.hairline}` }}>
            <div className="font-semibold text-gray-700 flex items-center justify-between">
              <span>Record Snapshot</span>
              <span className="text-[10px] uppercase font-bold" style={{ color: C.inkSoft }}>{patient.name ? "Active" : "New"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="p-2 rounded bg-white border" style={{ borderColor: C.hairline }}>
                <div className="text-lg font-bold" style={{ color: C.accent }}>{totalTests}</div>
                <div className="text-[10px]" style={{ color: C.inkSoft }}>Total Tests</div>
              </div>
              <div className="p-2 rounded bg-white border" style={{ borderColor: C.hairline }}>
                <div className="text-lg font-bold" style={{ color: outOfRange > 0 ? C.high : C.normal }}>{outOfRange}</div>
                <div className="text-[10px]" style={{ color: C.inkSoft }}>Out of Range</div>
              </div>
            </div>
            {unverifiedCount > 0 && (
              <div className="text-[11px] pt-1 text-center" style={{ color: C.inkSoft }}>
                {unverifiedCount} value{unverifiedCount === 1 ? "" : "s"} awaiting review
              </div>
            )}
          </div>

          {/* Conflicts Alert */}
          {conflicts.length > 0 && (
            <div className="mt-3 p-3 rounded-lg text-xs flex gap-2.5" style={{ background: C.highSoft, color: C.high, border: `1px solid ${C.high}33` }}>
              <ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{conflicts.length} safety alert{conflicts.length === 1 ? "" : "s"}</span>
                <p className="text-[11px] mt-0.5 opacity-90">Potential medication/allergy conflict</p>
              </div>
            </div>
          )}

          {/* Critical alerts */}
          {criticalAlerts.length > 0 && (
            <div className="mt-2 p-3 rounded-lg text-xs flex gap-2.5" style={{ background: C.criticalSoft, color: C.critical, border: `1px solid ${C.critical}33` }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Critical Lab Alert</span>
                <p className="text-[11px] mt-0.5 opacity-90">{criticalAlerts[0].message}</p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-4 text-[11px] text-center" style={{ color: C.inkSoft }}>
            {cloudPersistenceEnabled ? "Cloud-synced" : "Local Storage mode"}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-4xl overflow-y-auto">
          {err && (
            <div className="mb-5 p-3.5 rounded-lg text-sm flex items-start gap-2.5 shadow-xs" style={{ background: C.highSoft, color: C.high, border: `1px solid ${C.high}44` }}>
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Notice</div>
                <div className="text-xs mt-0.5">{err}</div>
              </div>
            </div>
          )}

          {/* ================= TAB: Patient Intake ================= */}
          {tab === "intake" && (
            <section className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 22, fontWeight: 700 }}>Patient Intake</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Record baseline demographics, symptoms, and medical history. Tagged as <em>patient-reported</em>.
                  </p>
                </div>
                {reports.length === 0 && !patient.name && (
                  <button
                    onClick={loadSampleData}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded transition-colors"
                    style={{ background: C.accentSoft, color: C.accent }}
                  >
                    <Sparkles size={14} /> Try Sample Patient
                  </button>
                )}
              </div>

              <div className="p-5 rounded-lg border shadow-xs" style={{ background: C.panel, borderColor: C.hairline }}>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Full Name" half value={patient.name} onChange={(v) => setPatient((p) => ({ ...p, name: v }))} placeholder="e.g. Eleanor Vance" />
                  <Field label="Age" half value={patient.age} onChange={(v) => setPatient((p) => ({ ...p, age: v }))} placeholder="e.g. 54" />
                  <Field label="Sex / Gender" half value={patient.sex} onChange={(v) => setPatient((p) => ({ ...p, sex: v }))} placeholder="e.g. Female" />
                  <div className="col-span-2 sm:col-span-1" />
                  <Field label="Chief Symptoms & Timeline" value={patient.symptoms} onChange={(v) => setPatient((p) => ({ ...p, symptoms: v }))} placeholder="What symptoms are present, and since when?" textarea />
                  <Field label="Existing Medical Conditions" value={patient.conditions} onChange={(v) => setPatient((p) => ({ ...p, conditions: v }))} placeholder="e.g. Type 2 Diabetes, Hypertension" textarea />
                  <Field label="Documented Allergies" value={patient.allergies} onChange={(v) => setPatient((p) => ({ ...p, allergies: v }))} placeholder="e.g. Penicillin, Sulfa" textarea />
                  <Field label="Current Medications & Dosages" value={patient.medications} onChange={(v) => setPatient((p) => ({ ...p, medications: v }))} placeholder="Name, dose, frequency" textarea />
                  <Field label="Additional Clinical Notes" value={patient.notes} onChange={(v) => setPatient((p) => ({ ...p, notes: v }))} placeholder="Fasting status, lifestyle, or prior physician advice" textarea />
                </div>
              </div>

              {/* Drug-Allergy Warning Box */}
              {conflicts.length > 0 && (
                <div className="p-4 rounded-lg text-sm" style={{ background: C.highSoft, color: C.high, border: `1px solid ${C.high}44` }}>
                  <div className="font-semibold mb-1.5 flex items-center gap-2">
                    <ShieldAlert size={16} /> Clinical Flags for Review
                  </div>
                  <ul className="list-disc ml-5 space-y-1 text-xs">
                    {conflicts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* ================= TAB: Add Medical Report ================= */}
          {tab === "reports" && (
            <section className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 22, fontWeight: 700 }}>Add Medical Report</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Paste a lab report, clinical summary, or drop a PDF/image document. MedLens extracts exact lab values, units, and ranges without guessing.
                  </p>
                </div>
                <button
                  onClick={insertSampleReportText}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-colors"
                  style={{ background: C.accentSoft, color: C.accent }}
                  title="Insert realistic sample laboratory report text"
                >
                  <FileText size={14} /> Insert Sample Report
                </button>
              </div>

              <div className="p-5 rounded-lg border shadow-xs space-y-4" style={{ background: C.panel, borderColor: C.hairline }}>
                {/* Report Title */}
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 block mb-1">
                    Report Label / Title
                  </span>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder='e.g. "Metabolic Panel — Aug 2026"'
                    className="w-full rounded px-3 py-2 text-sm outline-none border transition-colors"
                    style={{ borderColor: C.hairline, background: C.page }}
                  />
                </div>

                {/* Drag & Drop File Area */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-6 rounded-lg border-2 border-dashed cursor-pointer text-center transition-all"
                  style={{
                    borderColor: isDragOver ? C.accent : C.hairline,
                    background: isDragOver ? C.accentSoft : "#FBFAF7",
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={handleFileUpload}
                    disabled={fileBusy}
                    className="sr-only"
                  />
                  <div className="flex flex-col items-center justify-center gap-2">
                    {fileBusy ? (
                      <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: C.accent }}>
                        <Loader2 size={20} className="animate-spin" />
                        {fileStatusText || "Processing document..."}
                      </div>
                    ) : (
                      <>
                        <UploadCloud size={28} style={{ color: C.accent }} />
                        <div className="text-sm font-semibold" style={{ color: C.ink }}>
                          {draftFile ? draftFile.name : "Drag & drop PDF or Image, or click to browse"}
                        </div>
                        <div className="text-xs" style={{ color: C.inkSoft }}>
                          Supports PDF, PNG, JPG · In-browser OCR via PDF.js & Tesseract
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Raw Text Box */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                      Report Text Content
                    </span>
                    {draftText && (
                      <button
                        onClick={() => setDraftText("")}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={9}
                    placeholder="Paste raw lab results, pathology report, or clinical note text here..."
                    className="w-full rounded px-3 py-2 text-xs outline-none border leading-relaxed"
                    style={{ ...mono, borderColor: C.hairline, background: C.page }}
                  />
                </div>

                {/* Extract Button */}
                <div className="flex items-center justify-between pt-1">
                  <div className="text-xs" style={{ color: C.inkSoft }}>
                    Engine: Claude AI Proxy (with Local Heuristic Fallback)
                  </div>
                  <button
                    onClick={extractReport}
                    disabled={busy || !draftText.trim()}
                    className="flex items-center gap-2 text-sm px-5 py-2.5 rounded font-semibold text-white transition-opacity shadow-xs"
                    style={{ background: C.accent, opacity: busy || !draftText.trim() ? 0.6 : 1 }}
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {busy ? "Extracting Lab Data…" : "Extract Structured Data"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ================= TAB: Structured Record ================= */}
          {tab === "record" && (
            <section className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 style={{ ...serif, fontSize: 22, fontWeight: 700 }}>Structured Record</h2>
                  <p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>
                    Extracted biomarkers organized by clinical report. Edit any value to mark as verified.
                  </p>
                </div>
              </div>

              {/* Search & Filter Toolbar */}
              {reports.length > 0 && (
                <div className="p-3 rounded-lg border shadow-xs flex flex-wrap items-center justify-between gap-3" style={{ background: C.panel, borderColor: C.hairline }}>
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search biomarker (e.g. Glucose, A1c, Cholesterol)..."
                      className="w-full pl-9 pr-3 py-1.5 text-xs rounded border outline-none"
                      style={{ borderColor: C.hairline, background: C.page }}
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      onClick={() => setStatusFilter("all")}
                      className={`px-2.5 py-1 rounded transition-colors ${statusFilter === "all" ? "font-bold text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "all" ? C.accent : "transparent" }}
                    >
                      All ({totalTests})
                    </button>
                    <button
                      onClick={() => setStatusFilter("outOfRange")}
                      className={`px-2.5 py-1 rounded transition-colors ${statusFilter === "outOfRange" ? "font-bold text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "outOfRange" ? C.high : "transparent" }}
                    >
                      Out of Range ({outOfRange})
                    </button>
                    <button
                      onClick={() => setStatusFilter("unverified")}
                      className={`px-2.5 py-1 rounded transition-colors ${statusFilter === "unverified" ? "font-bold text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "unverified" ? "#92400E" : "transparent" }}
                    >
                      Unverified ({unverifiedCount})
                    </button>
                    {reports.length > 1 && (
                      <select
                        value={selectedReportFilter}
                        onChange={(e) => setSelectedReportFilter(e.target.value)}
                        className="px-2 py-1 rounded border outline-none bg-white text-gray-700 ml-1 text-xs"
                        style={{ borderColor: C.hairline }}
                      >
                        <option value="all">All Reports ({reports.length})</option>
                        {reports.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {reports.length === 0 && (
                <div className="text-center p-8 rounded-lg border border-dashed" style={{ borderColor: C.hairline, background: C.panel }}>
                  <ClipboardList size={32} className="mx-auto mb-2 opacity-50" style={{ color: C.inkSoft }} />
                  <div className="font-semibold" style={{ color: C.ink }}>No reports structured yet</div>
                  <p className="text-xs mt-1 mb-4" style={{ color: C.inkSoft }}>
                    Add your first lab report or load a sample scenario to preview organized biomarkers.
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setTab("reports")}
                      className="px-3 py-1.5 rounded text-xs font-semibold text-white"
                      style={{ background: C.accent }}
                    >
                      Add Medical Report
                    </button>
                    <button
                      onClick={loadSampleData}
                      className="px-3 py-1.5 rounded text-xs font-medium border"
                      style={{ borderColor: C.hairline }}
                    >
                      Load Demo Record
                    </button>
                  </div>
                </div>
              )}

              {/* Reports List */}
              <div className="space-y-6">
                {reports
                  .filter((r) => selectedReportFilter === "all" || r.id === selectedReportFilter)
                  .map((r) => {
                  const filteredTests = r.tests.filter((t) => {
                    const matchSearch =
                      !searchTerm.trim() ||
                      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (t.observation && t.observation.toLowerCase().includes(searchTerm.toLowerCase()));

                    if (!matchSearch) return false;

                    const st = computeStatus(t);
                    if (statusFilter === "outOfRange") return st === "low" || st === "high";
                    if (statusFilter === "unverified") return t.source !== "user_verified";
                    return true;
                  });

                  return (
                    <div key={r.id} className="rounded-lg border shadow-xs overflow-hidden" style={{ borderColor: C.hairline, background: C.panel }}>
                      {/* Report Card Header */}
                      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-2" style={{ borderColor: C.hairline, background: "#FCFAF7" }}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{r.title}</span>
                            <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: C.accentSoft, color: C.accent }}>
                              {r.date}
                            </span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                            {r.tests.length} biomarkers recorded
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => verifyAllTestsInReport(r.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium border transition-colors hover:bg-emerald-50 text-emerald-700 border-emerald-300"
                            title="Mark all extracted tests as verified"
                          >
                            <CheckCircle2 size={13} /> Verify All
                          </button>
                          <button
                            onClick={() => setActiveReportIdForAdd(r.id)}
                            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded font-medium border transition-colors hover:bg-white"
                            style={{ borderColor: C.hairline, color: C.accent }}
                            title="Add a manual test entry"
                          >
                            <Plus size={13} /> Add Test
                          </button>
                          <button
                            onClick={() => deleteReport(r.id)}
                            className="p-1 rounded text-gray-400 hover:text-red-600 transition-colors"
                            title="Remove report"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Source Text Drawer & Test Rows */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: C.hairline }}>
                        {/* Original Source Snippet */}
                        <div className="lg:col-span-4 p-4 max-h-96 overflow-auto" style={{ background: "#FDFCF9" }}>
                          <div className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: C.inkSoft }}>
                            Original Report Source
                          </div>
                          <pre className="whitespace-pre-wrap text-[11px] leading-relaxed select-text" style={{ ...mono, color: C.inkSoft }}>
                            {r.rawText || "No original text saved."}
                          </pre>
                        </div>

                        {/* Extracted Test Rows */}
                        <div className="lg:col-span-8 divide-y" style={{ borderColor: C.hairline }}>
                          {filteredTests.length === 0 ? (
                            <div className="p-4 text-xs text-center text-gray-400">
                              No tests match the current search or status filter.
                            </div>
                          ) : (
                            filteredTests.map((t) => (
                              <TestRow
                                key={t.id}
                                test={t}
                                onSave={(patch) => updateTest(r.id, t.id, patch)}
                                onDelete={() => deleteTest(r.id, t.id)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ================= TAB: AI Summary ================= */}
          {tab === "summary" && (
            <section className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 22, fontWeight: 700 }}>Clinical Summary</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Plain-language overview synthesizing lab findings and intake history. Explains findings neutrally without medical diagnoses.
                  </p>
                </div>
              </div>

              <div className="p-5 rounded-lg border shadow-xs space-y-4" style={{ background: C.panel, borderColor: C.hairline }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={generateSummary}
                    disabled={summaryBusy || (reports.length === 0 && !patient.symptoms)}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded font-semibold text-white transition-opacity shadow-xs"
                    style={{ background: C.accent, opacity: summaryBusy || (reports.length === 0 && !patient.symptoms) ? 0.6 : 1 }}
                  >
                    {summaryBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                    {summaryBusy ? "Synthesizing Summary…" : summary ? "Regenerate Summary" : "Generate Summary"}
                  </button>

                  {summary && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(summary);
                        showToast("Summary copied to clipboard", "success");
                      }}
                      className="text-xs px-2.5 py-1.5 rounded border transition-colors hover:bg-gray-50"
                      style={{ borderColor: C.hairline }}
                    >
                      Copy to Clipboard
                    </button>
                  )}
                </div>

                {summary ? (
                  <div className="p-4 rounded-lg text-sm leading-relaxed border space-y-2.5" style={{ background: "#FAFAF7", borderColor: C.hairline }}>
                    <div className="flex items-center gap-2">
                      <Badge color={C.accent} bg={C.accentSoft}>Organized Summary · Non-Diagnostic</Badge>
                    </div>
                    <p style={{ ...serif, fontSize: 15, lineHeight: 1.6 }}>{summary}</p>
                  </div>
                ) : (
                  <div className="text-xs p-6 text-center text-gray-400 border border-dashed rounded" style={{ borderColor: C.hairline }}>
                    Click &ldquo;Generate Summary&rdquo; to build a coherent, plain-language patient overview from your reports.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ================= TAB: History & Trends ================= */}
          {tab === "history" && (
            <section className="space-y-6">
              <div>
                <h2 style={{ ...serif, fontSize: 22, fontWeight: 700 }}>History & Longitudinal Trends</h2>
                <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                  Biomarkers measured across multiple dates, plotted with reference ranges to track trajectory.
                </p>
              </div>

              {trends.length === 0 ? (
                <div className="text-center p-8 rounded-lg border border-dashed" style={{ borderColor: C.hairline, background: C.panel }}>
                  <Clock size={32} className="mx-auto mb-2 opacity-40" style={{ color: C.inkSoft }} />
                  <div className="font-semibold" style={{ color: C.ink }}>No multi-date trends yet</div>
                  <p className="text-xs mt-1 mb-4" style={{ color: C.inkSoft }}>
                    Add at least two reports sharing the same biomarker name (e.g. Glucose or HbA1c) to see trajectory charts.
                  </p>
                  <button onClick={loadSampleData} className="px-3 py-1.5 rounded text-xs font-semibold text-white" style={{ background: C.accent }}>
                    Load Demo Record with Sequential Labs
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trends.map(([name, points]) => (
                    <TrendChart
                      key={name}
                      title={name}
                      points={points}
                      unit={points[0]?.unit}
                    />
                  ))}
                </div>
              )}

              {/* Chronological Reports List */}
              <div className="p-5 rounded-lg border shadow-xs" style={{ background: C.panel, borderColor: C.hairline }}>
                <h3 style={{ ...serif, fontSize: 17, fontWeight: 700 }} className="mb-3">
                  Chronological Report Ledger
                </h3>
                {reports.length === 0 ? (
                  <div className="text-xs text-gray-400">No reports recorded.</div>
                ) : (
                  <div className="divide-y" style={{ borderColor: C.hairline }}>
                    {reports.map((r) => (
                      <div key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Clock size={14} style={{ color: C.inkSoft }} />
                          <span className="text-xs font-medium" style={{ color: C.inkSoft }}>{r.date}</span>
                          <ChevronRight size={13} style={{ color: C.inkSoft }} />
                          <span className="font-semibold">{r.title}</span>
                        </div>
                        <span className="text-xs" style={{ color: C.inkSoft }}>
                          {r.tests.length} tests recorded
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Trail */}
              <div className="p-5 rounded-lg border shadow-xs" style={{ background: C.panel, borderColor: C.hairline }}>
                <h3 style={{ ...serif, fontSize: 17, fontWeight: 700 }} className="mb-3">
                  Verification & Audit Trail
                </h3>
                {auditLog.length === 0 ? (
                  <div className="text-xs text-gray-400">No events logged yet.</div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {auditLog.slice(0, 20).map((event) => (
                      <div key={event.id} className="flex items-center gap-2 text-xs py-1 border-b" style={{ borderColor: C.hairline }}>
                        <span style={{ ...mono, color: C.inkSoft, fontSize: 11 }}>
                          {new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <strong style={{ color: C.ink }}>{event.action}:</strong>
                        <span style={{ color: C.inkSoft }}>{event.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Manual Test Add Modal */}
      <AddTestModal
        isOpen={Boolean(activeReportIdForAdd)}
        onClose={() => setActiveReportIdForAdd(null)}
        onAdd={handleAddManualTest}
      />

      {/* Toast Notification */}
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { extractDocumentText } from "./lib/documentText";
import { cloudPersistenceEnabled, supabase } from "./lib/supabase";
import {
  SAMPLE_RAW_REPORT_TEXT,
  SCENARIOS,
} from "./lib/sampleData";
import { parseReportTextLocally, generateLocalSummary } from "./lib/localParser";
import { lookupBiomarkerInfo } from "./lib/biomarkerDictionary";
import {
  Activity,
  HeartPulse,
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
  SlidersHorizontal,
  Droplets,
  Layers,
  Dna,
  Send,
  Table,
  Copy,
  HelpCircle,
} from "lucide-react";

/* ---------------------------------------------------------------
   MedLens — Design System & Tokens
   Editorial ledger warmth meets modern clinical precision.
------------------------------------------------------------------*/
const C = {
  page: "#F8F6F1",
  panel: "#FFFFFF",
  panelMuted: "#FCFAF6",
  ink: "#192825",
  inkSoft: "#586965",
  hairline: "#E2DCD0",
  hairlineDark: "#C7C0B2",
  accent: "#1E6C66",
  accentSoft: "#E3EFEF",
  accentHover: "#165550",
  low: "#2962B8",
  lowSoft: "#EBF2FD",
  high: "#BD4A1F",
  highSoft: "#FCEEE7",
  normal: "#297C4D",
  normalSoft: "#EAF5EE",
  unknown: "#7A7368",
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

/* ---------------- Clinical Status & Categorization ---------------- */
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

function getBiomarkerCategory(testName = "") {
  const n = testName.toLowerCase();
  if (n.includes("glucose") || n.includes("a1c") || n.includes("insulin")) {
    return { name: "Metabolic", color: "#B45309", bg: "#FEF3C7", icon: Droplets };
  }
  if (n.includes("cholesterol") || n.includes("ldl") || n.includes("hdl") || n.includes("triglyceride") || n.includes("apolipoprotein")) {
    return { name: "Lipids", color: "#0F766E", bg: "#CCFBF1", icon: HeartPulse };
  }
  if (n.includes("creatinine") || n.includes("gfr") || n.includes("bun") || n.includes("potassium") || n.includes("sodium")) {
    return { name: "Renal & Electrolytes", color: "#1D4ED8", bg: "#DBEAFE", icon: Activity };
  }
  if (n.includes("wbc") || n.includes("white blood") || n.includes("platelet") || n.includes("hemoglobin") || n.includes("rbc") || n.includes("ferritin")) {
    return { name: "Hematology", color: "#BE123C", bg: "#FFE4E6", icon: Dna };
  }
  if (n.includes("ast") || n.includes("alt") || n.includes("bilirubin") || n.includes("albumin")) {
    return { name: "Hepatic", color: "#7C3AED", bg: "#EDE9FE", icon: Layers };
  }
  return { name: "Chemistry", color: "#4B5563", bg: "#F3F4F6", icon: Activity };
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
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold tracking-wide"
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
    <span title={label[level] || "Confidence"} className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: C.inkSoft }}>
      <span style={{ width: 22, height: 4, borderRadius: 999, background: C.hairline, display: "inline-block", overflow: "hidden" }}>
        <span style={{ width: width[level] || "33%", height: "100%", borderRadius: 999, background: map[level] || C.unknown, display: "block" }} />
      </span>
      <span className="hidden sm:inline">{label[level] || "Confidence"}</span>
    </span>
  );
}

/* ---------------- Redesigned Visual Range Gauge ---------------- */
function RangeGauge({ value, min, max, unit }) {
  if (value == null || (min == null && max == null)) return null;

  let pos = 50;
  let status = "normal";

  if (min != null && max != null) {
    const span = max - min || 1;
    const lower = min - span * 0.35;
    const upper = max + span * 0.35;
    pos = Math.max(5, Math.min(95, ((value - lower) / (upper - lower)) * 100));
    if (value < min) status = "low";
    else if (value > max) status = "high";
  } else if (max != null) {
    pos = Math.max(5, Math.min(95, (value / (max * 1.45)) * 100));
    if (value > max) status = "high";
  } else if (min != null) {
    pos = Math.max(5, Math.min(95, (value / (min * 1.75)) * 100));
    if (value < min) status = "low";
  }

  const pinColor = status === "high" ? C.high : status === "low" ? C.low : C.normal;

  return (
    <div
      className="w-full max-w-[155px] flex flex-col gap-1 select-none"
      title={`Current value: ${value} ${unit || ""} | Target range: ${min != null ? min : ""}${min != null && max != null ? " - " : ""}${max != null ? max : ""}`}
    >
      <div className="relative w-full h-2 rounded-full overflow-hidden flex bg-gray-100 shadow-inner">
        {/* Low zone */}
        <div style={{ width: min != null && max != null ? "25%" : min != null ? "35%" : "0%", background: "#BFDBFE" }} />
        {/* Normal zone */}
        <div style={{ width: min != null && max != null ? "50%" : "65%", background: "#BBF7D0" }} />
        {/* High zone */}
        <div style={{ width: min != null && max != null ? "25%" : max != null ? "35%" : "0%", background: "#FED7AA" }} />

        {/* Needle Pin Marker */}
        <div
          className="absolute top-0 bottom-0 w-2 rounded-full shadow-md transition-all duration-300 ring-1 ring-white"
          style={{
            left: `calc(${pos}% - 4px)`,
            background: pinColor,
          }}
        />
      </div>

      <div className="flex justify-between items-center text-[10px] px-0.5 font-medium" style={{ color: C.inkSoft }}>
        <span style={mono}>{min != null ? min : "<"}</span>
        <span style={{ ...mono, color: pinColor, fontWeight: 700 }}>{value}</span>
        <span style={mono}>{max != null ? max : ">"}</span>
      </div>
    </div>
  );
}

/* ---------------- Redesigned Interactive SVG Area Trend Chart ---------------- */
function TrendChart({ points, title, unit }) {
  const chartId = useMemo(() => `trend-grad-${title.replace(/[^a-zA-Z0-9]/g, "")}-${uid()}`, [title]);
  if (!points || points.length < 2) return null;

  const width = 460;
  const height = 135;
  const padding = { top: 22, right: 35, bottom: 25, left: 45 };
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

  const lineCoords = points.map((p, i) => `${getX(i)},${getY(p.value)}`).join(" ");
  const areaCoords = `${getX(0)},${padding.top + chartH} ${lineCoords} ${getX(points.length - 1)},${padding.top + chartH}`;

  const firstPt = points[0];
  const lastPt = points[points.length - 1];
  const delta = lastPt.value - firstPt.value;
  const pctDelta = firstPt.value !== 0 ? ((delta / firstPt.value) * 100).toFixed(1) : 0;
  const deltaSign = delta > 0 ? "+" : "";

  let trajectoryLabel = "Stable";
  let trajectoryColor = C.inkSoft;
  let trajectoryBg = C.unknownSoft;

  const isGlycemicOrLipid = /(glucose|a1c|cholesterol|ldl|triglyceride)/i.test(title);
  if (Math.abs(delta) > 0.05) {
    if (isGlycemicOrLipid) {
      if (delta < 0) {
        trajectoryLabel = "Improving (Decreasing)";
        trajectoryColor = C.normal;
        trajectoryBg = C.normalSoft;
      } else {
        trajectoryLabel = "Rising Above Target";
        trajectoryColor = C.high;
        trajectoryBg = C.highSoft;
      }
    } else {
      trajectoryLabel = delta > 0 ? "Upward Shift" : "Downward Shift";
      trajectoryColor = C.accent;
      trajectoryBg = C.accentSoft;
    }
  }

  let refBandY1 = null;
  let refBandY2 = null;
  if (commonRefMin != null && commonRefMax != null) {
    refBandY1 = getY(commonRefMax);
    refBandY2 = getY(commonRefMin);
  }

  return (
    <div className="p-4 rounded-xl border transition-shadow hover:shadow-sm" style={{ borderColor: C.hairline, background: C.panel }}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2">
            <span style={{ ...serif, fontSize: 16, fontWeight: 700 }}>{title}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: trajectoryBg, color: trajectoryColor }}>
              {trajectoryLabel}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
            {points.length} records {unit ? `(${unit})` : ""}
            {commonRefMin != null && commonRefMax != null && ` · Target: ${commonRefMin} – ${commonRefMax}`}
          </div>
        </div>
        <div className="text-right">
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded font-bold"
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
          <defs>
            <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.accent} stopOpacity="0.25" />
              <stop offset="100%" stopColor={C.accent} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Normal Reference Band */}
          {refBandY1 != null && refBandY2 != null && (
            <rect
              x={padding.left}
              y={refBandY1}
              width={chartW}
              height={Math.max(2, refBandY2 - refBandY1)}
              fill="#22C55E"
              opacity={0.12}
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
            strokeDasharray="3,3"
          />

          {/* Y Axis Min/Max Labels */}
          <text x={padding.left - 6} y={padding.top + 4} textAnchor="end" fontSize={9} fill={C.inkSoft} style={mono}>
            {maxBound.toFixed(1)}
          </text>
          <text x={padding.left - 6} y={padding.top + chartH} textAnchor="end" fontSize={9} fill={C.inkSoft} style={mono}>
            {minBound.toFixed(1)}
          </text>

          {/* Gradient Area under curve */}
          <polygon fill={`url(#${chartId})`} points={areaCoords} />

          {/* Line connecting points */}
          <polyline
            fill="none"
            stroke={C.accent}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={lineCoords}
          />

          {/* Data points */}
          {points.map((p, idx) => {
            const cx = getX(idx);
            const cy = getY(p.value);
            const status = computeStatus(p);
            const meta = STATUS_META[status] || STATUS_META.normal;
            return (
              <g key={idx} className="cursor-pointer">
                <circle cx={cx} cy={cy} r={5.5} fill={meta.color} stroke="#FFFFFF" strokeWidth={2.5} />
                <text
                  x={cx}
                  y={cy - 9}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={C.ink}
                  style={mono}
                >
                  {p.value}
                </text>
                <text
                  x={cx}
                  y={padding.top + chartH + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={500}
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
    <label className={"flex flex-col gap-1.5 " + (half ? "col-span-2 sm:col-span-1" : "col-span-2")}>
      <span className="text-xs font-bold uppercase tracking-wider text-gray-700">{label}</span>
      <Comp
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={textarea ? 2 : undefined}
        className="w-full rounded-lg px-3.5 py-2 text-sm outline-none transition-all focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700"
        style={{ border: `1px solid ${C.hairline}`, background: "#FFFFFF", color: C.ink }}
      />
    </label>
  );
}

function NavItem({ icon: Icon, label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-left rounded-lg transition-all"
      style={{
        background: active ? C.accentSoft : "transparent",
        color: active ? C.accent : C.inkSoft,
        fontWeight: active ? 700 : 500,
      }}
    >
      <div className="flex items-center gap-3">
        <Icon size={17} style={{ color: active ? C.accent : C.inkSoft }} />
        {label}
      </div>
      {badge != null && (
        <span
          className="text-xs px-2 py-0.5 rounded-full font-bold transition-colors"
          style={{ background: active ? C.accent : "#EFECE4", color: active ? "#FFFFFF" : C.ink }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/* ---------------- Biomarker Explainer ("Clinical Context") Modal ---------------- */
function BiomarkerExplainerModal({ biomarkerName, onClose }) {
  if (!biomarkerName) return null;
  const info = lookupBiomarkerInfo(biomarkerName);

  function copyQuestions() {
    const text = info.doctorQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg p-6 rounded-2xl shadow-2xl bg-white border max-h-[90vh] overflow-y-auto" style={{ borderColor: C.hairline }}>
        <div className="flex items-start justify-between pb-3 border-b" style={{ borderColor: C.hairline }}>
          <div>
            <div className="flex items-center gap-2">
              <span style={{ ...serif, fontSize: 20, fontWeight: 700 }}>{info.name}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: C.accentSoft, color: C.accent }}>
                {info.category}
              </span>
            </div>
            <div className="text-xs text-gray-500 font-medium mt-0.5">Primary System: {info.organ}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="py-4 space-y-4 text-sm">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">What It Measures</h4>
            <p className="text-gray-600 text-xs leading-relaxed">{info.description}</p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-1">Clinical Significance</h4>
            <p className="text-gray-600 text-xs leading-relaxed">{info.clinicalSignificance}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-orange-50 border border-orange-200">
              <span className="text-[10px] font-bold uppercase text-orange-900 block mb-0.5">If Result is High</span>
              <p className="text-xs text-orange-800 leading-relaxed">{info.interpretation.high}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-[10px] font-bold uppercase text-blue-900 block mb-0.5">If Result is Low</span>
              <p className="text-xs text-blue-800 leading-relaxed">{info.interpretation.low}</p>
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-gray-50/70" style={{ borderColor: C.hairline }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Questions for Your Doctor
              </span>
              <button
                onClick={copyQuestions}
                className="flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline"
              >
                <Copy size={12} /> Copy Prompts
              </button>
            </div>
            <ul className="list-disc ml-4 space-y-1.5 text-xs text-gray-700">
              {info.doctorQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-2 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold rounded-lg text-white"
            style={{ background: C.accent }}
          >
            Close Explainer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Scenario Switcher Modal ---------------- */
function ScenarioSwitcherModal({ isOpen, onClose, onSelectScenario, onResetBlank }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl p-6 rounded-2xl shadow-2xl bg-white border" style={{ borderColor: C.hairline }}>
        <div className="flex items-center justify-between pb-3 border-b mb-4" style={{ borderColor: C.hairline }}>
          <div>
            <h3 style={{ ...serif, fontSize: 20, fontWeight: 700 }}>Clinical Scenario Switcher</h3>
            <p className="text-xs text-gray-500 mt-0.5">Switch between real-world patient personas to test clinical flows.</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          {SCENARIOS.map((sc) => (
            <div
              key={sc.id}
              onClick={() => {
                onSelectScenario(sc);
                onClose();
              }}
              className="p-4 rounded-xl border cursor-pointer transition-all hover:border-teal-700 hover:bg-teal-50/20 group"
              style={{ borderColor: C.hairline }}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-sm text-gray-900 group-hover:text-teal-800">{sc.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: C.accentSoft, color: C.accent }}>
                  {sc.specialty}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{sc.summaryDesc}</p>
              <div className="mt-2 text-[11px] font-semibold text-teal-700 flex items-center gap-1">
                Load {sc.patient.name}&rsquo;s records <ChevronRight size={12} />
              </div>
            </div>
          ))}

          <div
            onClick={() => {
              onResetBlank();
              onClose();
            }}
            className="p-3 rounded-xl border border-dashed text-center cursor-pointer hover:bg-gray-50 text-xs font-semibold text-gray-600"
            style={{ borderColor: C.hairline }}
          >
            Start with Blank Slate (Manual Intake & OCR Upload)
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Patient Portal Message Drafter Modal ---------------- */
function PortalMessageModal({ isOpen, onClose, patient, reports }) {
  if (!isOpen) return null;

  const outOfRangeTests = reports.flatMap((r) =>
    r.tests.filter((t) => ["low", "high"].includes(computeStatus(t)))
  );

  const draftMessage = `Dear Care Team,

I am reviewing my recent laboratory results organized in MedLens and wanted to check in regarding a few biomarker values:

${outOfRangeTests.slice(0, 5).map((t) => `• ${t.name}: ${t.value} ${t.unit || ""} (Standard target: ${t.referenceRangeText || "N/A"})`).join("\n")}

A few questions for our next review:
1. Do these numbers align with our current medication and lifestyle plan?
2. Are there any dosage adjustments you would recommend at this stage?
3. When should we schedule my next repeat lab panel?

Thank you,
${patient.name || "Patient"}
${patient.conditions ? `Documented History: ${patient.conditions}` : ""}`;

  function handleCopy() {
    navigator.clipboard.writeText(draftMessage);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg p-6 rounded-2xl shadow-2xl bg-white border" style={{ borderColor: C.hairline }}>
        <div className="flex items-center justify-between pb-3 border-b mb-3" style={{ borderColor: C.hairline }}>
          <div className="flex items-center gap-2">
            <Send size={18} style={{ color: C.accent }} />
            <h3 style={{ ...serif, fontSize: 19, fontWeight: 700 }}>Patient Portal Message Drafter</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Pre-formatted message structured for MyChart, Epic, Cerner, or AthenaHealth patient portals.
        </p>
        <textarea
          readOnly
          value={draftMessage}
          rows={11}
          className="w-full p-3 rounded-xl text-xs font-mono border leading-relaxed bg-gray-50"
          style={{ borderColor: C.hairline }}
        />
        <div className="flex items-center justify-between pt-3">
          <span className="text-[11px] text-gray-400">Ready to paste into your portal</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg border text-xs font-semibold" style={{ borderColor: C.hairline }}>
              Close
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs" style={{ background: C.accent }}>
              <Copy size={13} /> Copy Message
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Editable Test Row ---------------- */
function TestRow({ test, onSave, onDelete, onOpenExplainer }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(test);
  const status = computeStatus(test);
  const meta = STATUS_META[status];
  const criticalAlert = checkCritical(test);
  const category = getBiomarkerCategory(test.name);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => setDraft(test), [test]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (editing) {
    return (
      <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 grid grid-cols-1 sm:grid-cols-6 gap-3 items-center text-sm shadow-xs">
        <div className="sm:col-span-2">
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-1">Test Name</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
        </div>
        <div>
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-1">Value</span>
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
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-1">Unit</span>
          <input
            className="w-full rounded px-2.5 py-1.5 text-sm outline-none bg-white border border-amber-300"
            value={draft.unit || ""}
            onChange={(e) => setDraft((d) => ({ ...d, unit: e.target.value }))}
          />
        </div>
        <div className="sm:col-span-1">
          <span className="text-[10px] uppercase font-bold text-amber-900 block mb-1">Reference Range</span>
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
            className="p-1.5 rounded-lg flex items-center gap-1 text-xs font-bold px-3 py-1.5 shadow-sm"
            style={{ background: C.normal, color: "#fff" }}
          >
            <Check size={14} /> Save
          </button>
          <button
            onClick={() => {
              setDraft(test);
              setEditing(false);
            }}
            className="p-1.5 rounded-lg text-xs px-2.5 py-1.5 bg-gray-200 text-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3.5 sm:px-4 sm:py-3.5 transition-all hover:bg-emerald-50/20 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center text-sm border-b"
      style={{ borderColor: C.hairline }}
    >
      {/* Test Name & Category Pill */}
      <div className="sm:col-span-4">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenExplainer(test.name)}
            className="text-left font-bold text-gray-900 hover:text-teal-800 transition-colors flex items-center gap-1 group"
            title="Click for clinical explanation & questions for your doctor"
          >
            <span style={{ fontSize: 14.5 }}>{test.name}</span>
            <HelpCircle size={13} className="text-gray-400 group-hover:text-teal-700 transition-colors" />
          </button>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
            style={{ background: category.bg, color: category.color }}
          >
            {category.name}
          </span>
          {criticalAlert && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-subtle-pulse"
              style={{ background: C.criticalSoft, color: C.critical }}
              title={criticalAlert}
            >
              Critical
            </span>
          )}
        </div>
        {test.observation && (
          <div className="text-xs mt-0.5 font-medium" style={{ color: C.inkSoft }}>
            Note: {test.observation}
          </div>
        )}
      </div>

      {/* Numeric Value & Units */}
      <div className="sm:col-span-2 flex items-baseline gap-1.5">
        <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: meta.color }}>
          {test.value}
        </span>
        <span style={mono} className="text-xs font-semibold" style={{ color: C.inkSoft }}>
          {test.unit || ""}
        </span>
      </div>

      {/* Range text & Range Gauge */}
      <div className="sm:col-span-3">
        <div className="text-[11px] mb-1 font-medium" style={{ color: C.inkSoft }}>
          {test.referenceRangeText ? `Ref: ${test.referenceRangeText}` : "No stated range"}
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

      {/* Status & Actions */}
      <div className="sm:col-span-3 flex flex-wrap sm:flex-col items-start sm:items-end justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
          <ProvenanceTag source={test.source} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ConfidenceDot level={test.confidence} />
          <button
            onClick={() => setEditing(true)}
            className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold transition-colors hover:underline"
            style={{ color: C.accent }}
            title="Edit value or reference interval"
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
      <div className="w-full max-w-md p-6 rounded-2xl shadow-2xl bg-white border" style={{ borderColor: C.hairline }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Plus size={18} style={{ color: C.accent }} />
            <h3 style={{ ...serif, fontSize: 19, fontWeight: 700 }}>Add Manual Test Result</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <label className="block text-xs font-bold uppercase text-gray-700">
            Biomarker Name *
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fasting Blood Glucose" className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 focus:ring-teal-700/20" style={{ borderColor: C.hairline }} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-bold uppercase text-gray-700">
              Value *
              <input required value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 110" className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 focus:ring-teal-700/20" style={{ borderColor: C.hairline }} />
            </label>
            <label className="block text-xs font-bold uppercase text-gray-700">
              Unit
              <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mg/dL" className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 focus:ring-teal-700/20" style={{ borderColor: C.hairline }} />
            </label>
          </div>
          <label className="block text-xs font-bold uppercase text-gray-700">
            Reference Interval
            <input value={refRange} onChange={(e) => setRefRange(e.target.value)} placeholder="e.g. 70 - 99" className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 focus:ring-teal-700/20" style={{ borderColor: C.hairline }} />
          </label>
          <label className="block text-xs font-bold uppercase text-gray-700">
            Observation Notes
            <input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="e.g. Borderline fasting" className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none border focus:ring-2 focus:ring-teal-700/20" style={{ borderColor: C.hairline }} />
          </label>
          <div className="flex justify-end gap-2.5 pt-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border font-medium hover:bg-gray-50" style={{ borderColor: C.hairline }}>Cancel</button>
            <button type="submit" className="px-5 py-2 text-sm rounded-lg font-bold text-white shadow-sm" style={{ background: C.accent }}>Add to Report</button>
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
      <form onSubmit={onSubmit} className="w-full max-w-sm p-8 rounded-2xl shadow-xl bg-white border" style={{ borderColor: C.hairline }}>
        <div style={{ ...serif, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>MedLens</div>
        <p className="text-sm mt-1 mb-6" style={{ color: C.inkSoft }}>Clinical health ledger with cloud sync.</p>
        {error && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: C.highSoft, color: C.high }}>{error}</div>}
        <label className="block text-xs font-bold uppercase mb-3 text-gray-700">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg px-3.5 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} /></label>
        <label className="block text-xs font-bold uppercase mb-5 text-gray-700">Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-lg px-3.5 py-2 text-sm outline-none border" style={{ borderColor: C.hairline }} /></label>
        <button disabled={busy} className="w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity shadow-sm" style={{ background: C.accent, opacity: busy ? 0.6 : 1 }}>{busy ? "Working…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
        <button type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")} className="w-full mt-4 text-xs font-semibold text-center" style={{ color: C.accent }}>{mode === "sign-in" ? "Create a new account" : "I already have an account"}</button>
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
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm transition-all duration-300 border backdrop-blur-md"
      style={{
        background: isError ? "#FEF2F2" : isSuccess ? "#F0FDF4" : "#FFFFFF",
        color: isError ? C.critical : isSuccess ? C.normal : C.ink,
        borderColor: isError ? C.critical : isSuccess ? C.normal : C.hairline,
      }}
    >
      {isSuccess ? <CheckCircle2 size={18} className="text-emerald-600" /> : isError ? <AlertTriangle size={18} className="text-red-600" /> : <Info size={18} className="text-teal-700" />}
      <span className="font-semibold">{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-50 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

/* ---------------- Main MedLens Application ---------------- */
export default function MedLens() {
  const [tab, setTab] = useState("record");
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

  // Search, Filter & Sort Controls
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReportFilter, setSelectedReportFilter] = useState("all");
  const [sortBy, setSortBy] = useState("severity");

  // History Tab View Mode ("charts" vs "flowsheet")
  const [historyViewMode, setHistoryViewMode] = useState("charts");

  // Active Modals
  const [activeReportIdForAdd, setActiveReportIdForAdd] = useState(null);
  const [explainingBiomarker, setExplainingBiomarker] = useState(null);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

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
          /* clean local slate */
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

  /* Load specific scenario */
  function loadScenario(scenario) {
    setPatient(scenario.patient);
    setReports(scenario.reports);
    setSummary(scenario.summary);
    setAuditLog(scenario.auditLog);
    setTab("record");
    showToast(`Loaded scenario: ${scenario.patient.name}`, "success");
  }

  function loadSampleData() {
    loadScenario(SCENARIOS[0]);
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

  /* File upload processing */
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

  /* Extraction workflow (Claude proxy with heuristic fallback) */
  async function extractReport() {
    if (!draftText.trim()) return;
    setBusy(true);
    setErr(null);
    let detectedTests = [];
    let detectedDate = todayStr();
    let extractionSource = "ai_extracted";

    try {
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
      const localResult = parseReportTextLocally(draftText);
      if (localResult.tests.length > 0) {
        detectedTests = localResult.tests.map((t) => ({
          ...t,
          id: uid(),
          source: "local_heuristic",
        }));
        if (localResult.reportDate) detectedDate = localResult.reportDate;
        extractionSource = "local_heuristic";
        showToast("Extracted via MedLens Local Heuristic Engine", "info");
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
    showToast(`Successfully extracted ${detectedTests.length} biomarkers!`, "success");
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
    showToast(`All tests in "${report.title}" verified`, "success");
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

  /* Safety & Conflict Detection */
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

  /* EHR Flow Sheet Matrix Data (Biomarker rows x Chronological report columns) */
  const flowSheetData = useMemo(() => {
    const sortedReports = [...reports].sort((a, b) => (a.date > b.date ? 1 : -1));
    const dates = sortedReports.map((r) => ({ id: r.id, date: r.date, title: r.title }));

    // Group tests by test name
    const matrixMap = {};
    sortedReports.forEach((r) => {
      r.tests.forEach((t) => {
        if (!matrixMap[t.name]) {
          matrixMap[t.name] = {
            name: t.name,
            unit: t.unit,
            referenceRangeText: t.referenceRangeText,
            category: getBiomarkerCategory(t.name),
            valuesByReportId: {},
          };
        }
        matrixMap[t.name].valuesByReportId[r.id] = {
          value: t.value,
          numericValue: t.numericValue,
          status: computeStatus(t),
        };
      });
    });

    return {
      dates,
      rows: Object.values(matrixMap).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [reports]);

  /* Clinical summary generator */
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
      ["Report Title", "Report Date", "Test Name", "Category", "Result Value", "Numeric Value", "Unit", "Reference Range", "Status", "Observation", "Source"],
    ];

    reports.forEach((r) => {
      r.tests.forEach((t) => {
        const cat = getBiomarkerCategory(t.name).name;
        rows.push([
          `"${r.title.replace(/"/g, '""')}"`,
          `"${r.date}"`,
          `"${t.name.replace(/"/g, '""')}"`,
          `"${cat}"`,
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

  function resetBlank() {
    localStorage.removeItem("medlens-record");
    setPatient({ name: "", age: "", sex: "", symptoms: "", conditions: "", allergies: "", medications: "", notes: "" });
    setReports([]);
    setSummary("");
    setDraftText("");
    setDraftTitle("");
    setAuditLog([]);
    setErr(null);
    setTab("intake");
    showToast("Started blank record", "info");
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
  const inRangeCount = totalTests - outOfRange;
  const unverifiedCount = reports.reduce(
    (n, r) => n + r.tests.filter((t) => t.source !== "user_verified").length,
    0
  );

  const patientInitials = patient.name
    ? patient.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "PX";

  return (
    <div style={{ background: C.page, color: C.ink, minHeight: "100vh" }} className="w-full flex flex-col">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
      `}</style>

      {/* ================= Printable Sheet (Doctor Handout) ================= */}
      <div className="print-only p-8 text-black bg-white">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 style={{ ...serif, fontSize: 26, fontWeight: 700 }}>MEDLENS CLINICAL DOSSIER</h1>
            <p className="text-xs text-gray-600 mt-1">
              Patient-Organized Health Intelligence · Confidential Medical Reference
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Printed: {new Date().toLocaleDateString()}</div>
            <div>MedLens v2.0</div>
          </div>
        </div>

        {/* Demographics */}
        <div className="grid grid-cols-3 gap-4 p-4 border border-gray-300 rounded-lg mb-6 text-sm">
          <div>
            <span className="font-bold block text-xs uppercase text-gray-500">Patient</span>
            <span className="font-semibold text-base">{patient.name || "Unnamed"}</span>
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
              <th className="border border-gray-300 p-2">Date</th>
              <th className="border border-gray-300 p-2">Panel / Source</th>
              <th className="border border-gray-300 p-2">Biomarker</th>
              <th className="border border-gray-300 p-2">Category</th>
              <th className="border border-gray-300 p-2">Result</th>
              <th className="border border-gray-300 p-2">Reference Range</th>
              <th className="border border-gray-300 p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.flatMap((r) =>
              r.tests.map((t) => {
                const st = computeStatus(t);
                const cat = getBiomarkerCategory(t.name).name;
                return (
                  <tr key={t.id} className={st === "high" || st === "low" ? "bg-amber-50 font-medium" : ""}>
                    <td className="border border-gray-300 p-2">{r.date}</td>
                    <td className="border border-gray-300 p-2">{r.title}</td>
                    <td className="border border-gray-300 p-2 font-semibold">{t.name}</td>
                    <td className="border border-gray-300 p-2 text-gray-600">{cat}</td>
                    <td className="border border-gray-300 p-2" style={mono}>
                      {t.value} {t.unit || ""}
                    </td>
                    <td className="border border-gray-300 p-2 text-gray-600">{t.referenceRangeText || "—"}</td>
                    <td className="border border-gray-300 p-2 uppercase font-bold">
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
          <div className="p-4 border border-gray-300 rounded-lg mb-8">
            <h3 className="font-bold text-xs uppercase text-gray-500 mb-1">Clinical Synthesis</h3>
            <p className="text-sm leading-relaxed">{summary}</p>
          </div>
        )}

        {/* Doctor Signature Line */}
        <div className="pt-8 border-t border-gray-300 grid grid-cols-2 gap-8 text-xs text-gray-600">
          <div>Reviewing Clinician Signature: ___________________________</div>
          <div className="text-right">Date: __________________</div>
        </div>
      </div>

      {/* ================= Header ================= */}
      <header
        className="no-print flex flex-wrap items-center justify-between gap-4 px-6 py-3 sticky top-0 z-30 shadow-xs backdrop-blur-lg border-b"
        style={{ borderColor: C.hairline, background: `${C.panel}F5` }}
      >
        <div className="flex items-center gap-4">
          {/* Logo Mark */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs transition-transform active:scale-95"
              style={{ background: C.accent, color: "#FFFFFF" }}
            >
              <Activity size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span style={{ ...serif, fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: C.ink }}>
                  MedLens
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider"
                  style={{ background: C.accentSoft, color: C.accent }}
                >
                  Clinical Intelligence v2.0
                </span>
              </div>
              <div className="text-xs flex items-center gap-1.5" style={{ color: C.inkSoft }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: C.normal, display: "inline-block" }} />
                <span>Patient-Facing Clinical Ledger</span>
              </div>
            </div>
          </div>

          {/* Active Patient Pill in Header */}
          {patient.name && (
            <div
              onClick={() => setIsScenarioModalOpen(true)}
              className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border cursor-pointer hover:border-teal-700/50 transition-all bg-white"
              style={{ borderColor: C.hairline }}
              title="Click to switch clinical scenario"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-xs"
                style={{ background: C.accent }}
              >
                {patientInitials}
              </div>
              <div className="text-xs">
                <span className="font-bold" style={{ color: C.ink }}>{patient.name}</span>
                <span className="ml-1.5 text-gray-500 font-medium">{patient.age ? `${patient.age}y` : ""} {patient.sex || ""}</span>
              </div>
              <ChevronRight size={13} className="text-gray-400" />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Clinical Scenario Switcher Button */}
          <button
            onClick={() => setIsScenarioModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
            style={{ borderColor: C.hairline, color: C.accent }}
            title="Switch between clinical personas"
          >
            <Sparkles size={14} /> Switch Scenario
          </button>

          {/* Export Action Hub */}
          <div className="flex items-center gap-1 rounded-lg p-1 border shadow-2xs" style={{ borderColor: C.hairline, background: C.page }}>
            <button
              onClick={exportRecordText}
              disabled={reports.length === 0 && !patient.name}
              title="Download text ledger"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <FileText size={13} /> Text
            </button>
            <button
              onClick={exportCsvRecord}
              disabled={reports.length === 0}
              title="Download CSV spreadsheet"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <FileSpreadsheet size={13} /> CSV
            </button>
            <button
              onClick={exportJsonRecord}
              disabled={reports.length === 0 && !patient.name}
              title="Download full JSON file"
              className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md font-medium transition-colors hover:bg-white disabled:opacity-40"
              style={{ color: C.ink }}
            >
              <Download size={13} /> JSON
            </button>
            <button
              onClick={() => window.print()}
              disabled={reports.length === 0 && !patient.name}
              title="Print Clinician Consultation Handout"
              className="flex items-center gap-1 text-xs px-3 py-1 rounded-md font-bold transition-all hover:bg-white disabled:opacity-40 shadow-2xs"
              style={{ color: C.accent }}
            >
              <Printer size={13} /> Print Sheet
            </button>
          </div>

          <button
            onClick={resetBlank}
            disabled={!patient.name && reports.length === 0}
            title="Reset active record to blank"
            className="p-1.5 rounded-lg border hover:bg-red-50 transition-colors disabled:opacity-30"
            style={{ borderColor: C.hairline, color: C.high }}
          >
            <RotateCcw size={15} />
          </button>

          {cloudPersistenceEnabled && (
            <button onClick={signOut} className="text-xs px-2 py-1 font-medium rounded hover:underline" style={{ color: C.inkSoft }}>
              {user?.email?.split("@")[0]} · sign out
            </button>
          )}
        </div>
      </header>

      {/* ================= Main Layout ================= */}
      <div className="no-print flex-1 flex flex-col md:flex-row">
        {/* Modern Sidebar */}
        <aside
          className="w-full md:w-64 shrink-0 p-4 flex flex-col gap-1.5 border-r"
          style={{ borderColor: C.hairline, background: C.panel }}
        >
          <div className="text-[11px] uppercase font-bold tracking-wider px-3 pt-1 pb-1.5 text-gray-400">
            Navigation
          </div>
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
            badge={trends.length > 0 ? `${trends.length} charts` : undefined}
            onClick={() => setTab("history")}
          />

          {/* Quick Metrics Snapshot Widget */}
          <div className="mt-6 p-4 rounded-xl text-xs flex flex-col gap-2.5 border" style={{ background: C.page, borderColor: C.hairline }}>
            <div className="font-bold text-gray-800 flex items-center justify-between">
              <span>Record Snapshot</span>
              <span className="text-[10px] uppercase px-1.5 py-0.2 rounded font-bold" style={{ background: C.accentSoft, color: C.accent }}>
                {patient.name ? "Active" : "Blank"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center pt-1">
              <div className="p-2.5 rounded-lg bg-white border shadow-2xs" style={{ borderColor: C.hairline }}>
                <div className="text-xl font-bold" style={{ color: C.accent }}>{totalTests}</div>
                <div className="text-[10px] font-medium text-gray-500">Biomarkers</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border shadow-2xs" style={{ borderColor: C.hairline }}>
                <div className="text-xl font-bold" style={{ color: outOfRange > 0 ? C.high : C.normal }}>{outOfRange}</div>
                <div className="text-[10px] font-medium text-gray-500">Out of Range</div>
              </div>
            </div>
            {unverifiedCount > 0 && (
              <div className="text-[11px] font-medium text-center text-amber-700 bg-amber-50 py-1 rounded border border-amber-200">
                {unverifiedCount} value{unverifiedCount === 1 ? "" : "s"} awaiting verification
              </div>
            )}
          </div>

          {/* Conflict Alerts */}
          {conflicts.length > 0 && (
            <div className="mt-3 p-3 rounded-xl text-xs flex gap-2.5 border" style={{ background: C.highSoft, color: C.high, borderColor: `${C.high}44` }}>
              <ShieldAlert size={18} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{conflicts.length} Safety Flag{conflicts.length === 1 ? "" : "s"}</span>
                <p className="text-[11px] mt-0.5 opacity-90 font-medium">Drug-allergy overlap detected</p>
              </div>
            </div>
          )}

          {/* Critical alerts */}
          {criticalAlerts.length > 0 && (
            <div className="mt-2 p-3 rounded-xl text-xs flex gap-2.5 border animate-subtle-pulse" style={{ background: C.criticalSoft, color: C.critical, borderColor: `${C.critical}44` }}>
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Critical Lab Alert</span>
                <p className="text-[11px] mt-0.5 opacity-90 font-medium">{criticalAlerts[0].message}</p>
              </div>
            </div>
          )}

          <div className="mt-auto pt-6 text-[11px] font-medium text-center text-gray-400">
            {cloudPersistenceEnabled ? "Cloud-Synchronized" : "Local Browser Storage"}
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-6 md:p-8 max-w-5xl overflow-y-auto">
          {err && (
            <div className="mb-6 p-4 rounded-xl text-sm flex items-start gap-3 shadow-sm border" style={{ background: C.highSoft, color: C.high, borderColor: `${C.high}44` }}>
              <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Attention</div>
                <div className="text-xs mt-0.5 font-medium">{err}</div>
              </div>
            </div>
          )}

          {/* ================= TAB: Patient Intake ================= */}
          {tab === "intake" && (
            <section className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 24, fontWeight: 700 }}>Patient Intake Dossier</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Demographics, medical history, and current medications recorded strictly as patient-reported.
                  </p>
                </div>
                <button
                  onClick={() => setIsScenarioModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-lg transition-all shadow-xs"
                  style={{ background: C.accentSoft, color: C.accent }}
                >
                  <Sparkles size={14} /> Clinical Scenarios
                </button>
              </div>

              <div className="p-6 rounded-2xl border shadow-xs space-y-5" style={{ background: C.panel, borderColor: C.hairline }}>
                <h3 style={{ ...serif, fontSize: 17, fontWeight: 700 }} className="text-gray-800 pb-2 border-b" style={{ borderColor: C.hairline }}>
                  Demographics & Presentation
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Patient Name" half value={patient.name} onChange={(v) => setPatient((p) => ({ ...p, name: v }))} placeholder="e.g. Eleanor Vance" />
                  <Field label="Age (Years)" half value={patient.age} onChange={(v) => setPatient((p) => ({ ...p, age: v }))} placeholder="e.g. 54" />
                  <Field label="Assigned Biological Sex" half value={patient.sex} onChange={(v) => setPatient((p) => ({ ...p, sex: v }))} placeholder="e.g. Female" />
                  <div className="col-span-2 sm:col-span-1" />
                  <Field label="Chief Symptoms & Timeline" value={patient.symptoms} onChange={(v) => setPatient((p) => ({ ...p, symptoms: v }))} placeholder="Describe main complaints, frequency, onset..." textarea />
                  <Field label="Documented Medical Conditions" value={patient.conditions} onChange={(v) => setPatient((p) => ({ ...p, conditions: v }))} placeholder="e.g. Type 2 Diabetes, Hypertension" textarea />
                  <Field label="Documented Drug Allergies" value={patient.allergies} onChange={(v) => setPatient((p) => ({ ...p, allergies: v }))} placeholder="e.g. Penicillin, Sulfa antibiotics" textarea />
                  <Field label="Active Medications & Regimen" value={patient.medications} onChange={(v) => setPatient((p) => ({ ...p, medications: v }))} placeholder="Drug name, dosage, frequency (e.g. Metformin 1000mg BID)" textarea />
                  <Field label="Additional Clinical Notes" value={patient.notes} onChange={(v) => setPatient((p) => ({ ...p, notes: v }))} placeholder="Fasting conditions, recent vitals, specialist notes..." textarea />
                </div>
              </div>

              {conflicts.length > 0 && (
                <div className="p-5 rounded-2xl text-sm border shadow-xs" style={{ background: C.highSoft, color: C.high, borderColor: `${C.high}44` }}>
                  <div className="font-bold mb-2 flex items-center gap-2">
                    <ShieldAlert size={18} /> Drug-Allergy Safety Inconsistencies
                  </div>
                  <ul className="list-disc ml-5 space-y-1 text-xs font-medium">
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
            <section className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 24, fontWeight: 700 }}>Ingest Medical Report</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Upload lab report documents (PDF, PNG, JPG) or paste clinical text directly. MedLens extracts biomarkers with exact provenance.
                  </p>
                </div>
                <button
                  onClick={insertSampleReportText}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                  style={{ borderColor: C.hairline, color: C.accent }}
                  title="Insert realistic lab results"
                >
                  <FileText size={14} /> Insert Sample Text
                </button>
              </div>

              <div className="p-6 rounded-2xl border shadow-xs space-y-5" style={{ background: C.panel, borderColor: C.hairline }}>
                {/* Title */}
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-700 block mb-1.5">
                    Report Identification / Panel Label
                  </span>
                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder='e.g. "Comprehensive Metabolic & Lipid Panel — Aug 2026"'
                    className="w-full rounded-lg px-4 py-2.5 text-sm outline-none border transition-all focus:ring-2 focus:ring-teal-700/20"
                    style={{ borderColor: C.hairline, background: "#FFFFFF" }}
                  />
                </div>

                {/* Drag & Drop Upload Zone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-8 rounded-2xl border-2 border-dashed cursor-pointer text-center transition-all hover:bg-teal-50/20"
                  style={{
                    borderColor: isDragOver ? C.accent : C.hairline,
                    background: isDragOver ? C.accentSoft : "#FAF8F4",
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
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    {fileBusy ? (
                      <div className="flex items-center gap-3 text-sm font-bold" style={{ color: C.accent }}>
                        <Loader2 size={22} className="animate-spin" />
                        {fileStatusText || "Processing document with OCR..."}
                      </div>
                    ) : (
                      <>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs" style={{ background: C.accentSoft, color: C.accent }}>
                          <UploadCloud size={24} />
                        </div>
                        <div className="text-sm font-bold" style={{ color: C.ink }}>
                          {draftFile ? draftFile.name : "Drag & drop lab PDF or image, or browse local files"}
                        </div>
                        <div className="text-xs font-medium text-gray-500">
                          Automated optical character recognition via PDF.js & Tesseract
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Raw Text Box */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Report Document Text
                    </span>
                    {draftText && (
                      <button onClick={() => setDraftText("")} className="text-xs font-medium text-gray-400 hover:text-gray-700">
                        Clear Text
                      </button>
                    )}
                  </div>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={8}
                    placeholder="Paste raw laboratory panel text, EHR export, or clinical note here..."
                    className="w-full rounded-xl px-4 py-3 text-xs outline-none border leading-relaxed focus:ring-2 focus:ring-teal-700/20"
                    style={{ ...mono, borderColor: C.hairline, background: "#FFFFFF" }}
                  />
                </div>

                {/* Extract Actions */}
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: C.hairline }}>
                  <div className="text-xs text-gray-500 font-medium">
                    Extraction: Claude 3.5 Haiku AI · Local Heuristic Engine Fallback
                  </div>
                  <button
                    onClick={extractReport}
                    disabled={busy || !draftText.trim()}
                    className="flex items-center gap-2 text-sm px-6 py-2.5 rounded-xl font-bold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50"
                    style={{ background: C.accent }}
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
            <section className="space-y-6">
              {/* Header Title */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 style={{ ...serif, fontSize: 24, fontWeight: 700 }}>Structured Health Record</h2>
                  <p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>
                    Extracted biomarkers organized by clinical report with calibrated range gauges. Click any biomarker name for clinical explanation.
                  </p>
                </div>
              </div>

              {/* KPI Executive Summary Cards */}
              {reports.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-xl border bg-white shadow-2xs" style={{ borderColor: C.hairline }}>
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Total Tests</span>
                      <Layers size={15} style={{ color: C.accent }} />
                    </div>
                    <div className="text-2xl font-extrabold" style={{ color: C.ink }}>{totalTests}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Across {reports.length} report{reports.length === 1 ? "" : "s"}</div>
                  </div>

                  <div className="p-4 rounded-xl border bg-white shadow-2xs" style={{ borderColor: C.hairline }}>
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>In Optimal Range</span>
                      <CheckCircle2 size={15} className="text-emerald-600" />
                    </div>
                    <div className="text-2xl font-extrabold text-emerald-700">{inRangeCount}</div>
                    <div className="text-[11px] text-emerald-600 mt-0.5">{totalTests > 0 ? ((inRangeCount / totalTests) * 100).toFixed(0) : 0}% within normal bounds</div>
                  </div>

                  <div className="p-4 rounded-xl border bg-white shadow-2xs" style={{ borderColor: C.hairline }}>
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Attention Needed</span>
                      <AlertTriangle size={15} style={{ color: C.high }} />
                    </div>
                    <div className="text-2xl font-extrabold" style={{ color: outOfRange > 0 ? C.high : C.normal }}>
                      {outOfRange}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Above or below target limits</div>
                  </div>

                  <div className="p-4 rounded-xl border bg-white shadow-2xs" style={{ borderColor: C.hairline }}>
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500 mb-1">
                      <span>Verification State</span>
                      <Pencil size={15} className="text-amber-600" />
                    </div>
                    <div className="text-2xl font-extrabold text-amber-700">{unverifiedCount}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{unverifiedCount === 0 ? "All values verified" : "Pending review"}</div>
                  </div>
                </div>
              )}

              {/* Search, Filter & Sort Toolbar */}
              {reports.length > 0 && (
                <div className="p-3.5 rounded-xl border shadow-2xs flex flex-wrap items-center justify-between gap-3 bg-white" style={{ borderColor: C.hairline }}>
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[220px]">
                    <Search size={15} className="absolute left-3.5 top-2.5 text-gray-400" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search biomarker (e.g. Glucose, A1c, Cholesterol)..."
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border outline-none transition-all focus:ring-2 focus:ring-teal-700/20"
                      style={{ borderColor: C.hairline, background: C.page }}
                    />
                    {searchTerm && (
                      <button onClick={() => setSearchTerm("")} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                    <button
                      onClick={() => setStatusFilter("all")}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "all" ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "all" ? C.accent : "transparent" }}
                    >
                      All ({totalTests})
                    </button>
                    <button
                      onClick={() => setStatusFilter("outOfRange")}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "outOfRange" ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "outOfRange" ? C.high : "transparent" }}
                    >
                      Out of Range ({outOfRange})
                    </button>
                    <button
                      onClick={() => setStatusFilter("unverified")}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === "unverified" ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                      style={{ background: statusFilter === "unverified" ? "#92400E" : "transparent" }}
                    >
                      Unverified ({unverifiedCount})
                    </button>
                  </div>

                  {/* Sort & Report Selector */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className="flex items-center gap-1 text-gray-500">
                      <SlidersHorizontal size={13} />
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border outline-none bg-white font-medium text-gray-700"
                        style={{ borderColor: C.hairline }}
                      >
                        <option value="severity">Sort: Severity First</option>
                        <option value="name_asc">Name: A to Z</option>
                        <option value="name_desc">Name: Z to A</option>
                      </select>
                    </div>

                    {reports.length > 1 && (
                      <select
                        value={selectedReportFilter}
                        onChange={(e) => setSelectedReportFilter(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg border outline-none bg-white font-medium text-gray-700"
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
                <div className="text-center p-12 rounded-2xl border-2 border-dashed bg-white" style={{ borderColor: C.hairline }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: C.accentSoft, color: C.accent }}>
                    <ClipboardList size={28} />
                  </div>
                  <div style={{ ...serif, fontSize: 19, fontWeight: 700 }}>No Lab Reports On File</div>
                  <p className="text-xs mt-1.5 mb-5 max-w-md mx-auto text-gray-500">
                    Ingest your first clinical lab report or select a pre-configured clinical scenario to explore structured biomarkers and visual gauges.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={() => setTab("reports")}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                      style={{ background: C.accent }}
                    >
                      Ingest Medical Report
                    </button>
                    <button
                      onClick={() => setIsScenarioModalOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold border hover:bg-gray-50"
                      style={{ borderColor: C.hairline }}
                    >
                      Browse Scenarios
                    </button>
                  </div>
                </div>
              )}

              {/* Reports List */}
              <div className="space-y-6">
                {reports
                  .filter((r) => selectedReportFilter === "all" || r.id === selectedReportFilter)
                  .map((r) => {
                    let filteredTests = r.tests.filter((t) => {
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

                    filteredTests = [...filteredTests].sort((a, b) => {
                      if (sortBy === "severity") {
                        const scoreA = ["high", "low"].includes(computeStatus(a)) ? 2 : 1;
                        const scoreB = ["high", "low"].includes(computeStatus(b)) ? 2 : 1;
                        return scoreB - scoreA;
                      }
                      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
                      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
                      return 0;
                    });

                    return (
                      <div key={r.id} className="rounded-2xl border shadow-xs overflow-hidden bg-white" style={{ borderColor: C.hairline }}>
                        {/* Report Card Header */}
                        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: C.hairline, background: "#FAF9F5" }}>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs" style={{ background: C.accentSoft, color: C.accent }}>
                              {r.tests.length}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span style={{ fontWeight: 700, fontSize: 16 }}>{r.title}</span>
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold" style={{ background: C.accentSoft, color: C.accent }}>
                                  {r.date}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Specimen collection {r.date} · {r.tests.length} biomarkers
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => verifyAllTestsInReport(r.id)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors hover:bg-emerald-50 text-emerald-700 border-emerald-300"
                              title="Verify all extracted tests in this report"
                            >
                              <CheckCircle2 size={14} /> Verify All
                            </button>
                            <button
                              onClick={() => setActiveReportIdForAdd(r.id)}
                              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold border transition-colors hover:bg-white"
                              style={{ borderColor: C.hairline, color: C.accent }}
                              title="Add manual biomarker result"
                            >
                              <Plus size={14} /> Add Test
                            </button>
                            <button
                              onClick={() => deleteReport(r.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete this report"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        {/* Source Text Drawer & Test Rows */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: C.hairline }}>
                          {/* Original Document Source */}
                          <div className="lg:col-span-4 p-4 max-h-96 overflow-auto" style={{ background: "#FDFCF9" }}>
                            <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-gray-500">
                              Document Source Text
                            </div>
                            <pre className="whitespace-pre-wrap text-[11px] leading-relaxed select-text" style={{ ...mono, color: C.inkSoft }}>
                              {r.rawText || "No source text available."}
                            </pre>
                          </div>

                          {/* Extracted Test Rows */}
                          <div className="lg:col-span-8 divide-y" style={{ borderColor: C.hairline }}>
                            {filteredTests.length === 0 ? (
                              <div className="p-6 text-xs text-center text-gray-400">
                                No biomarkers match the active search or status filters.
                              </div>
                            ) : (
                              filteredTests.map((t) => (
                                <TestRow
                                  key={t.id}
                                  test={t}
                                  onSave={(patch) => updateTest(r.id, t.id, patch)}
                                  onDelete={() => deleteTest(r.id, t.id)}
                                  onOpenExplainer={(name) => setExplainingBiomarker(name)}
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
            <section className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 style={{ ...serif, fontSize: 24, fontWeight: 700 }}>Clinical Synthesis & Patient Summary</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Plain-language overview synthesizing lab findings, clinical context, and medication adherence.
                  </p>
                </div>
                <button
                  onClick={() => setIsPortalModalOpen(true)}
                  disabled={reports.length === 0}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors disabled:opacity-40"
                  style={{ borderColor: C.hairline, color: C.accent }}
                  title="Generate a message for your doctor via MyChart/Epic/Cerner"
                >
                  <Send size={13} /> Message My Doctor
                </button>
              </div>

              <div className="p-6 rounded-2xl border shadow-xs space-y-4 bg-white" style={{ borderColor: C.hairline }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={generateSummary}
                    disabled={summaryBusy || (reports.length === 0 && !patient.symptoms)}
                    className="flex items-center gap-2 text-sm px-5 py-2.5 rounded-xl font-bold text-white transition-transform active:scale-95 shadow-xs disabled:opacity-50"
                    style={{ background: C.accent }}
                  >
                    {summaryBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    {summaryBusy ? "Synthesizing Summary…" : summary ? "Regenerate Clinical Summary" : "Generate Clinical Summary"}
                  </button>

                  {summary && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(summary);
                          showToast("Summary copied to clipboard", "success");
                        }}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                        style={{ borderColor: C.hairline }}
                      >
                        Copy Summary
                      </button>
                      <button
                        onClick={() => setIsPortalModalOpen(true)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                      >
                        Draft Portal Note
                      </button>
                    </div>
                  )}
                </div>

                {summary ? (
                  <div className="p-6 rounded-2xl text-sm leading-relaxed border space-y-3" style={{ background: "#FAFAF6", borderColor: C.hairline }}>
                    <div className="flex items-center gap-2">
                      <Badge color={C.accent} bg={C.accentSoft}>Non-Diagnostic Clinical Synthesis</Badge>
                    </div>
                    <p style={{ ...serif, fontSize: 16, lineHeight: 1.7 }} className="text-gray-900">
                      {summary}
                    </p>
                  </div>
                ) : (
                  <div className="text-xs p-8 text-center text-gray-400 border border-dashed rounded-xl" style={{ borderColor: C.hairline }}>
                    Click &ldquo;Generate Clinical Summary&rdquo; to build an executive, plain-language patient overview.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ================= TAB: History & Trends ================= */}
          {tab === "history" && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 style={{ ...serif, fontSize: 24, fontWeight: 700 }}>Longitudinal Trendline Studio</h2>
                  <p className="text-sm mt-1" style={{ color: C.inkSoft }}>
                    Biomarkers tracked over time. View interactive SVG charts or the EHR-style flow sheet matrix.
                  </p>
                </div>

                {/* View Switcher: Charts vs Flow Sheet */}
                <div className="flex items-center p-1 rounded-xl border bg-white shadow-2xs text-xs font-bold" style={{ borderColor: C.hairline }}>
                  <button
                    onClick={() => setHistoryViewMode("charts")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${historyViewMode === "charts" ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                    style={{ background: historyViewMode === "charts" ? C.accent : "transparent" }}
                  >
                    <Activity size={14} /> Trendline Charts
                  </button>
                  <button
                    onClick={() => setHistoryViewMode("flowsheet")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${historyViewMode === "flowsheet" ? "text-white" : "text-gray-600 hover:bg-gray-100"}`}
                    style={{ background: historyViewMode === "flowsheet" ? C.accent : "transparent" }}
                  >
                    <Table size={14} /> EHR Flow Sheet Matrix
                  </button>
                </div>
              </div>

              {trends.length === 0 ? (
                <div className="text-center p-12 rounded-2xl border-2 border-dashed bg-white" style={{ borderColor: C.hairline }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: C.accentSoft, color: C.accent }}>
                    <Clock size={28} />
                  </div>
                  <div style={{ ...serif, fontSize: 19, fontWeight: 700 }}>No Longitudinal Data Points Yet</div>
                  <p className="text-xs mt-1.5 mb-5 max-w-md mx-auto text-gray-500">
                    Add at least two reports sharing the same biomarker name (e.g. Glucose or HbA1c) to unlock trajectory charts.
                  </p>
                  <button onClick={loadSampleData} className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm" style={{ background: C.accent }}>
                    Load Demo Record with Sequential Labs
                  </button>
                </div>
              ) : historyViewMode === "charts" ? (
                /* Visual Area Charts */
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
              ) : (
                /* EHR Flow Sheet Matrix View */
                <div className="p-6 rounded-2xl border shadow-xs bg-white overflow-hidden" style={{ borderColor: C.hairline }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 style={{ ...serif, fontSize: 18, fontWeight: 700 }}>EHR Flow Sheet Matrix</h3>
                      <p className="text-xs text-gray-500">Side-by-side chronological comparison of biomarkers across lab dates.</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-50/70" style={{ borderColor: C.hairline }}>
                          <th className="p-3 font-bold text-gray-700">Biomarker</th>
                          <th className="p-3 font-bold text-gray-700">Category</th>
                          <th className="p-3 font-bold text-gray-700">Standard Target</th>
                          {flowSheetData.dates.map((d) => (
                            <th key={d.id} className="p-3 font-bold text-teal-800">
                              {d.date}
                            </th>
                          ))}
                          <th className="p-3 font-bold text-gray-700 text-right">Net Shift</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: C.hairline }}>
                        {flowSheetData.rows.map((row) => {
                          const validEntries = flowSheetData.dates
                            .map((d) => row.valuesByReportId[d.id])
                            .filter((v) => v && v.numericValue != null);

                          let shiftBadge = null;
                          if (validEntries.length >= 2) {
                            const first = validEntries[0].numericValue;
                            const last = validEntries[validEntries.length - 1].numericValue;
                            const diff = last - first;
                            const pct = first !== 0 ? ((diff / first) * 100).toFixed(1) : 0;
                            const sign = diff > 0 ? "+" : "";

                            shiftBadge = (
                              <span
                                className="px-2 py-0.5 rounded font-bold text-[11px]"
                                style={{
                                  background: diff === 0 ? C.unknownSoft : diff < 0 ? C.normalSoft : C.highSoft,
                                  color: diff === 0 ? C.inkSoft : diff < 0 ? C.normal : C.high,
                                }}
                              >
                                {sign}{diff.toFixed(1)} ({sign}{pct}%)
                              </span>
                            );
                          }

                          return (
                            <tr key={row.name} className="hover:bg-gray-50/50">
                              <td className="p-3 font-bold text-gray-900 flex items-center gap-1.5">
                                <button
                                  onClick={() => setExplainingBiomarker(row.name)}
                                  className="hover:text-teal-800 transition-colors flex items-center gap-1 text-left"
                                >
                                  {row.name}
                                  <HelpCircle size={12} className="text-gray-400" />
                                </button>
                              </td>
                              <td className="p-3 text-gray-500">
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase" style={{ background: row.category.bg, color: row.category.color }}>
                                  {row.category.name}
                                </span>
                              </td>
                              <td className="p-3 text-gray-500 font-medium">
                                {row.referenceRangeText || "—"}
                              </td>
                              {flowSheetData.dates.map((d) => {
                                const entry = row.valuesByReportId[d.id];
                                if (!entry) return <td key={d.id} className="p-3 text-gray-300">—</td>;
                                const meta = STATUS_META[entry.status] || STATUS_META.normal;
                                return (
                                  <td key={d.id} className="p-3">
                                    <span
                                      className="px-2 py-0.5 rounded text-xs font-bold"
                                      style={{ ...mono, background: meta.bg, color: meta.color }}
                                    >
                                      {entry.value} {row.unit || ""}
                                    </span>
                                  </td>
                                );
                              })}
                              <td className="p-3 text-right">{shiftBadge || <span className="text-gray-400">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Chronological Reports List */}
              <div className="p-6 rounded-2xl border shadow-xs bg-white" style={{ borderColor: C.hairline }}>
                <h3 style={{ ...serif, fontSize: 18, fontWeight: 700 }} className="mb-3">
                  Chronological Report Ledger
                </h3>
                {reports.length === 0 ? (
                  <div className="text-xs text-gray-400">No reports recorded.</div>
                ) : (
                  <div className="divide-y" style={{ borderColor: C.hairline }}>
                    {reports.map((r) => (
                      <div key={r.id} className="py-3 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5">
                          <Clock size={15} style={{ color: C.inkSoft }} />
                          <span className="text-xs font-bold" style={{ color: C.accent }}>{r.date}</span>
                          <ChevronRight size={14} style={{ color: C.inkSoft }} />
                          <span className="font-bold">{r.title}</span>
                        </div>
                        <span className="text-xs font-medium text-gray-500">
                          {r.tests.length} tests recorded
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Trail */}
              <div className="p-6 rounded-2xl border shadow-xs bg-white" style={{ borderColor: C.hairline }}>
                <h3 style={{ ...serif, fontSize: 18, fontWeight: 700 }} className="mb-3">
                  Verification & Audit Trail
                </h3>
                {auditLog.length === 0 ? (
                  <div className="text-xs text-gray-400">No events logged yet.</div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {auditLog.slice(0, 20).map((event) => (
                      <div key={event.id} className="flex items-center gap-2 text-xs py-1.5 border-b" style={{ borderColor: C.hairline }}>
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

      {/* Biomarker Explainer Modal */}
      <BiomarkerExplainerModal
        biomarkerName={explainingBiomarker}
        onClose={() => setExplainingBiomarker(null)}
      />

      {/* Scenario Switcher Modal */}
      <ScenarioSwitcherModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        onSelectScenario={loadScenario}
        onResetBlank={resetBlank}
      />

      {/* Patient Portal Message Drafter Modal */}
      <PortalMessageModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        patient={patient}
        reports={reports}
        summary={summary}
      />

      {/* Toast Notification */}
      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

export const SAMPLE_PATIENT = {
  name: "Eleanor Vance",
  age: "54",
  sex: "Female",
  symptoms: "Mild fatigue in afternoons, occasional numbness in toes, increased thirst over past two months.",
  conditions: "Type 2 Diabetes Mellitus, Essential Hypertension, Hyperlipidemia",
  allergies: "Penicillin (rash/hives), Sulfa antibiotics",
  medications: "Metformin 1000 mg BID, Lisinopril 10 mg QD, Atorvastatin 20 mg QHS",
  notes: "Follow-up metabolic and lipid monitoring. Patient actively logging blood glucose logs twice weekly.",
};

export const SAMPLE_REPORTS = [
  {
    id: "rep-001",
    title: "Comprehensive Metabolic & Lipid Panel — Mar 2026",
    date: "2026-03-12",
    createdAt: "2026-03-12T10:30:00.000Z",
    rawText: `METROPOLITAN CLINICAL LABORATORIES
Patient: Eleanor Vance | DOB: 1972-04-18 | Sex: F
Collection Date: 2026-03-12 08:15 AM
Ordering Physician: Dr. K. Martinez, MD

TEST NAME                       RESULT    FLAG   UNITS       REFERENCE INTERVAL
Fasting Blood Glucose           138       H      mg/dL       70 - 99
Hemoglobin A1c                  7.4       H      %           4.0 - 5.6
Total Cholesterol               215       H      mg/dL       125 - 200
LDL Cholesterol (calc)          132       H      mg/dL       < 100
HDL Cholesterol                 48               mg/dL       40 - 60
Triglycerides                   175       H      mg/dL       < 150
Serum Creatinine                0.95             mg/dL       0.50 - 1.10
Estimated GFR (CKD-EPI)         78               mL/min      > 60
Serum Potassium                 4.4              mmol/L      3.5 - 5.1
Serum Sodium                    140              mmol/L      135 - 145
AST (SGOT)                      24               U/L         10 - 40
ALT (SGPT)                      28               U/L         7 - 56
White Blood Cell Count          6.8              K/uL        4.0 - 11.0`,
    tests: [
      {
        id: "t-001",
        name: "Fasting Blood Glucose",
        value: "138",
        numericValue: 138,
        unit: "mg/dL",
        referenceRangeText: "70 - 99",
        referenceMin: 70,
        referenceMax: 99,
        observation: "Elevated fasting level",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-002",
        name: "Hemoglobin A1c",
        value: "7.4",
        numericValue: 7.4,
        unit: "%",
        referenceRangeText: "4.0 - 5.6",
        referenceMin: 4.0,
        referenceMax: 5.6,
        observation: "Above target reference interval",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-003",
        name: "Total Cholesterol",
        value: "215",
        numericValue: 215,
        unit: "mg/dL",
        referenceRangeText: "125 - 200",
        referenceMin: 125,
        referenceMax: 200,
        observation: "Mild hypercholesterolemia",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-004",
        name: "LDL Cholesterol",
        value: "132",
        numericValue: 132,
        unit: "mg/dL",
        referenceRangeText: "< 100",
        referenceMin: null,
        referenceMax: 100,
        observation: "Above optimal reference range",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-005",
        name: "HDL Cholesterol",
        value: "48",
        numericValue: 48,
        unit: "mg/dL",
        referenceRangeText: "40 - 60",
        referenceMin: 40,
        referenceMax: 60,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-006",
        name: "Triglycerides",
        value: "175",
        numericValue: 175,
        unit: "mg/dL",
        referenceRangeText: "< 150",
        referenceMin: null,
        referenceMax: 150,
        observation: "Borderline high",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-007",
        name: "Serum Creatinine",
        value: "0.95",
        numericValue: 0.95,
        unit: "mg/dL",
        referenceRangeText: "0.50 - 1.10",
        referenceMin: 0.50,
        referenceMax: 1.10,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-008",
        name: "Serum Potassium",
        value: "4.4",
        numericValue: 4.4,
        unit: "mmol/L",
        referenceRangeText: "3.5 - 5.1",
        referenceMin: 3.5,
        referenceMax: 5.1,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
    ],
  },
  {
    id: "rep-002",
    title: "Follow-Up Metabolic Panel & Lipids — Aug 2026",
    date: "2026-08-20",
    createdAt: "2026-08-20T09:15:00.000Z",
    rawText: `METROPOLITAN CLINICAL LABORATORIES
Patient: Eleanor Vance | DOB: 1972-04-18 | Sex: F
Collection Date: 2026-08-20 08:30 AM
Ordering Physician: Dr. K. Martinez, MD

TEST NAME                       RESULT    FLAG   UNITS       REFERENCE INTERVAL
Fasting Blood Glucose           122       H      mg/dL       70 - 99
Hemoglobin A1c                  6.8       H      %           4.0 - 5.6
Total Cholesterol               188              mg/dL       125 - 200
LDL Cholesterol (calc)          104       H      mg/dL       < 100
HDL Cholesterol                 52               mg/dL       40 - 60
Triglycerides                   142              mg/dL       < 150
Serum Creatinine                0.92             mg/dL       0.50 - 1.10
Serum Potassium                 4.5              mmol/L      3.5 - 5.1`,
    tests: [
      {
        id: "t-009",
        name: "Fasting Blood Glucose",
        value: "122",
        numericValue: 122,
        unit: "mg/dL",
        referenceRangeText: "70 - 99",
        referenceMin: 70,
        referenceMax: 99,
        observation: "Improved from 138 mg/dL",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-010",
        name: "Hemoglobin A1c",
        value: "6.8",
        numericValue: 6.8,
        unit: "%",
        referenceRangeText: "4.0 - 5.6",
        referenceMin: 4.0,
        referenceMax: 5.6,
        observation: "Improved from 7.4%",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-011",
        name: "Total Cholesterol",
        value: "188",
        numericValue: 188,
        unit: "mg/dL",
        referenceRangeText: "125 - 200",
        referenceMin: 125,
        referenceMax: 200,
        observation: "Normalized into reference range",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-012",
        name: "LDL Cholesterol",
        value: "104",
        numericValue: 104,
        unit: "mg/dL",
        referenceRangeText: "< 100",
        referenceMin: null,
        referenceMax: 100,
        observation: "Near normal threshold",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-013",
        name: "HDL Cholesterol",
        value: "52",
        numericValue: 52,
        unit: "mg/dL",
        referenceRangeText: "40 - 60",
        referenceMin: 40,
        referenceMax: 60,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-014",
        name: "Triglycerides",
        value: "142",
        numericValue: 142,
        unit: "mg/dL",
        referenceRangeText: "< 150",
        referenceMin: null,
        referenceMax: 150,
        observation: "Normalized into reference range",
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-015",
        name: "Serum Creatinine",
        value: "0.92",
        numericValue: 0.92,
        unit: "mg/dL",
        referenceRangeText: "0.50 - 1.10",
        referenceMin: 0.50,
        referenceMax: 1.10,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
      {
        id: "t-016",
        name: "Serum Potassium",
        value: "4.5",
        numericValue: 4.5,
        unit: "mmol/L",
        referenceRangeText: "3.5 - 5.1",
        referenceMin: 3.5,
        referenceMax: 5.1,
        observation: null,
        confidence: "high",
        source: "user_verified",
      },
    ],
  },
];

export const SAMPLE_SUMMARY =
  "Between March and August 2026, glycemic markers showed downward trends, with Fasting Blood Glucose shifting from 138 mg/dL to 122 mg/dL and Hemoglobin A1c declining from 7.4% to 6.8%, both remaining above standard reference ranges. Total cholesterol (215 to 188 mg/dL) and triglycerides (175 to 142 mg/dL) both shifted back inside normal reference intervals, while LDL cholesterol improved toward threshold at 104 mg/dL. Kidney markers including serum creatinine remained stable and within normal limits throughout. Please review these trends and current medications with your healthcare team.";

export const SAMPLE_AUDIT_LOG = [
  { id: "aud-001", at: "2026-08-20T10:15:00.000Z", action: "Report extracted", detail: "Follow-Up Metabolic Panel & Lipids — Aug 2026" },
  { id: "aud-002", at: "2026-08-20T10:20:00.000Z", action: "Summary generated", detail: "Multi-report clinical summary" },
  { id: "aud-003", at: "2026-03-12T11:00:00.000Z", action: "Report extracted", detail: "Comprehensive Metabolic & Lipid Panel — Mar 2026" },
];

export const SAMPLE_RAW_REPORT_TEXT = `BIO-ANALYTIC DIAGNOSTICS INC.
Patient Name: Eleanor Vance
DOB: 1972-04-18 | Gender: Female
Ordering Clinic: Westside Family Medicine
Collection Date: 2026-08-20

ROUTINE METABOLIC & LIPID PROFILE
Test                         Result      Unit      Ref Range      Flag
------------------------------------------------------------------------
Fasting Blood Glucose        122         mg/dL     70 - 99        HIGH
Hemoglobin A1c               6.8         %         4.0 - 5.6      HIGH
Total Cholesterol            188         mg/dL     125 - 200      NORMAL
LDL Cholesterol              104         mg/dL     < 100          HIGH
HDL Cholesterol              52          mg/dL     40 - 60        NORMAL
Triglycerides                142         mg/dL     < 150          NORMAL
Serum Creatinine             0.92        mg/dL     0.50 - 1.10    NORMAL
Serum Potassium              4.5         mmol/L    3.5 - 5.1      NORMAL
Estimated GFR                80          mL/min    > 60           NORMAL

Notes: Specimen collected in 12-hour fasting state. Specimen integrity verified.`;

/* ---------------------------------------------------------------
   Interactive Clinical Scenarios
------------------------------------------------------------------*/
export const SCENARIOS = [
  {
    id: "eleanor",
    label: "Eleanor Vance (54F) — Type 2 Diabetes & Metabolic",
    specialty: "Endocrinology",
    summaryDesc: "Monitoring glycemic progression and lipid response to Metformin/Statin therapy across 6 months.",
    patient: SAMPLE_PATIENT,
    reports: SAMPLE_REPORTS,
    summary: SAMPLE_SUMMARY,
    auditLog: SAMPLE_AUDIT_LOG,
  },
  {
    id: "marcus",
    label: "Marcus Chen (61M) — Cardiovascular & Lipid Profiling",
    specialty: "Cardiology",
    summaryDesc: "Atherosclerotic cardiovascular risk evaluation; LDL, ApoB, and Triglyceride titration.",
    patient: {
      name: "Marcus Chen",
      age: "61",
      sex: "Male",
      symptoms: "Occasional exertion-related chest tightness, shortness of breath on stairs.",
      conditions: "Coronary Artery Disease, Hyperlipidemia, Mild Carotid Plaque",
      allergies: "Aspirin (bronchospasm / wheezing)",
      medications: "Rosuvastatin 40 mg QD, Ezetimibe 10 mg QD, Clopidogrel 75 mg QD",
      notes: "Cardiology consult with coronary calcium score 240. Statin escalated from 20mg to 40mg.",
    },
    reports: [
      {
        id: "rep-mc-1",
        title: "Baseline Lipid Panel & Cardiac Markers — Jan 2026",
        date: "2026-01-15",
        createdAt: "2026-01-15T09:00:00.000Z",
        rawText: `ADVANCED CARDIOVASCULAR LABS
Patient: Marcus Chen | 61M
TEST                     RESULT   REF RANGE    FLAG
Total Cholesterol        248      125 - 200    HIGH
LDL Cholesterol          164      < 70         HIGH
HDL Cholesterol          39       40 - 60      LOW
Triglycerides            225      < 150        HIGH
Apolipoprotein B         128      < 80         HIGH
High-Sensitivity CRP     3.2      < 1.0        HIGH`,
        tests: [
          { id: "mc-1", name: "Total Cholesterol", value: "248", numericValue: 248, unit: "mg/dL", referenceRangeText: "125 - 200", referenceMin: 125, referenceMax: 200, observation: "Elevated", confidence: "high", source: "user_verified" },
          { id: "mc-2", name: "LDL Cholesterol", value: "164", numericValue: 164, unit: "mg/dL", referenceRangeText: "< 70", referenceMin: null, referenceMax: 70, observation: "High cardiovascular risk", confidence: "high", source: "user_verified" },
          { id: "mc-3", name: "HDL Cholesterol", value: "39", numericValue: 39, unit: "mg/dL", referenceRangeText: "40 - 60", referenceMin: 40, referenceMax: 60, observation: "Below target", confidence: "high", source: "user_verified" },
          { id: "mc-4", name: "Triglycerides", value: "225", numericValue: 225, unit: "mg/dL", referenceRangeText: "< 150", referenceMin: null, referenceMax: 150, observation: "Hypertriglyceridemia", confidence: "high", source: "user_verified" },
          { id: "mc-5", name: "Serum Creatinine", value: "1.05", numericValue: 1.05, unit: "mg/dL", referenceRangeText: "0.60 - 1.20", referenceMin: 0.60, referenceMax: 1.20, observation: null, confidence: "high", source: "user_verified" },
        ],
      },
      {
        id: "rep-mc-2",
        title: "High-Intensity Statin Follow-Up — Jul 2026",
        date: "2026-07-22",
        createdAt: "2026-07-22T08:45:00.000Z",
        rawText: `ADVANCED CARDIOVASCULAR LABS
Patient: Marcus Chen | 61M
TEST                     RESULT   REF RANGE    FLAG
Total Cholesterol        158      125 - 200    NORMAL
LDL Cholesterol          68       < 70         NORMAL
HDL Cholesterol          44       40 - 60      NORMAL
Triglycerides            135      < 150        NORMAL
Serum Creatinine         1.02     0.60 - 1.20  NORMAL`,
        tests: [
          { id: "mc-6", name: "Total Cholesterol", value: "158", numericValue: 158, unit: "mg/dL", referenceRangeText: "125 - 200", referenceMin: 125, referenceMax: 200, observation: "Marked reduction", confidence: "high", source: "user_verified" },
          { id: "mc-7", name: "LDL Cholesterol", value: "68", numericValue: 68, unit: "mg/dL", referenceRangeText: "< 70", referenceMin: null, referenceMax: 70, observation: "Achieved target < 70", confidence: "high", source: "user_verified" },
          { id: "mc-8", name: "HDL Cholesterol", value: "44", numericValue: 44, unit: "mg/dL", referenceRangeText: "40 - 60", referenceMin: 40, referenceMax: 60, observation: "Normalized", confidence: "high", source: "user_verified" },
          { id: "mc-9", name: "Triglycerides", value: "135", numericValue: 135, unit: "mg/dL", referenceRangeText: "< 150", referenceMin: null, referenceMax: 150, observation: "Normalized", confidence: "high", source: "user_verified" },
          { id: "mc-10", name: "Serum Creatinine", value: "1.02", numericValue: 1.02, unit: "mg/dL", referenceRangeText: "0.60 - 1.20", referenceMin: 0.60, referenceMax: 1.20, observation: "Stable renal function", confidence: "high", source: "user_verified" },
        ],
      },
    ],
    summary:
      "Following initiation of high-intensity lipid-lowering therapy, LDL cholesterol decreased substantially from 164 mg/dL to 68 mg/dL, achieving the targeted clinical threshold of under 70 mg/dL. Total cholesterol (248 to 158 mg/dL) and triglycerides (225 to 135 mg/dL) also normalized into their respective reference intervals, while renal filtration markers remained steady. Continue monitoring liver enzymes and clinical symptoms in consultation with your cardiologist.",
    auditLog: [
      { id: "aud-mc-1", at: "2026-07-22T11:00:00.000Z", action: "Report extracted", detail: "High-Intensity Statin Follow-Up — Jul 2026" },
      { id: "aud-mc-2", at: "2026-01-15T11:00:00.000Z", action: "Report extracted", detail: "Baseline Lipid Panel & Cardiac Markers — Jan 2026" },
    ],
  },
  {
    id: "sarah",
    label: "Sarah Jenkins (48F) — Renal & Hematology Workup",
    specialty: "Nephrology / Hematology",
    summaryDesc: "Longitudinal tracking of eGFR, Creatinine, Ferritin, and Hemoglobin following iron repletion.",
    patient: {
      name: "Sarah Jenkins",
      age: "48",
      sex: "Female",
      symptoms: "Exertional dyspnea, pale conjunctiva, cold intolerance, restless legs at night.",
      conditions: "Stage 2 Chronic Kidney Disease, Iron Deficiency Anemia, Hypothyroidism",
      allergies: "Iodine contrast dye (urticaria)",
      medications: "Levothyroxine 75 mcg QD, Ferrous Fumarate 210 mg BID, Losartan 25 mg QD",
      notes: "Follow-up for microcytic anemia and baseline renal filtration monitoring.",
    },
    reports: [
      {
        id: "rep-sj-1",
        title: "Complete Blood Count & Iron Studies — Feb 2026",
        date: "2026-02-10",
        createdAt: "2026-02-10T10:00:00.000Z",
        rawText: `PROVIDENCE HEALTH LABS
Patient: Sarah Jenkins | 48F
TEST                     RESULT   REF RANGE     FLAG
Hemoglobin               9.4      12.0 - 16.0   LOW
Serum Ferritin           11       20 - 200      LOW
Serum Creatinine         1.28     0.50 - 1.10   HIGH
Estimated GFR            52       > 60          LOW
White Blood Cell Count   5.4      4.0 - 11.0    NORMAL
Platelet Count           210      150 - 450     NORMAL`,
        tests: [
          { id: "sj-1", name: "Hemoglobin", value: "9.4", numericValue: 9.4, unit: "g/dL", referenceRangeText: "12.0 - 16.0", referenceMin: 12.0, referenceMax: 16.0, observation: "Moderate anemia", confidence: "high", source: "user_verified" },
          { id: "sj-2", name: "Serum Ferritin", value: "11", numericValue: 11, unit: "ng/mL", referenceRangeText: "20 - 200", referenceMin: 20, referenceMax: 200, observation: "Severe iron depletion", confidence: "high", source: "user_verified" },
          { id: "sj-3", name: "Serum Creatinine", value: "1.28", numericValue: 1.28, unit: "mg/dL", referenceRangeText: "0.50 - 1.10", referenceMin: 0.50, referenceMax: 1.10, observation: "Elevated", confidence: "high", source: "user_verified" },
          { id: "sj-4", name: "Estimated GFR", value: "52", numericValue: 52, unit: "mL/min", referenceRangeText: "> 60", referenceMin: 60, referenceMax: null, observation: "Mild-moderate reduction", confidence: "high", source: "user_verified" },
        ],
      },
      {
        id: "rep-sj-2",
        title: "Post-Repletion CBC & Renal Panel — Sep 2026",
        date: "2026-09-01",
        createdAt: "2026-09-01T09:30:00.000Z",
        rawText: `PROVIDENCE HEALTH LABS
Patient: Sarah Jenkins | 48F
TEST                     RESULT   REF RANGE     FLAG
Hemoglobin               12.2     12.0 - 16.0   NORMAL
Serum Ferritin           48       20 - 200      NORMAL
Serum Creatinine         1.18     0.50 - 1.10   HIGH
Estimated GFR            58       > 60          LOW`,
        tests: [
          { id: "sj-5", name: "Hemoglobin", value: "12.2", numericValue: 12.2, unit: "g/dL", referenceRangeText: "12.0 - 16.0", referenceMin: 12.0, referenceMax: 16.0, observation: "Normalized with repletion", confidence: "high", source: "user_verified" },
          { id: "sj-6", name: "Serum Ferritin", value: "48", numericValue: 48, unit: "ng/mL", referenceRangeText: "20 - 200", referenceMin: 20, referenceMax: 200, observation: "Restored iron stores", confidence: "high", source: "user_verified" },
          { id: "sj-7", name: "Serum Creatinine", value: "1.18", numericValue: 1.18, unit: "mg/dL", referenceRangeText: "0.50 - 1.10", referenceMin: 0.50, referenceMax: 1.10, observation: "Stable kidney filtration", confidence: "high", source: "user_verified" },
          { id: "sj-8", name: "Estimated GFR", value: "58", numericValue: 58, unit: "mL/min", referenceRangeText: "> 60", referenceMin: 60, referenceMax: null, observation: "Improved toward threshold", confidence: "high", source: "user_verified" },
        ],
      },
    ],
    summary:
      "Following oral iron repletion therapy, hemoglobin recovered from 9.4 g/dL to a normal level of 12.2 g/dL, accompanied by restoration of serum ferritin from 11 ng/mL to 48 ng/mL. Estimated GFR showed modest improvement from 52 to 58 mL/min, with serum creatinine decreasing slightly from 1.28 to 1.18 mg/dL. Renal filtration parameters should continue to be monitored periodically in conjunction with blood pressure management.",
    auditLog: [
      { id: "aud-sj-1", at: "2026-09-01T11:00:00.000Z", action: "Report extracted", detail: "Post-Repletion CBC & Renal Panel — Sep 2026" },
      { id: "aud-sj-2", at: "2026-02-10T11:00:00.000Z", action: "Report extracted", detail: "Complete Blood Count & Iron Studies — Feb 2026" },
    ],
  },
];

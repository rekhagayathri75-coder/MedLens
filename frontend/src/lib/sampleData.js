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

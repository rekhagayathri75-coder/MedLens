/**
 * MedLens Clinical Biomarker Knowledge Base
 * Educational context, organ system mappings, and physician conversation starters.
 */

export const BIOMARKER_DICTIONARY = {
  "fasting blood glucose": {
    name: "Fasting Blood Glucose",
    organ: "Pancreas / Endocrine",
    category: "Metabolic",
    description: "Measures the level of circulating glucose in your blood after fasting for at least 8 to 12 hours. It reflects how effectively your pancreas produces insulin and how sensitive your cells are to it.",
    clinicalSignificance: "Screening and monitoring tool for prediabetes, Type 1, and Type 2 diabetes.",
    interpretation: {
      high: "Elevated levels (impaired fasting glucose) indicate insulin resistance or decreased insulin production.",
      low: "Low levels (hypoglycemia) can occur with medication excess, prolonged fasting, or reactive hormonal shifts.",
    },
    doctorQuestions: [
      "Does this fasting level warrant checking a continuous glucose monitor (CGM) or fingerstick log?",
      "Could my current medications or dinner timing be influencing this reading?",
      "What target fasting range is appropriate for my specific medical history?",
    ],
  },
  "glucose": {
    name: "Blood Glucose",
    organ: "Pancreas / Endocrine",
    category: "Metabolic",
    description: "The primary energy source for your body's cells, regulated by the hormone insulin.",
    clinicalSignificance: "Fundamental marker for cellular metabolism and glycemic control.",
    interpretation: {
      high: "Hyperglycemia can stem from diabetes, acute stress, infection, or corticosteroid medication.",
      low: "Hypoglycemia may cause shakiness, dizziness, or confusion, often related to diabetes medications.",
    },
    doctorQuestions: [
      "Was this drawn in a true fasting state, and how does that affect the interpretation?",
      "Should we re-evaluate my carbohydrate intake or medication dosing?",
    ],
  },
  "hemoglobin a1c": {
    name: "Hemoglobin A1c (HbA1c)",
    organ: "Hematology / Pancreas",
    category: "Metabolic",
    description: "Reflects your average blood sugar levels over the past 2 to 3 months. When glucose circulates in the blood, a portion binds permanently to hemoglobin molecules inside red blood cells.",
    clinicalSignificance: "Gold standard for diagnosing and tracking long-term diabetes management.",
    interpretation: {
      high: "Values between 5.7%–6.4% indicate prediabetes; 6.5% or higher indicates diabetes. Higher numbers correlate with long-term microvascular risk.",
      low: "Generally normal unless accompanied by chronic anemia or shortened red blood cell lifespan.",
    },
    doctorQuestions: [
      "What is my personalized A1c goal given my age and lifestyle?",
      "Do my daily home readings align with this 3-month average?",
      "Are there lifestyle adjustments or medication titration steps we should discuss?",
    ],
  },
  "total cholesterol": {
    name: "Total Cholesterol",
    organ: "Cardiovascular / Liver",
    category: "Lipids",
    description: "Measures the total amount of cholesterol in your blood, which includes low-density lipoprotein (LDL), high-density lipoprotein (HDL), and other lipid components.",
    clinicalSignificance: "Part of an overall cardiovascular risk assessment alongside blood pressure, age, and smoking history.",
    interpretation: {
      high: "Elevated total cholesterol can contribute to plaque accumulation (atherosclerosis) in coronary and peripheral arteries.",
      low: "Very low levels are uncommon and usually reviewed in the context of malnutrition or severe liver disorders.",
    },
    doctorQuestions: [
      "How does my total cholesterol ratio (Total/HDL) factor into my 10-year ASCVD risk score?",
      "Should we perform an advanced lipid panel such as ApoB or Lp(a)?",
    ],
  },
  "ldl cholesterol": {
    name: "LDL Cholesterol",
    organ: "Cardiovascular / Liver",
    category: "Lipids",
    description: "Often termed 'bad cholesterol', Low-Density Lipoprotein transports cholesterol particles throughout your body. Excess LDL can penetrate arterial walls and oxidize, forming atherosclerotic plaques.",
    clinicalSignificance: "Primary therapeutic target for cardiovascular disease prevention.",
    interpretation: {
      high: "Higher LDL levels accelerate vascular plaque formation, increasing risk of myocardial infarction or stroke.",
      low: "Desirable; lower levels are frequently targeted in patients with documented heart disease or diabetes.",
    },
    doctorQuestions: [
      "What is my specific LDL target (e.g., < 100 mg/dL or < 70 mg/dL for high risk)?",
      "Would statin therapy or dietary lipid reduction be the recommended first step?",
    ],
  },
  "hdl cholesterol": {
    name: "HDL Cholesterol",
    organ: "Cardiovascular / Liver",
    category: "Lipids",
    description: "Commonly referred to as 'good cholesterol', High-Density Lipoprotein collects excess cholesterol from peripheral tissues and transports it back to the liver for excretion (reverse cholesterol transport).",
    clinicalSignificance: "Higher levels are associated with reduced cardiovascular risk.",
    interpretation: {
      high: "Generally cardioprotective, though extremely elevated levels (> 90 mg/dL) require comprehensive lipidology review.",
      low: "Low HDL (< 40 mg/dL in men, < 50 mg/dL in women) is an independent risk factor for coronary artery disease.",
    },
    doctorQuestions: [
      "What physical activities or dietary patterns can help raise my HDL levels safely?",
    ],
  },
  "triglycerides": {
    name: "Serum Triglycerides",
    organ: "Metabolism / Cardiovascular",
    category: "Lipids",
    description: "The primary form of fat stored in the body, derived from dietary calories and synthesized by the liver from unburned carbohydrates.",
    clinicalSignificance: "Indicator of metabolic syndrome, fatty liver infiltration, and cardiovascular risk.",
    interpretation: {
      high: "Elevated triglycerides are linked to metabolic syndrome, diabetes, and at very high levels (> 500 mg/dL), acute pancreatitis.",
      low: "Uncommon; typically indicates strict low-fat diet or malabsorption.",
    },
    doctorQuestions: [
      "Could simple sugars, alcohol, or refined carbs be driving this triglyceride number?",
      "Does this reading suggest insulin resistance or hepatic steatosis?",
    ],
  },
  "serum creatinine": {
    name: "Serum Creatinine",
    organ: "Kidneys (Renal)",
    category: "Renal & Electrolytes",
    description: "A natural metabolic waste product created by routine muscle breakdown. Healthy kidneys filter almost all creatinine from the bloodstream and excrete it in urine.",
    clinicalSignificance: "Core marker for kidney filtration capacity; used directly to calculate eGFR.",
    interpretation: {
      high: "Elevated levels suggest reduced glomerular filtration rate, dehydration, acute kidney stress, or high muscle mass.",
      low: "Low levels can be seen with low muscle mass, pregnancy, or severe liver disease.",
    },
    doctorQuestions: [
      "Does this creatinine level indicate stable chronic function or acute fluctuation?",
      "Are any of my current medications (e.g. NSAIDs, blood pressure meds) affecting kidney filtration?",
      "Should I be mindful of hydration or protein intake before blood tests?",
    ],
  },
  "estimated gfr": {
    name: "Estimated GFR (eGFR)",
    organ: "Kidneys (Renal)",
    category: "Renal & Electrolytes",
    description: "Estimated Glomerular Filtration Rate calculates how many milliliters of blood your kidneys clean each minute, mathematically derived from creatinine, age, and biological sex.",
    clinicalSignificance: "Primary metric used to classify stages of chronic kidney disease (CKD).",
    interpretation: {
      high: "Values above 60–90 mL/min indicate healthy filtration in adults.",
      low: "Values below 60 mL/min sustained for > 3 months may indicate mild to moderate renal insufficiency.",
    },
    doctorQuestions: [
      "Is my eGFR stable when compared to my prior lab tests over the past 12–24 months?",
      "Should we order a urine albumin-to-creatinine ratio (uACR) to check for microscopic protein leakage?",
    ],
  },
  "serum potassium": {
    name: "Serum Potassium",
    organ: "Electrolytes / Heart / Kidneys",
    category: "Renal & Electrolytes",
    description: "An essential mineral electrolyte that conducts electrical impulses throughout the body, critical for heart rhythm regulation and muscle contraction.",
    clinicalSignificance: "Critical cardiac biomarker; small deviations can trigger severe cardiac arrhythmias.",
    interpretation: {
      high: "Hyperkalemia (> 5.2 mmol/L) can be caused by kidney impairment or ACE inhibitors/ARBs, posing cardiac conduction risks.",
      low: "Hypokalemia (< 3.5 mmol/L) is often caused by diuretics or gastrointestinal losses, leading to muscle weakness and palpitations.",
    },
    doctorQuestions: [
      "Are my blood pressure medications or diuretics contributing to this potassium level?",
      "Do I need dietary adjustments or electrolyte monitoring?",
    ],
  },
  "serum sodium": {
    name: "Serum Sodium",
    organ: "Electrolytes / Fluid Balance",
    category: "Renal & Electrolytes",
    description: "The primary extracellular electrolyte in the human body, governing water balance, blood volume, and neurological cellular signaling.",
    clinicalSignificance: "Evaluates hydration status, endocrine regulation, and neurological safety.",
    interpretation: {
      high: "Hypernatremia indicates fluid deficit, dehydration, or excessive salt intake.",
      low: "Hyponatremia indicates water retention, diuretic use, heart failure, or syndrome of inappropriate ADH (SIADH).",
    },
    doctorQuestions: [
      "Could my daily fluid intake or diuretics be impacting this sodium reading?",
    ],
  },
  "white blood cell count": {
    name: "White Blood Cell Count (WBC)",
    organ: "Immune / Bone Marrow",
    category: "Hematology",
    description: "Quantifies the total number of circulating defensive immune cells (neutrophils, lymphocytes, monocytes, eosinophils, basophils) in your blood.",
    clinicalSignificance: "Indicates immune activation, bacterial or viral infection, inflammation, or bone marrow disorders.",
    interpretation: {
      high: "Leukocytosis occurs with acute infections, severe physical stress, inflammation, smoking, or hematologic conditions.",
      low: "Leukopenia can result from viral infections, autoimmune conditions, chemotherapy, or bone marrow suppression.",
    },
    doctorQuestions: [
      "Does this WBC count suggest an active or recent infection?",
      "Should we review the five-part differential to see which specific cell line shifted?",
    ],
  },
  "hemoglobin": {
    name: "Hemoglobin",
    organ: "Bone Marrow / Red Blood Cells",
    category: "Hematology",
    description: "The iron-rich protein inside red blood cells responsible for carrying oxygen from the lungs to every tissue in the body.",
    clinicalSignificance: "Primary diagnostic test for anemia and polycythemia.",
    interpretation: {
      high: "Elevated levels can occur with chronic hypoxia (e.g., sleep apnea, smoking, high altitude) or polycythemia vera.",
      low: "Low hemoglobin defines anemia (iron deficiency, blood loss, chronic disease, vitamin B12 deficiency).",
    },
    doctorQuestions: [
      "Is my anemia related to iron deficiency, vitamin levels, or kidney function?",
      "Should we check ferritin and iron saturation levels?",
    ],
  },
  "platelets": {
    name: "Platelet Count",
    organ: "Bone Marrow / Hemostasis",
    category: "Hematology",
    description: "Tiny cell fragments circulating in the blood that clump together and form plugs to arrest bleeding when vascular walls are injured.",
    clinicalSignificance: "Essential for evaluating bleeding tendencies and clotting disorders.",
    interpretation: {
      high: "Thrombocytosis can be reactive (infection, iron deficiency, inflammation) or primary (essential thrombocythemia).",
      low: "Thrombocytopenia increases bruising and bleeding risk, often triggered by medications, viral illness, or autoimmune destruction.",
    },
    doctorQuestions: [
      "Are there any precautions I should take regarding bruising, dental work, or aspirin use?",
    ],
  },
  "ferritin": {
    name: "Serum Ferritin",
    organ: "Liver / Bone Marrow / Spleen",
    category: "Hematology",
    description: "The primary cellular storage protein for iron. Measuring serum ferritin directly reflects your body's total iron reserves.",
    clinicalSignificance: "Most sensitive blood test for detecting total body iron deficiency.",
    interpretation: {
      high: "Elevated ferritin can represent hemochromatosis (iron overload) or act as an acute phase reactant during systemic inflammation.",
      low: "Exclusively diagnostic of iron deficiency, even before overt anemia develops.",
    },
    doctorQuestions: [
      "Does this ferritin level indicate iron depletion?",
      "Would oral iron supplementation or dietary changes be beneficial?",
    ],
  },
  "ast": {
    name: "AST (Aspartate Aminotransferase)",
    organ: "Liver / Heart / Skeletal Muscle",
    category: "Hepatic",
    description: "An enzyme found predominantly in hepatocytes (liver cells), cardiac muscle, and skeletal muscle tissue.",
    clinicalSignificance: "Screens for acute or chronic hepatocellular injury.",
    interpretation: {
      high: "Elevations point to liver inflammation (fatty liver, viral hepatitis, medications/alcohol) or recent strenuous muscle exertion.",
      low: "Generally has no pathological significance.",
    },
    doctorQuestions: [
      "Could any of my supplements or prescription medications be contributing to elevated liver enzymes?",
    ],
  },
  "alt": {
    name: "ALT (Alanine Aminotransferase)",
    organ: "Liver (Hepatic)",
    category: "Hepatic",
    description: "An enzyme located almost exclusively within liver cells, making it a much more liver-specific marker than AST.",
    clinicalSignificance: "Premier screening marker for liver inflammation, steatohepatitis, and toxicity.",
    interpretation: {
      high: "Signals liver cell damage or stress from non-alcoholic fatty liver disease (NAFLD), medications, or viral hepatitis.",
      low: "Normal baseline finding.",
    },
    doctorQuestions: [
      "Should we perform an abdominal liver ultrasound to evaluate for hepatic steatosis?",
    ],
  },
};

export function lookupBiomarkerInfo(testName = "") {
  const clean = testName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  // Exact or contains match
  for (const [key, entry] of Object.entries(BIOMARKER_DICTIONARY)) {
    if (clean.includes(key) || key.includes(clean)) {
      return entry;
    }
  }

  // Fallback generic clinical info
  return {
    name: testName,
    organ: "Clinical Chemistry",
    category: "General Biomarker",
    description: `A clinical laboratory assay evaluating physiological levels of ${testName} in circulating serum, plasma, or whole blood.`,
    clinicalSignificance: "Interpreted in the context of reference intervals provided by the analyzing clinical laboratory.",
    interpretation: {
      high: "Values exceeding the upper reference threshold warrant clinical correlation with symptoms and medication history.",
      low: "Values below the lower reference threshold should be evaluated for physiological or nutritional causes.",
    },
    doctorQuestions: [
      `What was the clinical indication for ordering ${testName}?`,
      `Does my result for ${testName} require follow-up testing or changes to my management plan?`,
    ],
  };
}

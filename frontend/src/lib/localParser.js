/**
 * Clinical Heuristic & Regex Parser for Medical Lab Reports
 * Provides a resilient offline/client-side fallback parser when Claude API
 * is unreachable, unconfigured, or offline.
 */

// Common reference ranges database to enhance extraction when reference ranges are partially formatted
const COMMON_RANGES = {
  "fasting blood glucose": { min: 70, max: 99, unit: "mg/dL" },
  "glucose": { min: 70, max: 99, unit: "mg/dL" },
  "hemoglobin a1c": { min: 4.0, max: 5.6, unit: "%" },
  "hba1c": { min: 4.0, max: 5.6, unit: "%" },
  "total cholesterol": { min: 125, max: 200, unit: "mg/dL" },
  "ldl cholesterol": { min: null, max: 100, unit: "mg/dL" },
  "hdl cholesterol": { min: 40, max: 60, unit: "mg/dL" },
  "triglycerides": { min: null, max: 150, unit: "mg/dL" },
  "serum creatinine": { min: 0.50, max: 1.10, unit: "mg/dL" },
  "creatinine": { min: 0.50, max: 1.10, unit: "mg/dL" },
  "serum potassium": { min: 3.5, max: 5.1, unit: "mmol/L" },
  "potassium": { min: 3.5, max: 5.1, unit: "mmol/L" },
  "serum sodium": { min: 135, max: 145, unit: "mmol/L" },
  "sodium": { min: 135, max: 145, unit: "mmol/L" },
  "ast": { min: 10, max: 40, unit: "U/L" },
  "alt": { min: 7, max: 56, unit: "U/L" },
  "white blood cell count": { min: 4.0, max: 11.0, unit: "K/uL" },
  "wbc": { min: 4.0, max: 11.0, unit: "K/uL" },
  "platelets": { min: 150, max: 450, unit: "K/uL" },
  "hemoglobin": { min: 12.0, max: 17.5, unit: "g/dL" },
};

function parseDateFromText(text) {
  const isoMatch = text.match(/\b(20\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch) return isoMatch[1].replace(/\//g, "-");

  const usMatch = text.match(/\b((?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01])[-/](?:20\d{2}))\b/);
  if (usMatch) {
    const [m, d, y] = usMatch[1].split(/[-/]/);
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const writtenMatch = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/i);
  if (writtenMatch) {
    const monthIdx = monthNames.findIndex((m) => writtenMatch[1].toLowerCase().startsWith(m)) + 1;
    const day = writtenMatch[2].padStart(2, "0");
    const year = writtenMatch[3];
    return `${year}-${String(monthIdx).padStart(2, "0")}-${day}`;
  }

  return null;
}

function parseRangeString(rangeStr) {
  if (!rangeStr) return { text: null, min: null, max: null };
  const clean = rangeStr.trim();

  // Pattern: "70 - 99" or "70.0 - 99.0" or "70 to 99"
  const rangeMatch = clean.match(/([\d.]+)\s*(?:-|to)\s*([\d.]+)/i);
  if (rangeMatch) {
    return {
      text: `${rangeMatch[1]} - ${rangeMatch[2]}`,
      min: parseFloat(rangeMatch[1]),
      max: parseFloat(rangeMatch[2]),
    };
  }

  // Pattern: "< 100" or "<= 100"
  const maxMatch = clean.match(/(?:<|<=|less than)\s*([\d.]+)/i);
  if (maxMatch) {
    return {
      text: `< ${maxMatch[1]}`,
      min: null,
      max: parseFloat(maxMatch[1]),
    };
  }

  // Pattern: "> 60" or ">= 60"
  const minMatch = clean.match(/(?:>|>=|greater than)\s*([\d.]+)/i);
  if (minMatch) {
    return {
      text: `> ${minMatch[1]}`,
      min: parseFloat(minMatch[1]),
      max: null,
    };
  }

  return { text: clean, min: null, max: null };
}

export function parseReportTextLocally(text) {
  const reportDate = parseDateFromText(text);
  const tests = [];
  const lines = text.split(/\r?\n/);

  // Common units in lab reports
  const unitsRegex = /\b(mg\/dL|mmol\/L|%|K\/uL|M\/uL|g\/dL|mL\/min(?:\/1\.73m2)?|U\/L|IU\/L|ng\/mL|pg\/mL|uIU\/mL|mcg\/dL|fl|pg)\b/i;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("---") || rawLine.startsWith("===")) continue;

    // Skip header or metadata lines
    if (
      /^(patient|dob|sex|gender|physician|doctor|clinic|hospital|collection|order|specimen|test\s+name|routine)/i.test(
        rawLine
      )
    ) {
      continue;
    }

    // Attempt 1: Line with standard delimiter (colon, tabs, or multiple spaces)
    // Example: "Fasting Blood Glucose        122         mg/dL     70 - 99        HIGH"
    // Example: "Hemoglobin A1c: 6.8 % (4.0 - 5.6)"
    let testName = null;
    let testValue = null;
    let unit = null;
    let rangeText = null;
    let observation = null;

    // Colon format: "Name: Value Unit (Ref: min - max)"
    if (rawLine.includes(":")) {
      const parts = rawLine.split(":");
      testName = parts[0].trim();
      const rest = parts.slice(1).join(":").trim();

      // Look for parenthesized reference range e.g. "(70 - 99)" or "(Ref: 70-99)"
      const refParen = rest.match(/\((?:ref(?:erence)?:?\s*)?([^)]+)\)/i);
      if (refParen) {
        rangeText = refParen[1].trim();
      }

      const restWithoutRef = rest.replace(/\([^)]+\)/g, "").trim();
      const valMatch = restWithoutRef.match(/^([\d.]+)\s*([a-zA-Z/%/]+)?/);
      if (valMatch) {
        testValue = valMatch[1];
        unit = valMatch[2] || null;
      }
    } else {
      // Tabular format separated by 2+ spaces or tabs
      const columns = rawLine.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);

      if (columns.length >= 2) {
        // Find the first column containing a numeric value
        const numColIndex = columns.findIndex((col) => /^<?>?\s*\d+(?:\.\d+)?$/.test(col) || /^\d+(?:\.\d+)?$/.test(col));
        if (numColIndex > 0) {
          testName = columns.slice(0, numColIndex).join(" ");
          testValue = columns[numColIndex].replace(/[^\d.]/g, "");

          // Check subsequent columns for unit, range, flag
          for (let c = numColIndex + 1; c < columns.length; c++) {
            const col = columns[c];
            if (unitsRegex.test(col) && !unit) {
              unit = col;
            } else if (/[\d.]+\s*[-to]\s*[\d.]+/i.test(col) || /[<>]\s*[\d.]+/i.test(col)) {
              rangeText = col;
            } else if (/^(H|L|HIGH|LOW|NORMAL|ABNORMAL|CRITICAL)$/i.test(col)) {
              observation = col.toUpperCase();
            }
          }
        }
      }
    }

    if (testName && testValue && testName.length > 1 && testName.length < 50) {
      const numericVal = parseFloat(testValue);
      if (!isNaN(numericVal)) {
        const parsedRange = parseRangeString(rangeText);

        // Fallback to known reference range if absent
        const normalizedKey = testName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
        let fallback = null;
        for (const [known, def] of Object.entries(COMMON_RANGES)) {
          if (normalizedKey.includes(known) || known.includes(normalizedKey)) {
            fallback = def;
            break;
          }
        }

        const finalMin = parsedRange.min ?? (parsedRange.text ? null : fallback?.min ?? null);
        const finalMax = parsedRange.max ?? (parsedRange.text ? null : fallback?.max ?? null);
        const finalRangeText =
          parsedRange.text ??
          (fallback
            ? fallback.min != null && fallback.max != null
              ? `${fallback.min} - ${fallback.max}`
              : fallback.max != null
              ? `< ${fallback.max}`
              : `> ${fallback.min}`
            : null);
        const finalUnit = unit || fallback?.unit || null;

        tests.push({
          name: testName,
          value: testValue,
          numericValue: numericVal,
          unit: finalUnit,
          referenceRangeText: finalRangeText,
          referenceMin: finalMin,
          referenceMax: finalMax,
          observation: observation || null,
          confidence: parsedRange.text || fallback ? "high" : "medium",
        });
      }
    }
  }

  return {
    reportDate,
    tests,
  };
}

export function generateLocalSummary(patient, reports) {
  const totalReports = reports.length;
  if (totalReports === 0) {
    return "No clinical reports have been loaded into this record yet. Add a report or load a sample record to generate an overview.";
  }

  const allTests = reports.flatMap((r) => r.tests);
  const outOfRange = allTests.filter((t) => {
    if (t.numericValue == null) return false;
    if (t.referenceMin != null && t.numericValue < t.referenceMin) return true;
    if (t.referenceMax != null && t.numericValue > t.referenceMax) return true;
    return false;
  });

  const highTests = outOfRange.filter((t) => t.referenceMax != null && t.numericValue > t.referenceMax);
  const lowTests = outOfRange.filter((t) => t.referenceMin != null && t.numericValue < t.referenceMin);

  const lines = [];

  const patientIntro = patient.name
    ? `Record for ${patient.name}${patient.age ? ` (${patient.age}y${patient.sex ? `, ${patient.sex}` : ""})` : ""}.`
    : "Patient record summary.";

  lines.push(patientIntro);

  if (totalReports === 1) {
    lines.push(
      `Across ${allTests.length} recorded lab test${allTests.length === 1 ? "" : "s"} in 1 report, ${
        outOfRange.length
      } value${outOfRange.length === 1 ? " was" : "s were"} outside standard reference intervals.`
    );
  } else {
    lines.push(
      `Across ${totalReports} clinical reports containing ${allTests.length} recorded values, ${outOfRange.length} measurement${
        outOfRange.length === 1 ? "" : "s"
      } fell outside reference intervals.`
    );
  }

  if (highTests.length > 0) {
    const uniqueHigh = Array.from(new Set(highTests.map((t) => t.name))).slice(0, 4);
    lines.push(`Elevated results noted for ${uniqueHigh.join(", ")}.`);
  }

  if (lowTests.length > 0) {
    const uniqueLow = Array.from(new Set(lowTests.map((t) => t.name))).slice(0, 3);
    lines.push(`Lower-than-reference results observed for ${uniqueLow.join(", ")}.`);
  }

  if (patient.conditions) {
    lines.push(`Context includes documented history of ${patient.conditions}.`);
  }

  lines.push(
    "This summary is generated for organizational reference only and is not a medical diagnosis. Please review these findings and any recent symptoms with your licensed healthcare provider."
  );

  return lines.join(" ");
}

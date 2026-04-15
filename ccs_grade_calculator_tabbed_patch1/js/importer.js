function normalizeCategoryName(name) {
  if (/assignments/i.test(name)) return 'Assignments';
  if (/quizzes/i.test(name)) return 'Quizzes';
  if (/tests/i.test(name)) return 'Tests/Projects';
  return name.trim();
}

function parseTabLine(line) {
  const parts = line.split(/\t+/).map(part => part.trim());
  if (parts.length < 4) return null;

  const statusIndex = parts.findIndex(part => /^(Valid|Missing)$/i.test(part));
  if (statusIndex === -1) return null;

  const status = parts[statusIndex];
  const name = parts[0] || 'Imported assignment';
  const pts = parts[1] === '' ? 0 : Number(parts[1]);
  const max = Number(parts[2]);
  if (Number.isNaN(max) || max <= 0) return null;

  if (/missing/i.test(status)) {
    return {
      name,
      earned: 0,
      possible: max,
      correctedEnabled: false,
      correctedEarned: null,
      isMissing: true
    };
  }

  if (Number.isNaN(pts)) return null;
  return {
    name,
    earned: pts,
    possible: max,
    correctedEnabled: false,
    correctedEarned: null,
    isMissing: false
  };
}

function parseLooseLine(line) {
  const validMatch = line.match(/^(.*)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Valid\b/i);
  if (validMatch) {
    return {
      name: validMatch[1].trim() || 'Imported assignment',
      earned: Number(validMatch[2]),
      possible: Number(validMatch[3]),
      correctedEnabled: false,
      correctedEarned: null,
      isMissing: false
    };
  }

  const missingMatch = line.match(/^(.*)\s+(\d+(?:\.\d+)?)\s+Missing\b/i);
  if (missingMatch) {
    return {
      name: missingMatch[1].trim() || 'Imported missing assignment',
      earned: 0,
      possible: Number(missingMatch[2]),
      correctedEnabled: false,
      correctedEarned: null,
      isMissing: true
    };
  }

  const statusMatch = line.match(/\b(Valid|Missing)\b/i);
  if (statusMatch) {
    const status = statusMatch[1];
    const statusIndex = line.search(/\b(Valid|Missing)\b/i);
    const before = line.slice(0, statusIndex).trim();
    const nums = before.match(/\d+(?:\.\d+)?/g) || [];
    if (/Missing/i.test(status) && nums.length >= 1) {
      return {
        name: before.replace(/\d+(?:\.\d+)?\s*$/, '').trim() || 'Imported missing assignment',
        earned: 0,
        possible: Number(nums[nums.length - 1]),
        correctedEnabled: false,
        correctedEarned: null,
        isMissing: true
      };
    }
    if (/Valid/i.test(status) && nums.length >= 3) {
      return {
        name: before.replace(/\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s*$/, '').trim() || 'Imported assignment',
        earned: Number(nums[nums.length - 3]),
        possible: Number(nums[nums.length - 2]),
        correctedEnabled: false,
        correctedEarned: null,
        isMissing: false
      };
    }
  }

  return null;
}

export function importGradebookText
export function importGradebookText(raw) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const importedCategories = [];
  let currentCategory = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(.*?)Weight\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (headerMatch) {
      currentCategory = {
        name: normalizeCategoryName(headerMatch[1].trim()),
        weight: Number(headerMatch[2]),
        correctionCap: null,
        grades: []
      };
      importedCategories.push(currentCategory);
      continue;
    }

    if (!currentCategory) continue;
    if (/^Assignment\s+Pts\s+Max\s+Avg\s+Status\s+Due/i.test(line)) continue;
    if (/^Category Average/i.test(line)) continue;

    const parsed = line.includes('\t') ? parseTabLine(line) : parseLooseLine(line);
    if (parsed) currentCategory.grades.push(parsed);
  }

  return importedCategories;
}

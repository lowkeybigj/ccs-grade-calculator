// utils.js
function el(id) {
  return document.getElementById(id);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// storage.js
const STORAGE_KEY = 'gradeCalculatorClasses';
const THEME_KEY = 'ccsGradeCalculatorTheme';

function getSavedClasses() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function saveAllClasses(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function applyTheme(theme, button) {
  const isDark = theme === 'dark';
  document.body.classList.toggle('dark', isDark);
  if (button) button.textContent = isDark ? 'Light Mode' : 'Dark Mode';
  localStorage.setItem(THEME_KEY, theme);
}

function loadTheme(button) {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light', button);
}


// grades.js
function cloneData(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function letterGrade(percent) {
  if (percent === null || Number.isNaN(percent)) return 'N/A';
  if (percent >= 90) return 'A';
  if (percent >= 80) return 'B';
  if (percent >= 74) return 'C';
  if (percent >= 70) return 'D';
  return 'F';
}

function displayedEarned(grade) {
  if (grade.isMissing) return 0;
  if (grade.correctedEnabled && grade.correctedEarned !== null && grade.correctedEarned !== undefined) {
    return Number(grade.correctedEarned);
  }
  return Number(grade.earned ?? 0);
}

function baseGradePercent(grade) {
  if (!grade || Number(grade.possible) <= 0) return null;
  return (Number(grade.earned) / Number(grade.possible)) * 100;
}

function categoryTotals(category, options = {}) {
  const simulateMissingCompletion = !!options.simulateMissingCompletion;
  const simulateCorrections = !!options.simulateCorrections;
  let earned = 0;
  let possible = 0;

  (category.grades || []).forEach((grade) => {
    possible += Number(grade.possible ?? 0);

    if (simulateMissingCompletion && grade.isMissing) {
      earned += missingGradeEarnedWithPenalty(grade);
      return;
    }

    if (grade.isMissing) {
      earned += 0;
      return;
    }

    if (simulateCorrections) {
      const check = gradeCorrectionEligibility(category, grade);
      if (check.eligible) {
        earned += Number(check.maxEarned ?? grade.earned ?? 0);
        return;
      }
    }

    earned += displayedEarned(grade);
  });

  return { earned, possible };
}

function categoryAverage(category, options = {}) {
  const totals = categoryTotals(category, options);
  if (!totals.possible) return null;
  return (totals.earned / totals.possible) * 100;
}

function overallAverage(data, options = {}) {
  const active = (data.categories || []).filter(c => categoryAverage(c, options) !== null);
  const activeWeight = active.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (!active.length || !activeWeight) return null;

  let total = 0;
  active.forEach(category => {
    const avg = categoryAverage(category, options);
    total += avg * (Number(category.weight || 0) / activeWeight);
  });
  return total;
}

function totalWeight(data) {
  return data.categories.reduce((sum, c) => sum + Number(c.weight || 0), 0);
}

function allGradePercents(data) {
  const values = [];
  data.categories.forEach(category => {
    category.grades.forEach(grade => {
      if (Number(grade.possible) > 0) {
        values.push({
          categoryName: category.name,
          assignmentName: grade.name,
          percent: (displayedEarned(grade) / Number(grade.possible)) * 100,
          rawPercent: (Number(grade.earned) / Number(grade.possible)) * 100,
          isMissing: !!grade.isMissing,
      latePenalty: grade.latePenalty ?? 1
        });
      }
    });
  });
  return values;
}

function normalizeLoadedClass(data) {
  const copy = cloneData(data);
  copy.goalGrade = copy.goalGrade ?? '';
  copy.upcoming = Array.isArray(copy.upcoming) ? copy.upcoming : [];
  copy.categories = Array.isArray(copy.categories) ? copy.categories : [];
  copy.categories.forEach((category) => {
    category.correctionCap = category.correctionCap ?? null;
    category.grades = Array.isArray(category.grades) ? category.grades : [];
    category.grades.forEach((grade, index) => {
      grade.name = grade.name || `Imported grade ${index + 1}`;
      grade.earned = Number(grade.earned ?? 0);
      grade.possible = Number(grade.possible ?? 0);
      grade.correctedEnabled = !!grade.correctedEnabled;
      grade.correctedEarned = grade.correctedEarned ?? null;
      grade.isMissing = !!grade.isMissing;
      grade.latePenalty = grade.latePenalty ?? 1;
    });
  });
  return copy;
}

function gradeCorrectionEligibility(category, grade) {
  const cap = Number(category.correctionCap);
  const originalPercent = baseGradePercent(grade);
  if (!cap || Number.isNaN(cap) || cap <= 0) return { eligible: false, reason: 'This category has no correction cap.' };
  if (originalPercent === null) return { eligible: false, reason: 'This grade is invalid.' };
  if (originalPercent < 70) return { eligible: false, reason: 'Grades below 70 do not count as correctable.' };
  if (originalPercent >= cap) return { eligible: false, reason: 'This grade is already at or above the correction cap.' };
  return { eligible: true, maxEarned: grade.possible * (cap / 100), cap };
}

function applyUpcomingScores(data, earnedArray) {
  earnedArray.forEach((earned, index) => {
    const slot = data.upcoming[index];
    const category = data.categories[slot.categoryIndex];
    category.grades.push({
      name: slot.label || `Upcoming grade ${index + 1}`,
      earned,
      possible: slot.possible,
      correctedEnabled: false,
      correctedEarned: null,
      isMissing: false
    });

    if (slot.dropLowest && category.grades.length > 1) {
      let lowestIndex = 0;
      let lowestPercent = displayedEarned(category.grades[0]) / category.grades[0].possible;
      for (let i = 1; i < category.grades.length; i++) {
        const percent = displayedEarned(category.grades[i]) / category.grades[i].possible;
        if (percent < lowestPercent) {
          lowestPercent = percent;
          lowestIndex = i;
        }
      }
      category.grades.splice(lowestIndex, 1);
    }
  });
  return data;
}


// importer.js
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

function normalizeImportedCategories(importedCategories) {
  return (importedCategories || []).map((category, categoryIndex) => ({
    name: category.name || `Category ${categoryIndex + 1}`,
    weight: Number(category.weight || 0),
    correctionCap: category.correctionCap ?? null,
    grades: (category.grades || []).map((grade, gradeIndex) => ({
      name: grade.name || `Imported grade ${gradeIndex + 1}`,
      earned: Number(grade.earned || 0),
      possible: Number(grade.possible || 0),
      correctedEnabled: !!grade.correctedEnabled,
      correctedEarned: grade.correctedEarned ?? null,
      isMissing: !!grade.isMissing,
      latePenalty: grade.latePenalty ?? 1
    }))
  }));
}

function importGradebookText(raw) {
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

    let parsed = null;

    if (line.includes('\t')) {
      const parts = line.split(/\t+/).map(part => part.trim());
      const statusIndex = parts.findIndex(part => /^(Valid|Missing)$/i.test(part));
      if (statusIndex !== -1) {
        const status = parts[statusIndex];
        const name = parts[0] || 'Imported assignment';
        const earnedRaw = parts[1];
        const maxRaw = parts[2];
        const max = Number(maxRaw);
        if (!Number.isNaN(max) && max > 0) {
          parsed = {
            name,
            earned: /missing/i.test(status) ? 0 : (earnedRaw === '' ? 0 : Number(earnedRaw)),
            possible: max,
            correctedEnabled: false,
            correctedEarned: null,
            isMissing: /missing/i.test(status)
          };
        }
      }
    }

    if (!parsed) {
      const statusMatch = line.match(/\b(Valid|Missing)\b/i);
      if (statusMatch) {
        const status = statusMatch[1];
        const statusIndex = line.search(/\b(Valid|Missing)\b/i);
        const before = line.slice(0, statusIndex).trim();
        const nums = before.match(/\d+(?:\.\d+)?/g) || [];

        if (/Missing/i.test(status) && nums.length >= 1) {
          parsed = {
            name: before.replace(/\d+(?:\.\d+)?\s*$/, '').trim() || 'Imported missing assignment',
            earned: 0,
            possible: Number(nums[nums.length - 1]),
            correctedEnabled: false,
            correctedEarned: null,
            isMissing: true
          };
        } else if (/Valid/i.test(status) && nums.length >= 3) {
          parsed = {
            name: before.replace(/\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s*$/, '').trim() || 'Imported assignment',
            earned: Number(nums[nums.length - 3]),
            possible: Number(nums[nums.length - 2]),
            correctedEnabled: false,
            correctedEarned: null,
            isMissing: false
          };
        }
      }
    }

    if (!parsed) {
      const validMatch = line.match(/^(.*)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Valid\b/i);
      if (validMatch) {
        parsed = {
          name: validMatch[1].trim() || 'Imported assignment',
          earned: Number(validMatch[2]),
          possible: Number(validMatch[3]),
          correctedEnabled: false,
          correctedEarned: null,
          isMissing: false
        };
      }
    }

    if (!parsed) {
      const missingMatch = line.match(/^(.*)\s+(\d+(?:\.\d+)?)\s+Missing\b/i);
      if (missingMatch) {
        parsed = {
          name: missingMatch[1].trim() || 'Imported missing assignment',
          earned: 0,
          possible: Number(missingMatch[2]),
          correctedEnabled: false,
          correctedEarned: null,
          isMissing: true
        };
      }
    }

    if (parsed && !Number.isNaN(parsed.possible) && parsed.possible > 0) {
      currentCategory.grades.push(parsed);
    }
  }

  return importedCategories;
}


// planner.js

function potentialActionsForClass(data) {
  const actions = [];
  const before = overallAverage(data);
  if (before === null) return actions;

  data.categories.forEach((category, categoryIndex) => {
    category.grades.forEach((grade, gradeIndex) => {
      if (grade.isMissing && Number(grade.possible) > 0) {
        const copy = cloneData(data);
        copy.categories[categoryIndex].grades[gradeIndex].earned = copy.categories[categoryIndex].grades[gradeIndex].possible;
        copy.categories[categoryIndex].grades[gradeIndex].isMissing = false;
        const after = overallAverage(copy);
        actions.push({
          type: 'missing',
          className: data.className || 'Unnamed class',
          assignmentName: grade.name || `Missing assignment ${gradeIndex + 1}`,
          categoryName: category.name,
          gain: round2((after ?? before) - before),
          after: after ?? before
        });
      }

      const check = gradeCorrectionEligibility(category, grade);
      if (check.eligible) {
        const copy = cloneData(data);
        const g = copy.categories[categoryIndex].grades[gradeIndex];
        g.correctedEnabled = true;
        g.correctedEarned = check.maxEarned;
        const after = overallAverage(copy);
        actions.push({
          type: 'correction',
          className: data.className || 'Unnamed class',
          assignmentName: grade.name || `Assignment ${gradeIndex + 1}`,
          categoryName: category.name,
          gain: round2((after ?? before) - before),
          after: after ?? before
        });
      }
    });
  });

  return actions.sort((a, b) => b.gain - a.gain);
}

function summarizeClassPlan(data) {
  const current = overallAverage(data);
  const goal = Number(data.goalGrade);
  const actions = potentialActionsForClass(data);

  let html = `<div class="category"><div class="row"><strong>${escapeHtml(data.className || 'Unnamed class')}</strong><span class="pill">Current: ${current === null ? 'N/A' : round2(current) + '%'}</span><span class="pill">Goal: ${data.goalGrade ? round2(goal) + '%' : 'not set'}</span></div>`;

  if (!actions.length) {
    html += '<p>No obvious missing assignments or correctable grades were found for this class.</p></div>';
    return html;
  }

  if (data.goalGrade && !Number.isNaN(goal)) {
    let simulated = cloneData(data);
    const picked = [];

    for (const action of actions) {
      if ((overallAverage(simulated) ?? -Infinity) >= goal) break;

      simulated.categories.forEach(category => {
        category.grades.forEach(grade => {
          if (grade.name === action.assignmentName) {
            if (action.type === 'missing' && grade.isMissing) {
              grade.earned = grade.possible;
              grade.isMissing = false;
            } else if (action.type === 'correction') {
              const check = gradeCorrectionEligibility(category, grade);
              if (check.eligible) {
                grade.correctedEnabled = true;
                grade.correctedEarned = check.maxEarned;
              }
            }
          }
        });
      });

      picked.push(action);
    }

    const finalOverall = overallAverage(simulated);
    if (finalOverall !== null && finalOverall >= goal && picked.length) {
      const sentence = picked.map(action =>
        action.type === 'missing'
          ? `turn in missing assignment "${action.assignmentName}" in ${action.className}`
          : `correct "${action.assignmentName}" in ${action.className}`
      ).join(', and ');
      html += `<p><strong>Fastest path to the goal:</strong> You must ${sentence} to reach a ${round2(goal)}.</p>`;
    } else {
      html += `<p class="warning">A saved goal exists, but the current missing/correction options are not enough by themselves to reach it.</p>`;
    }
  }

  html += '<table><tr><th>Priority</th><th>Move</th><th>Estimated Gain</th><th>Projected Grade</th></tr>';
  actions.slice(0, 8).forEach((action, index) => {
    const move = action.type === 'missing'
      ? `Turn in missing "${escapeHtml(action.assignmentName)}" (${escapeHtml(action.categoryName)})`
      : `Correct "${escapeHtml(action.assignmentName)}" up to the cap in ${escapeHtml(action.categoryName)}`;
    html += `<tr><td>${index + 1}</td><td>${move}</td><td>+${round2(action.gain)}%</td><td>${round2(action.after)}%</td></tr>`;
  });
  html += '</table></div>';
  return html;
}

function renderAllClassesPlanner(savedClasses, normalizeLoadedClass) {
  const names = Object.keys(savedClasses);
  if (!names.length) {
    return '<p class="warning">Save at least one class first.</p>';
  }

  const normalized = names.map(name => normalizeLoadedClass(savedClasses[name]));
  const globalActions = normalized.flatMap(potentialActionsForClass).sort((a, b) => b.gain - a.gain);

  let html = '<div>';
  if (globalActions.length) {
    html += '<div class="category"><strong>Best moves across all saved classes</strong><table><tr><th>Priority</th><th>Move</th><th>Estimated Gain</th><th>Projected Grade</th></tr>';
    globalActions.slice(0, 10).forEach((action, index) => {
      const move = action.type === 'missing'
        ? `Turn in missing "${escapeHtml(action.assignmentName)}" in ${escapeHtml(action.className)}`
        : `Correct "${escapeHtml(action.assignmentName)}" in ${escapeHtml(action.className)}`;
      html += `<tr><td>${index + 1}</td><td>${move}</td><td>+${round2(action.gain)}%</td><td>${round2(action.after)}%</td></tr>`;
    });
    html += '</table></div>';
  } else {
    html += '<p>No missing assignments or correctable grades were found in your saved classes.</p>';
  }

  normalized.forEach(data => {
    html += summarizeClassPlan(data);
  });
  html += '</div>';
  return html;
}


// insights.js

function createSparkline(values) {
  if (!values.length) return '<p class="mini-text">Add a few grades to see a trend graph.</p>';
  const width = 520;
  const height = 120;
  const min = 0;
  const max = 100;

  const points = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${round2(x)},${round2(y)}`;
  }).join(' ');

  return `
    <div class="sparkline-wrap">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="120" aria-label="Grade trend graph">
        <line x1="0" y1="${height}" x2="${width}" y2="${height}" stroke="currentColor" opacity="0.15"></line>
        <line x1="0" y1="0" x2="0" y2="${height}" stroke="currentColor" opacity="0.15"></line>
        <polyline fill="none" stroke="currentColor" stroke-width="3" points="${points}"></polyline>
      </svg>
      <div class="sparkline-labels"><span>older</span><span>newer</span></div>
    </div>
  `;
}

function safeThresholdForUpcoming(data, slotIndex, target) {
  const slot = data.upcoming[slotIndex];
  if (!slot) return null;

  let low = 0;
  let high = slot.possible * 2;
  let answer = null;

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const earnedArray = data.upcoming.map((entry, index) => index === slotIndex ? mid : entry.possible);
    const overall = overallAverage(applyUpcomingScores(cloneData(data), earnedArray));
    if (overall >= target) {
      answer = mid;
      high = mid;
    } else {
      low = mid;
    }
  }

  return answer;
}

function reachableGradeMessage(data, upcomingCount) {
  const current = overallAverage(data);
  if (current === null) return 'Add grades first.';
  const best = upcomingCount ? overallAverage(applyUpcomingScores(cloneData(data), data.upcoming.map(slot => slot.possible))) : current;

  const thresholds = [90, 80, 70, 60];
  const letters = { 90: 'A', 80: 'B', 70: 'C', 60: 'D' };
  const reached = thresholds.filter(t => best >= t);
  if (!reached.length) return 'Even with perfect scores on the saved upcoming work, passing is not guaranteed yet.';
  const highest = reached[0];
  return `With your current saved upcoming work, the highest clearly reachable letter grade is ${letters[highest]}.`;
}

function renderInsights(data) {
  const overall = overallAverage(data);
  if (overall === null) {
    return '<p>Add some grades first to unlock insights.</p>';
  }

  const gradePercents = allGradePercents(data);
  const sortedWorst = [...gradePercents].sort((a, b) => a.percent - b.percent);
  const worst = sortedWorst[0] || null;

  let bestCorrection = null;
  let bestMissing = null;

  data.categories.forEach(category => {
    category.grades.forEach(grade => {
      if (grade.isMissing) {
        const copy = cloneData(data);
        copy.categories.forEach(cat => cat.grades.forEach(g => {
          if (g.name === grade.name && g.isMissing) {
            g.earned = g.possible;
            g.isMissing = false;
          }
        }));
        const after = overallAverage(copy);
        const gain = round2((after ?? overall) - overall);
        if (!bestMissing || gain > bestMissing.gain) {
          bestMissing = { name: grade.name, category: category.name, gain, after };
        }
      }

      const check = gradeCorrectionEligibility(category, grade);
      if (check.eligible) {
        const copy = cloneData(data);
        copy.categories.forEach(cat => cat.grades.forEach(g => {
          if (g.name === grade.name) {
            g.correctedEnabled = true;
            g.correctedEarned = check.maxEarned;
          }
        }));
        const after = overallAverage(copy);
        const gain = round2((after ?? overall) - overall);
        if (!bestCorrection || gain > bestCorrection.gain) {
          bestCorrection = { name: grade.name, category: category.name, gain, after, cap: category.correctionCap };
        }
      }
    });
  });

  const categoryRanks = data.categories
    .map(category => ({ name: category.name, average: categoryAverage(category) }))
    .filter(entry => entry.average !== null)
    .sort((a, b) => a.average - b.average);
  const weakestCategory = categoryRanks[0] || null;

  let riskMessage = 'No upcoming work saved yet, so there is no forward-looking risk warning.';
  if (data.upcoming.length) {
    const target = data.goalGrade ? Number(data.goalGrade) : 70;
    const safe = safeThresholdForUpcoming(data, 0, target);
    const slot = data.upcoming[0];
    if (safe === null) {
      riskMessage = 'Could not calculate a risk threshold for the next saved assignment.';
    } else {
      const pct = round2((safe / slot.possible) * 100);
      riskMessage = `Risk warning: if you score below ${round2(safe)}/${round2(slot.possible)} (${pct}%) on "${escapeHtml(slot.label || 'your next saved assignment')}", you will likely fall below ${round2(target)}%.`;
    }
  }

  const missingDoneOverall = overallIfMissingDone(data);
  const stressLevel = getStressLevel(data);
  const realityCheck = getRealityCheckMessage(data);
  const topActions = getTopActions(data, 3);

  return `
    <div class="insight-grid">
      <div class="insight-card">
        <h4>What's hurting me the most?</h4>
        ${worst ? `<p><strong>${escapeHtml(worst.assignmentName)}</strong> in ${escapeHtml(worst.categoryName)} is currently your worst saved grade at ${round2(worst.percent)}%.</p>` : '<p>No assignments yet.</p>'}
      </div>
      <div class="insight-card">
        <h4>Best correction</h4><div class="subtext">Nothing showing up? Try setting the correction cap in each of your categories in the grades tab.</div>
        ${bestCorrection ? `<p>Correcting <strong>${escapeHtml(bestCorrection.name)}</strong> in ${escapeHtml(bestCorrection.category)} could raise your grade by about <strong>${round2(bestCorrection.gain)}%</strong>.</p>` : '<p>No correctable grades were found.</p>'}
      </div>
      <div class="insight-card">
        <h4>Best missing assignment</h4>
        ${bestMissing ? `<p>Turning in <strong>${escapeHtml(bestMissing.name)}</strong> in ${escapeHtml(bestMissing.category)} could raise your grade by about <strong>${round2(bestMissing.gain)}%</strong>.</p>` : '<p>No missing assignments were found.</p>'}
      </div>
      <div class="insight-card">
        <h4>Weakest category</h4>
        ${weakestCategory ? `<p><strong>${escapeHtml(weakestCategory.name)}</strong> is currently your lowest category at ${round2(weakestCategory.average)}%.</p>` : '<p>No category averages yet.</p>'}
      </div>
      <div class="insight-card">
        <h4>If I do nothing...</h4>
        <p>${round2(overall)}% (${letterGrade(overall)})</p>
      </div>
      <div class="insight-card">
        <h4>If I turn in missing work...</h4>
        <p>${missingDoneOverall === null ? 'N/A' : `${round2(missingDoneOverall)}% (${letterGrade(missingDoneOverall)})`}</p>
      </div>
      <div class="insight-card">
        <h4>Stress level</h4>
        <p>${stressLevel}</p>
      </div>
      <div class="insight-card">
        <h4>Reality check</h4>
        <p>${realityCheck}</p>
      </div>
      <div class="insight-card">
        <h4>Can I still pass?</h4><div class="subtext">(Based off of your upcoming work saved in the solver tab.)</div>
        <p>${reachableGradeMessage(data, data.upcoming.length)}</p>
      </div>
      <div class="insight-card">
        <h4>Risk warning</h4>
        <p>${riskMessage}</p>
      </div>
      <div class="insight-card">
        <h4>
    </div>
  `;
}


// main.js


const APP_VERSION = "v.8.4";
let editingCategoryIndex = null;

let editingGradeKey = null;




const DARK_THEME_PRESET_MAP = {
  lime: {
    '--bg': '#16200f','--card':'#1f2a17','--card-2':'#26351d','--text':'#f4f8eb',
    '--muted':'#b8c8aa','--line':'#415234','--accent':'#8fd14d','--accent-2':'#72b438'
  },
  pink: {
    '--bg':'#26141f','--card':'#341c2b','--card-2':'#402336','--text':'#fff2f8',
    '--muted':'#dfbfd2','--line':'#634257','--accent':'#ef78b6','--accent-2':'#d75a9d'
  },
  ocean: {
    '--bg':'#101d28','--card':'#172835','--card-2':'#1d3344','--text':'#eef8ff',
    '--muted':'#b7ccd9','--line':'#365064','--accent':'#4ea4eb','--accent-2':'#3689cc'
  },
  sunset: {
    '--bg':'#2a1a14','--card':'#38241c','--card-2':'#462e24','--text':'#fff1ea',
    '--muted':'#d2b3a5','--line':'#6b4a3b','--accent':'#ff8a5c','--accent-2':'#d96a3e'
  },
  lavender: {
    '--bg':'#1e1a2b','--card':'#2a2540','--card-2':'#332d4f','--text':'#f4f1ff',
    '--muted':'#c9c2e8','--line':'#514a73','--accent':'#b79cff','--accent-2':'#9278e0'
  },
  mint: {
    '--bg':'#13231e','--card':'#1c2f29','--card-2':'#233a33','--text':'#eafff8',
    '--muted':'#b5d9cd','--line':'#3f6158','--accent':'#4fd1a1','--accent-2':'#38a87f'
  },
  gold: {
    '--bg':'#2a2412','--card':'#3a321a','--card-2':'#463c1f','--text':'#fff7d6',
    '--muted':'#d8c88b','--line':'#6b5a2e','--accent':'#ffd54a','--accent-2':'#c9a61c'
  },
  grape: {
    '--bg':'#241a2d','--card':'#32213f','--card-2':'#3d2a4f','--text':'#f6efff',
    '--muted':'#d1c2e3','--line':'#5b4a73','--accent':'#c27bff','--accent-2':'#9b5dd6'
  },
  rose: {
    '--bg':'#2a161c','--card':'#3a2028','--card-2':'#472732','--text':'#fff0f4',
    '--muted':'#e0b9c4','--line':'#6b3f49','--accent':'#ff7a96','--accent-2':'#d95c75'
  },
  sky: {
    '--bg':'#0f2230','--card':'#173243','--card-2':'#1d3c50','--text':'#eefaff',
    '--muted':'#b7d7e5','--line':'#355a6b','--accent':'#6ecaff','--accent-2':'#4aa3d6'
  },
  forest: {
    '--bg':'#142117','--card':'#1d2f22','--card-2':'#233a2a','--text':'#eaffef',
    '--muted':'#b7d7c0','--line':'#3e5f48','--accent':'#5bbf73','--accent-2':'#3f9f59'
  },
  coral: {
    '--bg':'#2a1b16','--card':'#38241d','--card-2':'#452d25','--text':'#fff2ec',
    '--muted':'#e0bfb4','--line':'#6b4a3d','--accent':'#ff9a7a','--accent-2':'#d97557'
  },
  mono: {
    '--bg':'#1e1f23','--card':'#2a2b30','--card-2':'#32343a','--text':'#f1f2f4',
    '--muted':'#b8bbc2','--line':'#4a4d55','--accent':'#9aa0aa','--accent-2':'#7b808a'
  }
};


const THEME_PRESET_MAP = {
  default: null,
  lime: {
    '--bg': '#f6fbef', '--card': '#ffffff', '--card-2': '#eef7df', '--text': '#24361a',
    '--muted': '#60724f', '--line': '#d7e6bf', '--accent': '#83c441', '--accent-2': '#67a62d',
    '--good': '#3b944d', '--warn': '#b68b18', '--danger': '#b53a2d',
    '--shadow': '0 10px 25px rgba(88,118,50,0.10)'
  },
  pink: {
    '--bg': '#fff6fb', '--card': '#ffffff', '--card-2': '#fdebf5', '--text': '#4c2341',
    '--muted': '#87677c', '--line': '#f0cfe0', '--accent': '#e55fa2', '--accent-2': '#c94888',
    '--good': '#2d9c67', '--warn': '#c58d1f', '--danger': '#c73752',
    '--shadow': '0 10px 25px rgba(181,79,137,0.10)'
  },
  ocean: {
    '--bg': '#f2f8fc', '--card': '#ffffff', '--card-2': '#e8f3fa', '--text': '#16344c',
    '--muted': '#5f7890', '--line': '#cddfeb', '--accent': '#2f8bd7', '--accent-2': '#1f6fb3',
    '--good': '#1c8b73', '--warn': '#c08a1d', '--danger': '#c24b42',
    '--shadow': '0 10px 25px rgba(47,111,179,0.10)'
  },
  sunset: {
    '--bg': '#fff5ef', '--card': '#ffffff', '--card-2': '#fee9de', '--text': '#4a2a1e',
    '--muted': '#8c6a59', '--line': '#f0d1c0', '--accent': '#ef7d57', '--accent-2': '#d9623b',
    '--good': '#2d9c67', '--warn': '#c58d1f', '--danger': '#c73737',
    '--shadow': '0 10px 25px rgba(217,98,59,0.10)'
  },
  lavender: {
    '--bg': '#faf7ff', '--card': '#ffffff', '--card-2': '#efe8ff', '--text': '#33275a',
    '--muted': '#736894', '--line': '#ddd2f7', '--accent': '#9b7df2', '--accent-2': '#7f62d1',
    '--good': '#2d9c67', '--warn': '#b98a18', '--danger': '#c0445c',
    '--shadow': '0 10px 25px rgba(127,98,209,0.10)'
  },
  mint: {
    '--bg': '#f2fff9', '--card': '#ffffff', '--card-2': '#e2f8ef', '--text': '#184236',
    '--muted': '#5c8274', '--line': '#c9eadc', '--accent': '#3eb489', '--accent-2': '#29956f',
    '--good': '#228b5d', '--warn': '#bf8c1f', '--danger': '#c94545',
    '--shadow': '0 10px 25px rgba(41,149,111,0.10)'
  },
  gold: {
    '--bg': '#fffaf0', '--card': '#ffffff', '--card-2': '#fff1d1', '--text': '#4b3820',
    '--muted': '#8b7556', '--line': '#ecd9a5', '--accent': '#d9a316', '--accent-2': '#b5850b',
    '--good': '#2d9c67', '--warn': '#b57a00', '--danger': '#c54d2d',
    '--shadow': '0 10px 25px rgba(181,133,11,0.12)'
  },
  grape: {
    '--bg': '#fbf5ff', '--card': '#ffffff', '--card-2': '#f0e2fa', '--text': '#3e234e',
    '--muted': '#7a6487', '--line': '#dfc9eb', '--accent': '#a34fd8', '--accent-2': '#823bb5',
    '--good': '#2d9c67', '--warn': '#c08a1d', '--danger': '#ca4660',
    '--shadow': '0 10px 25px rgba(130,59,181,0.10)'
  },
  rose: {
    '--bg': '#fff7f8', '--card': '#ffffff', '--card-2': '#ffe8ec', '--text': '#4b2631',
    '--muted': '#8a6671', '--line': '#f1cfd7', '--accent': '#dd5a7b', '--accent-2': '#bd4160',
    '--good': '#2d9c67', '--warn': '#c08a1d', '--danger': '#c43636',
    '--shadow': '0 10px 25px rgba(189,65,96,0.10)'
  },
  sky: {
    '--bg': '#f4fbff', '--card': '#ffffff', '--card-2': '#e4f4ff', '--text': '#143850',
    '--muted': '#5e7c91', '--line': '#cfe6f4', '--accent': '#56b6e9', '--accent-2': '#3396ca',
    '--good': '#1c8b73', '--warn': '#c08a1d', '--danger': '#c24b42',
    '--shadow': '0 10px 25px rgba(51,150,202,0.10)'
  },
  forest: {
    '--bg': '#f3faf4', '--card': '#ffffff', '--card-2': '#e3f0e6', '--text': '#223d2a',
    '--muted': '#627a68', '--line': '#cde0d1', '--accent': '#3f8f52', '--accent-2': '#2f6f3e',
    '--good': '#228b5d', '--warn': '#ba861b', '--danger': '#bf4038',
    '--shadow': '0 10px 25px rgba(47,111,62,0.10)'
  },
  coral: {
    '--bg': '#fff7f4', '--card': '#ffffff', '--card-2': '#ffe7df', '--text': '#4d2f28',
    '--muted': '#86685f', '--line': '#f1d1c5', '--accent': '#ff7f61', '--accent-2': '#db6247',
    '--good': '#2d9c67', '--warn': '#c08a1d', '--danger': '#c63e2d',
    '--shadow': '0 10px 25px rgba(219,98,71,0.10)'
  },
  mono: {
    '--bg': '#f5f5f6', '--card': '#ffffff', '--card-2': '#ececef', '--text': '#25262b',
    '--muted': '#6e7179', '--line': '#d7d9de', '--accent': '#5c6470', '--accent-2': '#444b55',
    '--good': '#34835b', '--warn': '#a57a1d', '--danger': '#b24646',
    '--shadow': '0 10px 25px rgba(68,75,85,0.10)'
  }
};


function clearThemePresetStyles() {
  const root = document.documentElement;
  const allVars = ['--bg','--card','--card-2','--text','--muted','--line','--accent','--accent-2','--good','--warn','--danger','--shadow'];
  allVars.forEach(v => root.style.removeProperty(v));
}


function markDiagnostics() {
  if (window.__CCS_DIAG__) window.__CCS_DIAG__.jsLoaded = true;
  const diagJsEl = document.getElementById('diagJs');
  if (diagJsEl) diagJsEl.textContent = 'Main JavaScript loaded: yes';
  const diagThemeEl = document.getElementById('diagTheme');
  if (diagThemeEl) diagThemeEl.textContent = 'Theme system loaded: yes';
  if (window.__CCS_DIAG__) window.__CCS_DIAG__.themeLoaded = true;
  const diagTabsEl = document.getElementById('diagTabs');
  if (diagTabsEl) diagTabsEl.textContent = 'Tab system loaded: yes';
}


let classData = {
  className: '',
  goalGrade: '',
  categories: [],
  upcoming: []
};


let summaryAnimationPlayed = false;
let lastGoalCelebrationKey = null;

function gradeColorClassFromPercent(percent) {
  const letter = letterGrade(percent);
  return letter === 'A' ? 'grade-color-a'
    : letter === 'B' ? 'grade-color-b'
    : letter === 'C' ? 'grade-color-c'
    : letter === 'D' ? 'grade-color-d'
    : 'grade-color-f';
}

function gradeProgressClass(percent) {
  const letter = letterGrade(percent);
  return letter === 'A' ? 'grade-a'
    : letter === 'B' ? 'grade-b'
    : letter === 'C' ? 'grade-c'
    : letter === 'D' ? 'grade-d'
    : 'grade-f';
}



const TOUR_STEPS = [
  {
    tab: 'tutorial',
    target: '#startTourBtn',
    title: 'Welcome',
    text: 'This tour walks you through the main parts of the calculator. Use Next and Back anytime.'
  },
  {
    tab: 'setup',
    target: '#className',
    title: 'Class Setup',
    text: 'Start here. Give your class a name, set a goal if you want, then save the class so other tools can use it.'
  },
  {
    tab: 'planner',
    target: '#analyzeAllClassesBtn',
    title: 'All Classes Planner',
    text: 'This compares your saved classes and shows the best moves you can make across all of them.'
  },
  {
    tab: 'planner',
    target: '#analyzerClassSelect',
    title: 'Max Possible Grade by Class',
    text: 'Pick a saved class here to see the highest grade you could reach by turning in missing work and using available corrections.'
  },
  {
    tab: 'import',
    target: '#gradebookPaste',
    title: 'Paste Gradebook Import',
    text: 'This is the fastest way to fill in a class. Paste your gradebook text here, then import it.'
  },
  {
    tab: 'category',
    target: '#categoryName',
    title: 'Add Category',
    text: 'If you are building a class by hand, add categories like Assignments, Quizzes, and Tests here.'
  },
  {
    tab: 'grades',
    target: '#categoriesContainer',
    title: 'Grades Tab',
    text: 'This is where your categories and assignments appear. You can add grades, edit them, and manage corrections here.'
  },
  {
    tab: 'summary',
    target: '#currentSummary',
    title: 'Summary',
    text: 'This shows your current overall grade, category breakdown, and progress bars.'
  },
  {
    tab: 'insights',
    target: '#insightsOutput',
    title: 'Insights',
    text: 'Insights shows what is hurting your grade most, risk warnings, and other useful guidance.'
  },
  {
    tab: 'solver',
    target: '#solverOutput',
    title: 'Solver',
    text: 'Use the Solver to test future assignments and see what scores you need to hit a target grade.'
  }
];


let tourIndex = 0;

function clearTourHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(elm => elm.classList.remove('tour-highlight'));
}

function positionTourCard(target) {
  const card = el('tourCard');
  if (!card) return;
  const rect = target?.getBoundingClientRect?.();
  const margin = 14;
  if (!rect) {
    card.style.top = '80px';
    card.style.left = '20px';
    return;
  }
  const preferredTop = rect.bottom + margin;
  const fitsBelow = preferredTop + card.offsetHeight < window.innerHeight - 12;
  const top = fitsBelow ? preferredTop : Math.max(12, rect.top - card.offsetHeight - margin);
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - card.offsetWidth - 12);
  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function renderTourStep() {
  const step = TOUR_STEPS[tourIndex];
  if (!step) return;
  if (typeof setActiveTab === 'function') setActiveTab(step.tab);
  setTimeout(() => {
    clearTourHighlight();
    const target = document.querySelector(step.target);
    if (target) {
      target.classList.add('tour-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      positionTourCard(target);
    } else {
      positionTourCard(null);
    }
    el('tourStepNumber').textContent = String(tourIndex + 1);
    el('tourStepTotal').textContent = String(TOUR_STEPS.length);
    el('tourTitle').textContent = step.title;
    el('tourText').textContent = step.text;
    const backBtn = el('tourBackBtn');
    const nextBtn = el('tourNextBtn');
    if (backBtn) backBtn.disabled = tourIndex === 0;
    if (nextBtn) nextBtn.textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
  }, 120);
}

function openTour() {
  tourIndex = 0;
  const overlay = el('tourOverlay');
  if (!overlay) return;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
  renderTourStep();
}

function closeTour() {
  clearTourHighlight();
  const overlay = el('tourOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
}

function nextTourStep() {
  if (tourIndex >= TOUR_STEPS.length - 1) {
    closeTour();
    return;
  }
  tourIndex += 1;
  renderTourStep();
}

function previousTourStep() {
  if (tourIndex <= 0) return;
  tourIndex -= 1;
  renderTourStep();
}


function showToast(message, type = 'success') {
  const container = el('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    setTimeout(() => toast.remove(), 180);
  }, 2400);
}

function animateNumber(elm, start, end, suffix = '') {
  if (!elm) return;
  const duration = 700;
  const startTime = performance.now();
  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = start + (end - start) * eased;
    elm.textContent = `${round2(value)}${suffix}`;
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function launchConfetti() {
  const canvas = el('confettiCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const particles = [];
  const width = canvas.width = window.innerWidth;
  const height = canvas.height = window.innerHeight;
  const colors = ['#8d2b2b', '#16233a', '#f3f0ee', '#2f6fed', '#1f8f5f', '#c59112'];
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * width,
      y: -20 - Math.random() * 80,
      vx: -2 + Math.random() * 4,
      vy: 3 + Math.random() * 5,
      size: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: -0.15 + Math.random() * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  let frames = 0;
  function draw() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.vy += 0.04;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
      ctx.restore();
    });
    frames++;
    if (frames < 120) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, width, height);
  }
  draw();
}

function maybeCelebrateGoal() {
  const overall = overallAverage(classData);
  const goal = Number(classData.goalGrade);
  if (overall === null || Number.isNaN(goal)) return;
  const key = `${classData.className || 'unnamed'}|${round2(overall)}|${round2(goal)}`;
  if (overall >= goal && lastGoalCelebrationKey !== key && overall < goal + 0.0001) {
    lastGoalCelebrationKey = key;
    launchConfetti();
    showToast('Grade reached goal! Good job!', 'success');
  }
}

function applyThemePreset(preset) {
  const normalized = Object.prototype.hasOwnProperty.call(THEME_PRESET_MAP, preset) ? preset : 'default';

  document.body.classList.remove(
    'theme-lime','theme-pink','theme-ocean','theme-sunset','theme-lavender',
    'theme-mint','theme-gold','theme-grape','theme-rose','theme-sky',
    'theme-forest','theme-coral','theme-mono'
  );
  if (normalized !== 'default') {
    document.body.classList.add(`theme-${normalized}`);
  }

  clearThemePresetStyles();

  const isDark = document.body.classList.contains('dark');
  const map = isDark && typeof DARK_THEME_PRESET_MAP !== 'undefined' && DARK_THEME_PRESET_MAP[normalized]
    ? DARK_THEME_PRESET_MAP[normalized]
    : THEME_PRESET_MAP[normalized];

  if (map) {
    Object.entries(map).forEach(([k, v]) => {
      document.documentElement.style.setProperty(k, v);
    });
  }

  try {
    localStorage.setItem('ccsThemePreset', normalized);
  } catch (e) {}

  const select = document.getElementById('themePreset');
  if (select && select.value !== normalized) select.value = normalized;

  return normalized;
}

function loadThemePreset() {
  let preset = 'default';
  try {
    preset = localStorage.getItem('ccsThemePreset') || 'default';
  } catch (e) {}
  applyThemePreset(preset);
}

function overallIfMissingDone(data) {
  const copy = cloneData(data);
  copy.categories.forEach(category => {
    category.grades.forEach(grade => {
      if (grade.isMissing) {
        let penalty = grade.latePenalty ?? 1;
        grade.earned = grade.possible * penalty;
        grade.isMissing = false;
      }
    });
  });
  return overallAverage(copy);
}

function getStressLevel(data) {
  const upcomingCount = data.upcoming.length;
  if (upcomingCount === 0) return '🟢 Safe';
  if (upcomingCount <= 2) return '🟡 Risky';
  return '🔴 Critical';
}

function getRealityCheckMessage(data) {
  const activeCategories = data.categories
    .map(category => ({ name: category.name, avg: categoryAverage(category) }))
    .filter(entry => entry.avg !== null)
    .sort((a, b) => a.avg - b.avg);

  if (!activeCategories.length) return 'Add grades to see patterns.';
  if (activeCategories.length === 1) return `Most of your grade is coming from ${activeCategories[0].name}.`;
  return `Your lowest category is ${activeCategories[0].name}. Focus there first.`;
}



function missingGradeEarnedWithPenalty(grade) {
  const parsed = Number(grade.latePenalty ?? 1);
  const penalty = Number.isFinite(parsed) ? parsed : 1;
  return Number(grade.possible ?? 0) * penalty;
}

function calculateMaxPossibleGrade(data) {
  const normalized = normalizeLoadedClass(cloneData(data));
  return overallAverage(normalized, {
    simulateMissingCompletion: true,
    simulateCorrections: true
  });
}

function calculateAnalyzerMaxGrade() {
  const output = el('analyzerMaxGradeOutput');
  const select = el('analyzerClassSelect');
  if (!output || !select) return;
  if (!select.value) {
    output.innerHTML = '<span class="warning">Choose a class first.</span>';
    return;
  }
  const all = getSavedClasses();
  const raw = all[select.value];
  if (!raw) {
    output.innerHTML = '<span class="warning">Could not find that saved class.</span>';
    return;
  }

  const data = normalizeLoadedClass(raw);
  const current = overallAverage(data);
  const maxGrade = calculateMaxPossibleGrade(data);
  const missingCount = data.categories.reduce((sum, c) => sum + c.grades.filter(g => g.isMissing).length, 0);

  output.innerHTML = `
    <strong>${escapeHtml(select.value)}</strong><br>
    Current grade: ${current === null ? 'N/A' : round2(current) + '%'}<br>
    Max possible grade: ${maxGrade === null ? 'N/A' : round2(maxGrade) + '%'}<br>
    <span class="small">Uses ${missingCount} missing assignment(s), their saved late penalties, and any available corrections.</span>
  `;
}

function getTopActions(data, limit = 3) {
  const actions = [];

  data.categories.forEach((category, categoryIndex) => {
    category.grades.forEach((grade, gradeIndex) => {
      if (grade.isMissing && Number(grade.possible) > 0) {
        const copy = cloneData(data);
        const g = copy.categories[categoryIndex].grades[gradeIndex];
        g.earned = g.possible;
        g.isMissing = false;
        const after = overallAverage(copy);
        const before = overallAverage(data);
        actions.push({
          label: `Turn in missing "${grade.name}"`,
          gain: round2((after ?? before) - before),
          after
        });
      }

      const check = gradeCorrectionEligibility(category, grade);
      if (check.eligible) {
        const copy = cloneData(data);
        const g = copy.categories[categoryIndex].grades[gradeIndex];
        g.correctedEnabled = true;
        g.correctedEarned = check.maxEarned;
        const after = overallAverage(copy);
        const before = overallAverage(data);
        actions.push({
          label: `Correct "${grade.name}" in ${category.name}`,
          gain: round2((after ?? before) - before),
          after
        });
      }
    });
  });

  actions.sort((a, b) => b.gain - a.gain);
  return actions.slice(0, limit);
}

function encodeShareData(data) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

function decodeShareData(encoded) {
  return JSON.parse(decodeURIComponent(escape(atob(encoded))));
}

function generateShareLink() {
  const output = el('shareLinkOutput');
  if (!output) return;
  const payload = encodeShareData(classData);
  const url = new URL(window.location.href);
  url.searchParams.set('share', payload);
  output.value = url.toString();
}

function copyShareLink() {
  const output = el('shareLinkOutput');
  if (!output || !output.value) return alert('Generate a share link first.');
  output.select();
  output.setSelectionRange(0, output.value.length);
  navigator.clipboard.writeText(output.value).then(() => {
    showToast('Share link copied.');
  }).catch(() => {
    try {
      document.execCommand('copy');
      showToast('Share link copied.');
    } catch (e) {
      alert('Could not copy automatically. Copy it manually from the box.');
    }
  });
}

function loadSharedClassFromUrl() {
  const url = new URL(window.location.href);
  const payload = url.searchParams.get('share');
  if (!payload) return;
  try {
    const loaded = normalizeLoadedClass(decodeShareData(payload));
    classData = loaded;
    el('className').value = classData.className || '';
  } catch (e) {
    console.error('Could not load shared class:', e);
  }
}


function setActiveTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabTarget === tabName);
  });

  if (tabName === 'summary') {
    const overall = overallAverage(classData);
    const big = el('summaryBigNumber');
    if (big && overall !== null) {
      animateNumber(big, Math.max(0, overall - 4), overall, '%');
    }
  }
}

function toggleTutorial(id) {
  const box = el(id);
  if (!box) return;
  box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
}

function renderSavedClasses() {
  const select = el('savedClasses');
  const insightsSelect = el('insightsClassSelect');
  const analyzerSelect = el('analyzerClassSelect');
  const all = getSavedClasses();
  select.innerHTML = '<option value="">-- saved classes --</option>';
  if (insightsSelect) insightsSelect.innerHTML = '<option value="__current__">Current class</option>';
  if (analyzerSelect) analyzerSelect.innerHTML = '<option value="">-- choose class --</option>';
  Object.keys(all).sort().forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    select.appendChild(option);

    if (insightsSelect) {
      const opt2 = document.createElement('option');
      opt2.value = name;
      opt2.textContent = name;
      insightsSelect.appendChild(opt2);
    }
    if (analyzerSelect) {
      const opt3 = document.createElement('option');
      opt3.value = name;
      opt3.textContent = name;
      analyzerSelect.appendChild(opt3);
    }
  });
}

function renderWeightStatus() {
  const total = round2(totalWeight(classData));
  el('weightStatus').innerHTML = total === 100
    ? `<span class="good">Weights total ${total}%.</span>`
    : `<span class="warning">Weights total ${total}%. They should add up to 100%.</span>`;
}

function showCategoryTutorial(categoryIndex) {
  const category = classData.categories[categoryIndex];
  const box = el(`categoryTutorial_${categoryIndex}`);
  const totals = categoryTotals(category);
  const avg = categoryAverage(category);
  if (box.style.display === 'none' || box.style.display === '') {
    box.style.display = 'block';
    box.innerHTML = `
      <strong>${escapeHtml(category.name)} Tutorial</strong><br>
      1. Give the assignment a name if you want.<br>
      2. Enter the points you got.<br>
      3. Enter how many points it was out of.<br>
      4. Click Add Grade for each one.<br>
      5. If this category has a correction cap, only grades from 70 up to that cap can be corrected.<br>
      6. Right now this category has <strong>${round2(totals.earned)}/${round2(totals.possible)}</strong>${avg === null ? '' : `, which is <strong>${round2(avg)}%</strong>`}.`;
  } else {
    box.style.display = 'none';
  }
}

function renderCategories() {
  const container = el('categoriesContainer');
  if (!classData.categories.length) {
    container.innerHTML = '<p>No categories yet.</p>';
    return;
  }

  container.innerHTML = classData.categories.map((category, categoryIndex) => {
    const avg = categoryAverage(category);
    const totals = categoryTotals(category);
    const capText = category.correctionCap ? `${round2(category.correctionCap)}%` : 'none';
    const isEditingCategory = editingCategoryIndex === categoryIndex;

    const headerHtml = isEditingCategory ? `
      <div class="row">
        <strong>Editing category</strong>
      </div>
      <div class="row">
        <input id="editCategoryName_${categoryIndex}" value="${escapeHtml(category.name)}" placeholder="Category name" />
        <input id="editCategoryWeight_${categoryIndex}" type="number" step="0.01" value="${round2(category.weight)}" placeholder="Weight %" />
        <input id="editCategoryCap_${categoryIndex}" type="number" step="0.01" value="${category.correctionCap ?? ''}" placeholder="Correction cap % (optional)" />
        <button type="button" data-action="save-category" data-index="${categoryIndex}">Save Changes</button>
        <button type="button" class="ghost-btn" data-action="cancel-edit-category">Cancel</button>
      </div>
    ` : `
      <div class="row">
        <strong>${escapeHtml(category.name)}</strong>
        <span class="pill">Weight: ${round2(category.weight)}%</span>
        <span class="pill">Category average: ${avg === null ? 'N/A' : round2(avg) + '%'}</span>
        <span class="pill">Points: ${round2(totals.earned)}/${round2(totals.possible)}</span>
        <span class="pill">Correction cap: ${capText}</span>
        <span class="pill">Grades: ${category.grades.length}</span>
        <button type="button" data-action="edit-category" data-index="${categoryIndex}">Edit Category</button>
        <button type="button" class="danger-btn" data-action="delete-category" data-index="${categoryIndex}">Delete Category</button>
      </div>
    `;

    const addRowHtml = `
      <div class="row">
        <input id="nameInput_${categoryIndex}" placeholder="Assignment name" />
        <input id="earnedInput_${categoryIndex}" type="number" step="0.01" placeholder="Points earned" />
        <input id="possibleInput_${categoryIndex}" type="number" step="0.01" placeholder="Points possible" />
        <button type="button" data-action="add-grade" data-index="${categoryIndex}">Add Grade</button>
        <button type="button" class="ghost-btn" data-action="toggle-category-tutorial" data-index="${categoryIndex}">Tutorial</button>
      </div>
      <div id="categoryTutorial_${categoryIndex}" class="small subtle-box"></div>
    `;

    const gradesHtml = !category.grades.length
      ? '<div>No grades yet.</div>'
      : `<div class="grade-list">${category.grades.map((grade, gradeIndex) => {
          const shownEarned = displayedEarned(grade);
          const correctedText = grade.correctedEnabled ? `Corrected from ${round2(grade.earned)}/${round2(grade.possible)}` : '';
          const missingPenaltyText = grade.isMissing
            ? ((grade.latePenalty ?? 1) === 1
                ? 'Missing counts as 0'
                : (grade.latePenalty === 0.9
                    ? 'Missing • 1 day late'
                    : grade.latePenalty === 0.8
                      ? 'Missing • 2 days late'
                      : grade.latePenalty === 0.65
                        ? 'Missing • 3+ days late'
                        : 'Missing • Unredeemable'))
            : '';
          const missingText = grade.isMissing ? `<span class="pill warning">${missingPenaltyText}</span>` : '';
          const isEditingGrade = editingGradeKey === `${categoryIndex}:${gradeIndex}`;

          if (isEditingGrade) {
            return `
              <div class="grade-card">
                <div class="row">
                  <input id="editGradeName_${categoryIndex}_${gradeIndex}" value="${escapeHtml(grade.name || '')}" placeholder="Assignment name" />
                  <input id="editGradeEarned_${categoryIndex}_${gradeIndex}" type="number" step="0.01" value="${round2(grade.earned)}" placeholder="Points earned" />
                  <input id="editGradePossible_${categoryIndex}_${gradeIndex}" type="number" step="0.01" value="${round2(grade.possible)}" placeholder="Points possible" />
                </div>
                <div class="row">
                  <select id="editGradeCorrection_${categoryIndex}_${gradeIndex}">
                    <option value="no" ${grade.correctedEnabled ? '' : 'selected'}>Correction off</option>
                    <option value="yes" ${grade.correctedEnabled ? 'selected' : ''}>Correction on</option>
                  </select>
                  <input id="editGradeCorrected_${categoryIndex}_${gradeIndex}" type="number" step="0.01" value="${grade.correctedEarned ?? ''}" placeholder="Corrected points earned" />
                  <select id="editGradeMissing_${categoryIndex}_${gradeIndex}">
                    <option value="no" ${grade.isMissing ? '' : 'selected'}>Not missing</option>
                    <option value="yes" ${grade.isMissing ? 'selected' : ''}>Missing</option>
                  </select>
<select id="editGradeLate_${categoryIndex}_${gradeIndex}">
  <option value="1" ${(grade.latePenalty ?? 1) === 1 ? "selected" : ""}>On time (no penalty)</option>
  <option value="0.9" ${(grade.latePenalty ?? 1) === 0.9 ? "selected" : ""}>1 day late (-10%)</option>
  <option value="0.8" ${(grade.latePenalty ?? 1) === 0.8 ? "selected" : ""}>2 days late (-20%)</option>
  <option value="0.65" ${(grade.latePenalty ?? 1) === 0.65 ? "selected" : ""}>3+ days late (-35%)</option>
  <option value="0" ${(grade.latePenalty ?? 1) === 0 ? "selected" : ""}>Unredeemable (0%)</option>
</select>
                  <button type="button" data-action="save-grade" data-category="${categoryIndex}" data-grade="${gradeIndex}">Save Changes</button>
                  <button type="button" class="ghost-btn" data-action="cancel-edit-grade">Cancel</button>
                </div>
              </div>
            `;
          }

          return `
            <div class="grade-card">
              <div class="grade-title">${escapeHtml(grade.name || `Untitled grade ${gradeIndex + 1}`)}</div>
              <div class="grade-meta">
                ${round2(shownEarned)}/${round2(grade.possible)} (${round2((shownEarned / grade.possible) * 100)}%)
                ${correctedText ? ' • ' + escapeHtml(correctedText) : ''}
              </div>
              <div class="row">
                ${missingText}
                <button type="button" data-action="edit-grade" data-category="${categoryIndex}" data-grade="${gradeIndex}">Edit</button>
                <button type="button" class="ghost-btn" data-action="toggle-correction" data-category="${categoryIndex}" data-grade="${gradeIndex}">${grade.correctedEnabled ? 'Turn Off Correction' : 'Correct'}</button>
                <button type="button" class="danger-btn" data-action="delete-grade" data-category="${categoryIndex}" data-grade="${gradeIndex}">Delete</button>
              </div>
            </div>
          `;
        }).join('')}</div>`;

    return `<div class="category">${headerHtml}${addRowHtml}${gradesHtml}</div>`;
  }).join('');
}

function renderSummary() {
  const summary = el('currentSummary');
  const overall = overallAverage(classData);
  const total = round2(totalWeight(classData));
  const colorClass = gradeColorClassFromPercent(overall);
  const progressClass = gradeProgressClass(overall);

  let html = '';
  html += `<div class="grade-big-card">
    <div id="summaryBigNumber" class="grade-big-number ${colorClass}">${overall === null ? 'N/A' : round2(overall) + '%'}</div>
    <div class="grade-big-sub">${overall === null ? 'No grade yet' : `${letterGrade(overall)} • Current overall grade`}</div>
    <div class="progress-track"><div class="progress-fill ${progressClass}" style="width:${overall === null ? 0 : Math.max(0, Math.min(100, overall))}%"></div></div>
  </div>`;

  html += `<p><strong>Letter grade:</strong> ${letterGrade(overall)}</p>`;
  if (classData.goalGrade !== '' && !Number.isNaN(Number(classData.goalGrade))) {
    html += `<p><strong>Current goal:</strong> ${round2(Number(classData.goalGrade))}%</p>`;
  }
  if (total !== 100) {
    html += `<p class="warning">Your configured weights do not add up to 100%.</p>`;
  }

  html += `<table>
    <tr><th>Category</th><th>Weight</th><th>Total Points</th><th>Total Points (%)</th><th>Category Average</th><th>Progress</th><th>Weighted Contribution (Current)</th><th>Correction Cap</th></tr>`;

  const active = classData.categories.filter(c => categoryAverage(c) !== null);
  const activeWeight = active.reduce((sum, c) => sum + Number(c.weight), 0);
  let totalEarned = 0;
  let totalPossible = 0;
  let totalContribution = 0;

  classData.categories.forEach(category => {
    const avg = categoryAverage(category);
    const totals = categoryTotals(category);
    totalEarned += totals.earned;
    totalPossible += totals.possible;
    const contribution = avg === null || activeWeight <= 0 ? 0 : avg * (Number(category.weight) / activeWeight);
    totalContribution += contribution;
    const pClass = gradeProgressClass(avg);
    const tClass = gradeColorClassFromPercent(avg);
    html += `<tr>
      <td>${escapeHtml(category.name)}</td>
      <td>${round2(category.weight)}%</td>
      <td>${round2(totals.earned)}/${round2(totals.possible)}</td>
      <td class="${tClass}">${totals.possible > 0 ? round2((totals.earned / totals.possible) * 100) + '%' : 'N/A'}</td>
      <td class="${tClass}">${avg === null ? 'N/A' : round2(avg) + '%'}</td>
      <td>${avg === null ? 'N/A' : `<div class="progress-track"><div class="progress-fill ${pClass}" style="width:${Math.max(0, Math.min(100, avg))}%"></div></div>`}</td>
      <td>${avg === null ? 'Ignored until graded' : round2(contribution)}</td>
      <td>${category.correctionCap ? round2(category.correctionCap) + '%' : 'none'}</td>
    </tr>`;
  });

  html += `<tr>
    <th>Totals</th>
    <th>${round2(total)}%</th>
    <th>${round2(totalEarned)}/${round2(totalPossible)}</th>
    <th>${totalPossible > 0 ? round2((totalEarned / totalPossible) * 100) + '%' : 'N/A'}</th>
    <th>${overall === null ? 'N/A' : round2(overall) + '%'}</th>
    <th>${overall === null ? 'N/A' : `<div class="progress-track"><div class="progress-fill ${progressClass}" style="width:${Math.max(0, Math.min(100, overall))}%"></div></div>`}</th>
    <th>${overall === null ? 'N/A' : round2(totalContribution)}</th>
    <th>-</th>
  </tr>`;
  html += '</table>';
  summary.innerHTML = html;
}

function renderUpcomingOptions() {
  const upcoming = el('upcomingCategory');
  const safe = el('safeCategory');
  upcoming.innerHTML = '';
  safe.innerHTML = '';
  classData.categories.forEach((category, index) => {
    const a = document.createElement('option');
    a.value = index;
    a.textContent = category.name;
    upcoming.appendChild(a);

    const b = document.createElement('option');
    b.value = index;
    b.textContent = category.name;
    safe.appendChild(b);
  });
}

function renderUpcomingList() {
  const container = el('upcomingList');
  container.innerHTML = '';
  if (!classData.upcoming.length) {
    container.innerHTML = '<p>No upcoming grade slots yet.</p>';
    return;
  }
  classData.upcoming.forEach((slot, index) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span>${index + 1}. ${escapeHtml(slot.label || ('Slot ' + (index + 1)))} - ${escapeHtml(classData.categories[slot.categoryIndex]?.name || 'Unknown')} - ${round2(slot.possible)} points possible${slot.dropLowest ? ' - drops lowest in category' : ''}</span>
      <button type="button" data-action="edit-upcoming" data-index="${index}">Edit</button>
      <button type="button" class="danger-btn" data-action="remove-upcoming" data-index="${index}">Remove</button>
    `;
    container.appendChild(row);
  });
}

function renderInsightsPanel() {
  const sel = el('insightsClassSelect');
  let data = classData;
  if (sel && sel.value && sel.value !== '__current__') {
    const saved = getSavedClasses();
    if (saved[sel.value]) data = normalizeLoadedClass(saved[sel.value]);
  }
  el('insightsOutput').innerHTML = renderInsights(data);
}

function renderAll() {
  renderCategories();
  renderWeightStatus();
  renderSummary();
  renderInsightsPanel();
  renderUpcomingOptions();
  renderUpcomingList();
  renderSavedClasses();
  el('classGoal').value = classData.goalGrade || '';
}

function addCategory() {
  const name = el('categoryName').value.trim();
  const weight = Number(el('categoryWeight').value);
  let correctionCapRaw = el('categoryCorrectionCap').value.trim();

  if (!name) return alert('Enter a category name.');
  if (Number.isNaN(weight) || weight <= 0) return alert('Enter a valid weight.');

  let correctionCap = null;
  if (correctionCapRaw === '') {
    const lower = name.toLowerCase();
    if (lower.includes('quiz')) correctionCap = 80;
    else if (lower.includes('test')) correctionCap = 70;
    else correctionCap = null;
  } else {
    correctionCap = Number(correctionCapRaw);
    if (Number.isNaN(correctionCap) || correctionCap < 0) {
      return alert('Enter a valid correction cap or leave blank.');
    }
  }

  classData.categories.push({
    name,
    weight,
    correctionCap,
    grades: []
  });

  el('categoryName').value = '';
  el('categoryWeight').value = '';
  el('categoryCorrectionCap').value = '';

  renderAll();
}

function editCategory(index) {
  editingCategoryIndex = index;
  renderAll();
}

function saveCategoryEdits(index) {
  const category = classData.categories[index];
  const name = (el(`editCategoryName_${index}`)?.value ?? '').trim();
  const weightRaw = el(`editCategoryWeight_${index}`)?.value ?? '';
  const capRaw = el(`editCategoryCap_${index}`)?.value ?? '';
  const weight = Number(weightRaw);
  const cap = capRaw.trim() === '' ? null : Number(capRaw);

  if (!name) return;
  if (Number.isNaN(weight) || weight <= 0) return alert('Enter a valid weight.');
  if (capRaw.trim() !== '' && (Number.isNaN(cap) || cap < 0)) return alert('Enter a valid correction cap or leave it blank.');

  category.name = name;
  category.weight = weight;
  category.correctionCap = cap;
  editingCategoryIndex = null;
  renderAll();
}

function cancelCategoryEdits() {
  editingCategoryIndex = null;
  renderAll();
}

function deleteCategory(index) {
  if (!confirm('Delete this category?')) return;
  classData.categories.splice(index, 1);
  classData.upcoming = classData.upcoming.filter(slot => slot.categoryIndex !== index).map(slot => ({ ...slot, categoryIndex: slot.categoryIndex > index ? slot.categoryIndex - 1 : slot.categoryIndex }));
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function addGrade(categoryIndex) {
  const name = el(`nameInput_${categoryIndex}`).value.trim() || `Untitled grade ${classData.categories[categoryIndex].grades.length + 1}`;
  const earned = Number(el(`earnedInput_${categoryIndex}`).value);
  const possible = Number(el(`possibleInput_${categoryIndex}`).value);
  if (Number.isNaN(earned) || Number.isNaN(possible) || possible <= 0) return alert('Enter valid points earned and points possible.');
  classData.categories[categoryIndex].grades.push({
    name,
    earned,
    possible,
    correctedEnabled: false,
    correctedEarned: null,
    isMissing: false
  });
  el(`nameInput_${categoryIndex}`).value = '';
  el(`earnedInput_${categoryIndex}`).value = '';
  el(`possibleInput_${categoryIndex}`).value = '';
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
  
}

function editGrade(categoryIndex, gradeIndex) {
  editingGradeKey = `${categoryIndex}:${gradeIndex}`;
  renderAll();
}

function saveGradeEdits(categoryIndex, gradeIndex) {
  const grade = classData.categories[categoryIndex].grades[gradeIndex];
  const name = el(`editGradeName_${categoryIndex}_${gradeIndex}`)?.value ?? '';
  const earnedRaw = el(`editGradeEarned_${categoryIndex}_${gradeIndex}`)?.value ?? '';
  const possibleRaw = el(`editGradePossible_${categoryIndex}_${gradeIndex}`)?.value ?? '';
  const correctionRaw = el(`editGradeCorrection_${categoryIndex}_${gradeIndex}`)?.value ?? 'no';
  const correctedRaw = el(`editGradeCorrected_${categoryIndex}_${gradeIndex}`)?.value ?? '';
  const missingRaw = el(`editGradeMissing_${categoryIndex}_${gradeIndex}`)?.value ?? 'no';
  const lateRaw = el(`editGradeLate_${categoryIndex}_${gradeIndex}`)?.value ?? '1';

  const earned = Number(earnedRaw);
  const possible = Number(possibleRaw);
  if (Number.isNaN(earned) || Number.isNaN(possible) || possible <= 0) return alert('Enter valid points.');

  const correctionEnabled = correctionRaw === 'yes';
  let correctedEarned = null;
  if (correctionEnabled) {
    correctedEarned = correctedRaw.trim() === '' ? earned : Number(correctedRaw);
    if (Number.isNaN(correctedEarned)) return alert('Enter a valid corrected score.');
  }

  grade.name = name.trim() || grade.name;
  grade.earned = earned;
  grade.possible = possible;
  grade.correctedEnabled = correctionEnabled;
  grade.correctedEarned = correctedEarned;
  grade.isMissing = missingRaw === 'yes';
  grade.latePenalty = Number(lateRaw);

  editingGradeKey = null;
  renderAll();
  triggerGoalCheckAfterEdit();
}

function cancelGradeEdits() {
  editingGradeKey = null;
  renderAll();
}

function toggleCorrection(categoryIndex, gradeIndex) {
  const category = classData.categories[categoryIndex];
  const grade = category.grades[gradeIndex];
  if (grade.correctedEnabled) {
    grade.correctedEnabled = false;
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
  
    return;
  }
  const check = gradeCorrectionEligibility(category, grade);
  if (!check.eligible) return alert(check.reason);
  const suggested = round2(check.maxEarned);
  const corrected = prompt(`What should this grade be corrected to? Max allowed for this category is ${round2(check.cap)}% (${suggested}/${round2(grade.possible)}).`, suggested);
  if (corrected === null) return;
  const parsed = Number(corrected);
  if (Number.isNaN(parsed)) return alert('Enter a valid corrected score.');
  if (parsed > check.maxEarned) return alert('That corrected score is above the category correction cap.');
  if (parsed < 0) return alert('Corrected score cannot be negative.');
  grade.correctedEarned = parsed;
  grade.correctedEnabled = true;
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function deleteGrade(categoryIndex, gradeIndex) {
  classData.categories[categoryIndex].grades.splice(gradeIndex, 1);
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function addUpcoming() {
  if (!classData.categories.length) return alert('Add categories first.');
  const categoryIndex = Number(el('upcomingCategory').value);
  const possible = Number(el('upcomingPoints').value);
  const label = el('upcomingLabel').value.trim();
  const dropLowest = el('upcomingDropLowest').checked;
  if (Number.isNaN(categoryIndex) || Number.isNaN(possible) || possible <= 0) return alert('Pick a category and enter valid points possible.');
  classData.upcoming.push({ categoryIndex, possible, label, dropLowest });
  el('upcomingPoints').value = '';
  el('upcomingLabel').value = '';
  el('upcomingDropLowest').checked = false;
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function editUpcoming(index) {
  const slot = classData.upcoming[index];
  const newLabel = prompt('Edit assignment name:', slot.label || '');
  if (newLabel === null) return;
  const newPossible = prompt('Edit points possible:', slot.possible);
  if (newPossible === null) return;
  const parsedPossible = Number(newPossible);
  if (Number.isNaN(parsedPossible) || parsedPossible <= 0) return alert('Invalid points possible.');
  const newDropLowest = confirm('Should this upcoming grade drop the lowest grade in its category? Click OK for yes, Cancel for no.');
  slot.label = newLabel.trim();
  slot.possible = parsedPossible;
  slot.dropLowest = newDropLowest;
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function removeUpcoming(index) {
  classData.upcoming.splice(index, 1);
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function clearUpcoming() {
  classData.upcoming = [];
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
}

function bestCaseOverall() {
  if (!classData.upcoming.length) return overallAverage(classData);
  return overallAverage(applyUpcomingScores(cloneData(classData), classData.upcoming.map(slot => slot.possible)));
}

function worstCaseOverall() {
  if (!classData.upcoming.length) return overallAverage(classData);
  return overallAverage(applyUpcomingScores(cloneData(classData), classData.upcoming.map(() => 0)));
}

function solveUnlockedEqualPercent(target) {
  let low = 0, high = 200, answer = null, projected = null;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const earnedArray = classData.upcoming.map(slot => slot.possible * (mid / 100));
    const overall = overallAverage(applyUpcomingScores(cloneData(classData), earnedArray));
    if (overall >= target) {
      answer = mid;
      projected = overall;
      high = mid;
    } else {
      low = mid;
    }
  }
  return { neededPercent: answer, projectedOverall: projected };
}

function minimumSingleSlotNeeded(target) {
  return classData.upcoming.map((slot, i) => {
    let low = 0, high = slot.possible * 2, answer = null;
    for (let step = 0; step < 60; step++) {
      const mid = (low + high) / 2;
      const earnedArray = classData.upcoming.map((s, j) => j === i ? mid : s.possible);
      const overall = overallAverage(applyUpcomingScores(cloneData(classData), earnedArray));
      if (overall >= target) { answer = mid; high = mid; } else { low = mid; }
    }
    return {
      label: slot.label || `Slot ${i + 1}`,
      categoryName: classData.categories[slot.categoryIndex]?.name || 'Unknown',
      possible: slot.possible,
      neededEarned: answer,
      neededPercent: answer === null ? null : (answer / slot.possible) * 100
    };
  });
}

function generateSampleCombinations(target) {
  if (!classData.upcoming.length || classData.upcoming.length > 4) return [];
  const samples = [];
  const percents = [50, 60, 70, 75, 80, 85, 90, 95, 100];
  function backtrack(current) {
    if (samples.length >= 16) return;
    if (current.length === classData.upcoming.length) {
      const earnedArray = current.map((percent, index) => classData.upcoming[index].possible * (percent / 100));
      const overall = overallAverage(applyUpcomingScores(cloneData(classData), earnedArray));
      if (overall >= target) samples.push({ percents: [...current], overall: round2(overall) });
      return;
    }
    for (const percent of percents) {
      current.push(percent);
      backtrack(current);
      current.pop();
      if (samples.length >= 16) return;
    }
  }
  backtrack([]);
  return samples;
}

function importPastedGradebook() {
  const raw = el('gradebookPaste').value;
  const output = el('pasteImportOutput');
  output.innerHTML = '';
  if (!raw.trim()) {
    output.innerHTML = '<p class="warning">Paste your gradebook text first.</p>';
    return;
  }

  const importedCategories = importGradebookText(raw);
  if (!importedCategories.length) {
    output.innerHTML = '<p class="warning">No categories were found in the pasted text.</p>';
    return;
  }

  const normalizedCategories = normalizeImportedCategories(importedCategories);
  classData.categories = normalizedCategories;
  classData.upcoming = [];
  editingCategoryIndex = null;

  const gradeCount = normalizedCategories.reduce((sum, c) => sum + c.grades.length, 0);
  output.innerHTML = `<p class="good">Imported ${normalizedCategories.length} categories and ${gradeCount} assignments. Missing grades were counted as zeroes.</p>`;

  renderAll();
  applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default');
  showToast(`Imported ${gradeCount} assignments.`);
  output.innerHTML = `<p class="good">Imported ${normalizedCategories.length} categories and ${gradeCount} assignments. Missing grades were counted as zeroes.</p>`;
}

function saveClass() {
  const className = el('className').value.trim();
  if (!className) return alert('Enter a class name first.');
  classData.className = className;
  classData.goalGrade = el('classGoal').value.trim();
  const all = getSavedClasses();
  all[className] = cloneData(classData);
  saveAllClasses(all);
  renderSavedClasses();
  showToast('Class saved.'); 
}

function loadSelectedClass() {
  const selected = el('savedClasses').value;
  if (!selected) return alert('Pick a saved class.');
  const all = getSavedClasses();
  if (!all[selected]) return alert('Saved class not found.');
  classData = normalizeLoadedClass(all[selected]);
  el('className').value = classData.className || '';
  el('solverOutput').innerHTML = '';
  el('lowestSafeOutput').innerHTML = '';
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
  
}

function deleteSelectedClass() {
  const selected = el('savedClasses').value;
  if (!selected) return alert('Pick a saved class.');
  if (!confirm(`Delete saved class "${selected}"?`)) return;
  const all = getSavedClasses();
  delete all[selected];
  applyTheme(document.body.classList.contains('dark') ? 'dark' : 'light', el('themeToggle'));
  saveAllClasses(all);
  renderSavedClasses();
}

function analyzeAllClasses() {
  const all = getSavedClasses();
  el('allClassesOutput').innerHTML = renderAllClassesPlanner(all, normalizeLoadedClass);
}

function findLowestSafeScore() {
  const categoryIndex = Number(el('safeCategory').value);
  const possible = Number(el('safePoints').value);
  const target = Number(el('safeTarget').value);
  const dropLowest = el('safeDropLowest').checked;
  const output = el('lowestSafeOutput');
  output.innerHTML = '';
  if (Number.isNaN(categoryIndex) || Number.isNaN(possible) || possible <= 0 || Number.isNaN(target)) {
    output.innerHTML = '<p class="warning">Enter a category, valid points possible, and a target class grade.</p>';
    return;
  }
  const current = overallAverage(classData);
  if (current === null) {
    output.innerHTML = '<p class="warning">Add some categories and grades first.</p>';
    return;
  }
  let low = 0, high = possible * 2, answer = null, projected = null;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const data = cloneData(classData);
    data.upcoming = [{ categoryIndex, possible, label: 'Safe Score Check', dropLowest }];
    const overall = overallAverage(applyUpcomingScores(data, [mid]));
    if (overall >= target) { answer = mid; projected = overall; high = mid; } else { low = mid; }
  }
  const bestData = cloneData(classData);
  bestData.upcoming = [{ categoryIndex, possible, label: 'Safe Score Check', dropLowest }];
  const bestPossible = overallAverage(applyUpcomingScores(bestData, [possible]));
  if (bestPossible < target) {
    output.innerHTML = `<p class="warning">Even a perfect ${round2(possible)}/${round2(possible)} would not keep you at ${round2(target)}%.</p>`;
    return;
  }
  if (answer === null) {
    output.innerHTML = '<p class="warning">Could not solve this scenario.</p>';
    return;
  }
  output.innerHTML = `<p><strong>Lowest safe score:</strong> ${round2(answer)}/${round2(possible)} (${round2((answer / possible) * 100)}%)</p>
  <p><strong>Projected class grade with that score:</strong> ${round2(projected)}% (${letterGrade(projected)})</p>`;
}

function solveScenario() {
  const target = Number(el('targetGrade').value);
  const output = el('solverOutput');
  output.innerHTML = '';
  if (Number.isNaN(target)) return alert('Enter a valid target grade.');
  const current = overallAverage(classData);
  if (current === null) {
    output.innerHTML = '<p class="warning">You need categories first.</p>';
    return;
  }
  if (!classData.upcoming.length) {
    output.innerHTML = '<p class="warning">Add at least one upcoming grade slot.</p>';
    return;
  }

  const best = bestCaseOverall();
  const worst = worstCaseOverall();
  const equal = solveUnlockedEqualPercent(target);
  const singleSlot = minimumSingleSlotNeeded(target);
  const samples = generateSampleCombinations(target);

  let html = `<p><strong>Current overall:</strong> ${round2(current)}% (${letterGrade(current)})</p>`;
  html += `<p><strong>Target overall:</strong> ${round2(target)}% (${letterGrade(target)})</p>`;
  html += `<p><strong>Best case if you get 100% on every upcoming grade:</strong> ${round2(best)}% (${letterGrade(best)})</p>`;
  html += `<p><strong>Worst case if you get 0 on every upcoming grade:</strong> ${round2(worst)}% (${letterGrade(worst)})</p>`;

  if (best < target) html += `<p class="warning">Even if you got 100% on every upcoming grade, you still would not reach this target.</p>`;
  if (equal.neededPercent === null) {
    html += `<p class="warning">Could not solve the equal-score scenario.</p>`;
  } else if (equal.neededPercent > 100) {
    html += `<p class="warning"><strong>Equal-score solution:</strong> you would need about ${round2(equal.neededPercent)}% on every upcoming grade. That is above 100%, so this setup is probably impossible unless extra credit exists.</p>`;
  } else if (equal.neededPercent <= 0) {
    html += `<p class="good"><strong>Equal-score solution:</strong> you already safely meet this target.</p>`;
  } else {
    html += `<p><strong>Equal-score solution:</strong> if all upcoming grades had the same percent, you would need about <strong>${round2(equal.neededPercent)}%</strong> on each one.</p>`;
  }

  html += '<h4>Minimum score needed per slot if all other upcoming grades are 100%</h4>';
  html += '<table><tr><th>Assignment</th><th>Category</th><th>Needed Points</th><th>Needed Percent</th></tr>';
  singleSlot.forEach(row => {
    html += `<tr>
      <td>${escapeHtml(row.label)}</td>
      <td>${escapeHtml(row.categoryName)}</td>
      <td>${row.neededEarned === null ? 'Impossible' : round2(row.neededEarned) + '/' + round2(row.possible)}</td>
      <td>${row.neededPercent === null ? 'Impossible' : round2(row.neededPercent) + '%'}</td>
    </tr>`;
  });
  html += '</table>';

  html += '<h4>Sample valid combinations</h4>';
  if (!samples.length) {
    html += classData.upcoming.length > 4
      ? '<p>Too many upcoming slots for sample combination generation. Use equal-score mode instead.</p>'
      : '<p>No sample combinations from the built-in list reached the target.</p>';
  } else {
    html += '<table><tr><th>Combination</th><th>Projected Overall</th></tr>';
    samples.forEach(sample => {
      const label = sample.percents.map((p, i) => `${escapeHtml(classData.upcoming[i].label || ('Slot ' + (i + 1)))}: ${p}%`).join(', ');
      html += `<tr><td>${label}</td><td>${sample.overall}%</td></tr>`;
    });
    html += '</table>';
  }
  output.innerHTML = html;
}





function highlightTutorialHeadingByHash(hash) {
  if (!hash) return;
  const target = document.querySelector(hash);
  if (!target) return;
  target.classList.add('tutorial-heading-highlight');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => target.classList.remove('tutorial-heading-highlight'), 1800);
}

function temporarilyHighlightElement(element) {
  if (!element) return;
  element.classList.add('guide-highlight');
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  setTimeout(() => {
    element.classList.remove('guide-highlight');
  }, 2200);
}

function tutorialJump(tabName, targetId) {
  if (typeof setActiveTab === 'function') {
    setActiveTab(tabName);
  }
  setTimeout(() => {
    const target = document.getElementById(targetId);
    if (target) {
      temporarilyHighlightElement(target);
      if (typeof target.focus === 'function' && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) {
        try { target.focus(); } catch (e) {}
      }
    }
  }, 80);
}

function bindButtons() {
  const __diagBindingsEl = document.getElementById('diagBindings');
  if (__diagBindingsEl) __diagBindingsEl.textContent = 'Buttons/tabs bound: yes';
  if (window.__CCS_DIAG__) window.__CCS_DIAG__.bindingsLoaded = true;
  document.querySelectorAll('.tutorial-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleTutorial(btn.dataset.target));
  });

  if (el('startTourBtn')) el('startTourBtn').addEventListener('click', openTour);
  if (el('tourNextBtn')) el('tourNextBtn').addEventListener('click', nextTourStep);
  if (el('tourBackBtn')) el('tourBackBtn').addEventListener('click', previousTourStep);
  if (el('tourSkipBtn')) el('tourSkipBtn').addEventListener('click', closeTour);

  document.querySelectorAll('.tutorial-anchor-link').forEach(link => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      if (!hash || !hash.startsWith('#')) return;
      event.preventDefault();
      history.replaceState(null, '', hash);
      highlightTutorialHeadingByHash(hash);
    });
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.type = 'button';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      setActiveTab(btn.dataset.tabTarget);
    });
  });

  el('themeToggle').addEventListener('click', () => {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark', el('themeToggle'));
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
  });
  if (el('themePreset')) {
    el('themePreset').addEventListener('change', (event) => {
      const applied = applyThemePreset(event.target.value);
      renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default');
      showToast(`Theme changed to ${applied.charAt(0).toUpperCase() + applied.slice(1)}.`);
    });
  }


  el('saveClassBtn').addEventListener('click', saveClass);
  el('loadClassBtn').addEventListener('click', loadSelectedClass);
  el('deleteClassBtn').addEventListener('click', deleteSelectedClass);
  el('analyzeAllClassesBtn').addEventListener('click', analyzeAllClasses);
  el('importGradebookBtn').addEventListener('click', importPastedGradebook);
  el('addCategoryBtn').addEventListener('click', addCategory);
  el('addUpcomingBtn').addEventListener('click', addUpcoming);
  el('clearUpcomingBtn').addEventListener('click', clearUpcoming);
  el('solveBtn').addEventListener('click', solveScenario);
  el('findSafeBtn').addEventListener('click', findLowestSafeScore);
  if (el('insightsClassSelect')) el('insightsClassSelect').addEventListener('change', renderInsightsPanel);
  if (el('generateShareBtn')) el('generateShareBtn').addEventListener('click', generateShareLink);
  if (el('copyShareBtn')) el('copyShareBtn').addEventListener('click', copyShareLink);
  if (el('analyzerMaxGradeBtn')) el('analyzerMaxGradeBtn').addEventListener('click', calculateAnalyzerMaxGrade);

  document.querySelectorAll('.tutorial-jump-btn').forEach(btn => {
    btn.type = 'button';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      tutorialJump(btn.dataset.jumpTab, btn.dataset.jumpTarget);
    });
  });

  el('categoriesContainer').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;

    if (action === 'edit-category') editCategory(Number(button.dataset.index));
    if (action === 'save-category') saveCategoryEdits(Number(button.dataset.index));
    if (action === 'cancel-edit-category') cancelCategoryEdits();
    if (action === 'save-category') saveCategoryEdits(Number(button.dataset.index));
    if (action === 'cancel-edit-category') cancelCategoryEdits();
    if (action === 'delete-category') deleteCategory(Number(button.dataset.index));
    if (action === 'add-grade') addGrade(Number(button.dataset.index));
    if (action === 'toggle-category-tutorial') showCategoryTutorial(Number(button.dataset.index));
    if (action === 'edit-grade') editGrade(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'save-grade') saveGradeEdits(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'cancel-edit-grade') cancelGradeEdits();
    if (action === 'toggle-correction') toggleCorrection(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'delete-grade') deleteGrade(Number(button.dataset.category), Number(button.dataset.grade));
  });

  el('upcomingList').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'edit-upcoming') editUpcoming(Number(button.dataset.index));
    if (action === 'remove-upcoming') removeUpcoming(Number(button.dataset.index));
  });
}



// startup
document.addEventListener('DOMContentLoaded', () => {
  try {
    bindButtons();
    loadSharedClassFromUrl();
    setActiveTab('tutorial');
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
    loadTheme(el('themeToggle'));
    loadThemePreset();
    markDiagnostics();
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'default'); triggerGoalCheckAfterEdit();
    const diagStart = document.getElementById('diagStartup');
    if (diagStart) diagStart.textContent = 'Startup finished: yes';
  } catch (e) {
    const box=document.getElementById('diagError');
    if (box) box.textContent = 'Startup error: ' + e.message;
    console.error(e);
  }
});


function triggerGoalCheckAfterEdit() {
  const overall = overallAverage(classData);
  const goal = Number(classData.goalGrade);
  if (overall === null || Number.isNaN(goal)) return;

  const key = `${classData.className}|${goal}`;
  if (overall >= goal && lastGoalCelebrationKey !== key) {
    lastGoalCelebrationKey = key;
    launchConfetti();
    showToast('Grade reached goal! Good job!', 'success');
  }
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeTour();
});

setTimeout(() => {
  if (window.location.hash && document.querySelector('[data-tab="tutorial"]')) {
    highlightTutorialHeadingByHash(window.location.hash);
  }
}, 250);

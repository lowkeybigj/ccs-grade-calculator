window.addEventListener("error", (event) => console.log("[CCS DEBUG] global error", event.message));
console.log("[CCS DEBUG] script.js loaded", {
  version: "v14.2",
  time: new Date().toLocaleTimeString(),
  random: Math.random()
});

function overallAverage(data, options = {}) {
  const active = (data.categories || []).filter(c => categoryAverage(c, options) !== null);
  const activeWeight = active.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (activeWeight <= 0) return null;
  return active.reduce((sum, c) => sum + categoryAverage(c, options) * (Number(c.weight || 0) / activeWeight), 0);
}

function categoryAverage(category, options = {}) {
  const totals = categoryTotals(category, options);
  if (totals.possible <= 0) return null;
  return (totals.earned / totals.possible) * 100;
}

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
  document.body.classList.remove('dark');
  try { localStorage.setItem(THEME_KEY, 'light'); } catch (e) {}
  applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled');
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
  return grade.correctedEnabled ? Number(grade.correctedEarned) : Number(grade.earned);
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
    if (grade.excluded) return;
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
      latePenalty: grade.latePenalty ?? 1,
      excluded: !!grade.excluded
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
      grade.excluded = !!grade.excluded;
    });
    category.weight = Number(category.weight ?? 0);
  });
  copy.upcoming.forEach((slot, index) => {
    slot.label = slot.label || `Upcoming ${index + 1}`;
    slot.possible = Number(slot.possible ?? 0);
    slot.categoryIndex = Number(slot.categoryIndex ?? 0);
    slot.dropLowest = !!slot.dropLowest;
    slot.isMissing = !!slot.isMissing;
    slot.latePenalty = slot.latePenalty ?? 1;
  });
  return copy;
}

function gradeCorrectionEligibility(category, grade) {
  const cap = Number(category.correctionCap);
  if (!Number.isFinite(cap)) return { eligible: false, maxEarned: null, reason: 'No correction cap' };
  const percent = grade.possible > 0 ? (Number(grade.earned) / Number(grade.possible)) * 100 : 0;
  if (percent >= 70) return { eligible: false, maxEarned: null, reason: 'Score is 70 or above' };
  const maxEarned = (cap / 100) * Number(grade.possible);
  if (maxEarned <= Number(grade.earned)) return { eligible: false, maxEarned: null, reason: 'Correction cap does not improve score' };
  return { eligible: true, maxEarned, reason: 'Eligible' };
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
      latePenalty: grade.latePenalty ?? 1,
      excluded: !!grade.excluded
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


function renderUpcoming() {
  console.log("[CCS DEBUG] renderUpcoming fallback called");
  if (typeof renderUpcomingList === "function") return renderUpcomingList();
  if (typeof renderUpcomingGrades === "function") return renderUpcomingGrades();
  const container = el("upcomingList") || el("upcomingContainer") || el("upcomingGradesList");
  if (container && !container.innerHTML.trim()) {
    container.innerHTML = '<p class="small">No upcoming assignments saved yet.</p>';
  }
}





function repairSummaryBigNumber() {
  if (typeof overallAverage !== "function" || typeof classData === "undefined") return;
  const current = overallAverage(classData);
  const big = document.getElementById('summaryBigNumber');
  if (!big) return;
  big.textContent = formatSummaryBigNumber(current);

  if (big.nextElementSibling?.classList?.contains('gpa-subtext')) {
    big.nextElementSibling.remove();
  }

  if (isGpaModeEnabled() && current !== null && !Number.isNaN(Number(current))) {
    big.insertAdjacentHTML('afterend', getGpaSubtextHtml());
  }
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
  const current = overallAverage(data);
  if (current === null) return '<p class="warning">Add categories and grades first.</p>';

  const plan = getMaxGradePlan(data);
  const currentLetter = letterGrade(current);
  const maxLetter = plan.maxGrade === null ? 'N/A' : letterGrade(plan.maxGrade);

  const overallBestMove = plan.actions.length ? plan.actions[0] : 'No missing, correctable, or upcoming work was found.';
  const bestMoveGain = plan.maxGrade !== null ? round2(plan.maxGrade - current) : null;

  let stress = 'Low';
  let stressReason = 'Your current class setup does not show major urgent problems.';
  const missingCount = (data.categories || []).reduce((sum, c) => sum + (c.grades || []).filter(g => g.isMissing && !g.excluded).length, 0);
  const correctionCount = (data.categories || []).reduce((sum, c) => sum + (c.grades || []).filter(g => !g.excluded && gradeCorrectionEligibility(c, g).eligible).length, 0);
  if (missingCount >= 3 && current < 80) {
    stress = 'High';
    stressReason = `You have ${missingCount} missing assignment(s) and your grade is already low enough that those zeroes matter a lot.`;
  } else if (missingCount > 0 || correctionCount >= 2 || current < 90) {
    stress = 'Moderate';
    stressReason = 'There are enough available moves that planning them now would make a noticeable difference.';
  }

  const canStillPass = plan.maxGrade !== null && plan.maxGrade >= 70;
  const weakestCategory = (data.categories || [])
    .map(c => ({ name: c.name, avg: categoryAverage(c) }))
    .filter(c => c.avg !== null)
    .sort((a, b) => a.avg - b.avg)[0];
  const strongestCategory = (data.categories || [])
    .map(c => ({ name: c.name, avg: categoryAverage(c) }))
    .filter(c => c.avg !== null)
    .sort((a, b) => b.avg - a.avg)[0];

  let html = '';
  html += `<div class="insight-card"><strong>Overall best move</strong><p>${escapeHtml(overallBestMove)}</p><div class="small">${bestMoveGain === null ? 'No projected gain available.' : 'Possible swing to your ceiling: +' + bestMoveGain + '%'}</div></div>`;
  html += `<div class="insight-card"><strong>Weakest category</strong><p>${weakestCategory ? escapeHtml(weakestCategory.name) + ' (' + round2(weakestCategory.avg) + '%)' : 'N/A'}</p><div class="small">${weakestCategory ? 'This is the lowest category average currently dragging your class down.' : 'No category data yet.'}</div></div>`;
  html += `<div class="insight-card"><strong>Strongest category</strong><p>${strongestCategory ? escapeHtml(strongestCategory.name) + ' (' + round2(strongestCategory.avg) + '%)' : 'N/A'}</p><div class="small">${strongestCategory ? 'This is the category currently holding your average up the most.' : 'No category data yet.'}</div></div>`;
  html += `<div class="insight-card"><strong>Can I still pass?</strong><p>${canStillPass ? 'Yes' : 'Not with the current missing work, corrections, and saved upcoming assignments.'}</p><div class="small">Ceiling with all available moves: ${plan.maxGrade === null ? 'N/A' : round2(plan.maxGrade) + '%'} (${maxLetter}). More information available in the planner tab.</div></div>`;
  html += `<div class="insight-card"><strong>Stress level</strong><p>${stress}</p><div class="small">${escapeHtml(stressReason)}</div></div>`;
  html += `<div class="insight-card"><strong>Ceiling check</strong><p>Current: ${formatSummaryBigNumber(current)} (${currentLetter})<br>Best realistic result: ${plan.maxGrade === null ? 'N/A' : round2(plan.maxGrade) + '%'} (${maxLetter})</p><div class="small">This compares where you are now against the best realistic outcome available from missing work, corrections, and saved upcoming work.</div></div>`;
  return html;
}


// main.js


const APP_VERSION = "v.14.2";
let editingCategoryIndex = null;
let editingGradeKey = null;
let editingUpcomingIndex = null;
let pendingUndoDelete = null;





const THEME_PRESET_MAP = {
  "white": {"--bg": "#f8fafc", "--bg-2": "#eef2f7", "--card": "#ffffff", "--card-2": "#f6f8fb", "--card-3": "#e9eef5", "--text": "#111827", "--text-soft": "#334155", "--muted": "#64748b", "--faint": "#94a3b8", "--line": "#d8e0ea", "--line-soft": "#edf2f7", "--line-strong": "#b6c2d2", "--accent": "#2563eb", "--accent-2": "#0ea5e9", "--accent-3": "#93c5fd", "--accent-soft": "#dbeafe", "--accent-glow": "#2563eb66", "--gradient-1": "linear-gradient(135deg, #2563eb, #0ea5e9)", "--gradient-2": "linear-gradient(135deg, #ffffff, #eef2f7)", "--gradient-3": "linear-gradient(135deg, #dbeafe, #ffffff)", "--good": "#16a34a", "--warn": "#f59e0b", "--danger": "#dc2626", "--good-soft": "#dcfce7", "--warn-soft": "#fef3c7", "--danger-soft": "#fee2e2", "--shadow-color": "#64748b22", "--shadow-accent": "#2563eb22", "--glow-accent": "#2563eb55"},
  "gray": {"--bg": "#18181b", "--bg-2": "#27272a", "--card": "#27272a", "--card-2": "#3f3f46", "--card-3": "#52525b", "--text": "#fafafa", "--text-soft": "#e4e4e7", "--muted": "#a1a1aa", "--faint": "#71717a", "--line": "#3f3f46", "--line-soft": "#27272a", "--line-strong": "#71717a", "--accent": "#d4d4d8", "--accent-2": "#a1a1aa", "--accent-3": "#f4f4f5", "--accent-soft": "#3f3f46", "--accent-glow": "#d4d4d866", "--gradient-1": "linear-gradient(135deg, #71717a, #d4d4d8)", "--gradient-2": "linear-gradient(135deg, #18181b, #3f3f46)", "--gradient-3": "linear-gradient(135deg, #27272a, #a1a1aa)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000077", "--shadow-accent": "#d4d4d822", "--glow-accent": "#d4d4d866"},
  "pure-black-amoled": {"--bg": "#000000", "--bg-2": "#050505", "--card": "#0a0a0a", "--card-2": "#111111", "--card-3": "#1a1a1a", "--text": "#ffffff", "--text-soft": "#d4d4d4", "--muted": "#a3a3a3", "--faint": "#737373", "--line": "#1f1f1f", "--line-soft": "#141414", "--line-strong": "#2a2a2a", "--accent": "#3b82f6", "--accent-2": "#60a5fa", "--accent-3": "#93c5fd", "--accent-soft": "#0a1a33", "--accent-glow": "#3b82f6aa", "--gradient-1": "linear-gradient(135deg, #111111, #000000)", "--gradient-2": "linear-gradient(135deg, #000000, #181818)", "--gradient-3": "linear-gradient(135deg, #3b82f6, #60a5fa)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#052e16", "--warn-soft": "#451a03", "--danger-soft": "#450a0a", "--shadow-color": "#000000aa", "--shadow-accent": "#3b82f633", "--glow-accent": "#3b82f6aa"},
  "red": {"--bg": "#140808", "--bg-2": "#1f0d0d", "--card": "#2a1212", "--card-2": "#3a1a1a", "--card-3": "#4a2323", "--text": "#ffe5e5", "--text-soft": "#fca5a5", "--muted": "#f87171", "--faint": "#dc2626", "--line": "#3a1a1a", "--line-soft": "#2a1212", "--line-strong": "#7f1d1d", "--accent": "#ef4444", "--accent-2": "#f87171", "--accent-3": "#fca5a5", "--accent-soft": "#450a0a", "--accent-glow": "#ef4444aa", "--gradient-1": "linear-gradient(135deg, #7f1d1d, #ef4444)", "--gradient-2": "linear-gradient(135deg, #140808, #3a1a1a)", "--gradient-3": "linear-gradient(135deg, #ef4444, #fca5a5)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#ef444433", "--glow-accent": "#ef4444aa"},
  "vermillion": {"--bg": "#180704", "--bg-2": "#260c07", "--card": "#35110a", "--card-2": "#48160d", "--card-3": "#641f12", "--text": "#fff0eb", "--text-soft": "#ffb4a2", "--muted": "#ff7b5c", "--faint": "#e34218", "--line": "#4a1c12", "--line-soft": "#35110a", "--line-strong": "#8a2c18", "--accent": "#e34218", "--accent-2": "#ff5a36", "--accent-3": "#ff9a7d", "--accent-soft": "#4a1208", "--accent-glow": "#e34218aa", "--gradient-1": "linear-gradient(135deg, #8a2c18, #e34218)", "--gradient-2": "linear-gradient(135deg, #180704, #48160d)", "--gradient-3": "linear-gradient(135deg, #e34218, #ff9a7d)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#e3421833", "--glow-accent": "#e34218aa"},
  "blood-orange": {"--bg": "#1c0803", "--bg-2": "#2b0e05", "--card": "#3b1408", "--card-2": "#551d0d", "--card-3": "#7a2b13", "--text": "#fff1e8", "--text-soft": "#ffc6a8", "--muted": "#ff8a4c", "--faint": "#f04e23", "--line": "#551d0d", "--line-soft": "#3b1408", "--line-strong": "#9a3412", "--accent": "#f04e23", "--accent-2": "#ff7a3d", "--accent-3": "#ffb38a", "--accent-soft": "#4b1207", "--accent-glow": "#f04e23aa", "--gradient-1": "linear-gradient(135deg, #9a3412, #f04e23)", "--gradient-2": "linear-gradient(135deg, #1c0803, #551d0d)", "--gradient-3": "linear-gradient(135deg, #f04e23, #ffb38a)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#f04e2333", "--glow-accent": "#f04e23aa"},
  "orange": {"--bg": "#1a0f05", "--bg-2": "#2a1707", "--card": "#3a1f0a", "--card-2": "#4a2a0f", "--card-3": "#5c3414", "--text": "#fff4e5", "--text-soft": "#fdba74", "--muted": "#fb923c", "--faint": "#ea580c", "--line": "#4a2a0f", "--line-soft": "#3a1f0a", "--line-strong": "#7c2d12", "--accent": "#f97316", "--accent-2": "#fb923c", "--accent-3": "#fdba74", "--accent-soft": "#431407", "--accent-glow": "#f97316aa", "--gradient-1": "linear-gradient(135deg, #c2410c, #f97316)", "--gradient-2": "linear-gradient(135deg, #1a0f05, #4a2a0f)", "--gradient-3": "linear-gradient(135deg, #f97316, #fdba74)", "--good": "#22c55e", "--warn": "#f97316", "--danger": "#dc2626", "--good-soft": "#14532d", "--warn-soft": "#7c2d12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#f9731633", "--glow-accent": "#f97316aa"},
  "yellow": {"--bg": "#1a1703", "--bg-2": "#2a2306", "--card": "#3a300a", "--card-2": "#4a3f0f", "--card-3": "#5a4d14", "--text": "#fffde8", "--text-soft": "#fde68a", "--muted": "#facc15", "--faint": "#ca8a04", "--line": "#4a3f0f", "--line-soft": "#3a300a", "--line-strong": "#854d0e", "--accent": "#eab308", "--accent-2": "#facc15", "--accent-3": "#fde68a", "--accent-soft": "#422006", "--accent-glow": "#eab308aa", "--gradient-1": "linear-gradient(135deg, #ca8a04, #fde68a)", "--gradient-2": "linear-gradient(135deg, #1a1703, #4a3f0f)", "--gradient-3": "linear-gradient(135deg, #facc15, #fff7cc)", "--good": "#22c55e", "--warn": "#eab308", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000055", "--shadow-accent": "#eab30833", "--glow-accent": "#eab308aa"},
  "green": {"--bg": "#06140c", "--bg-2": "#0a1f14", "--card": "#0f2e1e", "--card-2": "#134e2a", "--card-3": "#166534", "--text": "#ecfdf5", "--text-soft": "#bbf7d0", "--muted": "#4ade80", "--faint": "#16a34a", "--line": "#134e2a", "--line-soft": "#0f2e1e", "--line-strong": "#166534", "--accent": "#22c55e", "--accent-2": "#4ade80", "--accent-3": "#86efac", "--accent-soft": "#052e16", "--accent-glow": "#22c55eaa", "--gradient-1": "linear-gradient(135deg, #065f46, #22c55e)", "--gradient-2": "linear-gradient(135deg, #06140c, #134e2a)", "--gradient-3": "linear-gradient(135deg, #22c55e, #86efac)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#064e3b", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#22c55e33", "--glow-accent": "#22c55eaa"},
  "turquoise": {"--bg": "#031716", "--bg-2": "#062827", "--card": "#0a3d3b", "--card-2": "#0d5a56", "--card-3": "#117c76", "--text": "#e6fffb", "--text-soft": "#99f6e4", "--muted": "#5eead4", "--faint": "#14b8a6", "--line": "#0d5a56", "--line-soft": "#0a3d3b", "--line-strong": "#0f766e", "--accent": "#14b8a6", "--accent-2": "#2dd4bf", "--accent-3": "#99f6e4", "--accent-soft": "#042f2e", "--accent-glow": "#14b8a6aa", "--gradient-1": "linear-gradient(135deg, #0f766e, #14b8a6)", "--gradient-2": "linear-gradient(135deg, #031716, #0d5a56)", "--gradient-3": "linear-gradient(135deg, #14b8a6, #99f6e4)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#14b8a633", "--glow-accent": "#14b8a6aa"},
  "blue": {"--bg": "#050a1a", "--bg-2": "#0a112a", "--card": "#0f1f3a", "--card-2": "#132c5a", "--card-3": "#1d4ed8", "--text": "#eff6ff", "--text-soft": "#bfdbfe", "--muted": "#60a5fa", "--faint": "#2563eb", "--line": "#132c5a", "--line-soft": "#0f1f3a", "--line-strong": "#1d4ed8", "--accent": "#3b82f6", "--accent-2": "#60a5fa", "--accent-3": "#93c5fd", "--accent-soft": "#1e3a8a", "--accent-glow": "#3b82f6aa", "--gradient-1": "linear-gradient(135deg, #1e40af, #3b82f6)", "--gradient-2": "linear-gradient(135deg, #050a1a, #132c5a)", "--gradient-3": "linear-gradient(135deg, #3b82f6, #93c5fd)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#3b82f633", "--glow-accent": "#3b82f6aa"},
  "indigo": {"--bg": "#090b1f", "--bg-2": "#111338", "--card": "#1a1c4a", "--card-2": "#312e81", "--card-3": "#4338ca", "--text": "#eef2ff", "--text-soft": "#c7d2fe", "--muted": "#818cf8", "--faint": "#6366f1", "--line": "#312e81", "--line-soft": "#1a1c4a", "--line-strong": "#4338ca", "--accent": "#6366f1", "--accent-2": "#818cf8", "--accent-3": "#a5b4fc", "--accent-soft": "#1e1b4b", "--accent-glow": "#6366f1aa", "--gradient-1": "linear-gradient(135deg, #312e81, #6366f1)", "--gradient-2": "linear-gradient(135deg, #090b1f, #312e81)", "--gradient-3": "linear-gradient(135deg, #6366f1, #a5b4fc)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#6366f133", "--glow-accent": "#6366f1aa"},
  "lavender": {"--bg": "#15101f", "--bg-2": "#211733", "--card": "#2f214a", "--card-2": "#49366d", "--card-3": "#6b4fa3", "--text": "#faf5ff", "--text-soft": "#e9d5ff", "--muted": "#c084fc", "--faint": "#a855f7", "--line": "#49366d", "--line-soft": "#2f214a", "--line-strong": "#7e5bef", "--accent": "#b57edc", "--accent-2": "#c084fc", "--accent-3": "#e9d5ff", "--accent-soft": "#3b235c", "--accent-glow": "#b57edcaa", "--gradient-1": "linear-gradient(135deg, #7e5bef, #b57edc)", "--gradient-2": "linear-gradient(135deg, #15101f, #49366d)", "--gradient-3": "linear-gradient(135deg, #b57edc, #e9d5ff)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#b57edc33", "--glow-accent": "#b57edcaa"},
  "hot-pink": {"--bg": "#1f0615", "--bg-2": "#330a22", "--card": "#4a0d31", "--card-2": "#701047", "--card-3": "#9d145f", "--text": "#fff0fa", "--text-soft": "#ffc1e3", "--muted": "#ff77bd", "--faint": "#ff1493", "--line": "#701047", "--line-soft": "#4a0d31", "--line-strong": "#be185d", "--accent": "#ff1493", "--accent-2": "#ff4fb3", "--accent-3": "#ff9bd2", "--accent-soft": "#500724", "--accent-glow": "#ff1493aa", "--gradient-1": "linear-gradient(135deg, #be185d, #ff1493)", "--gradient-2": "linear-gradient(135deg, #1f0615, #701047)", "--gradient-3": "linear-gradient(135deg, #ff1493, #ff9bd2)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#ff149333", "--glow-accent": "#ff1493aa"},
  "ocean": {"--bg": "#0b132b", "--bg-2": "#1c2541", "--card": "#1c2541", "--card-2": "#243b55", "--card-3": "#2f5d75", "--text": "#e0fbfc", "--text-soft": "#98c1d9", "--muted": "#5fa8d3", "--faint": "#3a86ff", "--line": "#3a506b", "--line-soft": "#1c2541", "--line-strong": "#5bc0be", "--accent": "#3a86ff", "--accent-2": "#00b4d8", "--accent-3": "#5bc0be", "--accent-soft": "#1c2541", "--accent-glow": "#00b4d8aa", "--gradient-1": "linear-gradient(135deg, #3a86ff, #00b4d8)", "--gradient-2": "linear-gradient(135deg, #0b132b, #1c2541)", "--gradient-3": "linear-gradient(135deg, #00b4d8, #5bc0be)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#00b4d833", "--glow-accent": "#00b4d8aa"},
  "royal-gold": {"--bg": "#0b1026", "--bg-2": "#121a3a", "--card": "#1b2555", "--card-2": "#25316d", "--card-3": "#2f3f8f", "--text": "#fff8dc", "--text-soft": "#fde68a", "--muted": "#c7d2fe", "--faint": "#818cf8", "--line": "#2f3f8f", "--line-soft": "#1b2555", "--line-strong": "#b45309", "--accent": "#fbbf24", "--accent-2": "#6366f1", "--accent-3": "#fde68a", "--accent-soft": "#312e81", "--accent-glow": "#fbbf24aa", "--gradient-1": "linear-gradient(135deg, #6366f1, #fbbf24)", "--gradient-2": "linear-gradient(135deg, #0b1026, #25316d)", "--gradient-3": "linear-gradient(135deg, #fbbf24, #fde68a)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#fbbf2433", "--glow-accent": "#fbbf24aa"},
  "forest-sepia": {"--bg": "#14110b", "--bg-2": "#1f1a10", "--card": "#2a2418", "--card-2": "#3b3323", "--card-3": "#4b3f2b", "--text": "#f7f0df", "--text-soft": "#d6c6a8", "--muted": "#a7b78a", "--faint": "#6b8e4e", "--line": "#4b3f2b", "--line-soft": "#2a2418", "--line-strong": "#6b5a3d", "--accent": "#84cc16", "--accent-2": "#a16207", "--accent-3": "#d6a85f", "--accent-soft": "#2f3b12", "--accent-glow": "#84cc16aa", "--gradient-1": "linear-gradient(135deg, #84cc16, #a16207)", "--gradient-2": "linear-gradient(135deg, #14110b, #3b3323)", "--gradient-3": "linear-gradient(135deg, #a16207, #d6a85f)", "--good": "#22c55e", "--warn": "#f59e0b", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#78350f", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000066", "--shadow-accent": "#84cc1633", "--glow-accent": "#84cc16aa"},
  "cyberpunk": {"--bg": "#06060f", "--bg-2": "#101020", "--card": "#17172f", "--card-2": "#221f46", "--card-3": "#302b63", "--text": "#f8fafc", "--text-soft": "#e0e7ff", "--muted": "#a5b4fc", "--faint": "#818cf8", "--line": "#302b63", "--line-soft": "#17172f", "--line-strong": "#ff00cc", "--accent": "#ff00cc", "--accent-2": "#00ffff", "--accent-3": "#ffff00", "--accent-soft": "#3b0a3b", "--accent-glow": "#ff00ccaa", "--gradient-1": "linear-gradient(135deg, #ff00cc, #00ffff)", "--gradient-2": "linear-gradient(135deg, #06060f, #302b63)", "--gradient-3": "linear-gradient(135deg, #00ffff, #ffff00)", "--good": "#00ff9f", "--warn": "#ffee00", "--danger": "#ff0055", "--good-soft": "#003f2f", "--warn-soft": "#403d00", "--danger-soft": "#3f0020", "--shadow-color": "#000000aa", "--shadow-accent": "#ff00cc33", "--glow-accent": "#ff00cccc"},
  "aurora": {"--bg": "linear-gradient(135deg, #020617, #0f766e, #1e3a8a)", "--bg-2": "#0f172a", "--card": "#111827", "--card-2": "#1f2937", "--card-3": "#374151", "--text": "#ecfeff", "--text-soft": "#a5f3fc", "--muted": "#67e8f9", "--faint": "#22d3ee", "--line": "#1f2937", "--line-soft": "#111827", "--line-strong": "#374151", "--accent": "#22d3ee", "--accent-2": "#6366f1", "--accent-3": "#14b8a6", "--accent-soft": "#083344", "--accent-glow": "#22d3eeaa", "--gradient-1": "linear-gradient(135deg, #22d3ee, #6366f1)", "--gradient-2": "linear-gradient(135deg, #14b8a6, #3b82f6)", "--gradient-3": "linear-gradient(135deg, #0ea5e9, #8b5cf6)", "--good": "#22c55e", "--warn": "#eab308", "--danger": "#ef4444", "--good-soft": "#064e3b", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#00000088", "--shadow-accent": "#22d3ee33", "--glow-accent": "#22d3eecc"},
  "vaporwave": {"--bg": "linear-gradient(135deg, #ff00cc, #3333ff)", "--bg-2": "#1a0033", "--card": "#2a004a", "--card-2": "#3b0066", "--card-3": "#520080", "--text": "#ffe6ff", "--text-soft": "#ffb3ff", "--muted": "#ff66ff", "--faint": "#cc33ff", "--line": "#4b0082", "--line-soft": "#2a004a", "--line-strong": "#8000ff", "--accent": "#ff00cc", "--accent-2": "#00ffff", "--accent-3": "#ff66ff", "--accent-soft": "#4a004a", "--accent-glow": "#ff00ccaa", "--gradient-1": "linear-gradient(135deg, #ff00cc, #3333ff)", "--gradient-2": "linear-gradient(135deg, #00ffff, #ff00cc)", "--gradient-3": "linear-gradient(135deg, #ff66ff, #00ffff)", "--good": "#00ff9f", "--warn": "#ffee00", "--danger": "#ff0066", "--good-soft": "#003f2f", "--warn-soft": "#403d00", "--danger-soft": "#3f0020", "--shadow-color": "#000000aa", "--shadow-accent": "#ff00cc33", "--glow-accent": "#ff00cccc"},
  "oil-slick": {"--bg": "linear-gradient(135deg, #000000, #1f2937, #4c1d95, #065f46)", "--bg-2": "#020617", "--card": "#111827", "--card-2": "#1f2937", "--card-3": "#374151", "--text": "#f8fafc", "--text-soft": "#cbd5f5", "--muted": "#94a3b8", "--faint": "#64748b", "--line": "#374151", "--line-soft": "#1f2937", "--line-strong": "#4b5563", "--accent": "#8b5cf6", "--accent-2": "#22c55e", "--accent-3": "#06b6d4", "--accent-soft": "#111827", "--accent-glow": "#8b5cf6aa", "--gradient-1": "linear-gradient(135deg, #8b5cf6, #22c55e)", "--gradient-2": "linear-gradient(135deg, #06b6d4, #8b5cf6)", "--gradient-3": "linear-gradient(135deg, #22c55e, #06b6d4)", "--good": "#22c55e", "--warn": "#facc15", "--danger": "#ef4444", "--good-soft": "#14532d", "--warn-soft": "#713f12", "--danger-soft": "#7f1d1d", "--shadow-color": "#000000aa", "--shadow-accent": "#8b5cf633", "--glow-accent": "#8b5cf6cc"},
  "holographic-glass": {"--bg": "linear-gradient(135deg, #ff00cc, #3333ff, #00ffff)", "--bg-2": "#0f172a", "--card": "rgba(255,255,255,0.08)", "--card-2": "rgba(255,255,255,0.12)", "--card-3": "rgba(255,255,255,0.18)", "--text": "#ffffff", "--text-soft": "#e0e7ff", "--muted": "#c7d2fe", "--faint": "#a5b4fc", "--line": "rgba(255,255,255,0.2)", "--line-soft": "rgba(255,255,255,0.1)", "--line-strong": "rgba(255,255,255,0.3)", "--accent": "#ffffff", "--accent-2": "#ff00cc", "--accent-3": "#00ffff", "--accent-soft": "rgba(255,255,255,0.2)", "--accent-glow": "#ffffffaa", "--gradient-1": "linear-gradient(135deg, #ff00cc, #3333ff)", "--gradient-2": "linear-gradient(135deg, #00ffff, #ff00cc)", "--gradient-3": "linear-gradient(135deg, #ff00cc, #00ffff)", "--good": "#00ff9f", "--warn": "#ffee00", "--danger": "#ff0055", "--good-soft": "rgba(0,255,159,0.2)", "--warn-soft": "rgba(255,238,0,0.2)", "--danger-soft": "rgba(255,0,85,0.2)", "--shadow-color": "#000000aa", "--shadow-accent": "#ffffff33", "--glow-accent": "#ffffffcc"}
};

const DARK_THEME_PRESET_MAP = THEME_PRESET_MAP;

const THEME_LABEL_MAP = {
  "white": "White",
  "gray": "Gray",
  "pure-black-amoled": "Pure Black",
  "red": "Red",
  "vermillion": "Vermillion",
  "blood-orange": "Blood Orange",
  "orange": "Orange",
  "yellow": "Yellow",
  "green": "Green",
  "turquoise": "Turquoise",
  "blue": "Blue",
  "indigo": "Indigo",
  "lavender": "Lavender",
  "hot-pink": "Hot Pink",
  "ocean": "Ocean",
  "royal-gold": "Royal Gold",
  "forest-sepia": "Forest Sepia",
  "cyberpunk": "Cyberpunk",
  "aurora": "Aurora",
  "vaporwave": "Vaporwave",
  "oil-slick": "Oil Slick",
  "holographic-glass": "Holographic Glass"
};

const THEME_CATEGORY_MAP = {
  "white": "mono",
  "gray": "mono",
  "pure-black-amoled": "mono",
  "red": "mono",
  "vermillion": "mono",
  "blood-orange": "mono",
  "orange": "mono",
  "yellow": "mono",
  "green": "mono",
  "turquoise": "mono",
  "blue": "mono",
  "indigo": "mono",
  "lavender": "mono",
  "hot-pink": "mono",
  "ocean": "mixed",
  "royal-gold": "mixed",
  "forest-sepia": "mixed",
  "cyberpunk": "mixed",
  "aurora": "gradient",
  "vaporwave": "gradient",
  "oil-slick": "gradient",
  "holographic-glass": "gradient"
};






function prepareDynamicBackgroundFade() {
  const bg = document.getElementById("dynamicBackground");
  const fade = document.getElementById("dynamicBackgroundFade");
  if (!bg || !fade || document.body.classList.contains("dynamic-bg-off")) return null;

  const computed = getComputedStyle(bg);
  fade.style.background = computed.background;
  fade.style.filter = computed.filter;
  fade.style.opacity = computed.opacity || (document.body.classList.contains("glass-cards") ? "0.95" : "0.78");
  fade.classList.add("active");
  return fade;
}

function finishDynamicBackgroundFade(fade) {
  if (!fade) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fade.classList.remove("active");
      fade.style.opacity = "0";

      const fadeMsRaw = getComputedStyle(document.documentElement).getPropertyValue("--ui-color-fade-ms").trim();
      const fadeMs = Number.parseFloat(fadeMsRaw) || 800;

      window.clearTimeout(window.__ccsBgFadeCleanupTimer);
      window.__ccsBgFadeCleanupTimer = window.setTimeout(() => {
        fade.classList.remove("active");
        fade.style.opacity = "0";
        fade.style.background = "transparent";
        fade.style.filter = "";
        console.log("[CCS DEBUG] dynamic background fade cleaned up");
      }, fadeMs + 120);
    });
  });
}

// Backwards-compatible old name.
function captureDynamicBackgroundForFade() {
  return prepareDynamicBackgroundFade();
}


function applyThemePreset(preset) {
  const normalized = Object.prototype.hasOwnProperty.call(THEME_PRESET_MAP, preset) ? preset : 'pure-black-amoled';
  const fadeLayer = prepareDynamicBackgroundFade();

  if (typeof clearThemePresetStyles === "function") clearThemePresetStyles();

  const map = THEME_PRESET_MAP[normalized] || THEME_PRESET_MAP['pure-black-amoled'];

  const dynamicMap = {
    '--dynamic-1': map['--accent-glow'] || map['--accent'] || '#3b82f6',
    '--dynamic-2': map['--shadow-accent'] || map['--accent-2'] || '#60a5fa',
    '--dynamic-3': map['--glow-accent'] || map['--accent-3'] || '#93c5fd'
  };

  console.log("[CCS DEBUG] applyThemePreset", {
    requested: preset,
    normalized,
    label: THEME_LABEL_MAP?.[normalized],
    accent: map?.['--accent'],
    bg: map?.['--bg']
  });

  Object.entries({...map, ...dynamicMap}).forEach(([k, v]) => {
    document.documentElement.style.setProperty(k, v);
  });

  try {
    localStorage.setItem('ccsThemePreset', normalized);
    localStorage.setItem('ccsThemeCategory', THEME_CATEGORY_MAP[normalized] || 'mono');
  } catch (e) {}

  refreshThemeButtonState();
  finishDynamicBackgroundFade(fadeLayer);
  return normalized;
}

function loadThemePreset() {
  let preset = 'default';
  try {
    preset = localStorage.getItem('ccsThemePreset') || 'pure-black-amoled';
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

function simulateCategoryAverageWithMax(category) {
  const simulated = cloneData(category);
  simulated.grades = (simulated.grades || []).map((grade) => {
    const g = cloneData(grade);
    if (g.isMissing) {
      g.earned = missingGradeEarnedWithPenalty(g);
      g.isMissing = false;
      g.correctedEnabled = false;
      g.correctedEarned = null;
    }
    const check = gradeCorrectionEligibility(simulated, g);
    if (check.eligible) {
      g.correctedEnabled = true;
      g.correctedEarned = check.maxEarned;
    }
    return g;
  });
  return categoryAverage(simulated);
}

function simulateDataWithUpcomingPerfect(data) {
  const copy = cloneData(data);
  const scores = (copy.upcoming || []).map(slot => Number(slot.possible ?? 0) * Number(slot.latePenalty ?? 1));
  return applyUpcomingScores(copy, scores);
}

function getMaxGradePlan(data) {
  const normalized = normalizeLoadedClass(cloneData(data));
  const withUpcoming = simulateDataWithUpcomingPerfect(normalized);
  const actions = [];

  (normalized.categories || []).forEach((category) => {
    (category.grades || []).forEach((grade) => {
      if (grade.excluded) return;
      if (grade.isMissing) {
        const parsed = Number(grade.latePenalty ?? 1);
        const label = parsed === 1 ? 'On time' : parsed === 0.9 ? '1 day late' : parsed === 0.8 ? '2 days late' : parsed === 0.65 ? '3+ days late' : 'Unredeemable';
        actions.push(`Turn in missing "${grade.name}" in ${category.name} (${label})`);
      } else {
        const check = gradeCorrectionEligibility(category, grade);
        if (check.eligible) actions.push(`Correct "${grade.name}" in ${category.name} up to ${round2(check.maxEarned)}/${round2(grade.possible)}`);
      }
    });
  });

  (normalized.upcoming || []).forEach((slot) => {
    const categoryName = normalized.categories[slot.categoryIndex]?.name || 'Unknown';
    const lateLabel = (slot.latePenalty ?? 1) === 1 ? 'on time' : ((slot.latePenalty ?? 1) === 0.9 ? '1 day late' : ((slot.latePenalty ?? 1) === 0.8 ? '2 days late' : ((slot.latePenalty ?? 1) === 0.65 ? '3+ days late' : 'unredeemable')));
    actions.push(`Get ${round2((slot.latePenalty ?? 1) * 100)}% equivalent on upcoming "${slot.label}" in ${categoryName} (${lateLabel})`);
  });

  const maxGrade = overallAverage(withUpcoming, {
    simulateMissingCompletion: true,
    simulateCorrections: true
  });

  return {
    maxGrade,
    actions,
    missingCount: normalized.categories.reduce((sum, c) => sum + c.grades.filter(g => g.isMissing && !g.excluded).length, 0),
    upcomingCount: normalized.upcoming.length
  };
}

function calculateMaxPossibleGrade(data) {
  return getMaxGradePlan(data).maxGrade;
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
  const plan = getMaxGradePlan(data);
  const actionList = plan.actions.length
    ? `<ol>${plan.actions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}</ol>`
    : '<p>No missing, correctable, or upcoming work was found for this class.</p>';

  output.innerHTML = `
    <strong>${escapeHtml(select.value)}</strong><br>
    Current grade: ${current === null ? 'N/A' : round2(current) + '%'}<br>
    Max possible grade: ${plan.maxGrade === null ? 'N/A' : round2(plan.maxGrade) + '%'}<br>
    <span class="small">Includes ${plan.missingCount} missing assignment(s), ${plan.upcomingCount} saved upcoming assignment(s) that are not marked missing, saved late-penalty settings, and available corrections.</span>
    <h4 style="margin:10px 0 6px;">What you would need to do</h4>
    ${actionList}
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



function animateNumber(element, start, end, duration = 300, formatter = value => value) {
  if (!element) return;

  if (typeof duration === 'string') {
    const suffix = duration;
    duration = 300;
    formatter = value => `${round2(value)}${suffix}`;
  }

  const startNum = Number(start);
  const endNum = Number(end);

  if (!Number.isFinite(startNum) || !Number.isFinite(endNum)) {
    const finalValue = typeof formatter === 'function' ? formatter(end) : end;
    element.textContent = finalValue ?? 'N/A';
    return;
  }

  const startTime = performance.now();
  function frame(now) {
    const progress = Math.min((now - startTime) / Math.max(Number(duration) || 300, 1), 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = startNum + (endNum - startNum) * eased;
    const formatted = typeof formatter === 'function' ? formatter(value) : value;
    element.textContent = formatted ?? 'N/A';
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabTarget === tabName);
  });

  if (tabName === 'summary') {
    renderSummary();
    repairSummaryBigNumber();
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


let classData = {
  className: '',
  goalGrade: '',
  categories: [],
  upcoming: []
};
console.log("[CCS DEBUG] classData fallback initialized");

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
          const excludedText = grade.excluded ? '<span class="pill">Excluded from grade</span>' : '';
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
                  <select id="editGradeExcluded_${categoryIndex}_${gradeIndex}">
                    <option value="no" ${grade.excluded ? '' : 'selected'}>Counts in grade</option>
                    <option value="yes" ${grade.excluded ? 'selected' : ''}>Excluded from grade</option>
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
                ${excludedText}
                <button type="button" data-action="edit-grade" data-category="${categoryIndex}" data-grade="${gradeIndex}">Edit</button>
                <button type="button" class="ghost-btn" data-action="toggle-excluded" data-category="${categoryIndex}" data-grade="${gradeIndex}">${grade.excluded ? 'Include Again' : 'Exclude'}</button>
                <button type="button" class="ghost-btn" data-action="toggle-correction" data-category="${categoryIndex}" data-grade="${gradeIndex}">${grade.correctedEnabled ? 'Turn Off Correction' : 'Correct'}</button>
                <button type="button" class="danger-btn" data-action="delete-grade" data-category="${categoryIndex}" data-grade="${gradeIndex}">Delete</button>
              </div>
            </div>
          `;
        }).join('')}</div>`;

    return `<div class="category">${headerHtml}${addRowHtml}${gradesHtml}</div>`;
  }).join('');
}


function gradeColorClassFromPercent(percent) {
  if (percent === null || percent === undefined || Number.isNaN(Number(percent))) return 'grade-neutral';
  const p = Number(percent);
  if (p >= 90) return 'grade-good';
  if (p >= 80) return 'grade-okay';
  if (p >= 70) return 'grade-warning';
  return 'grade-danger';
}

function gradeProgressClass(percent) {
  if (percent === null || percent === undefined || Number.isNaN(Number(percent))) return 'progress-neutral';
  const p = Number(percent);
  if (p >= 90) return 'progress-good';
  if (p >= 80) return 'progress-okay';
  if (p >= 70) return 'progress-warning';
  return 'progress-danger';
}

function markDiagnostics() {
  console.log("[CCS DEBUG] markDiagnostics called", {
    version: typeof APP_VERSION !== "undefined" ? APP_VERSION : "unknown",
    preset: localStorage.getItem("ccsThemePreset"),
    mode: localStorage.getItem(THEME_KEY),
    classDataExists: typeof classData !== "undefined"
  });
}





function numericValueForDisplayAnimation(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}




function isGpaModeEnabled() {
  return localStorage.getItem('ccsGpaMode') === '1';
}

function percentToSimpleGpa(percent) {
  if (percent === null || percent === undefined || Number.isNaN(Number(percent))) return null;
  const gpa = Number(percent) / 25;
  return Math.round(gpa * 10) / 10;
}

function formatSummaryBigNumber(overall) {
  if (overall === null || overall === undefined || Number.isNaN(Number(overall))) return 'N/A';
  if (isGpaModeEnabled()) {
    const gpa = percentToSimpleGpa(overall);
    return gpa === null ? 'N/A' : `${gpa.toFixed(1)} GPA`;
  }
  return `${round2(Number(overall))}%`;
}

function getGpaSubtextHtml() {
  return '<div class="gpa-subtext">Calculated as overall grade ÷ 25 and rounded to the nearest tenths place.</div>';
}

function renderSummary() {
  const summary = el('currentSummary');
  const overall = overallAverage(classData);
  const total = round2(totalWeight(classData));
  const colorClass = gradeColorClassFromPercent(overall);
  const progressClass = gradeProgressClass(overall);

  let html = '';
  html += `<div class="grade-big-card">
    <div id="summaryBigNumber" class="grade-big-number ${colorClass}">${formatSummaryBigNumber(overall)}</div>
    ${isGpaModeEnabled() && overall !== null ? getGpaSubtextHtml() : ''}
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
  if (!upcoming || !safe) return;

  upcoming.innerHTML = '';
  safe.innerHTML = '';

  if (!classData.categories.length) {
    upcoming.innerHTML = '<option value="">No categories yet</option>';
    safe.innerHTML = '<option value="">No categories yet</option>';
    return;
  }

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
    const card = document.createElement('div');
    card.className = 'upcoming-card';
    const isEditing = editingUpcomingIndex === index;
    const lateLabel = (slot.latePenalty ?? 1) === 1 ? 'on time' : (slot.latePenalty === 0.9 ? '1 day late' : (slot.latePenalty === 0.8 ? '2 days late' : (slot.latePenalty === 0.65 ? '3+ days late' : 'unredeemable')));

    if (isEditing) {
      card.innerHTML = `
        <div class="row">
          <label><strong>Editing upcoming assignment</strong></label>
        </div>
        <div class="row">
          <label>Category</label>
          <select id="editUpcomingCategory_${index}">
            ${classData.categories.map((c, i) => `<option value="${i}" ${i === slot.categoryIndex ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
          </select>
          <input id="editUpcomingLabel_${index}" value="${escapeHtml(slot.label || '')}" placeholder="Assignment name" />
          <input id="editUpcomingPossible_${index}" type="number" step="0.01" value="${round2(slot.possible)}" placeholder="Points possible" />
        </div>
        <div class="row">
          <label><input id="editUpcomingDropLowest_${index}" type="checkbox" ${slot.dropLowest ? 'checked' : ''}/> Drop lowest in category</label>
          <label>Late penalty</label>
          <select id="editUpcomingLatePenalty_${index}">
            <option value="1" ${(slot.latePenalty ?? 1) === 1 ? 'selected' : ''}>On time (no penalty)</option>
            <option value="0.9" ${slot.latePenalty === 0.9 ? 'selected' : ''}>1 day late (-10%)</option>
            <option value="0.8" ${slot.latePenalty === 0.8 ? 'selected' : ''}>2 days late (-20%)</option>
            <option value="0.65" ${slot.latePenalty === 0.65 ? 'selected' : ''}>3+ days late (-35%)</option>
            <option value="0" ${slot.latePenalty === 0 ? 'selected' : ''}>Unredeemable (0%)</option>
          </select>
          <button type="button" data-action="save-upcoming" data-index="${index}">Save Changes</button>
          <button type="button" class="ghost-btn" data-action="cancel-edit-upcoming">Cancel</button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="row">
          <span>${index + 1}. ${escapeHtml(slot.label || ('Slot ' + (index + 1)))} - ${escapeHtml(classData.categories[slot.categoryIndex]?.name || 'Unknown')} - ${round2(slot.possible)} points possible${slot.dropLowest ? ' - drops lowest in category' : ''} - ${lateLabel}</span>
          <button type="button" data-action="edit-upcoming" data-index="${index}">Edit</button>
          <button type="button" class="danger-btn" data-action="remove-upcoming" data-index="${index}">Delete</button>
        </div>
      `;
    }
    container.appendChild(card);
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
  if (typeof classData === "undefined" || !classData) {
    console.warn("[CCS DEBUG] classData fallback in renderAll");
    window.classData = {
      className: '',
      goalGrade: '',
      categories: [],
      upcoming: []
    };
    classData = window.classData;
  }

  const renderSteps = [
    ["renderCategories", typeof renderCategories === "function" ? renderCategories : null],
    ["renderSummary", typeof renderSummary === "function" ? renderSummary : null],
    ["renderInsightsPanel", typeof renderInsightsPanel === "function" ? renderInsightsPanel : null],
    ["renderUpcoming", typeof renderUpcoming === "function" ? renderUpcoming : null],
    ["renderWeightStatus", typeof renderWeightStatus === "function" ? renderWeightStatus : null],
    ["renderSavedClasses", typeof renderSavedClasses === "function" ? renderSavedClasses : null],
    ["renderReportClassChecklist", typeof renderReportClassChecklist === "function" ? renderReportClassChecklist : null]
  ];

  renderSteps.forEach(([name, fn]) => {
    if (!fn) {
      console.log(`[CCS DEBUG] ${name} skipped; function missing`);
      return;
    }
    try {
      fn();
    } catch (error) {
      console.error(`[CCS DEBUG] ${name} failed`, error);
    }
  });

  // Re-apply visual settings after render so newly-created UI follows the theme.
  repairSummaryBigNumber();
  

  if (typeof initializeVisualSettings === "function") {
    try {
      initializeVisualSettings();
    } catch (error) {
      console.error("[CCS DEBUG] initializeVisualSettings after render failed", error);
    }
  }
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
    repairSummaryBigNumber();
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
  const removedCategory = classData.categories.splice(index, 1)[0];
  const removedUpcoming = classData.upcoming.filter(slot => slot.categoryIndex === index);
  classData.upcoming = classData.upcoming
    .filter(slot => slot.categoryIndex !== index)
    .map(slot => ({ ...slot, categoryIndex: slot.categoryIndex > index ? slot.categoryIndex - 1 : slot.categoryIndex }));
  commitAndRender();
  showUndoDelete(`Deleted category "${removedCategory.name}".`, { type: 'category', categoryIndex: index, category: removedCategory, removedUpcoming });
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
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
  
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
  const excludedRaw = el(`editGradeExcluded_${categoryIndex}_${gradeIndex}`)?.value ?? 'no';

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
  grade.excluded = excludedRaw === 'yes';

  editingGradeKey = null;
  renderAll();
  triggerGoalCheckAfterEdit();
}

function cancelGradeEdits() {
  editingGradeKey = null;
  renderAll();
}


function toggleExcluded(categoryIndex, gradeIndex) {
  const grade = classData.categories[categoryIndex].grades[gradeIndex];
  grade.excluded = !grade.excluded;
  renderAll();
}

function toggleCorrection(categoryIndex, gradeIndex) {
  const category = classData.categories[categoryIndex];
  const grade = category.grades[gradeIndex];
  if (grade.correctedEnabled) {
    grade.correctedEnabled = false;
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
  
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
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
}

function deleteGrade(categoryIndex, gradeIndex) {
  const removed = classData.categories[categoryIndex].grades.splice(gradeIndex, 1)[0];
  commitAndRender();
  showUndoDelete(`Deleted "${removed.name || 'assignment'}".`, { type: 'grade', categoryIndex, gradeIndex, grade: removed });
}


function saveUpcomingEdits(index) {
  const slot = classData.upcoming[index];
  const label = el(`editUpcomingLabel_${index}`)?.value?.trim() ?? '';
  const possible = Number(el(`editUpcomingPossible_${index}`)?.value ?? '');
  const categoryIndex = Number(el(`editUpcomingCategory_${index}`)?.value ?? '');
  const dropLowest = !!el(`editUpcomingDropLowest_${index}`)?.checked;
    const latePenalty = Number(el(`editUpcomingLatePenalty_${index}`)?.value ?? '1');
  if (Number.isNaN(possible) || possible <= 0) return alert('Enter valid points possible.');
  if (Number.isNaN(categoryIndex)) return alert('Pick a category.');
  slot.label = label;
  slot.possible = possible;
  slot.categoryIndex = categoryIndex;
  slot.dropLowest = dropLowest;
  slot.latePenalty = latePenalty;
  editingUpcomingIndex = null;
  commitAndRender();
}

function cancelUpcomingEdits() {
  editingUpcomingIndex = null;
  renderAll();
}

function addUpcoming() {
  if (!classData.categories.length) return alert('Add categories first.');
  const categoryIndex = Number(el('upcomingCategory').value);
  const possible = Number(el('upcomingPoints').value);
  const label = el('upcomingLabel').value.trim();
  const dropLowest = el('upcomingDropLowest').checked;
  const latePenalty = Number(el('upcomingLatePenalty').value);
  if (Number.isNaN(categoryIndex) || Number.isNaN(possible) || possible <= 0) return alert('Pick a category and enter valid points possible.');
  classData.upcoming.push({ categoryIndex, possible, label, dropLowest, latePenalty });
  el('upcomingPoints').value = '';
  el('upcomingLabel').value = '';
  el('upcomingDropLowest').checked = false;
  if (el('upcomingLatePenalty')) el('upcomingLatePenalty').value = '1';
  commitAndRender();
}

function editUpcoming(index) {
  editingUpcomingIndex = index;
  renderAll();
}

function removeUpcoming(index) {
  const removed = classData.upcoming.splice(index, 1)[0];
  commitAndRender();
  showUndoDelete(`Deleted upcoming "${removed.label || 'slot'}".`, { type: 'upcoming', index, slot: removed });
}

function clearUpcoming() {
  classData.upcoming = [];
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
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
  applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled');
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
  renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
  
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
  <p><strong>Projected class grade with that score:</strong> ${formatSummaryBigNumber(projected)} (${letterGrade(projected)})</p>`;
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

  let html = `<p><strong>Current overall:</strong> ${formatSummaryBigNumber(current)} (${letterGrade(current)})</p>`;
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
  const heading = document.querySelector(hash);
  if (!heading) return;
  const pieces = [heading];
  let next = heading.nextElementSibling;
  while (next && next.tagName !== 'H3') {
    if (next.tagName === 'P' || next.classList.contains('small')) pieces.push(next);
    else break;
    next = next.nextElementSibling;
  }
  pieces.forEach(elm => {
    elm.classList.add('tutorial-section-highlight');
    elm.classList.add('jump-jiggle');
  });
  heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => {
    pieces.forEach(elm => {
      elm.classList.remove('tutorial-section-highlight');
      elm.classList.remove('jump-jiggle');
    });
  }, 1400);
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



function refreshThemeButtonState() {
  const preset = localStorage.getItem('ccsThemePreset') || 'pure-black-amoled';
  const category = localStorage.getItem('ccsThemeCategory') || THEME_CATEGORY_MAP[preset] || 'mono';

  document.querySelectorAll('.theme-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themePreset === preset);
  });

  document.querySelectorAll('.theme-category-panel').forEach(panel => {
    const active = panel.dataset.themePanel === category;
    panel.hidden = !active;
    panel.style.display = active ? '' : 'none';
  });

  const categorySelect = el('themeCategorySelect');
  if (categorySelect) categorySelect.value = category;

  const label = el('currentThemeLabel');
  if (label) label.textContent = `Current theme: ${THEME_LABEL_MAP[preset] || preset}`;
}


const VISUAL_DEFAULTS = {
  density: '55',
  roundness: '65',
  depth: '45',
  saturation: '100',
  brightness: '100',
  colorFade: '60',
  animationSpeed: '60'
};

function resetSettingsCategory(category) {
  if (category === 'appearance') {
    localStorage.setItem('ccsAnimationsEnabled', '1');
    localStorage.setItem('ccsTitleIntro', '1');
    localStorage.setItem('ccsDynamicBackground', '1');
    localStorage.setItem('ccsGpaMode', '0');
    localStorage.setItem('ccsOptimizerMode', '0');
    localStorage.setItem(THEME_KEY, 'light');
  } else if (category === 'theme') {
    localStorage.setItem('ccsThemePreset', 'pure-black-amoled');
    localStorage.setItem('ccsThemeCategory', 'mono');
    localStorage.setItem(THEME_KEY, 'light');
  } else if (category === 'layout') {
    localStorage.setItem('ccsDensity', VISUAL_DEFAULTS.density);
    localStorage.setItem('ccsRoundness', VISUAL_DEFAULTS.roundness);
    localStorage.setItem('ccsDepth', VISUAL_DEFAULTS.depth);
    localStorage.setItem('ccsSaturation', VISUAL_DEFAULTS.saturation);
    localStorage.setItem('ccsBrightness', VISUAL_DEFAULTS.brightness);
    localStorage.setItem('ccsColorFadeSpeed', VISUAL_DEFAULTS.colorFade);
    localStorage.setItem('ccsAnimationSpeed', VISUAL_DEFAULTS.animationSpeed);
  }
  initializeVisualSettings();
  if (typeof showToast === "function") showToast(`Reset ${category} settings.`);
}


function applyDensitySpacingOnly(rawValue) {
  const densityNumber = Number(rawValue ?? localStorage.getItem('ccsDensity') ?? VISUAL_DEFAULTS.density);
  const densityFactor = Math.max(0, Math.min(100, densityNumber)) / 100;

  // 0 = spacious, 50 = normal, 100 = truly compact.
  const spaceXs = 12 - densityFactor * 8;  // 12 -> 4
  const spaceSm = 16 - densityFactor * 10; // 16 -> 6
  const spaceMd = 24 - densityFactor * 15; // 24 -> 9
  const spaceLg = 34 - densityFactor * 22; // 34 -> 12
  const spaceXl = 46 - densityFactor * 28; // 46 -> 18

  document.documentElement.style.setProperty('--ui-density', densityNumber);
  document.documentElement.style.setProperty('--ui-density-padding', `${spaceLg}px`);
  document.documentElement.style.setProperty('--ui-density-gap', `${spaceMd}px`);
  document.documentElement.style.setProperty('--space-xs', `${spaceXs}px`);
  document.documentElement.style.setProperty('--space-sm', `${spaceSm}px`);
  document.documentElement.style.setProperty('--space-md', `${spaceMd}px`);
  document.documentElement.style.setProperty('--space-lg', `${spaceLg}px`);
  document.documentElement.style.setProperty('--space-xl', `${spaceXl}px`);

  return { spaceXs, spaceSm, spaceMd, spaceLg, spaceXl };
}



function setDynamicBackgroundEnabled(enabled, options = {}) {
  const optimizerOn = localStorage.getItem('ccsOptimizerMode') === '1';
  const bg = document.getElementById('dynamicBackground');
  const fade = document.getElementById('dynamicBackgroundFade');

  window.clearTimeout(window.__ccsDynamicBgOffTimer);

  if (optimizerOn && !options.force) {
    document.body.classList.add('dynamic-bg-off');
    if (bg) bg.classList.remove('dynamic-bg-visible');
    if (fade) {
      fade.classList.remove('active');
      fade.style.opacity = '0';
    }
    return;
  }

  if (bg) {
    bg.style.display = '';
    bg.style.visibility = '';
  }
  if (fade) {
    fade.style.display = '';
    fade.style.visibility = '';
  }

  if (enabled) {
    document.body.classList.remove('dynamic-bg-off');
    requestAnimationFrame(() => {
      if (bg) bg.classList.add('dynamic-bg-visible');
    });
    return;
  }

  if (bg) bg.classList.remove('dynamic-bg-visible');
  if (fade) {
    fade.classList.remove('active');
    fade.style.opacity = '0';
  }

  window.__ccsDynamicBgOffTimer = window.setTimeout(() => {
    if (localStorage.getItem('ccsDynamicBackground') === '0' && localStorage.getItem('ccsOptimizerMode') !== '1') {
      document.body.classList.add('dynamic-bg-off');
    }
  }, 480);
}

function syncDynamicBackgroundControl() {
  const optimizerOn = localStorage.getItem('ccsOptimizerMode') === '1';
  const dynamicToggle = el('dynamicBackgroundEnabled');

  if (dynamicToggle) {
    dynamicToggle.disabled = optimizerOn;
    const label = dynamicToggle.closest('label');
    if (label) label.classList.toggle('disabled-control', optimizerOn);
    if (optimizerOn) dynamicToggle.checked = false;
    else dynamicToggle.checked = localStorage.getItem('ccsDynamicBackground') !== '0';
  }

  document.body.classList.toggle('optimizer-mode', optimizerOn);

  if (optimizerOn) {
    document.body.classList.add('dynamic-bg-off');
    return;
  }

  setDynamicBackgroundEnabled(localStorage.getItem('ccsDynamicBackground') !== '0');
}
function initializeVisualSettings(options = {}) {
  const animationsEnabled = localStorage.getItem('ccsAnimationsEnabled');
  const titleIntro = localStorage.getItem('ccsTitleIntro');
  const density = localStorage.getItem('ccsDensity') || VISUAL_DEFAULTS.density;
  const roundness = localStorage.getItem('ccsRoundness') || VISUAL_DEFAULTS.roundness;
  const depth = localStorage.getItem('ccsDepth') || VISUAL_DEFAULTS.depth;
  const saturation = localStorage.getItem('ccsSaturation') || VISUAL_DEFAULTS.saturation;
  const brightness = localStorage.getItem('ccsBrightness') || VISUAL_DEFAULTS.brightness;
  const colorFade = localStorage.getItem('ccsColorFadeSpeed') || VISUAL_DEFAULTS.colorFade;
  const animSpeed = localStorage.getItem('ccsAnimationSpeed') || VISUAL_DEFAULTS.animationSpeed;

  
  if (el('animationsEnabled')) el('animationsEnabled').checked = animationsEnabled !== '0';
  if (el('titleIntroEnabled')) el('titleIntroEnabled').checked = titleIntro !== '0';
  if (el('dynamicBackgroundEnabled')) el('dynamicBackgroundEnabled').checked = localStorage.getItem('ccsDynamicBackground') !== '0';
  if (el('glassCardsEnabled')) el('glassCardsEnabled').checked = localStorage.getItem('ccsGlassCards') === '1';
  if (el('gradeDisplayMode')) el('gradeDisplayMode').value = (isGpaModeEnabled() ? 'gpa' : 'percent');
  if (el('gpaWarning')) el('gpaWarning').style.display = isGpaModeEnabled() ? 'block' : 'none';
  setDynamicBackgroundEnabled(localStorage.getItem('ccsDynamicBackground') !== '0');
  document.body.classList.toggle('glass-cards', localStorage.getItem('ccsGlassCards') === '1');
  if (el('optimizerModeEnabled')) el('optimizerModeEnabled').checked = localStorage.getItem('ccsOptimizerMode') === '1';
  if (el('gpaModeEnabled')) el('gpaModeEnabled').checked = isGpaModeEnabled();
  if (el('gpaWarning')) el('gpaWarning').style.display = isGpaModeEnabled() ? 'block' : 'none';
  document.body.classList.toggle('optimizer-mode', localStorage.getItem('ccsOptimizerMode') === '1');
  syncDynamicBackgroundControl();
  if (el('densitySlider')) el('densitySlider').value = density;
  if (el('roundnessSlider')) el('roundnessSlider').value = roundness;
  if (el('depthSlider')) el('depthSlider').value = depth;
  if (el('saturationSlider')) el('saturationSlider').value = saturation;
  if (el('brightnessSlider')) el('brightnessSlider').value = brightness;
  if (el('colorFadeSpeedSlider')) el('colorFadeSpeedSlider').value = colorFade;
  if (el('animationSpeedSlider')) el('animationSpeedSlider').value = animSpeed;

  document.body.classList.toggle('animations-off', animationsEnabled === '0');
  document.body.classList.remove('dark');

  const densityNumber = Number(density);
  const roundnessNumber = Number(roundness);
  const depthNumber = Number(depth);
  const colorFadeNumber = Number(colorFade);
  const animSpeedNumber = Number(animSpeed);

  // Denser minimum + less annoying range. 0 = compact but usable, 100 = spacious.
  const { spaceXs, spaceSm, spaceMd, spaceLg, spaceXl } = applyDensitySpacingOnly(densityNumber);
  const densityPadding = spaceLg;
  const densityGap = spaceMd;
  const radiusPx = Math.round(2 + roundnessNumber * 0.38);
  const roundPaddingBonus = radiusPx * 0.16;

  document.documentElement.style.setProperty('--ui-density', densityNumber);
  document.documentElement.style.setProperty('--ui-density-padding', `${densityPadding}px`);
  document.documentElement.style.setProperty('--ui-density-gap', `${densityGap}px`);
  document.documentElement.style.setProperty('--space-xs', `${spaceXs}px`);
  document.documentElement.style.setProperty('--space-sm', `${spaceSm}px`);
  document.documentElement.style.setProperty('--space-md', `${spaceMd}px`);
  document.documentElement.style.setProperty('--space-lg', `${spaceLg}px`);
  document.documentElement.style.setProperty('--space-xl', `${spaceXl}px`);
  document.documentElement.style.setProperty('--ui-radius', roundnessNumber);
  document.documentElement.style.setProperty('--ui-radius-px', `${radiusPx}px`);
  document.documentElement.style.setProperty('--ui-round-padding-bonus', `${roundPaddingBonus}px`);
  document.documentElement.style.setProperty('--ui-depth', depthNumber);
  document.documentElement.style.setProperty('--ui-shadow-blur', `${2 + depthNumber * 0.55}px`);
  document.documentElement.style.setProperty('--ui-shadow-alpha', `${0.02 + depthNumber * 0.0022}`);
  document.documentElement.style.setProperty('--ui-saturation', saturation);
  document.documentElement.style.setProperty('--ui-brightness', brightness);

  // Speed sliders are intentionally immediate with a wide range.
  document.documentElement.style.setProperty('--ui-color-fade-ms', `${1440 - colorFadeNumber * 13.6}ms`);
  document.documentElement.style.setProperty('--ui-motion-ms', `${1235 - animSpeedNumber * 12}ms`);

  console.log("[CCS DEBUG] visual settings applied", {
    density,
    roundness,
    depth,
    saturation,
    brightness,
    densityPadding: `${densityPadding}px`,
    densityGap: `${densityGap}px`,
    spacing: { xs: spaceXs, sm: spaceSm, md: spaceMd, lg: spaceLg, xl: spaceXl },
    colorFadeMs: `${1440 - colorFadeNumber * 13.6}ms`,
    motionMs: `${1235 - animSpeedNumber * 12}ms`
  });

  if (!options.skipTheme) {
    const preset = localStorage.getItem('ccsThemePreset') || 'pure-black-amoled';
    applyThemePreset(preset);
  }

  const title = document.getElementById('appTitle');
  if (title && titleIntro !== '0' && !title.dataset.introPlayed) {
    title.classList.add('hero-title-animate');
    title.dataset.introPlayed = '1';
  }
}



// startup



function bindThemePresetDelegation() {
  if (window.__ccsThemeDelegationBound) return;
  window.__ccsThemeDelegationBound = true;
  console.log("[CCS DEBUG] theme button delegation bound");

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.theme-preset-btn');
    if (!btn) return;

    const preset = btn.dataset.themePreset;
    const current = localStorage.getItem('ccsThemePreset') || 'pure-black-amoled';

    console.log("[CCS DEBUG] theme button clicked", {
      preset,
      label: btn.textContent.trim(),
      current
    });

    if (current === preset) return;
    applyThemePreset(preset);
    if (typeof showToast === "function") showToast(`Theme changed to ${btn.textContent}.`);
  });
}



function bindSettingsControlDelegation() {
  if (window.__ccsSettingsDelegationBound) return;
  window.__ccsSettingsDelegationBound = true;
  console.log("[CCS DEBUG] settings control delegation bound");

  document.addEventListener('click', (event) => {
    const resetButton = event.target.closest('[data-settings-reset]');
    if (!resetButton) return;
    resetSettingsCategory(resetButton.dataset.settingsReset);
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!target) return;

    if (target.id === 'themeCategorySelect') {
      localStorage.setItem('ccsThemeCategory', target.value);
      refreshThemeButtonState();
      console.log("[CCS DEBUG] theme category changed", target.value);
      return;
    }

    if (target.id === 'optimizerModeEnabled') {
      try { localStorage.setItem('ccsOptimizerMode', target.checked ? '1' : '0'); } catch (e) {}
      document.body.classList.toggle('optimizer-mode', target.checked);
      syncDynamicBackgroundControl();
      if (typeof showToast === "function") showToast(target.checked ? 'Optimizer mode enabled. Dynamic background paused.' : 'Optimizer mode disabled.');
      return;
    }

    if (target.id === 'gpaModeEnabled') {
      try { localStorage.setItem('ccsGpaMode', target.checked ? '1' : '0'); } catch (e) {}
      if (el('gpaWarning')) el('gpaWarning').style.display = target.checked ? 'block' : 'none';
      renderSummary();
      repairSummaryBigNumber();
      return;
    }

    if (target.id === 'animationsEnabled') {
      try { localStorage.setItem('ccsAnimationsEnabled', target.checked ? '1' : '0'); } catch (e) {}
      initializeVisualSettings();
      return;
    }

    if (target.id === 'titleIntroEnabled') {
      try { localStorage.setItem('ccsTitleIntro', target.checked ? '1' : '0'); } catch (e) {}
      initializeVisualSettings();
      return;
    }

    if (target.id === 'dynamicBackgroundEnabled') {
      if (localStorage.getItem('ccsOptimizerMode') === '1') {
        target.checked = false;
        syncDynamicBackgroundControl();
        return;
      }
      try { localStorage.setItem('ccsDynamicBackground', target.checked ? '1' : '0'); } catch (e) {}
      syncDynamicBackgroundControl();
      return;
    }

    if (target.id === 'glassCardsEnabled') {
      try { localStorage.setItem('ccsGlassCards', target.checked ? '1' : '0'); } catch (e) {}
      document.body.classList.toggle('glass-cards', target.checked);
      console.log("[CCS DEBUG] glass cards", target.checked);
      return;
    }
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (!target) return;
    if (target.id === 'densitySlider') {
      localStorage.setItem('ccsDensity', target.value);
      document.body.classList.add('density-dragging');
      applyDensitySpacingOnly(target.value);
      window.clearTimeout(window.__ccsDensityDragTimer);
      window.__ccsDensityDragTimer = window.setTimeout(() => {
        document.body.classList.remove('density-dragging');
      }, 120);
      return;
    }
    else if (target.id === 'roundnessSlider') localStorage.setItem('ccsRoundness', target.value);
    else if (target.id === 'depthSlider') localStorage.setItem('ccsDepth', target.value);
    else if (target.id === 'saturationSlider') localStorage.setItem('ccsSaturation', target.value);
    else if (target.id === 'brightnessSlider') localStorage.setItem('ccsBrightness', target.value);
    else if (target.id === 'colorFadeSpeedSlider') localStorage.setItem('ccsColorFadeSpeed', target.value);
    else if (target.id === 'animationSpeedSlider') localStorage.setItem('ccsAnimationSpeed', target.value);
    else return;
    initializeVisualSettings();
  });
}



function bindVisualPresetDelegation() {
  if (window.__ccsVisualPresetBound) return;
  window.__ccsVisualPresetBound = true;
  document.addEventListener('click', (event) => {
    const presetBtn = event.target.closest('.visual-preset-btn');
    if (!presetBtn) return;
    const preset = presetBtn.dataset.visualPreset;
    const presets = {
      balanced: { density: '55', roundness: '65', depth: '45', speed: '100', softCards: '1', comfortable: '1' },
      compact: { density: '20', roundness: '24', depth: '25', speed: '85', softCards: '0', comfortable: '0' },
      rounded: { density: '65', roundness: '90', depth: '35', speed: '100', softCards: '1', comfortable: '1' },
      floaty: { density: '60', roundness: '75', depth: '90', speed: '110', softCards: '1', comfortable: '1' },
      playful: { density: '72', roundness: '88', depth: '65', speed: '135', softCards: '1', comfortable: '1' }
    };
    const p = presets[preset];
    if (!p) return;
    localStorage.setItem('ccsDensity', p.density);
    localStorage.setItem('ccsRoundness', p.roundness);
    localStorage.setItem('ccsDepth', p.depth);
    localStorage.setItem('ccsAnimationSpeed', p.speed);
    localStorage.setItem('ccsSoftCards', p.softCards);
    localStorage.setItem('ccsComfortableSpacing', p.comfortable);
    initializeVisualSettings();
    document.querySelectorAll('.visual-preset-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.visualPreset === preset));
    showToast(`Applied ${presetBtn.textContent}.`);
  });
}












const TOUR_STEPS = [
  { tab: 'settings', selector: '.hero', title: 'Welcome', text: 'This app saves classes, calculates grades, plans moves, generates AI-ready reports, and lets you customize the whole look.' },
  { tab: 'settings', selector: '[data-tab="settings"]', title: 'Settings', text: 'Settings controls themes, dynamic background, glass cards, density, roundness, depth, saturation, brightness, and animation speeds.' },
  { tab: 'settings', selector: '#themeCategorySelect', title: 'Theme categories', text: 'Use the dropdown to choose Mono, Mixed, or Gradient themes. Then pick the actual theme with the buttons.' },
  { tab: 'settings', selector: '#dynamicBackgroundEnabled', title: 'Dynamic background', text: 'This controls the mouse-reactive background. Turn it off if you want the page calmer.' },
  { tab: 'settings', selector: '#glassCardsEnabled', title: 'Glass cards', text: 'Glass cards make panels, buttons, inputs, and cards translucent and shiny.' },
  { tab: 'setup', selector: '[data-tab="setup"]', title: 'Class setup', text: 'Set the class name and goal grade. Save classes so Planner, Insights, Solver, and Report can use them.' },
  { tab: 'import', selector: '[data-tab="import"]', title: 'Import', text: 'Paste gradebook text to quickly bring in categories, weights, assignments, scores, and missing work.' },
  { tab: 'category', selector: '[data-tab="category"]', title: 'Categories', text: 'Add weighted categories like Assignments, Quizzes, and Tests. Correction caps can also be set here.' },
  { tab: 'grades', selector: '[data-tab="grades"]', title: 'Grades', text: 'Add, edit, exclude, correct, and delete assignments. Missing work can be tracked here too.' },
  { tab: 'planner', selector: '[data-tab="planner"]', title: 'Planner', text: 'Planner finds useful moves across saved classes, especially missing work and corrections.' },
  { tab: 'summary', selector: '[data-tab="summary"]', title: 'Summary', text: 'Summary gives your current grade, category performance, and weighted breakdown.' },
  { tab: 'insights', selector: '[data-tab="insights"]', title: 'Insights', text: 'Insights explains your grade situation, best move, stress level, and goal status.' },
  { tab: 'solver', selector: '[data-tab="solver"]', title: 'Solver', text: 'Solver helps test upcoming grades and find what score you need to reach or keep a target.' },
  { tab: 'report', selector: '[data-tab="report"]', title: 'Grade Report', text: 'Report creates a copy-ready AI-friendly grade report with selected classes, missing work, corrections, upcoming grades, and best moves.' }
];

let currentTourStep = 0;

function ensureTourOverlay() {
  let overlay = document.getElementById('tourOverlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }

  overlay.className = 'tour-overlay';
  overlay.innerHTML = `
    <div class="tour-backdrop"></div>
    <div id="tourCard" class="tour-card" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div class="tour-step">Step <span id="tourStepNumber">1</span> of <span id="tourStepTotal">${TOUR_STEPS.length}</span></div>
      <h3 id="tourTitle">Welcome</h3>
      <p id="tourText"></p>
      <div class="tour-actions">
        <button id="tourBackBtn" type="button" class="ghost-btn">Back</button>
        <button id="tourNextBtn" type="button">Next</button>
        <button id="tourSkipBtn" type="button" class="ghost-btn">Skip</button>
      </div>
    </div>
  `;

  document.getElementById('tourBackBtn')?.addEventListener('click', previousTourStep);
  document.getElementById('tourNextBtn')?.addEventListener('click', nextTourStep);
  document.getElementById('tourSkipBtn')?.addEventListener('click', closeTour);
  overlay.querySelector('.tour-backdrop')?.addEventListener('click', closeTour);

  return overlay;
}

function clearTourHighlight() {
  document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
}


function updateTourSpotlight(target) {
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const pad = 20;
  document.documentElement.style.setProperty('--tour-x', `${Math.max(rect.left - pad, 0)}px`);
  document.documentElement.style.setProperty('--tour-y', `${Math.max(rect.top - pad, 0)}px`);
  document.documentElement.style.setProperty('--tour-w', `${Math.min(rect.width + pad * 2, window.innerWidth)}px`);
  document.documentElement.style.setProperty('--tour-h', `${Math.min(rect.height + pad * 2, window.innerHeight)}px`);
}

function showTourStep(index) {
  const overlay = ensureTourOverlay();
  currentTourStep = Math.max(0, Math.min(index, TOUR_STEPS.length - 1));
  const step = TOUR_STEPS[currentTourStep];

  if (step.tab && typeof setActiveTab === 'function') {
    setActiveTab(step.tab);
  }

  clearTourHighlight();

  requestAnimationFrame(() => {
    const target = document.querySelector(step.selector);
    if (target) {
      target.classList.add('tour-highlight');
      updateTourSpotlight(target);
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    const title = document.getElementById('tourTitle');
    const text = document.getElementById('tourText');
    const number = document.getElementById('tourStepNumber');
    const total = document.getElementById('tourStepTotal');
    const back = document.getElementById('tourBackBtn');
    const next = document.getElementById('tourNextBtn');

    if (title) title.textContent = step.title;
    if (text) text.textContent = step.text;
    if (number) number.textContent = String(currentTourStep + 1);
    if (total) total.textContent = String(TOUR_STEPS.length);
    if (back) back.disabled = currentTourStep === 0;
    if (next) next.textContent = currentTourStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';

    overlay.classList.add('active');
    overlay.removeAttribute('aria-hidden');
    overlay.style.display = 'block';
    setTimeout(() => updateTourSpotlight(document.querySelector(step.selector)), 350);
  });
}

function openTour() {
  console.log("[CCS DEBUG] opening tour");
  currentTourStep = 0;
  showTourStep(0);
}

function nextTourStep() {
  if (currentTourStep >= TOUR_STEPS.length - 1) {
    closeTour();
    return;
  }
  showTourStep(currentTourStep + 1);
}

function prevTourStep() {
  showTourStep(currentTourStep - 1);
}

function previousTourStep() {
  return prevTourStep();
}

function closeTour() {
  const overlay = document.getElementById('tourOverlay');
  if (overlay) {
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
  }
  clearTourHighlight();
  document.documentElement.style.removeProperty('--tour-x');
  document.documentElement.style.removeProperty('--tour-y');
  document.documentElement.style.removeProperty('--tour-w');
  document.documentElement.style.removeProperty('--tour-h');
}

function undoDelete() {
  console.log("[CCS DEBUG] undoDelete called");
  if (pendingUndoDelete && pendingUndoDelete.restore) {
    pendingUndoDelete.restore();
    pendingUndoDelete = null;
    renderAll();
    if (typeof showToast === "function") showToast("Delete undone.");
    return;
  }
  if (typeof showToast === "function") showToast("Nothing to undo.");
}

function safeNoopHandler(name) {
  return function () {
    console.log(`[CCS DEBUG] ${name} called (safe stub)`);
  };
}

if (typeof window !== "undefined") {
  window.undoDelete = undoDelete;
}


function getReportOptions() {
  return {
    includeCurrent: !!el('reportIncludeCurrent')?.checked,
    aiMode: !!el('reportAiMode')?.checked,
    includeAssignments: !!el('reportIncludeAssignments')?.checked,
    includeMissing: !!el('reportIncludeMissing')?.checked,
    includeCorrections: !!el('reportIncludeCorrections')?.checked,
    includeUpcoming: !!el('reportIncludeUpcoming')?.checked,
    includeBestMoves: !!el('reportIncludeBestMoves')?.checked,
    extraContext: el('reportExtraContext')?.value?.trim() || ''
  };
}

function reportSafePercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return `${round2(Number(value))}%`;
}

function reportClassKey(name, suffix = '') {
  return `${name || 'Untitled Class'}${suffix}`;
}

function getReportSelectedClasses() {
  const all = getSavedClasses();
  const options = getReportOptions();
  const selected = [];

  document.querySelectorAll('.report-class-checkbox:checked').forEach(box => {
    const name = box.value;
    if (all[name]) selected.push({ name, data: normalizeLoadedClass(cloneData(all[name])), source: 'saved' });
  });

  if (options.includeCurrent && classData && ((classData.categories || []).length || classData.className)) {
    const currentName = classData.className || 'Current Unsaved Class';
    selected.unshift({ name: reportClassKey(currentName, ' (current)'), data: normalizeLoadedClass(cloneData(classData)), source: 'current' });
  }

  return selected;
}

function renderReportClassChecklist() {
  const box = el('reportClassChecklist');
  if (!box) return;
  const all = getSavedClasses();
  const names = Object.keys(all).sort();

  if (!names.length) {
    box.innerHTML = '<p class="small">No saved classes yet. You can still include the current unsaved class.</p>';
    return;
  }

  box.innerHTML = names.map(name => `
    <label class="pretty-check report-class-row">
      <input class="report-class-checkbox" type="checkbox" value="${escapeHtml(name)}" checked>
      <span>${escapeHtml(name)}</span>
    </label>
  `).join('');
}

function describeCategoryForReport(category, options) {
  const avg = categoryAverage(category);
  const totals = categoryTotals(category);
  const lines = [];
  lines.push(`Category: ${category.name || 'Unnamed Category'}`);
  lines.push(`- Weight: ${Number(category.weight || 0)}%`);
  lines.push(`- Average: ${reportSafePercent(avg)}`);
  lines.push(`- Points: ${round2(totals.earned)}/${round2(totals.possible)}`);

  if (Number.isFinite(Number(category.correctionCap))) {
    lines.push(`- Correction cap: ${Number(category.correctionCap)}%`);
  }

  const grades = (category.grades || []).filter(g => !g.excluded);
  const missing = grades.filter(g => g.isMissing);
  const correctable = grades.filter(g => gradeCorrectionEligibility(category, g).eligible);

  if (options.includeMissing && missing.length) {
    lines.push(`- Missing assignments: ${missing.length}`);
    missing.forEach(g => lines.push(`  - ${g.name}: ${round2(Number(g.earned || 0))}/${round2(Number(g.possible || 0))}`));
  }

  if (options.includeCorrections && correctable.length) {
    lines.push(`- Possible corrections: ${correctable.length}`);
    correctable.forEach(g => {
      const check = gradeCorrectionEligibility(category, g);
      lines.push(`  - ${g.name}: can improve up to ${round2(check.maxEarned)}/${round2(g.possible)}`);
    });
  }

  if (options.includeAssignments && grades.length) {
    lines.push('- Assignments:');
    grades.forEach(g => {
      const pct = Number(g.possible) > 0 ? (displayedEarned(g) / Number(g.possible)) * 100 : null;
      const tags = [];
      if (g.isMissing) tags.push('missing');
      if (g.correctedEnabled) tags.push('corrected');
      if (g.excluded) tags.push('excluded');
      lines.push(`  - ${g.name}: ${round2(displayedEarned(g))}/${round2(Number(g.possible || 0))} (${reportSafePercent(pct)})${tags.length ? ` [${tags.join(', ')}]` : ''}`);
    });
  }

  return lines.join('\n');
}

function describeClassForReport(item, options) {
  const data = normalizeLoadedClass(cloneData(item.data));
  const current = overallAverage(data);
  const plan = getMaxGradePlan(data);
  const lines = [];

  lines.push(`CLASS: ${item.name}`);
  lines.push(`Current grade: ${formatSummaryBigNumber(current)} (${letterGrade(current)})`);
  if (data.goalGrade) lines.push(`Goal grade: ${data.goalGrade}%`);
  if (plan && plan.maxGrade !== null) lines.push(`Max possible grade: ${formatSummaryBigNumber(plan.maxGrade)} (${letterGrade(plan.maxGrade)})`);

  const categories = data.categories || [];
  if (!categories.length) {
    lines.push('No categories saved.');
  } else {
    lines.push('');
    lines.push('Categories:');
    categories.forEach(category => {
      lines.push(describeCategoryForReport(category, options));
      lines.push('');
    });
  }

  if (options.includeUpcoming) {
    const upcoming = data.upcoming || [];
    lines.push('Upcoming grades:');
    if (!upcoming.length) {
      lines.push('- None saved.');
    } else {
      upcoming.forEach(slot => {
        const missingLabel = slot.isMissing ? ' [marked missing]' : '';
        lines.push(`- ${slot.name || 'Upcoming assignment'} in ${slot.categoryName || slot.category || 'Unknown category'}: ${slot.possible || '?'} pts${missingLabel}`);
      });
    }
    lines.push('');
  }

  if (options.includeBestMoves && plan) {
    lines.push('Best moves / max grade plan:');
    if (!plan.actions || !plan.actions.length) {
      lines.push('- No missing, correctable, or upcoming actions found.');
    } else {
      plan.actions.slice(0, 12).forEach((action, index) => {
        lines.push(`${index + 1}) ${action}`);
      });
    }
    lines.push('');
  }

  return lines.join('\n');
}

function generateGradeReport() {
  const options = getReportOptions();
  const classes = getReportSelectedClasses();
  const output = el('gradeReportOutput');
  if (!output) return;

  if (!classes.length) {
    output.value = 'No classes selected. Save a class, select a class, or enable "Include current unsaved class."';
    return;
  }

  const lines = [];

  if (options.aiMode) {
    lines.push('GRADE REPORT FOR AI HELP');
    lines.push('');
    lines.push('Use this grade report to help me make a realistic schoolwork plan. Prioritize the biggest grade gains first, but keep the plan manageable. Explain what I should do first, what can wait, and what is probably not worth doing. If useful, split the plan into small work sessions.');
    lines.push('');
    if (options.extraContext) {
      lines.push('Extra context from me:');
      lines.push(options.extraContext);
      lines.push('');
    }
    lines.push('Important instructions for the AI:');
    lines.push('- Missing assignments usually count as zero until turned in.');
    lines.push('- Category weights matter more than raw point totals across the whole class.');
    lines.push('- Corrections can help only when listed as eligible.');
    lines.push('- Upcoming grades may change the final grade depending on category and point value.');
    lines.push('- Give me a simple plan, not just a summary.');
    lines.push('');
  } else {
    lines.push('GRADE REPORT');
    lines.push('');
    if (options.extraContext) {
      lines.push('Extra notes:');
      lines.push(options.extraContext);
      lines.push('');
    }
  }

  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push(`Classes included: ${classes.map(c => c.name).join(', ')}`);
  lines.push('');

  classes.forEach((item, index) => {
    if (index > 0) lines.push('\n------------------------------\n');
    lines.push(describeClassForReport(item, options));
  });

  if (options.aiMode) {
    lines.push('\n------------------------------\n');
    lines.push('What I want from you:');
    lines.push('1) Identify the highest-impact actions.');
    lines.push('2) Tell me what to do first.');
    lines.push('3) Make a realistic work plan.');
    lines.push('4) Point out any grade risks or impossible goals.');
    lines.push('5) Keep the advice clear and not overwhelming.');
  }

  output.value = lines.join('\n');
}

function copyGradeReport() {
  const output = el('gradeReportOutput');
  if (!output || !output.value.trim()) {
    generateGradeReport();
  }
  const text = output?.value || '';
  if (!text.trim()) return;
  navigator.clipboard?.writeText(text).then(() => {
    if (typeof showToast === "function") showToast('Grade report copied.');
  }).catch(() => {
    output.select();
    document.execCommand('copy');
    if (typeof showToast === "function") showToast('Grade report copied.');
  });
}

function clearGradeReport() {
  if (el('gradeReportOutput')) el('gradeReportOutput').value = '';
}

function bindReportButtons() {
  if (window.__ccsReportButtonsBound) return;
  window.__ccsReportButtonsBound = true;

  el('generateReportBtn')?.addEventListener('click', generateGradeReport);
  el('copyReportBtn')?.addEventListener('click', copyGradeReport);
  el('clearReportBtn')?.addEventListener('click', clearGradeReport);

  el('reportSelectAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.report-class-checkbox').forEach(box => box.checked = true);
  });

  el('reportClearAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.report-class-checkbox').forEach(box => box.checked = false);
  });
}


function fixTutorialReportPlacement() {
  const tutorial = document.querySelector('section[data-tab="tutorial"]');
  if (!tutorial) return;

  let report = document.getElementById('tutorial-report');
  if (!report) {
    report = document.createElement('div');
    report.id = 'tutorial-report';
    report.className = 'tutorial-section';
    report.innerHTML = `
      <h3>Report</h3>
      <p>The Report tab creates a copy-ready grade report. Choose which saved classes to include, turn AI mode on if you want help from an assistant, add extra context, then generate and copy the report.</p>
    `;
  }

  if (report.closest('section') !== tutorial) {
    tutorial.appendChild(report);
  }
}

function bindButtons() {
  bindSettingsControlDelegation();
    initDynamicBackground();
  bindThemePresetDelegation();
  bindVisualPresetDelegation();
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
  if (el('undoDeleteBtn')) el('undoDeleteBtn').addEventListener('click', undoDelete);

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
    if (action === 'delete-category') deleteCategory(Number(button.dataset.index));
    if (action === 'add-grade') addGrade(Number(button.dataset.index));
    if (action === 'toggle-category-tutorial') showCategoryTutorial(Number(button.dataset.index));
    if (action === 'edit-grade') editGrade(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'save-grade') saveGradeEdits(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'cancel-edit-grade') cancelGradeEdits();
    if (action === 'toggle-correction') toggleCorrection(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'toggle-excluded') toggleExcluded(Number(button.dataset.category), Number(button.dataset.grade));
    if (action === 'delete-grade') deleteGrade(Number(button.dataset.category), Number(button.dataset.grade));
  });

  el('upcomingList').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'edit-upcoming') editUpcoming(Number(button.dataset.index));
    if (action === 'save-upcoming') saveUpcomingEdits(Number(button.dataset.index));
    if (action === 'cancel-edit-upcoming') cancelUpcomingEdits();
    if (action === 'remove-upcoming') removeUpcoming(Number(button.dataset.index));
  });
}


function initDynamicBackground() {
  if (window.__ccsDynamicBackgroundBound) return;
  window.__ccsDynamicBackgroundBound = true;

  const move = (event) => {
    const x = Math.round((event.clientX / Math.max(window.innerWidth, 1)) * 100);
    const y = Math.round((event.clientY / Math.max(window.innerHeight, 1)) * 100);
    document.documentElement.style.setProperty('--mouse-x', `${x}%`);
    document.documentElement.style.setProperty('--mouse-y', `${y}%`);
  };

  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.style.setProperty('--mouse-x', '50%');
  document.documentElement.style.setProperty('--mouse-y', '30%');
  document.body.classList.toggle('dynamic-bg-off', localStorage.getItem('ccsDynamicBackground') === '0');
  console.log("[CCS DEBUG] dynamic background initialized");
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    fixTutorialReportPlacement();
    bindButtons();
    bindReportButtons();
initializeVisualSettings();
    loadSharedClassFromUrl();
    setActiveTab('settings');
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
    loadTheme(el('themeToggle'));
    loadThemePreset();
    markDiagnostics();
    renderAll(); applyThemePreset(localStorage.getItem('ccsThemePreset') || 'pure-black-amoled'); triggerGoalCheckAfterEdit();
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




window.__ccsThemeDebug = function () {
  const preset = localStorage.getItem('ccsThemePreset');
  const mode = localStorage.getItem(THEME_KEY);
  const root = getComputedStyle(document.documentElement);
  const result = {
    preset,
    mode,
    dark: document.body.classList.contains('dark'),
    accent: root.getPropertyValue('--accent').trim(),
    bg: root.getPropertyValue('--bg').trim(),
    card: root.getPropertyValue('--card').trim(),
    colorFade: root.getPropertyValue('--ui-color-fade-ms').trim(),
    motion: root.getPropertyValue('--ui-motion-ms').trim()
  };
  console.log("[CCS DEBUG] theme state", result);
  return result;
};

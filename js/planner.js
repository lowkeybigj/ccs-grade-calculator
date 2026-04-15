import { cloneData, overallAverage, gradeCorrectionEligibility } from './grades.js';
import { round2, escapeHtml } from './utils.js';

export function potentialActionsForClass(data) {
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

export function summarizeClassPlan(data) {
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

export function renderAllClassesPlanner(savedClasses, normalizeLoadedClass) {
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

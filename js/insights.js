import { cloneData, overallAverage, letterGrade, categoryAverage, allGradePercents, gradeCorrectionEligibility, applyUpcomingScores } from './grades.js';
import { round2, escapeHtml } from './utils.js';

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

export function renderInsights(data) {
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

  const trendValues = gradePercents.map(entry => entry.percent);
  const trendDirection = trendValues.length >= 2
    ? trendValues[trendValues.length - 1] - trendValues[0]
    : 0;

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
        <h4>Can I still pass?</h4><div class="subtext">(Based off of your upcoming work saved in the solver tab.)</div>
        <p>${reachableGradeMessage(data, data.upcoming.length)}</p>
      </div>
      <div class="insight-card">
        <h4>Risk warning</h4>
        <p>${riskMessage}</p>
      </div>
    </div>
    <div class="sparkline-wrap">
      <h4 style="margin:0 0 8px;">Grade trend graph</h4>
      <div class="mini-text">${trendValues.length ? `Trend: ${trendDirection >= 0 ? 'up' : 'down'} ${round2(Math.abs(trendDirection))} points from oldest to newest saved grade.` : 'Add a few grades to see a trend graph.'}</div>
      ${createSparkline(trendValues)}
    </div>
  `;
}

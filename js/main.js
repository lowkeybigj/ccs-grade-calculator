if (window.__CCS_DIAG__) window.__CCS_DIAG__.jsLoaded = true;
const __diagJsEl = document.getElementById('diagJs');
if (__diagJsEl) __diagJsEl.textContent = 'Main JavaScript loaded: yes';
const APP_VERSION = "v.3";\nimport { el, round2, escapeHtml } from './utils.js';
import { getSavedClasses, saveAllClasses, loadTheme, applyTheme } from './storage.js';
import { cloneData, letterGrade, displayedEarned, categoryTotals, categoryAverage, overallAverage, totalWeight, normalizeLoadedClass, gradeCorrectionEligibility, applyUpcomingScores } from './grades.js';
import { importGradebookText } from './importer.js';
import { renderAllClassesPlanner } from './planner.js';
import { renderInsights } from './insights.js';

let classData = {
  className: '',
  goalGrade: '',
  categories: [],
  upcoming: []
};


function setActiveTab(tabName) {
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tabTarget === tabName);
  });
}

function toggleTutorial(id) {
  const box = el(id);
  if (!box) return;
  box.style.display = (box.style.display === 'none' || box.style.display === '') ? 'block' : 'none';
}

function renderSavedClasses() {
  const select = el('savedClasses');
  const insightsSelect = el('insightsClassSelect');
  const all = getSavedClasses();
  select.innerHTML = '<option value="">-- saved classes --</option>';
  if (insightsSelect) insightsSelect.innerHTML = '<option value="__current__">Current class</option>';
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
  container.innerHTML = '';
  if (!classData.categories.length) {
    container.innerHTML = '<p>No categories yet.</p>';
    return;
  }

  classData.categories.forEach((category, categoryIndex) => {
    const avg = categoryAverage(category);
    const totals = categoryTotals(category);
    const capText = category.correctionCap ? `${round2(category.correctionCap)}%` : 'none';

    const card = document.createElement('div');
    card.className = 'category';
    card.innerHTML = `
      <div class="row">
        <strong>${escapeHtml(category.name)}</strong>
        <span class="pill">Weight: ${round2(category.weight)}%</span>
        <span class="pill">Category average: ${avg === null ? 'N/A' : round2(avg) + '%'}</span>
        <span class="pill">Points: ${round2(totals.earned)}/${round2(totals.possible)}</span>
        <span class="pill">Correction cap: ${capText}</span>
        <button type="button" data-action="edit-category" data-index="${categoryIndex}">Edit Category</button>
        <button type="button" class="danger-btn" data-action="delete-category" data-index="${categoryIndex}">Delete Category</button>
      </div>
      <div class="row">
        <input id="nameInput_${categoryIndex}" placeholder="Assignment name" />
        <input id="earnedInput_${categoryIndex}" type="number" step="0.01" placeholder="Points earned" />
        <input id="possibleInput_${categoryIndex}" type="number" step="0.01" placeholder="Points possible" />
        <button type="button" data-action="add-grade" data-index="${categoryIndex}">Add Grade</button>
        <button type="button" class="ghost-btn" data-action="toggle-category-tutorial" data-index="${categoryIndex}">Tutorial</button>
      </div>
      <div id="categoryTutorial_${categoryIndex}" class="small subtle-box"></div>
    `;

    if (!category.grades.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No grades yet.';
      card.appendChild(empty);
    } else {
      const gradeList = document.createElement('div');
      gradeList.className = 'grade-list';

      category.grades.forEach((grade, gradeIndex) => {
        const shownEarned = displayedEarned(grade);
        const correctedText = grade.correctedEnabled ? `Corrected from ${round2(grade.earned)}/${round2(grade.possible)}` : '';
        const missingText = grade.isMissing ? '<span class="pill warning">Missing counts as 0</span>' : '';

        const gradeCard = document.createElement('div');
        gradeCard.className = 'grade-card';
        gradeCard.innerHTML = `
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
        `;
        gradeList.appendChild(gradeCard);
      });

      card.appendChild(gradeList);
    }

    container.appendChild(card);
  });
}

function renderSummary() {
  const summary = el('currentSummary');
  const overall = overallAverage(classData);
  const total = round2(totalWeight(classData));

  let html = `<p><strong>Overall grade:</strong> ${overall === null ? 'N/A' : round2(overall) + '%'}</p>`;
  html += `<p><strong>Letter grade:</strong> ${letterGrade(overall)}</p>`;
  if (classData.goalGrade !== '' && !Number.isNaN(Number(classData.goalGrade))) {
    html += `<p><strong>Current goal:</strong> ${round2(Number(classData.goalGrade))}%</p>`;
  }
  if (total !== 100) {
    html += `<p class="warning">Your configured weights do not add up to 100%.</p>`;
  }

  html += `<table>
    <tr><th>Category</th><th>Weight</th><th>Total Points</th><th>Total Points (%)</th><th>Category Average</th><th>Weighted Contribution (Current)</th><th>Correction Cap</th></tr>`;

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
    html += `<tr>
      <td>${escapeHtml(category.name)}</td>
      <td>${round2(category.weight)}%</td>
      <td>${round2(totals.earned)}/${round2(totals.possible)}</td>
      <td>${totals.possible > 0 ? round2((totals.earned / totals.possible) * 100) + '%' : 'N/A'}</td>
      <td>${avg === null ? 'N/A' : round2(avg) + '%'}</td>
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
    <th>${overall === null ? 'N/A' : round2(totalContribution)}</th>
    <th>-</th>
  </tr>`;
  html += '</table>';
  summary.innerHTML = html;
}

function renderUpcomingOptionsfunction renderUpcomingOptions() {
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
  const capRaw = el('categoryCorrectionCap').value.trim();
  const correctionCap = capRaw === '' ? null : Number(capRaw);
  if (!name) return alert('Enter a category name.');
  if (Number.isNaN(weight) || weight <= 0) return alert('Enter a valid weight greater than 0.');
  if (capRaw !== '' && (Number.isNaN(correctionCap) || correctionCap < 0)) return alert('Enter a valid correction cap or leave it blank.');
  classData.categories.push({ name, weight, correctionCap, grades: [] });
  el('categoryName').value = '';
  el('categoryWeight').value = '';
  el('categoryCorrectionCap').value = '';
  renderAll();
}

function editCategory(index) {
  const category = classData.categories[index];
  const newName = prompt('Edit category name:', category.name);
  if (newName === null) return;
  const newWeight = prompt('Edit category weight:', category.weight);
  if (newWeight === null) return;
  const newCap = prompt('Edit correction cap percent (leave blank for none):', category.correctionCap ?? '');
  if (newCap === null) return;
  const parsedWeight = Number(newWeight);
  const parsedCap = newCap.trim() === '' ? null : Number(newCap);
  if (!newName.trim() || Number.isNaN(parsedWeight) || parsedWeight <= 0) return alert('Invalid category edit.');
  if (newCap.trim() !== '' && (Number.isNaN(parsedCap) || parsedCap < 0)) return alert('Invalid correction cap.');
  category.name = newName.trim();
  category.weight = parsedWeight;
  category.correctionCap = parsedCap;
  renderAll();
}

function deleteCategory(index) {
  if (!confirm('Delete this category?')) return;
  classData.categories.splice(index, 1);
  classData.upcoming = classData.upcoming.filter(slot => slot.categoryIndex !== index).map(slot => ({ ...slot, categoryIndex: slot.categoryIndex > index ? slot.categoryIndex - 1 : slot.categoryIndex }));
  renderAll();
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
  renderAll();
}

function editGrade(categoryIndex, gradeIndex) {
  const grade = classData.categories[categoryIndex].grades[gradeIndex];
  const newName = prompt('Edit assignment name:', grade.name || '');
  if (newName === null) return;
  const newEarned = prompt('Edit points earned:', grade.earned);
  if (newEarned === null) return;
  const newPossible = prompt('Edit points possible:', grade.possible);
  if (newPossible === null) return;
  const missingAnswer = prompt('Is this assignment missing? Type yes or no:', grade.isMissing ? 'yes' : 'no');
  if (missingAnswer === null) return;
  const parsedEarned = Number(newEarned);
  const parsedPossible = Number(newPossible);
  if (Number.isNaN(parsedEarned) || Number.isNaN(parsedPossible) || parsedPossible <= 0) return alert('Invalid grade edit.');
  grade.name = newName.trim() || grade.name;
  grade.earned = parsedEarned;
  grade.possible = parsedPossible;
  grade.isMissing = /^y(es)?$/i.test(missingAnswer.trim());
  if (grade.correctedEnabled && grade.correctedEarned !== null) {
    grade.correctedEarned = Math.min(grade.correctedEarned, parsedPossible * 2);
  }
  renderAll();
}

function toggleCorrectionfunction toggleCorrection(categoryIndex, gradeIndex) {
  const category = classData.categories[categoryIndex];
  const grade = category.grades[gradeIndex];
  if (grade.correctedEnabled) {
    grade.correctedEnabled = false;
    renderAll();
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
  renderAll();
}

function deleteGrade(categoryIndex, gradeIndex) {
  classData.categories[categoryIndex].grades.splice(gradeIndex, 1);
  renderAll();
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
  renderAll();
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
  renderAll();
}

function removeUpcoming(index) {
  classData.upcoming.splice(index, 1);
  renderAll();
}

function clearUpcoming() {
  classData.upcoming = [];
  renderAll();
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
  classData.categories = importedCategories;
  classData.upcoming = [];
  renderAll();
  const gradeCount = importedCategories.reduce((sum, c) => sum + c.grades.length, 0);
  output.innerHTML = `<p class="good">Imported ${importedCategories.length} categories and ${gradeCount} assignments. Missing grades were counted as zeroes.</p>`;
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
  alert('Class saved.');
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
  renderAll();
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

function bindButtons() {
  const __diagBindingsEl = document.getElementById('diagBindings');
  if (__diagBindingsEl) __diagBindingsEl.textContent = 'Buttons/tabs bound: yes';
  if (window.__CCS_DIAG__) window.__CCS_DIAG__.bindingsLoaded = true;
  document.querySelectorAll('.tutorial-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleTutorial(btn.dataset.target));
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tabTarget));
  });

  el('themeToggle').addEventListener('click', () => {
    applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark', el('themeToggle'));
    renderAll();
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

  el('categoriesContainer').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;

    if (action === 'edit-category') editCategory(Number(button.dataset.index));
    if (action === 'delete-category') deleteCategory(Number(button.dataset.index));
    if (action === 'add-grade') addGrade(Number(button.dataset.index));
    if (action === 'toggle-category-tutorial') showCategoryTutorial(Number(button.dataset.index));
    if (action === 'edit-grade') editGrade(Number(button.dataset.category), Number(button.dataset.grade));
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

bindButtons();
setActiveTab('setup');
renderAll();
loadTheme(el('themeToggle'));
const __diagThemeEl = document.getElementById('diagTheme');
if (__diagThemeEl) __diagThemeEl.textContent = 'Theme system loaded: yes';
if (window.__CCS_DIAG__) window.__CCS_DIAG__.themeLoaded = true;
renderAll();

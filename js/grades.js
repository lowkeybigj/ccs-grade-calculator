export function cloneData(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function letterGrade(percent) {
  if (percent === null || Number.isNaN(percent)) return 'N/A';
  if (percent >= 90) return 'A';
  if (percent >= 80) return 'B';
  if (percent >= 70) return 'C';
  if (percent >= 60) return 'D';
  return 'F';
}

export function displayedEarned(grade) {
  return grade.correctedEnabled ? Number(grade.correctedEarned) : Number(grade.earned);
}

export function baseGradePercent(grade) {
  if (!grade || Number(grade.possible) <= 0) return null;
  return (Number(grade.earned) / Number(grade.possible)) * 100;
}

export function categoryTotals(category) {
  const earned = category.grades.reduce((sum, g) => sum + displayedEarned(g), 0);
  const possible = category.grades.reduce((sum, g) => sum + Number(g.possible), 0);
  return { earned, possible };
}

export function categoryAverage(category) {
  const totals = categoryTotals(category);
  if (totals.possible <= 0) return null;
  return (totals.earned / totals.possible) * 100;
}

export function overallAverage(data) {
  const active = data.categories.filter(c => categoryAverage(c) !== null);
  const activeWeight = active.reduce((sum, c) => sum + Number(c.weight), 0);
  if (activeWeight <= 0) return null;
  return active.reduce((sum, c) => sum + categoryAverage(c) * (Number(c.weight) / activeWeight), 0);
}

export function totalWeight(data) {
  return data.categories.reduce((sum, c) => sum + Number(c.weight || 0), 0);
}

export function allGradePercents(data) {
  const values = [];
  data.categories.forEach(category => {
    category.grades.forEach(grade => {
      if (Number(grade.possible) > 0) {
        values.push({
          categoryName: category.name,
          assignmentName: grade.name,
          percent: (displayedEarned(grade) / Number(grade.possible)) * 100,
          rawPercent: (Number(grade.earned) / Number(grade.possible)) * 100,
          isMissing: !!grade.isMissing
        });
      }
    });
  });
  return values;
}

export function normalizeLoadedClass(data) {
  const copy = cloneData(data);
  copy.goalGrade = copy.goalGrade ?? '';
  copy.upcoming = Array.isArray(copy.upcoming) ? copy.upcoming : [];
  copy.categories = Array.isArray(copy.categories) ? copy.categories : [];
  copy.categories.forEach((category) => {
    category.correctionCap = category.correctionCap ?? null;
    category.grades = Array.isArray(category.grades) ? category.grades : [];
    category.grades.forEach((grade, index) => {
      grade.name = grade.name || `Imported grade ${index + 1}`;
      grade.correctedEnabled = !!grade.correctedEnabled;
      grade.correctedEarned = grade.correctedEarned ?? null;
      grade.isMissing = !!grade.isMissing;
    });
  });
  return copy;
}

export function gradeCorrectionEligibility(category, grade) {
  const cap = Number(category.correctionCap);
  const originalPercent = baseGradePercent(grade);
  if (!cap || Number.isNaN(cap) || cap <= 0) return { eligible: false, reason: 'This category has no correction cap.' };
  if (originalPercent === null) return { eligible: false, reason: 'This grade is invalid.' };
  if (originalPercent < 70) return { eligible: false, reason: 'Grades below 70 do not count as correctable.' };
  if (originalPercent >= cap) return { eligible: false, reason: 'This grade is already at or above the correction cap.' };
  return { eligible: true, maxEarned: grade.possible * (cap / 100), cap };
}

export function applyUpcomingScores(data, earnedArray) {
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

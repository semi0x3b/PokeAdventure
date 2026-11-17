// 사용: node tools/validate-questions.mjs [문제 JS 경로]
// 외부 모듈 없이 문제 데이터를 실행하고 구조·중복·정답을 검사한다.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AREAS = ['math', 'korean', 'english', 'creative'];

export function validateQuestions(questions, { minPerArea = 80, minPerDifficulty = 10 } = {}) {
  const errors = [];
  const counts = Object.fromEntries(AREAS.map(area => [area, { total: 0, easy: 0, challenge: 0, plus: 0 }]));
  if (!Array.isArray(questions)) return { errors: ['문제 데이터는 배열이어야 합니다.'], counts };
  const ids = new Set();
  const contents = new Set();
  const nonempty = value => typeof value === 'string' && value.trim().length > 0 && value === value.normalize('NFC');

  questions.forEach((question, index) => {
    if (!question || typeof question !== 'object') {
      errors.push(`${index + 1}번: 문제 객체가 아닙니다.`);
      return;
    }
    const label = question.id || `${index + 1}번`;
    if (!nonempty(question.id)) errors.push(`${label}: 식별자가 비어 있거나 올바른 문자열이 아닙니다.`);
    if (ids.has(question.id)) errors.push(`${label}: 식별자가 중복됩니다.`);
    ids.add(question.id);
    if (!AREAS.includes(question.area)) errors.push(`${label}: 알 수 없는 영역입니다.`);
    // 도전+(3)는 창의력에만 있다.
    const allowed = question.area === 'creative' ? [1, 2, 3] : [1, 2];
    if (!allowed.includes(question.difficulty)) errors.push(`${label}: 난이도는 ${allowed.join('·')} 가운데 하나여야 합니다.`);
    if (!nonempty(question.prompt)) errors.push(`${label}: 문제 문장이 비어 있거나 한글 정규화가 필요합니다.`);
    if (!nonempty(question.answer)) errors.push(`${label}: 정답이 비어 있거나 올바른 문자열이 아닙니다.`);

    // 따라 쓰기는 보기 없이 쓴 글씨를 채점한다. 나머지는 모두 4지선다.
    if (question.trace !== undefined) {
      if (!Array.isArray(question.options) || question.options.length !== 0) errors.push(`${label}: 따라쓰기는 보기가 없어야 합니다.`);
    } else if (!Array.isArray(question.options) || question.options.length !== 4) {
      errors.push(`${label}: 보기는 정확히 4개여야 합니다.`);
    }
    if (Array.isArray(question.options) && question.trace === undefined) {
      if (question.options.some(option => !nonempty(option))) errors.push(`${label}: 모든 보기는 비어 있지 않은 문자열이어야 합니다.`);
      if (new Set(question.options).size !== question.options.length) errors.push(`${label}: 보기가 중복됩니다.`);
      if (question.options.filter(option => option === question.answer).length !== 1) errors.push(`${label}: 정답이 보기 안에 정확히 한 번 있어야 합니다.`);
    }
    // 따라 쓰기 글자: 영어 1~4글자 또는 한글 1~2글자.
    if (question.trace !== undefined && !/^(?:[A-Za-z]{1,4}|[가-힣]{1,2})$/.test(question.trace)) errors.push(`${label}: 따라쓰기는 영어 1~4글자나 한글 1~2글자여야 합니다.`);
    if (question.trace !== undefined && question.answer !== question.trace) errors.push(`${label}: 따라쓰기는 정답이 쓸 글자와 같아야 합니다.`);

    // 세기 문제는 문장이 같고 그림의 개수만 다르므로 세는 그림도 내용에 넣어 비교한다.
    // 그림이 문제에 없는 「다른 하나 찾기」는 보기 그림이 곧 문제라 보기 묶음까지 넣는다.
    const optionsKey = !question.visual && !question.counting && Array.isArray(question.options) ? [...question.options].sort().join('/') : '';
    const content = `${question.area}|${question.prompt}|${question.visual || ''}|${JSON.stringify(question.counting || '')}|${optionsKey}`;
    if (contents.has(content)) errors.push(`${label}: 같은 문제 내용이 중복됩니다.`);
    contents.add(content);
    if (counts[question.area]) {
      counts[question.area].total++;
      if (question.difficulty === 1) counts[question.area].easy++;
      if (question.difficulty === 2) counts[question.area].challenge++;
      if (question.difficulty === 3) counts[question.area].plus++;
    }
  });

  for (const [area, count] of Object.entries(counts)) {
    if (count.total < minPerArea) errors.push(`${area}: ${count.total}개, 최소 ${minPerArea}개가 필요합니다.`);
    if (count.easy < minPerDifficulty || count.challenge < minPerDifficulty) errors.push(`${area}: 두 난이도에 각각 최소 ${minPerDifficulty}개가 필요합니다.`);
  }
  return { errors, counts };
}

export function loadQuestions(filename) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename, timeout: 5000 });
  return context.window.QUESTIONS;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const projectFile = path.resolve(directory, '../js/data/questions.js');
  const filename = process.argv[2] ? path.resolve(process.argv[2]) : fs.existsSync(projectFile) ? projectFile : path.join(directory, 'questions.js');
  try {
    const result = validateQuestions(loadQuestions(filename));
    for (const [area, count] of Object.entries(result.counts)) console.log(`${area}: ${count.total}개 (쉬움 ${count.easy}, 도전 ${count.challenge}${count.plus ? `, 도전+ ${count.plus}` : ''})`);
    if (result.errors.length) {
      console.error(result.errors.join('\n'));
      process.exitCode = 1;
    } else console.log('문제 데이터 검사 통과: 보기 4개, 보기 중복 없음, 정답 정확히 1개, 영역별 최소 수량 충족.');
  } catch (error) {
    console.error(`문제 데이터 검사 실패: ${error.message}`);
    process.exitCode = 1;
  }
}

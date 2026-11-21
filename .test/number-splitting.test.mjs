import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateQuestions } from '../tools/validate-questions.mjs';

const window = {};
const context = vm.createContext({ window });
for (const file of ['js/data/questions.js', 'js/data/learn-pictures.js', 'js/learning-art.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const questions = window.QUESTIONS;
const splitting = questions.filter(question => question.kind === 'split' && question.counting?.split);

test('가르기는 작은 수의 모든 양수 조합과 큰 수의 묶음·낱개 조합을 낸다', () => {
  for (let total = 2; total <= 10; total++) {
    for (let part = 1; part < total; part++) {
      assert.ok(splitting.some(question => question.counting.left === part && Number(question.answer) === total - part), `${total}을 ${part}와 가르기`);
    }
  }
  for (const [total, part, answer, level] of [[5, 2, '3', 5], [12, 10, '2', 20], [37, 30, '7', 50], [50, 10, '40', 50], [100, 90, '10', 100]]) {
    const question = splitting.find(item => item.counting.left === part && item.counting.left + item.counting.right === total);
    assert.ok(question, `${total}을 ${part}와 가르기`);
    assert.equal(question.answer, answer);
    assert.equal(question.level, level);
    assert.equal(question.difficulty, total <= 10 ? 1 : 2);
  }
});

test('가르기는 답을 알려 주지 않는 존댓말·짧은 힌트와 범위 안의 서로 다른 보기 네 개를 쓴다', () => {
  for (const question of splitting) {
    assert.match(question.prompt, /^\d+[을를] \d+[과와] 몇으로 나눌까요\?$/);
    assert.equal(question.counting.left + Number(question.answer), question.counting.left + question.counting.right);
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
    assert.equal(question.options.filter(option => option === question.answer).length, 1);
    assert.ok(question.options.every(option => /^\d+$/.test(option) && Number(option) <= question.level), question.id);
    assert.ok(question.hint.length <= 35);
    assert.doesNotMatch(question.hint, /\d/);
    assert.equal(question.trace, undefined);
    assert.equal(question.visual, undefined);
  }
  const positions = [0, 0, 0, 0];
  for (const question of splitting) positions[question.options.indexOf(question.answer)]++;
  assert.ok(positions.every(count => count > splitting.length * .2), String(positions));
  for (const level of [5, 10, 20, 50, 100]) {
    const positionsInLevel = [0, 0, 0, 0];
    for (const question of splitting.filter(item => item.level === level)) positionsInLevel[question.options.indexOf(question.answer)]++;
    assert.ok(Math.max(...positionsInLevel) - Math.min(...positionsInLevel) <= 1, `${level}: ${positionsInLevel}`);
  }
  assert.equal(new Set(splitting.map(question => question.prompt)).size, splitting.length);
  assert.deepEqual(validateQuestions(questions).errors, []);
});

test('영역·수 범위·난이도 설정과 풀었던 문제 제외 경로로 가르기를 뽑는다', () => {
  let seed = 417;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const level of [5, 10, 20, 50, 100]) {
    const seen = new Set();
    for (let turn = 0; turn < 80; turn++) {
      const batch = window.QuestionBank.pick({ area: 'math', levels: { math: level }, difficulty: turn % 3 + 1, count: 4, exclude: [...seen], random });
      assert.equal(batch.length, 4);
      assert.equal(new Set(batch.map(question => question.id)).size, 4);
      for (const question of batch) {
        assert.equal(question.area, 'math');
        if (question.kind !== 'split' || !question.counting?.split) continue;
        assert.ok(question.level === level || (level === 10 && question.level === 5));
        assert.ok(question.counting.left + question.counting.right <= level);
        seen.add(question.id);
      }
    }
    assert.ok(seen.size > 0, `${level} 범위에서 가르기 출제`);
    if (level === 10) assert.ok([...seen].some(id => splitting.find(question => question.id === id)?.level === 5));
  }
  const excluded = splitting.find(question => question.level === 5).id;
  for (let turn = 0; turn < 50; turn++) {
    const batch = window.QuestionBank.pick({ area: 'math', levels: { math: 5 }, count: 4, exclude: [excluded], random });
    assert.ok(batch.every(question => question.id !== excluded));
  }
  assert.ok(window.QuestionBank.pick({ area: 'korean', count: 20, random }).every(question => question.area === 'korean'));
});

test('가르기 그림은 두 무더기와 빈칸을 그리고 큰 수는 열 개씩 묶어 답 숫자를 숨긴다', () => {
  const art = window.LearningArt;
  const small = art.splittingHtml({ left: 2, right: 3 }, { id: 'math-019' });
  assert.equal((small.match(/gb-count-part/g) || []).length, 2);
  assert.equal((small.match(/<i>/g) || []).length, 5);
  assert.match(small, /is-unknown/);
  assert.match(small, /gb-count-mark">\?</);
  assert.doesNotMatch(small, />3<|aria-label="3"/);
  assert.match(small, /img\/learn\/2462.webp/);
  const large = art.splittingHtml({ left: 90, right: 10 }, { id: 'math-019' });
  assert.equal((large.match(/learning-ten/g) || []).length, 10);
  assert.equal((large.match(/<i>/g) || []).length, 10);
  assert.doesNotMatch(large, />90<|>100</);
  const mixed = art.splittingHtml({ left: 30, right: 7 }, { id: 'math-019' });
  assert.equal((mixed.match(/learning-ten/g) || []).length, 3);
  assert.equal((mixed.match(/<i>/g) || []).length, 10);
  assert.doesNotMatch(mixed, />7<|>37</);
});

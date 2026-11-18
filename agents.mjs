import { readFileSync } from 'node:fs';

export const config = JSON.parse(
  readFileSync(new URL('./config.json', import.meta.url)),
);
export const levels = ['一般', '较急', '紧急'];
const rules = config.rules.map((r) => ({ ...r, match: new RegExp(r.pattern) }));
const road =
  /[\u4e00-\u9fffA-Za-z0-9]{1,12}?(?:大道|大街|公路|路|街|巷)(?!灯|面|坑)/g;
const dangerous =
  /悬挂.{0,10}(人行道|车道|头顶)|随时.{0,3}(掉落|坠落)|漏电|冒火花|塌陷|阻断交通|已经伤人/;
function extractPlace(s) {
  const clean = s.replace(/^(?:我在|位于|在|发现|反映|上报)/, '');
  return (
    clean.match(
      /^(.{1,45}?(?:交叉口|交汇处|十字路口|路口)(?:[东西南北]{1,2}[侧边角口])?)/,
    )?.[1] ||
    clean.match(/^(.{1,22}?(?:路|街|巷)\d+号(?:门口)?)/)?.[1] ||
    clean.match(road)?.[0] ||
    ''
  );
}
function normalized(s) {
  return s
    .replace(/\s+/g, '')
    .replace(/东边|西边|南边|北边/g, (side) => side[0] + '侧')
    .replace(/交叉口|交汇处|十字路口/g, '路口');
}

export function judgeDepartment(asset, rule) {
  const owner = Object.hasOwn(config.assets, asset) ? config.assets[asset] : '';
  if (config.departments.includes(owner))
    return { department: owner, route: '设施台账 · ' + asset };
  if (owner)
    return { department: '待复核', route: '台账归属需核实 · ' + asset };
  return rule
    ? { department: rule.department, route: '职责清单 · ' + rule.type }
    : { department: '待复核', route: '请管理员核实设施及养护单位' };
}

export function parseClue(input, evidence = {}) {
  const text = input.text || '';
  const clauses = text.split(/[，,。；;\n]|还有|同时|并且/).filter(Boolean);
  const defaultPlace = input.location || extractPlace(clauses[0] || '');
  const found = new Map();
  let lastPlace = defaultPlace;
  let preceding = [];
  for (const [index, clause] of [...clauses, evidence.text || ''].entries()) {
    if (!clause) continue;
    const visual = index >= clauses.length;
    // CLIP proposes one class for the whole frame. A differing candidate stays
    // visible as evidence; it must not create a second, unreported incident.
    if (visual && Object.hasOwn(evidence, 'candidate') && found.size) continue;
    const place = (visual ? defaultPlace : extractPlace(clause)) || lastPlace;
    if (!visual) lastPlace = place;
    const location = input.location || place;
    const asset = (
      input.asset ||
      clause.match(/\b[A-Z]{1,5}-\d{2,8}\b/i)?.[0] ||
      ''
    ).toUpperCase();
    const subject = clause.replace(
      /(?:路灯|井盖|行道树|绿化带|花坛|灯杆)(?:旁边|边上|旁|下方|附近)的?/g,
      '',
    );
    const matches =
      visual && evidence.candidate
        ? rules.filter((r) => r.type === evidence.candidate)
        : rules.filter((r) => r.match.test(subject));
    if (!matches.length && dangerous.test(clause)) {
      for (const item of preceding) {
        item.urgency = '紧急';
        item.reason +=
          '\n' + (visual ? evidence.status : '市民描述') + ' · ' + clause;
      }
    }
    if (matches.length) preceding = [];
    const types = new Set(matches.map((r) => r.type));
    for (const r of matches) {
      if (
        (r.type === '井盖破损' && types.has('井盖缺失')) ||
        (r.type === '路灯故障' && types.has('照明设施倾斜')) ||
        (r.type === '绿化养护' && types.has('树木断枝或倾倒'))
      )
        continue;
      const key = JSON.stringify([r.type, location, asset]);
      const prior = found.get(key);
      const urgency = dangerous.test(clause) ? '紧急' : r.urgency;
      const reason = (visual ? evidence.status : '市民描述') + ' · ' + clause;
      if (prior) {
        prior.reason += '\n' + reason;
        if (levels.indexOf(urgency) > levels.indexOf(prior.urgency))
          prior.urgency = urgency;
      } else {
        found.set(key, {
          type: r.type,
          location,
          asset,
          urgency,
          reason,
          ...judgeDepartment(asset, r),
        });
      }
      preceding.push(found.get(key));
    }
  }
  return found.size
    ? [...found.values()]
    : [
        {
          type: '待识别问题',
          location: defaultPlace,
          asset: input.asset || '',
          urgency: dangerous.test(text + ' ' + (evidence.text || ''))
            ? '紧急'
            : '一般',
          reason: '缺少可确认的故障特征',
          ...judgeDepartment(input.asset || '', null),
        },
      ];
}

export function matchEvents(issue, events, imageHash, now) {
  const strong = [],
    candidates = [],
    closed = [];
  const loc = normalized(issue.location);
  const sides = (s) => s.match(/[东西南北]{1,2}(?=[侧角边口])/g) || [];
  for (const e of events) {
    if (e.type !== issue.type || issue.type === '待识别问题') continue;
    const other = normalized(e.location);
    if (
      sides(loc).length &&
      sides(other).length &&
      !sides(loc).some((s) => sides(other).includes(s))
    )
      continue;
    if (issue.asset && e.asset && issue.asset !== e.asset) continue;
    const sameAsset = Boolean(issue.asset && issue.asset === e.asset);
    const sameImage = Boolean(imageHash && e.hashes.includes(imageHash));
    const roads = new Set(loc.match(road) || []);
    const sameRoad = (other.match(road) || []).some(
      (r) =>
        roads.has(r) || [...roads].some((a) => a.endsWith(r) || r.endsWith(a)),
    );
    const house = (s) => s.match(/\d+号/)?.[0];
    if (house(loc) && house(other) && house(loc) !== house(other)) continue;
    if (roads.size && (other.match(road) || []).length && !sameRoad) continue;
    if (loc && other && !sameRoad && loc !== other && !sameAsset) continue;
    const exactPoint =
      loc &&
      loc === other &&
      /(?:\d+号(?:门口|门前)|斑马线[东西南北]端|[东西南北]侧第[一二三四五六七八九\d]+[盏棵个])/u.test(
        loc,
      );
    const exact = sameAsset || sameImage || exactPoint;
    if (e.status === '已办结') {
      if (exact) closed.push(e.id);
    } else if (exact && now - e.last <= 7 * 86400000) strong.push(e.id);
    else if (exact || sameRoad || (loc && loc === other)) candidates.push(e.id);
  }
  return {
    target: strong.length === 1 ? strong[0] : null,
    candidates: [...strong, ...candidates],
    previous: closed[0] || null,
  };
}

export function generateBrief(items, events, start, end) {
  const rows = items.filter((i) => i.time >= start && i.time < end);
  const reports = new Set(rows.map((i) => i.reportId));
  const selected = events
    .filter((e) => rows.some((i) => i.event === e.id))
    .map((e) => {
      const reportIds = [
        ...new Set(rows.filter((i) => i.event === e.id).map((i) => i.reportId)),
      ];
      return {
        id: e.id,
        type: e.type,
        location: e.location,
        urgency: e.urgency,
        department: e.department,
        status: e.status,
        reportIds,
        review:
          e.candidates.length > 0 ||
          e.department === '待复核' ||
          e.type === '待识别问题' ||
          e.photoReview ||
          !e.location,
      };
    });
  return {
    start,
    end,
    reports: reports.size,
    supplements: rows.filter((i) => i.supplement).length,
    events: selected,
    departments: Object.fromEntries(
      [...config.departments, '待复核'].map((d) => [
        d,
        selected.filter((e) => e.department === d).length,
      ]),
    ),
    urgent: selected.filter((e) => e.urgency === '紧急').length,
    review: selected.filter((e) => e.review).length,
  };
}

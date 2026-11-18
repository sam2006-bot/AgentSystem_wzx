import { readFileSync } from 'node:fs';

export const config = JSON.parse(
  readFileSync(new URL('./config.json', import.meta.url)),
);
export const levels = ['一般', '较急', '紧急'];
const rules = config.rules.map((r) => ({
  ...r,
  match: new RegExp(r.pattern, 'g'),
}));
export const halfWidth = (s) =>
  String(s ?? '').replace(/[０-９Ａ-Ｚａ-ｚ－]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  );

// ── 位置 ────────────────────────────────────────────────────────────
// 中文地名没有分词边界，正则从最左侧开始匹配，容易把「我家附近」「是」等
// 词并入路名。先按这些标记词切段，再在各段里按路口、门牌、地标、道路的
// 具体程度依次查找。
const NAME = '[\\u4e00-\\u9fffA-Za-z0-9]';
const NUM = '[一二三四五六七八九十\\d]+';
const ROAD = NAME + '{1,12}?(?:大道|大街|公路|胡同|路|街|巷)(?![灯面坑牙沿基障])';
const DETAIL = `(?:斑马线[东西南北]端|[东西南北]{1,2}[侧角边面](?:第${NUM}[盏棵个根])?|第${NUM}[盏棵个根])?`;
const roadPattern = new RegExp(ROAD, 'g');
const detailPattern = new RegExp('^' + DETAIL);
const crossingPattern = new RegExp(
  `[\\u4e00-\\u9fffA-Za-z0-9、/]{1,45}?(?:交叉口|交汇处|十字路口|丁字路口|路口)${DETAIL}`,
);
const housePattern = new RegExp(
  `${ROAD}\\d+号(?:楼|院)?(?:门口|门前|旁|对面)?${DETAIL}`,
);
const landmarkPattern = new RegExp(
  `(${NAME}{1,12}?)(广场|小区|公园|小学|中学|大学|学校|幼儿园|医院|学院|商场|超市|市场|大厦|中心|花园|家园|新村|社区|火车站|汽车站|地铁站|公交站|车站|码头|体育馆|图书馆|博物馆|大桥|立交桥|停车场)((?:[东西南北]门|正门|大门|侧门|后门|门口|入口|出口|\\d+号楼|\\d+栋|\\d+单元)?)${DETAIL}`,
);
const GENERIC_ROAD =
  /^(?:这条|那条|整条|一条|这|那|该|此|过|走|沿|顺着?|上|到|去)?(?:道路|马路|公路|大路|小路|大街|大道|小巷|小街|街道|胡同|一路|半路|路|街|巷)$/;
const VAGUE_NAME = /^(?:这个|那个|一个|这|那|该|此|本|某|市|城|路|街|马路)$/;
const MARK = new RegExp(
  '的(?!交叉口|交汇处|十字路口|丁字路口|路口|[东西南北]{1,2}[侧角边面])|位于|位置是?|地点是?|地址是?|附近|周边|旁边|这里|那里|这边|那边|我家|我们|发现|反映|上报|看到|看见|靠近|就在|在|是|' +
    // 常见故障描述也作为分隔，避免「路灯不亮人民路3号」整段被当成地名
    '不亮|坏了|坏掉|损坏|破损|缺失|丢失|丢了|堆积|很多|严重|倾斜|倒了|断了|漏电|塌陷|没了|不见了',
  'g',
);

function roadsIn(s) {
  const out = [];
  let end = -1;
  for (const m of s.matchAll(roadPattern)) {
    let name = m[0];
    // 「人民路与建设路」中第二个路名会带上连接词
    if (m.index === end)
      name = name.replace(/^(?:与|跟|同|及|、|\/)/, '').replace(/^和(?=.{3})/, '');
    end = m.index + m[0].length;
    if (!GENERIC_ROAD.test(name)) out.push(name);
  }
  return out;
}
const placeFinders = [
  (s) => {
    const m = s.match(crossingPattern)?.[0];
    return m && roadsIn(m).length ? m : '';
  },
  (s) => {
    const m = s.match(housePattern)?.[0];
    return m && roadsIn(m).length ? m : '';
  },
  (s) => {
    const m = s.match(landmarkPattern);
    return m && !VAGUE_NAME.test(m[1]) && !GENERIC_ROAD.test(m[1]) ? m[0] : '';
  },
  (s) => {
    for (const m of s.matchAll(roadPattern))
      if (roadsIn(m[0]).length)
        return (
          m[0] +
          (s.slice(m.index + m[0].length).match(detailPattern)?.[0] || '')
        );
    return '';
  },
];
const PLACE_KINDS = ['路口', '门牌', '地标', '道路'];
export function locatePlace(text) {
  const segments = halfWidth(text)
    .replace(/\s+/g, '')
    .split(MARK)
    .filter(Boolean);
  for (const [k, find] of placeFinders.entries())
    for (const segment of segments) {
      const place = find(segment);
      if (place) return { place, kind: PLACE_KINDS[k] };
    }
  return { place: '', kind: '' };
}
export const extractPlace = (text) => locatePlace(text).place;
// 「门口」「路边」「这条路」这类说法不能作为位置
export const isVaguePlace = (s) =>
  !s ||
  s.length < 2 ||
  GENERIC_ROAD.test(s) ||
  /^(?:这里|那里|这边|那边|门口|路边|路上|附近|旁边|楼下|家门口|小区门口|马路上?|我家.*)$/.test(
    s,
  );

// ── 线索解析 ──────────────────────────────────────────────────────────
const CLAUSE =
  /[，,。；;！!？?\n]|还有|同时|并且|另外|而是|但是|不过|可是/;
// 参照物：「路灯下有垃圾」说的是垃圾，不是路灯
const REFERENCE =
  /(?:路灯杆|电线杆|路灯|灯杆|灯柱|井盖|行道树|大树|绿化带|花坛|垃圾桶|站牌|红绿灯|信号灯|护栏)(?:旁边|边上|附近|下方|下面|底下|前面|前方|后面|对面|周围|那里|这里|旁|边(?![缘框角])|下(?![陷沉垂坠落雨]))的?/g;
// 「没有积水」「未见井盖缺失」中的设施不是故障
const NEG_BEFORE =
  /(?:没有|没看到|没发现|没看见|未见|未发现|未看到|不存在|并无|无)$/;
const NEGATED = /^(?:不是|并不是|并非|倒不是|也不是)|不是.{0,10}的?问题/;
const DONE =
  '(?:修好|修复|修理好|维修好|修完|处理好|处理完|解决|换好|换新|装好|补好|盖好|清理干净|清理完|清走|清运|恢复正常|恢复照明)';
const RESOLVED = new RegExp(
  `(?:已经?|已被|都已经?|早就?)${DONE}|(?<!没|没有|未|不|该|要|能|会|得|快|想|请|望|烦|时|紧)${DONE}了(?!吗|么|没)|(?:已经?|又|终于)(?:亮了|好了|正常了|通了)|(?:不用|无需|无须|不需要|不必)再?(?:处理|派人|管|来)|没事了|没问题了`,
);
const NO = '(?<!没|没有|没人|没有人|未|无|无人|不|不会|以免|避免|防止|小心)';
export const DANGER = new RegExp(
  '悬挂.{0,10}(?:人行道|车道|头顶)|随时.{0,4}(?:掉落|坠落|倒塌|砸|倒)|' +
    NO +
    '(?:漏电|触电|冒火花|打火|起火|着火|冒烟|电线裸露|裸露的?电线|塌陷|阻断交通|伤人|受伤|摔伤|摔倒|绊倒|砸伤|砸到人|掉下去|掉进去|掉进[井坑洞]|摔进)|' +
    '(?:差点|险些|差一点)(?:就|儿)?(?:掉|摔|绊|撞|砸|翻|出事|出车祸|受伤)|' +
    NO +
    '(?:太|非常|特别|十分|极其)危险|车.{0,3}熄火|没过膝盖|齐腰|淹没',
);

function mention(rule, s) {
  for (const m of s.matchAll(rule.match))
    if (!NEG_BEFORE.test(s.slice(Math.max(0, m.index - 4), m.index)))
      return m[0];
  return '';
}
export const issueTypes = config.rules.map((r) => r.type);
export const ruleOf = (type) => rules.find((r) => r.type === type) || null;
const PLACE_SCORE = { 路口: 0.85, 门牌: 0.85, 地标: 0.85, 道路: 0.6 };

export function judgeDepartment(asset, rule) {
  const owner = Object.hasOwn(config.assets, asset) ? config.assets[asset] : '';
  if (config.departments.includes(owner))
    return { department: owner, route: '设施台账 · ' + asset };
  if (owner)
    return { department: '待复核', route: '台账归属需核实 · ' + asset };
  if (!rule)
    return { department: '待复核', route: '请管理员核实设施及养护单位' };
  return config.departments.includes(rule.department)
    ? { department: rule.department, route: '职责清单 · ' + rule.type }
    : {
        department: '待复核',
        route: '职责清单 · ' + rule.type + ' · ' + (rule.note || '责任部门待核实'),
      };
}

// 线索解析 Agent 的规则部分。每个事项附带 basis：问题类型、位置和紧急等级
// 各自的确定方式与可信程度，由编排层整理为判断过程。不涉及职能部门。
export function extractIssues(input, evidence = {}) {
  const text = halfWidth(input.text);
  const clauses = text
    .split(CLAUSE)
    .map((c) => c.trim())
    .filter(Boolean);
  const given = input.location || '';
  // 位置常写在问题之后，如「井盖丢了，位置在中山路88号门口」
  const first = given
    ? { place: given, kind: '' }
    : clauses.map(locatePlace).find((p) => p.place) || { place: '', kind: '' };
  const defaultPlace = first.place;
  // here：本句提取到的位置；inherited：同一描述中其他句子写明的位置
  const placeBasis = (here, inherited) =>
    given
      ? [1, '市民填写的位置']
      : here?.place
        ? [PLACE_SCORE[here.kind], `描述中的${here.kind}「${here.place}」`]
        : inherited?.place
          ? [
              PLACE_SCORE[inherited.kind],
              `沿用同一描述中的${inherited.kind}「${inherited.place}」`,
            ]
          : [0, '未提取到位置'];
  const sources = clauses.map((clause) => ({ clause, visual: false }));
  if (evidence.text) sources.push({ clause: evidence.text, visual: true });
  const found = new Map();
  const notes = [];
  const live = [];
  let lastFound = first;
  let preceding = [];
  for (const { clause, visual } of sources) {
    // CLIP proposes one class for the whole frame. A differing candidate stays
    // visible as evidence; it must not create a second, unreported incident.
    if (visual && Object.hasOwn(evidence, 'candidate') && found.size) continue;
    const here = visual ? null : locatePlace(clause);
    if (here?.place) lastFound = here;
    const inherited = visual ? first : lastFound;
    const location = given || (visual ? defaultPlace : lastFound.place);
    const asset = (
      input.asset ||
      clause.match(/\b[A-Z]{1,5}-\d{2,8}\b/i)?.[0] ||
      ''
    ).toUpperCase();
    const subject = clause.replace(REFERENCE, '');
    let matches =
      visual && evidence.candidate
        ? rules
            .filter((r) => r.type === evidence.candidate)
            .map((r) => [r, ''])
        : rules.map((r) => [r, mention(r, subject)]).filter(([, m]) => m);
    matches = matches.filter(
      ([r]) => !matches.some(([o]) => o.suppresses?.includes(r.type)),
    );
    const keyOf = (type) => JSON.stringify([type, location, asset]);
    if (!visual && (NEGATED.test(clause) || RESOLVED.test(clause))) {
      const resolved = !NEGATED.test(clause);
      notes.push((resolved ? '已修复或无需处理' : '否定表述') + ' · ' + clause);
      if (resolved) {
        // 「路灯修好了」撤销同一位置此前提到的路灯故障；
        // 「昨天已经修好了」撤销紧邻的上一处问题
        for (const key of matches.length
          ? matches.map(([r]) => keyOf(r.type))
          : preceding)
          found.delete(key);
        preceding = [];
      }
      continue;
    }
    live.push(clause);
    const source = visual ? evidence.status : '市民描述';
    const danger = clause.match(DANGER)?.[0];
    if (!matches.length && danger)
      for (const key of preceding) {
        const item = found.get(key);
        if (!item) continue;
        item.urgency = '紧急';
        item.reason += '\n' + source + ' · ' + clause;
        item.basis.urgency = `后续险情描述「${danger}」`;
      }
    if (matches.length) preceding = [];
    for (const [r, keyword] of matches) {
      const key = keyOf(r.type);
      const prior = found.get(key);
      const urgency = danger ? '紧急' : r.urgency;
      const urgencyBasis = danger
        ? `险情描述「${danger}」`
        : `「${r.type}」的默认等级`;
      const reason = source + ' · ' + clause;
      if (prior) {
        prior.reason += '\n' + reason;
        if (levels.indexOf(urgency) > levels.indexOf(prior.urgency)) {
          prior.urgency = urgency;
          prior.basis.urgency = urgencyBasis;
        }
      } else {
        found.set(key, {
          type: r.type,
          location,
          asset,
          urgency,
          reason,
          basis: {
            type: !visual
              ? [0.9, `描述中的「${keyword}」`]
              : evidence.candidate
                ? [0.5, `图像分类候选「${r.type}」`]
                : [
                    evidence.status?.startsWith('模型观察') ? 0.75 : 0.6,
                    `${evidence.status}中的「${keyword}」`,
                  ],
            place: placeBasis(here, inherited),
            urgency: urgencyBasis,
          },
        });
      }
      preceding.push(key);
    }
  }
  if (found.size) return [...found.values()];
  const danger = live.map((c) => c.match(DANGER)?.[0]).find(Boolean);
  return [
    {
      type: '待识别问题',
      location: defaultPlace,
      asset: input.asset || '',
      urgency: danger ? '紧急' : '一般',
      reason: notes.length
        ? '未建立故障类型 · 描述含已修复或否定表述\n' + notes.join('\n')
        : '缺少可确认的故障特征',
      negated: notes.length > 0,
      basis: {
        type: [0, notes.length ? '描述为已修复或否定表述' : '未命中问题类型关键词'],
        place: placeBasis(first, null),
        urgency: danger ? `险情描述「${danger}」` : '未发现险情描述',
      },
    },
  ];
}

// 规则版「解析 + 归属」，供紧急预警等只需快速判断的场景使用
export function parseClue(input, evidence = {}) {
  return extractIssues(input, evidence).map(({ basis, negated, ...issue }) => ({
    ...issue,
    ...judgeDepartment(issue.asset, ruleOf(issue.type)),
  }));
}

// ── 重复合并 ──────────────────────────────────────────────────────────
export const AUTO_MERGE = 0.7;
const DAY = 86400000;

export function normalized(s) {
  return halfWidth(s)
    .replace(/\s+/g, '')
    .replace(/的/g, '')
    .replace(/([东西南北]{1,2})(?:边|面)/g, '$1侧')
    .replace(/交叉口|交汇处|十字路口|丁字路口|交叉路口/g, '路口')
    .replace(/门前|门外/g, '门口')
    .replace(/(?<=路|街|巷|大道)(?:与|跟|同|及|、|\/)/g, '')
    .replace(/(?:附近|一带|周边|旁边|这里|那里|这边|那边)$/, '');
}

function placeOf(s) {
  const text = normalized(s);
  const lm = text.match(landmarkPattern);
  return {
    text,
    roads: roadsIn(text),
    house: text.match(/\d+号/)?.[0] || '',
    sides: text.match(/[东西南北]{1,2}(?=[侧角口])/g) || [],
    ordinal: text.match(new RegExp(`第${NUM}[盏棵个根]`))?.[0] || '',
    zebra: text.match(/斑马线[东西南北]端/)?.[0] || '',
    crossing: text.includes('路口'),
    landmark:
      lm && !VAGUE_NAME.test(lm[1]) ? { name: lm[1] + lm[2], door: lm[3] } : null,
  };
}
const near = (a, b) => a === b || a.endsWith(b) || b.endsWith(a);
const differ = (a, b) => Boolean(a && b && a !== b);
const specific = (p) =>
  Boolean(
    p.house ||
      p.ordinal ||
      p.zebra ||
      (p.crossing && p.sides.length) ||
      p.landmark?.door,
  );

// 返回 { score, reason }；hard 否决表示两处位置明确不同，soft 否决表示
// 文字对不上，但同一设施、照片或坐标等其他证据仍可将其列为疑似。
function comparePlaces(a, b) {
  if (!a.text || !b.text) return { score: 0 };
  const hard = (veto) => ({ score: 0, veto, hard: true });
  if (differ(a.house, b.house)) return hard('门牌不同');
  if (a.sides.length && b.sides.length && !a.sides.some((s) => b.sides.includes(s)))
    return hard('方位不同');
  if (differ(a.ordinal, b.ordinal) || differ(a.zebra, b.zebra))
    return hard('点位不同');
  const common = a.roads.filter((r) => b.roads.some((o) => near(r, o)));
  if (a.roads.length && b.roads.length && !common.length)
    return hard('道路不同');
  const sameLandmark = Boolean(
    a.landmark && b.landmark && near(a.landmark.name, b.landmark.name),
  );
  if (a.landmark && b.landmark && !sameLandmark) return hard('地标不同');
  if (sameLandmark && differ(a.landmark.door, b.landmark.door))
    return hard('出入口不同');
  if (a.text === b.text && specific(a))
    return { score: 0.7, reason: '位置描述一致（精确点位）' };
  if (a.house && a.house === b.house && common.length)
    return { score: 0.65, reason: '同一门牌' };
  if (a.crossing && b.crossing && common.length >= 2)
    return a.sides.length && b.sides.length
      ? { score: 0.7, reason: '同一路口同一方位' }
      : { score: 0.4, reason: '同一路口' };
  if (sameLandmark)
    return a.landmark.door && a.landmark.door === b.landmark.door
      ? { score: 0.7, reason: '同一地标出入口' }
      : { score: 0.4, reason: '同一地标' };
  if (a.text === b.text) return { score: 0.25, reason: '位置描述一致（范围较大）' };
  if (common.length) return { score: 0.15, reason: '同一道路' };
  return { score: 0, veto: '位置描述不同' };
}

export function hamming(a, b) {
  let x = BigInt('0x' + a) ^ BigInt('0x' + b),
    n = 0;
  for (; x; x >>= 1n) n += Number(x & 1n);
  return n;
}
export function distance(a, b) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) *
      Math.cos(b.lat * rad) *
      Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function gap(ms) {
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + ' 分钟';
  if (ms < DAY) return Math.round(ms / 3600000) + ' 小时';
  return Math.round(ms / DAY) + ' 天';
}

// report: { hash, dhash, geo } —— 原图 SHA-256、浏览器端感知哈希、坐标
export function matchEvents(issue, events, report = {}, now = Date.now()) {
  const results = [];
  const here = placeOf(issue.location);
  for (const e of issue.type === '待识别问题' ? [] : events) {
    if (e.type !== issue.type) continue;
    if (issue.asset && e.asset && issue.asset !== e.asset) continue;
    // 与事件内每条线索的位置都比对：已并入「9号门口」的事件不能再吸收「10号门口」
    const checks = (e.places?.length ? e.places : [e.location]).map((p) =>
      comparePlaces(here, placeOf(p)),
    );
    if (checks.some((c) => c.hard)) continue;
    const place = checks.reduce((a, b) => (b.score > a.score ? b : a));
    const sameAsset = Boolean(issue.asset && issue.asset === e.asset);
    const signals = [];
    if (sameAsset) signals.push([1, '同一设施编号 ' + issue.asset]);
    if (place.score) signals.push([place.score, place.reason]);
    if (report.hash && e.hashes?.includes(report.hash))
      signals.push([0.95, '同一张现场原图']);
    else if (report.dhash && e.dhashes?.length) {
      const d = Math.min(...e.dhashes.map((h) => hamming(report.dhash, h)));
      if (d <= 6) signals.push([0.85, `照片高度相似（差异 ${d}/64）`]);
      else if (d <= 12) signals.push([0.4, `照片相似（差异 ${d}/64）`]);
    }
    const conflicts = place.veto ? [place.veto] : [];
    if (report.geo && e.coords?.length) {
      const acc = (g) => g.accuracy ?? 30;
      const [d, c] = e.coords
        .map((c) => [distance(report.geo, c), c])
        .sort((x, y) => x[0] - y[0])[0];
      const m = Math.round(d);
      if (acc(report.geo) <= 50 && acc(c) <= 50) {
        if (d <= 20) signals.push([0.7, `坐标相距 ${m} 米`]);
        else if (d <= 50) signals.push([0.45, `坐标相距 ${m} 米`]);
        else if (d <= 150) signals.push([0.2, `坐标相距 ${m} 米`]);
      }
      if (d > 300 + acc(report.geo) + acc(c)) conflicts.push(`坐标相距 ${m} 米`);
    }
    // 只有时间接近不算证据
    if (!signals.length) continue;
    const age = now - e.last;
    if (age <= DAY) signals.push([0.1, '间隔 ' + gap(age)]);
    const score = 1 - signals.reduce((p, [s]) => p * (1 - s), 1);
    results.push({
      id: e.id,
      score: Math.round(score * 100) / 100,
      reasons: [
        ...signals.map(([, r]) => r),
        ...(age > DAY ? ['间隔 ' + gap(age)] : []),
        ...conflicts.map((c) => '需核实：' + c),
      ],
      closed: e.status === '已办结',
      // 文字与坐标矛盾时不自动合并；设施编号相同时仍以编号为准
      auto: score >= AUTO_MERGE && (sameAsset || !conflicts.length),
      fresh: age <= 7 * DAY,
      sameAsset,
    });
  }
  const open = results
    .filter((r) => !r.closed)
    .sort((a, b) => b.score - a.score);
  let strong = open.filter((r) => r.auto && r.fresh);
  // 设施编号相同是最直接的证据，优先于坐标、照片等其他强匹配
  if (strong.some((r) => r.sameAsset)) strong = strong.filter((r) => r.sameAsset);
  const target = strong.length === 1 ? strong[0] : null;
  return {
    target: target?.id ?? null,
    link: target && { score: target.score, reasons: target.reasons },
    candidates: open.map(({ id, score, reasons }) => ({ id, score, reasons })),
    previous: results.find((r) => r.closed && r.auto)?.id ?? null,
  };
}

// 简报的统计部分全部由程序计算；摘要先按模板生成，编排层可再交给模型润色，
// 但模型输出的数字必须都能在这里的统计中找到。
const HOUR = 3600000;
function areaOf(location) {
  if (!location) return '';
  const p = placeOf(location);
  if (p.crossing && p.roads.length >= 2)
    return p.roads.slice(0, 2).join('与') + '路口';
  return p.landmark?.name || p.roads[0] || p.text;
}
function top(map, n = 5) {
  return [...map.values()]
    .sort((a, b) => b.events - a.events || b.reports - a.reports)
    .slice(0, n);
}

export function generateBrief(
  items,
  events,
  start,
  end,
  { orders = [], now = Date.now() } = {},
) {
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
          e.modelReview ||
          !e.location,
      };
    });
  // 与上一个等长时段对比
  const span = end - start;
  const before = items.filter((i) => i.time >= start - span && i.time < start);
  const beforeEvents = new Set(before.map((i) => i.event));
  const previous = {
    start: start - span,
    end: start,
    reports: new Set(before.map((i) => i.reportId)).size,
    events: beforeEvents.size,
    urgent: events.filter((e) => beforeEvents.has(e.id) && e.urgency === '紧急')
      .length,
  };
  const hotspots = new Map(),
    types = new Map();
  for (const e of selected) {
    const area = areaOf(e.location);
    if (area) {
      const h = hotspots.get(area) || { area, events: 0, reports: 0, ids: [] };
      h.events++;
      h.reports += e.reportIds.length;
      h.ids.push(e.id);
      hotspots.set(area, h);
    }
    const t = types.get(e.type) || { type: e.type, events: 0, reports: 0 };
    t.events++;
    t.reports += e.reportIds.length;
    types.set(e.type, t);
  }
  // 超时督办：所有在办事件，按截至生成时的等待时长判断
  const firstSeen = new Map();
  for (const i of items)
    firstSeen.set(i.event, Math.min(firstSeen.get(i.event) ?? i.time, i.time));
  const orderOf = new Map(orders.map((o) => [o.event, o]));
  const overdue = events
    .filter((e) => e.status !== '已办结')
    .flatMap((e) => {
      const order = orderOf.get(e.id);
      const stage = order ? '未办结' : '未派单';
      const since = order ? order.time : firstSeen.get(e.id);
      const limit =
        config.sla[order ? 'closeHours' : 'dispatchHours'][e.urgency];
      const hours = Math.floor((now - since) / HOUR);
      return since != null && now - since > limit * HOUR
        ? [
            {
              id: e.id,
              type: e.type,
              location: e.location,
              urgency: e.urgency,
              department: e.department,
              stage,
              hours,
              limit,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        levels.indexOf(b.urgency) - levels.indexOf(a.urgency) ||
        b.hours - a.hours,
    )
    .slice(0, 20);
  const urgentEvents = selected
    .filter((e) => e.urgency === '紧急')
    .map((e) => {
      const lines = items
        .filter((i) => i.event === e.id)
        .flatMap((i) => i.reason.split('\n'));
      const risky = [...new Set(lines.filter((l) => DANGER.test(l)))];
      return {
        id: e.id,
        type: e.type,
        location: e.location,
        department: e.department,
        status: e.status,
        basis: risky.length ? risky.slice(0, 2) : lines.slice(0, 1),
        advice: ruleOf(e.type)?.advice || '请尽快核实现场情况并派单',
      };
    });
  const body = {
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
    urgent: urgentEvents.length,
    review: selected.filter((e) => e.review).length,
    previous,
    hotspots: top(hotspots),
    types: top(types),
    overdue,
    urgentEvents,
    generatedAt: now,
  };
  body.summary = { text: briefText(body), method: '规则模板' };
  return body;
}

export function briefText(b) {
  const out = [];
  const diff = b.reports - b.previous.reports;
  out.push(
    `本期共收到 ${b.reports} 条上报，归并为 ${b.events.length} 个独立事件，其中补充线索 ${b.supplements} 条` +
      (b.previous.reports
        ? `；上报量较上期 ${b.previous.reports} 条` +
          (diff > 0 ? `增加 ${diff} 条` : diff < 0 ? `减少 ${-diff} 条` : '持平')
        : '；上期无上报') +
      '。',
  );
  out.push(
    b.urgentEvents.length
      ? `紧急事件 ${b.urgentEvents.length} 件：` +
          b.urgentEvents
            .map(
              (e) =>
                `E-${e.id} ${e.type}（${e.location || '位置待核实'}，${e.status}），建议${e.advice}`,
            )
            .join('；') +
          '。'
      : '本期无紧急事件。',
  );
  const hot = b.hotspots.filter((h) => h.events >= 2);
  out.push(
    hot.length
      ? '高发地点：' +
          hot.map((h) => `${h.area} ${h.events} 件`).join('、') +
          '，建议安排集中排查。'
      : '暂无同一地点多发的问题。',
  );
  if (b.types.length)
    out.push(
      '主要问题类型：' +
        b.types
          .slice(0, 3)
          .map((t) => `${t.type} ${t.events} 件`)
          .join('、') +
        '。',
    );
  const waiting = b.overdue.filter((o) => o.stage === '未派单').length;
  out.push(
    b.overdue.length
      ? `截至生成时，超时未派单 ${waiting} 件、超时未办结 ${b.overdue.length - waiting} 件，请优先督办。`
      : '截至生成时，无超时未派单或未办结的事件。',
  );
  if (b.review) out.push(`另有 ${b.review} 件需人工复核。`);
  return out.join('');
}

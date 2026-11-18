const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fmt = (n) => new Date(n).toLocaleString('zh-CN', { hour12: false });
const needs = (e) =>
  e.photoReview ||
  !e.location ||
  e.type === '待识别问题' ||
  e.department === '待复核' ||
  e.candidates.length > 0;
const pill = (s) =>
  '<span class="pill ' +
  (s === '紧急' ? 'urgent' : '') +
  '">' +
  esc(s) +
  '</span>';
let key = sessionStorage.getItem('operator') || '',
  state = null,
  current = 0,
  detail = null,
  view = 'events',
  version = 0,
  photoURLs = [];
function say(msg) {
  $('msg').textContent = msg;
}
function clearPhotos() {
  photoURLs.forEach(URL.revokeObjectURL);
  photoURLs = [];
}
async function api(path, body) {
  const res = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json();
  if (!res.ok) throw Error(out.error || '请求失败');
  return out;
}
function visibleRows() {
  const filter = $('filter').value;
  return state.events.filter(
    (e) =>
      filter === '全部事件' ||
      (filter === '待复核' && needs(e)) ||
      e.urgency === filter ||
      e.status === filter,
  );
}
function renderOverview() {
  $('metrics').innerHTML = [
    ['原始线索', state.reports],
    ['独立事件', state.events.length],
    [
      '在办紧急事件',
      state.events.filter((e) => e.urgency === '紧急' && e.status !== '已办结')
        .length,
    ],
    ['待确认派单', state.events.filter((e) => e.status === '待确认').length],
  ]
    .map(
      ([label, n]) =>
        '<div class="panel metric"><small>' +
        label +
        '</small><b>' +
        n +
        '</b></div>',
    )
    .join('');
  const urgent = state.events.filter(
    (e) => e.urgency === '紧急' && e.status === '待确认',
  );
  $('alerts').innerHTML =
    state.pending
      .map(
        (e) =>
          '<div class="alert">紧急线索正在解析图片 · ' +
          esc(e.location || e.text) +
          '</div>',
      )
      .join('') +
    (urgent.length
      ? '<div class="alert">紧急待处理　' +
        urgent
          .map(
            (e) =>
              '<button class="linkbtn" data-open="' +
              e.id +
              '">E-' +
              e.id +
              ' ' +
              esc(e.type) +
              '</button>',
          )
          .join('　') +
        '</div>'
      : '');
  $('events').innerHTML =
    visibleRows()
      .map(
        (e) =>
          '<button class="event ' +
          (current === e.id ? 'active' : '') +
          '" data-open="' +
          e.id +
          '"><small>E-' +
          e.id +
          ' · ' +
          esc(e.department) +
          ' · ' +
          esc(e.status) +
          '</small><strong>' +
          esc(e.type) +
          ' ' +
          pill(e.urgency) +
          '</strong><small>' +
          esc(e.location || '位置待核实') +
          ' · ' +
          e.count +
          ' 条线索' +
          (needs(e) ? ' · 待复核' : '') +
          '</small></button>',
      )
      .join('') || '<p class="empty">当前队列没有事件。</p>';
}
function options(choices, selected) {
  return choices
    .map(
      (v) =>
        '<option ' +
        (v === selected ? 'selected' : '') +
        '>' +
        esc(v) +
        '</option>',
    )
    .join('');
}
async function openEvent(id) {
  const stamp = ++version;
  clearPhotos();
  current = id;
  renderOverview();
  if (!id) {
    detail = null;
    $('detail').innerHTML =
      '<h2>事件详情</h2><p class="empty">收到上报后，可在这里查看判断依据并确认派单。</p>';
    return;
  }
  const e = await api('events/' + id);
  if (stamp !== version) return;
  detail = e;
  current = e.id;
  const active = e.status !== '已办结';
  const review =
    '<details ' +
    (needs(e) ? 'open' : '') +
    '><summary>人工复核</summary><form id="review"><div class="twocol"><div><label for="dept">主责部门</label><select id="dept" required><option value="">请选择</option>' +
    options(state.departments, e.department) +
    '</select></div><div><label for="level">紧急等级</label><select id="level">' +
    options(['一般', '较急', '紧急'], e.urgency) +
    '</select></div></div><label for="place">确认位置</label><input id="place" maxlength="150" required value="' +
    esc(e.location) +
    '"><div class="actions"><button class="secondary">确认现场证据及事件独立性</button></div></form></details>';
  const candidates = e.candidates
    .map(
      (id) =>
        '<div class="wrap"><span>疑似与 E-' +
        id +
        ' 重复</span><button class="linkbtn" data-open="' +
        id +
        '">查看候选</button><button class="quiet" data-action="merge" data-target="' +
        id +
        '">合并至 E-' +
        id +
        '</button></div>',
    )
    .join('');
  $('detail').innerHTML =
    '<div class="sectionhead"><div><small>事件 E-' +
    e.id +
    ' · ' +
    esc(e.status) +
    '</small><h2>' +
    esc(e.type) +
    '</h2></div>' +
    pill(e.urgency) +
    '</div><div class="detailmeta">' +
    esc(e.location || '位置待核实') +
    ' · ' +
    esc(e.department) +
    (e.asset ? ' · ' + esc(e.asset) : '') +
    '</div>' +
    (e.previous
      ? '<p>同一设施曾办结 <button data-open="' +
        e.previous +
        '" class="linkbtn">E-' +
        e.previous +
        '</button></p>'
      : '') +
    '<h3>原始线索与判断依据</h3>' +
    e.items
      .map(
        (i) =>
          '<article class="item"><small>线索 #' +
          i.reportId +
          ' · ' +
          fmt(i.time) +
          '</small><p>' +
          esc(i.text || '仅上传照片') +
          '</p><small>' +
          esc(i.route) +
          '</small><p class="muted">' +
          esc(i.reason) +
          '</p>' +
          (i.mime
            ? '<details><summary>查看现场照片</summary><img class="evidence-img" data-photo="' +
              i.reportId +
              '" alt="线索现场原图"><p>' +
              esc(i.evidence.status) +
              '</p><p>' +
              esc(i.evidence.text) +
              '</p></details>'
            : '') +
          (active && e.items.length > 1
            ? '<button class="linkbtn" data-action="split" data-item="' +
              i.id +
              '">拆分为独立事件</button>'
            : '') +
          '</article>',
      )
      .join('') +
    (active
      ? candidates +
        review.replace(
          '<form id="review">',
          '<form id="review"><label for="issueType">问题类型</label><select id="issueType" required><option value="">请选择</option>' +
            options(state.types, e.type) +
            '</select>',
        )
      : '') +
    (e.order
      ? '<p>主工单 #' +
        e.order.id +
        ' · ' +
        esc(e.order.department) +
        ' · ' +
        fmt(e.order.time) +
        '</p>'
      : '') +
    (active
      ? '<div class="actions">' +
        (e.order
          ? '<button class="primary" data-action="close">确认修复并办结</button>'
          : '<button class="primary" data-action="dispatch">确认派单</button>') +
        '</div>'
      : '') +
    '<details class="log"><summary>操作记录</summary>' +
    e.log
      .map((l) => '<p>' + fmt(l.time) + '　' + esc(l.action) + '</p>')
      .join('') +
    '</details>';
  for (const img of $('detail').querySelectorAll('[data-photo]')) {
    const res = await fetch('/api/photos/' + img.dataset.photo, {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (!res.ok) continue;
    const blob = await res.blob();
    if (stamp !== version) return;
    const url = URL.createObjectURL(blob);
    photoURLs.push(url);
    img.src = url;
  }
}
function renderInbox() {
  $('inbox').innerHTML =
    state.inbox
      .map(
        (b) =>
          '<article class="panel brief"><small>简报 #' +
          b.id +
          ' · 入箱于 ' +
          fmt(b.time) +
          '</small><h2>公共设施研判简报</h2><p>' +
          fmt(b.start) +
          ' 至 ' +
          fmt(b.end) +
          '</p><p><strong>' +
          b.reports +
          ' 条上报 · ' +
          b.events.length +
          ' 个事件 · ' +
          b.supplements +
          ' 条补充事项</strong></p><p>紧急事件 ' +
          b.urgent +
          ' 个，待复核 ' +
          b.review +
          ' 个。</p><p>' +
          Object.entries(b.departments)
            .map(([d, n]) => esc(d) + ' ' + n)
            .join('　') +
          '</p>' +
          b.events
            .map(
              (e) =>
                '<div class="item"><button class="linkbtn" data-open="' +
                e.id +
                '">E-' +
                e.id +
                ' ' +
                esc(e.type) +
                '</button> ' +
                pill(e.urgency) +
                '<p>' +
                esc(e.location || '位置待核实') +
                ' · ' +
                esc(e.department) +
                ' · ' +
                esc(e.status) +
                '</p><small>时段内线索 ' +
                e.reportIds.map((id) => '#' + id).join('、') +
                '</small></div>',
            )
            .join('') +
          '</article>',
      )
      .join('') ||
    '<div class="panel brief empty">收件箱暂无简报。请选择统计时段生成首份简报。</div>';
}
function tab(which) {
  view = which;
  $('eventView').hidden = which !== 'events';
  $('briefView').hidden = which !== 'brief';
  $('showEvents').setAttribute('aria-pressed', which === 'events');
  $('showInbox').setAttribute('aria-pressed', which === 'brief');
}
async function refresh(initial = false) {
  const session = key;
  const result = await api('state');
  if (!key || session !== key) return;
  state = result;
  $('work').hidden = false;
  $('login').hidden = true;
  renderOverview();
  renderInbox();
  if (initial || (!current && state.events.length))
    await openEvent(visibleRows()[0]?.id || 0);
}
$('login').onsubmit = async (ev) => {
  ev.preventDefault();
  key = $('key').value.trim();
  try {
    await refresh(true);
    sessionStorage.setItem('operator', key);
    $('key').value = '';
    say('');
  } catch (err) {
    key = '';
    say(err.message);
  }
};
$('logout').onclick = () => {
  version++;
  clearPhotos();
  key = '';
  sessionStorage.removeItem('operator');
  location.reload();
};
$('filter').onchange = () =>
  openEvent(visibleRows()[0]?.id || 0).catch((e) => say(e.message));
$('showEvents').onclick = () => tab('events');
$('showInbox').onclick = () => tab('brief');
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-open],button[data-action]');
  if (!btn) return;
  btn.disabled = true;
  try {
    if (btn.dataset.open) {
      tab('events');
      $('filter').value = '全部事件';
      await openEvent(Number(btn.dataset.open));
      say('');
      return;
    }
    const action = btn.dataset.action;
    if (
      action === 'merge' &&
      !confirm('确认将此事件的全部线索合并到所选事件？')
    )
      return;
    if (action === 'close' && !confirm('确认设施已修复并办结？')) return;
    const out = await api('events/' + current + '/' + action, {
      department: detail.department,
      item: Number(btn.dataset.item),
      target: Number(btn.dataset.target),
    });
    await refresh();
    await openEvent(
      action === 'merge' || action === 'split' ? out.id : current,
    );
    say(action === 'dispatch' ? '派单成功，主工单 #' + out.id : '操作已保存');
  } catch (error) {
    say(error.message);
  } finally {
    btn.disabled = false;
  }
});
$('detail').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  try {
    await api('events/' + current + '/review', {
      department: $('dept').value,
      location: $('place').value,
      urgency: $('level').value,
      type: $('issueType').value,
    });
    await refresh();
    await openEvent(current);
    say('复核结果已保存');
  } catch (error) {
    say(error.message);
  }
});
$('briefForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const btn = ev.submitter;
  btn.disabled = true;
  try {
    await api('briefs', {
      start: +new Date($('start').value),
      end: +new Date($('end').value),
    });
    await refresh();
    say('简报已提交后台收件箱');
  } catch (error) {
    say(error.message);
  } finally {
    btn.disabled = false;
  }
};
function localInput(d) {
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
const today = new Date();
today.setHours(0, 0, 0, 0);
$('start').value = localInput(today);
today.setDate(today.getDate() + 1);
$('end').value = localInput(today);
if (key)
  refresh(true).catch((err) => {
    sessionStorage.removeItem('operator');
    key = '';
    say(err.message);
  });
setInterval(() => {
  if (key && state && !document.hidden)
    refresh().catch((err) => say(err.message));
}, 5000);

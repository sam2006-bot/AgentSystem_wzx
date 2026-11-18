import { ErrorSummary, initAll } from '/vendor/govuk/govuk-frontend.min.js';

initAll();
const $ = (id) => document.getElementById(id);
const app = $('app');
const SERVICE = '设施研判工作台 - 城市设施服务站';
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const fmt = (n) => new Date(n).toLocaleString('zh-CN', { hour12: false });
const percent = (n) => Math.round(n * 100) + '%';
const hours = (h) => (h >= 48 ? Math.floor(h / 24) + ' 天' : h + ' 小时');
const FILTERS = ['全部事件', '紧急', '待复核', '待确认', '已派单', '已办结'];
const LEVELS = ['一般', '较急', '紧急'];
const FIELD_NAMES = { type: '问题类型', location: '位置', urgency: '紧急程度' };

// ── 组件片段（GOV.UK Frontend / MOJ Frontend 的标准标记）─────────────────
// MOJ alert 组件自带的图标
const ICONS = {
  success:
    '<path d="M11.2869 24.6726L2.00415 15.3899L4.62189 12.7722L11.2869 19.4186L25.3781 5.32739L27.9958 7.96369L11.2869 24.6726Z" fill="currentColor"/>',
  warning:
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M15 2.44922L28.75 26.1992H1.25L15 2.44922ZM13.5107 9.49579H16.4697L16.2431 17.7678H13.7461L13.5107 9.49579ZM13.1299 21.82C13.1299 21.5661 13.1787 21.3285 13.2764 21.1071C13.374 20.8793 13.5075 20.6807 13.6768 20.5114C13.8525 20.3421 14.0544 20.2087 14.2822 20.111C14.5101 20.0134 14.7542 19.9645 15.0146 19.9645C15.2686 19.9645 15.5062 20.0134 15.7275 20.111C15.9554 20.2087 16.154 20.3421 16.3232 20.5114C16.4925 20.6807 16.626 20.8793 16.7236 21.1071C16.8213 21.3285 16.8701 21.5661 16.8701 21.82C16.8701 22.0804 16.8213 22.3246 16.7236 22.5524C16.626 22.7803 16.4925 22.9789 16.3232 23.1481C16.154 23.3174 15.9554 23.4509 15.7275 23.5485C15.5062 23.6462 15.2686 23.695 15.0146 23.695C14.7542 23.695 14.5101 23.6462 14.2822 23.5485C14.0544 23.4509 13.8525 23.3174 13.6768 23.1481C13.5075 22.9789 13.374 22.7803 13.2764 22.5524C13.1787 22.3246 13.1299 22.0804 13.1299 21.82Z" fill="currentColor"/>',
  error:
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M20.1777 2.5H9.82233L2.5 9.82233V20.1777L9.82233 27.5H20.1777L27.5 20.1777V9.82233L20.1777 2.5ZM10.9155 8.87769L15.0001 12.9623L19.0847 8.87771L21.1224 10.9154L17.0378 15L21.1224 19.0846L19.0847 21.1222L15.0001 17.0376L10.9155 21.1223L8.87782 19.0846L12.9624 15L8.87783 10.9153L10.9155 8.87769Z" fill="currentColor"/>',
  information:
    '<path fill-rule="evenodd" clip-rule="evenodd" d="M10.2165 3.45151C11.733 2.82332 13.3585 2.5 15 2.5C16.6415 2.5 18.267 2.82332 19.7835 3.45151C21.3001 4.07969 22.6781 5.00043 23.8388 6.16117C24.9996 7.3219 25.9203 8.69989 26.5485 10.2165C27.1767 11.733 27.5 13.3585 27.5 15C27.5 18.3152 26.183 21.4946 23.8388 23.8388C21.4946 26.183 18.3152 27.5 15 27.5C13.3585 27.5 11.733 27.1767 10.2165 26.5485C8.69989 25.9203 7.3219 24.9996 6.16117 23.8388C3.81696 21.4946 2.5 18.3152 2.5 15C2.5 11.6848 3.81696 8.50537 6.16117 6.16117C7.3219 5.00043 8.69989 4.07969 10.2165 3.45151ZM16.3574 22.4121H13.6621V12.95H16.3574V22.4121ZM13.3789 9.20898C13.3789 8.98763 13.4212 8.7793 13.5059 8.58398C13.5905 8.38216 13.7044 8.20964 13.8477 8.06641C13.9974 7.91667 14.1699 7.79948 14.3652 7.71484C14.5605 7.63021 14.7721 7.58789 15 7.58789C15.2214 7.58789 15.4297 7.63021 15.625 7.71484C15.8268 7.79948 15.9993 7.91667 16.1426 8.06641C16.2923 8.20964 16.4095 8.38216 16.4941 8.58398C16.5788 8.7793 16.6211 8.98763 16.6211 9.20898C16.6211 9.43685 16.5788 9.64844 16.4941 9.84375C16.4095 10.0391 16.2923 10.2116 16.1426 10.3613C15.9993 10.5046 15.8268 10.6185 15.625 10.7031C15.4297 10.7878 15.2214 10.8301 15 10.8301C14.7721 10.8301 14.5605 10.7878 14.3652 10.7031C14.1699 10.6185 13.9974 10.5046 13.8477 10.3613C13.7044 10.2116 13.5905 10.0391 13.5059 9.84375C13.4212 9.64844 13.3789 9.43685 13.3789 9.20898Z" fill="currentColor"/>',
};
const ALERT_LABEL = {
  information: '提示',
  success: '成功',
  warning: '注意',
  error: '错误',
};
function alertBox(variant, title, html = '', role = 'region') {
  return (
    '<div class="moj-alert moj-alert--' +
    variant +
    (html ? ' moj-alert--with-heading' : '') +
    '" role="' +
    role +
    '" aria-label="' +
    ALERT_LABEL[variant] +
    '：' +
    esc(title) +
    '"><div><svg class="moj-alert__icon" role="presentation" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30" height="30" width="30">' +
    ICONS[variant] +
    '</svg></div><div class="moj-alert__content">' +
    (html
      ? '<h2 class="moj-alert__heading">' + esc(title) + '</h2>' + html
      : esc(title)) +
    '</div></div>'
  );
}
const STATUS_TAG = {
  待确认: 'govuk-tag--yellow',
  已派单: '',
  已办结: 'govuk-tag--green',
};
const statusTag = (s) =>
  '<strong class="govuk-tag ' +
  (STATUS_TAG[s] ?? 'govuk-tag--grey') +
  '">' +
  esc(s) +
  '</strong>';
const reviewTag = '<strong class="govuk-tag govuk-tag--orange">待复核</strong>';
const urgentBadge = (u) =>
  u === '紧急' ? ' <strong class="moj-badge moj-badge--red">紧急</strong>' : '';
const urgencyValue = (u) => (u === '紧急' ? urgentBadge(u).trim() : esc(u));
const eventLink = (id, label = 'E-' + id) =>
  '<a class="govuk-link" href="#/events/' + id + '">' + esc(label) + '</a>';
const back = (href, text) =>
  '<a href="' + href + '" class="govuk-back-link">' + text + '</a>';
const heading = (text, caption = '') =>
  (caption ? '<span class="govuk-caption-l">' + esc(caption) + '</span>' : '') +
  '<h1 class="govuk-heading-l app-focus-target" tabindex="-1">' +
  esc(text) +
  '</h1>';
function summaryList(rows) {
  return (
    '<dl class="govuk-summary-list">' +
    rows
      .map(
        ([k, v]) =>
          '<div class="govuk-summary-list__row"><dt class="govuk-summary-list__key">' +
          k +
          '</dt><dd class="govuk-summary-list__value">' +
          v +
          '</dd></div>',
      )
      .join('') +
    '</dl>'
  );
}
// head：[{ text, numeric? }]；rows：单元格 HTML 数组，首列为行标题
// 列数较多（≥ 6 列）的表格在窄屏上保持最小宽度，横向滚动查看
function table(caption, head, rows, hideCaption = true) {
  const numeric = head.map((h) => h.numeric);
  return (
    '<div class="app-table-wrap"><table class="govuk-table app-table' +
    (head.length >= 6 ? ' app-table--wide' : '') +
    '"><caption class="govuk-table__caption govuk-table__caption--s' +
    (hideCaption ? ' govuk-visually-hidden' : '') +
    '">' +
    esc(caption) +
    '</caption><thead class="govuk-table__head"><tr class="govuk-table__row">' +
    head
      .map(
        (h) =>
          '<th scope="col" class="govuk-table__header' +
          (h.numeric ? ' govuk-table__header--numeric' : '') +
          '">' +
          esc(h.text) +
          '</th>',
      )
      .join('') +
    '</tr></thead><tbody class="govuk-table__body">' +
    rows
      .map(
        (cells) =>
          '<tr class="govuk-table__row">' +
          cells
            .map((c, i) =>
              i === 0
                ? '<th scope="row" class="govuk-table__header app-nowrap">' +
                  c +
                  '</th>'
                : '<td class="govuk-table__cell' +
                  (numeric[i] ? ' govuk-table__cell--numeric' : '') +
                  '">' +
                  c +
                  '</td>',
            )
            .join('') +
          '</tr>',
      )
      .join('') +
    '</tbody></table></div>'
  );
}
function details(summary, html, key, open) {
  return (
    '<details class="govuk-details" data-key="' +
    key +
    '"' +
    (open?.has(key) ? ' open' : '') +
    '><summary class="govuk-details__summary"><span class="govuk-details__summary-text">' +
    esc(summary) +
    '</span></summary><div class="govuk-details__text">' +
    html +
    '</div></details>'
  );
}
// 各 Agent 的判断过程：结论、方法、置信度和依据
function trace(steps, key, open) {
  if (!steps?.length) return '';
  return details(
    '研判过程',
    '<ol class="govuk-list govuk-list--number app-trace">' +
      steps
        .map(
          (s) =>
            '<li><strong>' +
            esc(s.agent) +
            '</strong>：' +
            esc(s.summary) +
            '<br><span class="govuk-hint govuk-!-font-size-16">' +
            esc(s.method) +
            ' · 置信度 ' +
            percent(s.confidence) +
            (s.ms ? ' · 耗时 ' + s.ms + ' ms' : '') +
            '</span><ul class="govuk-list govuk-list--bullet govuk-!-font-size-16">' +
            s.evidence.map((x) => '<li>' + esc(x) + '</li>').join('') +
            '</ul></li>',
        )
        .join('') +
      '</ol>',
    key,
    open,
  );
}
function errorSummary(errors) {
  return (
    '<div class="govuk-error-summary" data-module="govuk-error-summary"><div role="alert"><h2 class="govuk-error-summary__title">请先修改以下问题</h2><div class="govuk-error-summary__body"><ul class="govuk-list govuk-error-summary__list">' +
    errors
      .map(
        (e) =>
          '<li>' +
          (e.field
            ? '<a href="#' + e.field + '">' + esc(e.text) + '</a>'
            : esc(e.text)) +
          '</li>',
      )
      .join('') +
    '</ul></div></div></div>'
  );
}
// 表单字段：control 为输入控件 HTML，error 为该字段的错误说明
function formGroup(id, label, control, error, hint = '') {
  return (
    '<div class="govuk-form-group' +
    (error ? ' govuk-form-group--error' : '') +
    '"><label class="govuk-label govuk-label--s" for="' +
    id +
    '">' +
    label +
    '</label>' +
    (hint ? '<div id="' + id + '-hint" class="govuk-hint">' + hint + '</div>' : '') +
    (error
      ? '<p id="' +
        id +
        '-error" class="govuk-error-message"><span class="govuk-visually-hidden">错误：</span>' +
        esc(error) +
        '</p>'
      : '') +
    control +
    '</div>'
  );
}
const describedBy = (id, hint, error) => {
  const ids = [hint && id + '-hint', error && id + '-error'].filter(Boolean);
  return ids.length ? ' aria-describedby="' + ids.join(' ') + '"' : '';
};
function select(id, choices, selected, error, placeholder = true) {
  return (
    '<select class="govuk-select' +
    (error ? ' govuk-select--error' : '') +
    '" id="' +
    id +
    '" name="' +
    id +
    '"' +
    describedBy(id, false, error) +
    '>' +
    (placeholder ? '<option value="">请选择</option>' : '') +
    choices
      .map(
        (v) =>
          '<option' +
          (v === selected ? ' selected' : '') +
          '>' +
          esc(v) +
          '</option>',
      )
      .join('') +
    '</select>'
  );
}
function focusSummary() {
  const summary = app.querySelector('.govuk-error-summary');
  if (summary) new ErrorSummary(summary);
}

// ── 状态与接口 ──────────────────────────────────────────────────────────
let key = sessionStorage.getItem('operator') || '',
  state = null,
  filter = FILTERS[0],
  flash = null,
  token = 0,
  photoURLs = [],
  shownEvent = null,
  shownBrief = '';
async function api(path, body) {
  const res = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + key,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = Error(out.error || '请求失败，请重试');
    error.status = res.status;
    throw error;
  }
  return out;
}
function clearPhotos() {
  photoURLs.forEach(URL.revokeObjectURL);
  photoURLs = [];
}
function reviewReasons(e) {
  return [
    e.photoReview && '现场照片未能确认故障，请核对原图',
    e.modelReview &&
      '问题类型、位置或紧急程度含模型推断，请核对',
    !e.location && '位置待核实',
    e.type === '待识别问题' && '问题类型未能识别',
    e.department === '待复核' && '主责部门待核实',
    e.candidates.length > 0 && '存在疑似重复事件',
  ].filter(Boolean);
}
const needs = (e) => reviewReasons(e).length > 0;
function visibleEvents() {
  return state.events.filter(
    (e) =>
      filter === '全部事件' ||
      (filter === '待复核' && needs(e)) ||
      e.urgency === filter ||
      e.status === filter,
  );
}
function takeFlash() {
  const f = flash;
  flash = null;
  return f
    ? alertBox(f.variant, f.text, '', f.variant === 'error' ? 'alert' : 'status')
    : '';
}
function showError(error) {
  const host = $('flash');
  if (!host) return;
  host.innerHTML = alertBox('error', error.message, '', 'alert');
  host.scrollIntoView({ block: 'nearest' });
}

// ── 路由 ────────────────────────────────────────────────────────────────
function route() {
  const hash = location.hash.replace(/^#/, '') || '/';
  let m;
  if ((m = hash.match(/^\/events\/(\d+)$/))) return { view: 'event', id: +m[1] };
  if ((m = hash.match(/^\/briefs\/(\d+)$/))) return { view: 'brief', id: +m[1] };
  if (hash === '/briefs') return { view: 'briefs' };
  return { view: 'queue' };
}
function setNav(view) {
  $('nav').hidden = !state;
  const section = view === 'brief' || view === 'briefs' ? 'briefs' : 'queue';
  for (const link of document.querySelectorAll('[data-nav]')) {
    const current = link.dataset.nav === section;
    link.parentElement.classList.toggle(
      'govuk-service-navigation__item--active',
      current,
    );
    if (current)
      link.setAttribute(
        'aria-current',
        view === 'queue' || view === 'briefs' ? 'page' : 'true',
      );
    else link.removeAttribute('aria-current');
    link.innerHTML = current
      ? '<strong class="govuk-service-navigation__active-fallback">' +
        link.dataset.label +
        '</strong>'
      : link.dataset.label;
  }
}
async function show(moveFocus = false) {
  const stamp = ++token;
  clearPhotos();
  shownEvent = null;
  const r = route();
  setNav(r.view);
  if (!state) return renderLogin();
  if (r.view === 'event') await renderEvent(r.id, stamp);
  else if (r.view === 'briefs') renderBriefs();
  else if (r.view === 'brief') renderBrief(r.id);
  else renderQueue();
  if (moveFocus && stamp === token)
    app.querySelector('.app-focus-target')?.focus({ preventScroll: true });
}
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  show(true).catch(showError);
});

// ── 登录 ────────────────────────────────────────────────────────────────
function renderLogin(error = '') {
  document.title = (error ? '错误：' : '') + '登录 - ' + SERVICE;
  const hint =
    '口令保存在项目的 data/admin-key.txt 中。如果启动服务时设置了 ADMIN_KEY，请使用该值。';
  app.innerHTML =
    '<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds">' +
    (error ? errorSummary([{ field: 'key', text: error }]) : '') +
    heading('登录设施研判工作台') +
    '<form id="login" novalidate>' +
    formGroup(
      'key',
      '管理员口令',
      '<input class="govuk-input govuk-input--width-20' +
        (error ? ' govuk-input--error' : '') +
        '" id="key" name="key" type="password" autocomplete="current-password" spellcheck="false"' +
        describedBy('key', true, error) +
        '>',
      error,
      hint,
    ) +
    '<button type="submit" class="govuk-button">登录</button></form></div></div>';
  focusSummary();
  $('login').onsubmit = async (ev) => {
    ev.preventDefault();
    const value = $('key').value.trim();
    if (!value) return renderLogin('请输入管理员口令');
    key = value;
    try {
      state = await api('state');
      sessionStorage.setItem('operator', key);
      await show(true);
    } catch (err) {
      key = '';
      state = null;
      renderLogin(err.status === 401 ? '口令不正确，请重新输入' : err.message);
    }
  };
}
$('logout').onclick = () => {
  sessionStorage.removeItem('operator');
  location.replace('/admin');
};

// ── 事件队列 ────────────────────────────────────────────────────────────
function renderQueue() {
  document.title = '事件队列 - ' + SERVICE;
  app.innerHTML =
    '<div id="flash">' +
    takeFlash() +
    '</div>' +
    heading('事件队列') +
    '<div id="alerts"></div><p class="govuk-body" id="counts"></p>' +
    '<div class="govuk-form-group app-filter"><label class="govuk-label" for="filter">显示</label>' +
    select('filter', FILTERS, filter, '', false) +
    '<span class="govuk-hint govuk-!-margin-bottom-0" id="shown"></span></div><div id="rows"></div>';
  $('filter').onchange = (ev) => {
    filter = ev.target.value;
    updateQueue();
  };
  updateQueue();
}
function updateQueue() {
  const events = state.events;
  const urgentOpen = events.filter(
    (e) => e.urgency === '紧急' && e.status !== '已办结',
  );
  const urgentWaiting = urgentOpen.filter((e) => e.status === '待确认');
  $('alerts').innerHTML =
    (state.pending.length
      ? alertBox(
          'information',
          '正在解析 ' + state.pending.length + ' 条紧急线索的现场照片',
          '<p class="govuk-body">解析完成后会出现在队列中：' +
            state.pending
              .map((p) => esc((p.location || p.text).slice(0, 40)))
              .join('；') +
            '</p>',
        )
      : '') +
    (urgentWaiting.length
      ? alertBox(
          'warning',
          urgentWaiting.length + ' 个紧急事件等待派单',
          '<ul class="govuk-list">' +
            urgentWaiting
              .map(
                (e) =>
                  '<li>' +
                  eventLink(e.id, 'E-' + e.id + ' ' + e.type) +
                  ' · ' +
                  esc(e.location || '位置待核实') +
                  '</li>',
              )
              .join('') +
            '</ul>',
        )
      : '');
  $('counts').textContent =
    '共收到 ' +
    state.reports +
    ' 条线索，归并为 ' +
    events.length +
    ' 个事件；在办紧急事件 ' +
    urgentOpen.length +
    ' 个，待确认派单 ' +
    events.filter((e) => e.status === '待确认').length +
    ' 个。';
  const rows = visibleEvents();
  $('shown').textContent =
    filter === '全部事件' ? '' : '共 ' + rows.length + ' 个事件';
  $('rows').innerHTML = rows.length
    ? table(
        '事件列表',
        [
          { text: '事件' },
          { text: '问题类型' },
          { text: '位置' },
          { text: '主责部门' },
          { text: '线索', numeric: true },
          { text: '状态' },
          { text: '最近更新' },
        ],
        rows.map((e) => [
          eventLink(e.id),
          esc(e.type) + urgentBadge(e.urgency),
          esc(e.location || '位置待核实'),
          esc(e.department),
          e.count,
          statusTag(e.status) + (needs(e) ? ' ' + reviewTag : ''),
          '<span class="app-nowrap">' + fmt(e.last) + '</span>',
        ]),
      )
    : '<p class="govuk-body">' +
      (events.length
        ? '没有符合筛选条件的事件。'
        : '还没有收到上报。市民提交线索后，事件会出现在这里。') +
      '</p>';
}

// ── 事件详情 ────────────────────────────────────────────────────────────
async function renderEvent(id, stamp) {
  let e;
  try {
    e = await api('events/' + id);
  } catch (error) {
    if (stamp !== token) return;
    document.title = '事件不存在 - ' + SERVICE;
    app.innerHTML =
      back('#/', '返回事件队列') +
      heading('找不到事件 E-' + id) +
      '<p class="govuk-body">' +
      esc(error.message) +
      '</p>';
    return;
  }
  if (stamp !== token) return;
  // 已合并的事件会跳转到保留事件
  if (e.id !== id) history.replaceState(null, '', '#/events/' + e.id);
  shownEvent = e;
  document.title = 'E-' + e.id + ' ' + e.type + ' - ' + SERVICE;
  const active = e.status !== '已办结';
  const reasons = reviewReasons(e);
  app.innerHTML =
    back('#/', '返回事件队列') +
    '<div id="flash">' +
    takeFlash() +
    '</div>' +
    heading(e.type, '事件 E-' + e.id) +
    '<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds">' +
    (active && reasons.length
      ? alertBox(
          'warning',
          '派单前需要人工复核',
          '<ul class="govuk-list govuk-list--bullet">' +
            reasons.map((r) => '<li>' + esc(r) + '</li>').join('') +
            '</ul>',
        )
      : '') +
    summaryList([
      ['状态', statusTag(e.status)],
      ['紧急程度', urgencyValue(e.urgency)],
      ['位置', esc(e.location || '位置待核实')],
      ['主责部门', esc(e.department)],
      ['设施编号', esc(e.asset || '无')],
      ['线索', e.count + ' 条上报'],
      [
        '主工单',
        e.order
          ? '#' +
            e.order.id +
            ' · ' +
            esc(e.order.department) +
            ' · ' +
            fmt(e.order.time)
          : '尚未派单',
      ],
      ...(e.previous
        ? [['同一设施', '此前办结过 ' + eventLink(e.previous)]]
        : []),
    ]) +
    (active ? candidates(e) : '') +
    '<h2 class="govuk-heading-m">原始线索</h2>' +
    e.items.map((i) => itemCard(e, i, active)).join('') +
    // 需要复核时先复核再派单；无需复核时派单在前，复核表单收起备用
    (active
      ? reasons.length
        ? '<div id="reviewSection">' + reviewSection(e) + '</div>' + decision(e, reasons)
        : decision(e, reasons) + '<div id="reviewSection">' + reviewSection(e) + '</div>'
      : '') +
    '</div><div class="govuk-grid-column-one-third"><h2 class="govuk-heading-m">操作记录</h2>' +
    timeline(e.log) +
    '</div></div>';
  for (const img of app.querySelectorAll('[data-photo]')) {
    const res = await fetch('/api/photos/' + img.dataset.photo, {
      headers: { Authorization: 'Bearer ' + key },
    });
    if (stamp !== token) return;
    if (!res.ok) continue;
    const url = URL.createObjectURL(await res.blob());
    if (stamp !== token) return URL.revokeObjectURL(url);
    photoURLs.push(url);
    img.src = url;
  }
}
function candidates(e) {
  if (!e.matches?.length) return '';
  return (
    '<h2 class="govuk-heading-m">疑似重复事件</h2><p class="govuk-body">确认是同一问题的，把本事件合并到对应事件；不是同一问题的，在下方人工复核中保存即可。</p>' +
    table(
      '疑似重复事件',
      [{ text: '事件' }, { text: '相似度', numeric: true }, { text: '依据' }, { text: '操作' }],
      e.matches.map((c) => [
        eventLink(c.id),
        c.score == null ? '—' : percent(c.score),
        esc(c.reasons?.join('、') || '—'),
        '<button type="button" class="govuk-button govuk-button--secondary govuk-!-margin-bottom-0" data-action="merge" data-target="' +
          c.id +
          '">合并到 E-' +
          c.id +
          '</button>',
      ]),
    )
  );
}
function itemCard(e, i, active) {
  const rows = [
    ['市民描述', '<span class="app-pre-line">' + esc(i.text || '仅上传照片') + '</span>'],
    ['归属依据', esc(i.route)],
    ['判断依据', '<span class="app-pre-line">' + esc(i.reason) + '</span>'],
  ];
  if (i.supplement && i.link)
    rows.push([
      '关联方式',
      '自动关联 · 相似度 ' + percent(i.link.score) + '<br>' + esc(i.link.reasons.join('、')),
    ]);
  if (i.geo)
    rows.push([
      '坐标',
      i.geo.lat +
        ', ' +
        i.geo.lng +
        '<br>' +
        esc(i.geo.source) +
        (i.geo.accuracy == null ? '' : ' · 精度约 ' + i.geo.accuracy + ' 米'),
    ]);
  if (i.mime)
    rows.push([
      '现场照片',
      esc(i.evidence.status) +
        (i.evidence.text ? '<br>' + esc(i.evidence.text) : '') +
        details(
          '查看原图',
          '<img class="app-evidence-photo" data-photo="' +
            i.reportId +
            '" alt="线索 #' +
            i.reportId +
            ' 的现场原图">',
          'photo-' + i.id,
        ),
    ]);
  return (
    '<div class="govuk-summary-card"><div class="govuk-summary-card__title-wrapper"><h3 class="govuk-summary-card__title">线索 #' +
    i.reportId +
    ' · ' +
    fmt(i.time) +
    '</h3>' +
    (active && e.items.length > 1
      ? '<ul class="govuk-summary-card__actions"><li class="govuk-summary-card__action"><button type="button" class="app-link-button" data-action="split" data-item="' +
        i.id +
        '">拆分为独立事件<span class="govuk-visually-hidden">（线索 #' +
        i.reportId +
        '）</span></button></li></ul>'
      : '') +
    '</div><div class="govuk-summary-card__content">' +
    summaryList(rows) +
    (i.inferred?.length
      ? '<div class="govuk-warning-text"><span class="govuk-warning-text__icon" aria-hidden="true">!</span><strong class="govuk-warning-text__text"><span class="govuk-visually-hidden">注意</span>' +
        esc(i.inferred.map((f) => FIELD_NAMES[f]).join('、')) +
        '由模型推断，请核对后在人工复核中确认。</strong></div>'
      : '') +
    trace(i.trace, 'trace-' + i.id) +
    '</div></div>'
  );
}
function reviewDefaults(e) {
  return {
    type: e.type === '待识别问题' ? '' : e.type,
    department: state.departments.includes(e.department) ? e.department : '',
    urgency: e.urgency,
    location: e.location,
  };
}
function reviewSection(e, v = reviewDefaults(e), errors = []) {
  const err = Object.fromEntries(errors.map((x) => [x.field, x.text]));
  const form =
    (errors.length ? errorSummary(errors) : '') +
    '<form id="review" novalidate>' +
    formGroup('issueType', '问题类型', select('issueType', state.types, v.type, err.issueType), err.issueType) +
    formGroup('dept', '主责部门', select('dept', state.departments, v.department, err.dept), err.dept) +
    formGroup('level', '紧急程度', select('level', LEVELS, v.urgency, '', false)) +
    formGroup(
      'place',
      '确认位置',
      '<input class="govuk-input' +
        (err.place ? ' govuk-input--error' : '') +
        '" id="place" name="place" type="text" maxlength="150" value="' +
        esc(v.location) +
        '"' +
        describedBy('place', false, err.place) +
        '>',
      err.place,
    ) +
    '<div class="govuk-inset-text">保存后，表示已核对现场证据和模型推断的内容' +
    (e.candidates.length ? '，并确认本事件与疑似重复事件不是同一问题' : '') +
    '。</div><button type="submit" class="govuk-button govuk-button--secondary">保存复核结果</button></form>';
  if (needs(e)) return '<h2 class="govuk-heading-m">人工复核</h2>' + form;
  return details(
    '修改问题类型、主责部门、紧急程度或位置',
    form,
    'review',
    new Set(errors.length ? ['review'] : []),
  );
}
function decision(e, reasons) {
  if (e.order)
    return (
      '<h2 class="govuk-heading-m">办结</h2><p class="govuk-body">主责部门修复设施后，确认办结。</p><button type="button" class="govuk-button" data-action="close">确认已修复并办结</button>'
    );
  if (reasons.length)
    return '<h2 class="govuk-heading-m">派单</h2><p class="govuk-body">完成人工复核后才能派单。</p>';
  return (
    '<h2 class="govuk-heading-m">派单</h2><p class="govuk-body">将生成主工单，派给<strong>' +
    esc(e.department) +
    '</strong>。</p><button type="button" class="govuk-button" data-action="dispatch">确认派单</button>'
  );
}
function timeline(log) {
  if (!log.length) return '<p class="govuk-body">暂无记录。</p>';
  return (
    '<div class="moj-timeline app-timeline">' +
    log
      .map((l) => {
        const [title, ...rest] = l.action.split(' · ');
        return (
          '<div class="moj-timeline__item"><div class="moj-timeline__header"><h3 class="moj-timeline__title">' +
          esc(title) +
          '</h3></div><p class="moj-timeline__date"><time datetime="' +
          new Date(l.time).toISOString() +
          '">' +
          fmt(l.time) +
          '</time></p>' +
          (rest.length
            ? '<div class="moj-timeline__description">' + esc(rest.join(' · ')) + '</div>'
            : '') +
          '</div>'
        );
      })
      .join('') +
    '</div>'
  );
}
const DONE = {
  dispatch: (out) => '已派单，主工单 #' + out.id,
  close: () => '事件已办结',
  merge: (out) => '已合并到 E-' + out.id,
  split: (out) => '已拆分为新事件 E-' + out.id,
};
app.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('button[data-action]');
  const e = shownEvent;
  if (!btn || !e) return;
  const action = btn.dataset.action;
  if (
    action === 'merge' &&
    !confirm('确认将 E-' + e.id + ' 的全部线索合并到 E-' + btn.dataset.target + '？')
  )
    return;
  if (action === 'close' && !confirm('确认设施已修复，并办结 E-' + e.id + '？'))
    return;
  btn.disabled = true;
  try {
    const out = await api('events/' + e.id + '/' + action, {
      department: e.department,
      item: Number(btn.dataset.item),
      target: Number(btn.dataset.target),
    });
    state = await api('state');
    flash = { variant: 'success', text: DONE[action](out) };
    const next = action === 'merge' || action === 'split' ? out.id : e.id;
    if (route().id !== next) location.hash = '#/events/' + next;
    else {
      await show();
      window.scrollTo(0, 0);
    }
  } catch (error) {
    showError(error);
  } finally {
    btn.disabled = false;
  }
});
app.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'review') return;
  ev.preventDefault();
  const e = shownEvent;
  const v = {
    type: $('issueType').value,
    department: $('dept').value,
    urgency: $('level').value,
    location: $('place').value.trim(),
  };
  const errors = [
    !v.type && { field: 'issueType', text: '请选择问题类型' },
    !v.department && { field: 'dept', text: '请选择主责部门' },
    !v.location && { field: 'place', text: '请填写确认后的位置' },
  ].filter(Boolean);
  if (errors.length) {
    $('reviewSection').innerHTML = reviewSection(e, v, errors);
    return focusSummary();
  }
  const btn = ev.submitter;
  if (btn) btn.disabled = true;
  try {
    await api('events/' + e.id + '/review', v);
    state = await api('state');
    flash = { variant: 'success', text: '复核结果已保存' };
    await show();
    window.scrollTo(0, 0);
  } catch (error) {
    $('reviewSection').innerHTML = reviewSection(e, v, [{ text: error.message }]);
    focusSummary();
  }
});

// ── 简报 ────────────────────────────────────────────────────────────────
function localInput(d) {
  return new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function renderBriefs() {
  document.title = '简报收件箱 - ' + SERVICE;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  app.innerHTML =
    '<div id="flash">' +
    takeFlash() +
    '</div>' +
    heading('简报收件箱') +
    '<div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds"><form id="briefForm" novalidate><fieldset class="govuk-fieldset" aria-describedby="brief-hint"><legend class="govuk-fieldset__legend govuk-fieldset__legend--m"><h2 class="govuk-fieldset__heading">生成研判简报</h2></legend><div id="brief-hint" class="govuk-hint">统计时段内的线索和事件，并与上一个等长时段对比。有上报的日期结束后，系统也会自动生成当日日报。</div>' +
    formGroup(
      'start',
      '开始时间',
      '<input class="govuk-input govuk-input--width-20" id="start" name="start" type="datetime-local" value="' +
        localInput(start) +
        '">',
    ) +
    formGroup(
      'end',
      '结束时间',
      '<input class="govuk-input govuk-input--width-20" id="end" name="end" type="datetime-local" value="' +
        localInput(end) +
        '">',
    ) +
    '</fieldset><button type="submit" class="govuk-button">生成简报</button></form></div></div>' +
    '<h2 class="govuk-heading-m">已收简报</h2><div id="briefRows"></div>';
  $('briefForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter;
    btn.disabled = true;
    try {
      const brief = await api('briefs', {
        start: +new Date($('start').value),
        end: +new Date($('end').value),
      });
      state = await api('state');
      flash = { variant: 'success', text: '简报 #' + brief.id + ' 已生成' };
      location.hash = '#/briefs/' + brief.id;
    } catch (error) {
      showError(error);
    } finally {
      btn.disabled = false;
    }
  };
  updateBriefList();
}
function updateBriefList() {
  $('briefRows').innerHTML = state.inbox.length
    ? table(
        '已收简报',
        [
          { text: '简报' },
          { text: '统计时段' },
          { text: '上报', numeric: true },
          { text: '事件', numeric: true },
          { text: '紧急', numeric: true },
          { text: '入箱时间' },
        ],
        state.inbox.map((b) => [
          '<a class="govuk-link" href="#/briefs/' + b.id + '">#' + b.id + '</a>',
          fmt(b.start) + ' 至 ' + fmt(b.end),
          b.reports,
          b.events.length,
          b.urgent,
          '<span class="app-nowrap">' + fmt(b.time) + '</span>',
        ]),
      )
    : '<p class="govuk-body">收件箱暂无简报。</p>';
}
function renderBrief(id) {
  const b = state.inbox.find((x) => x.id === id);
  if (!b) {
    document.title = '简报不存在 - ' + SERVICE;
    app.innerHTML =
      back('#/briefs', '返回简报收件箱') +
      heading('找不到简报 #' + id) +
      '<p class="govuk-body">该简报可能已被删除。</p>';
    return;
  }
  const open = new Set(
    [...app.querySelectorAll('details[open]')].map((d) => d.dataset.key),
  );
  shownBrief = JSON.stringify(b);
  document.title = '简报 #' + b.id + ' - ' + SERVICE;
  app.innerHTML =
    back('#/briefs', '返回简报收件箱') +
    '<div id="flash">' +
    takeFlash() +
    '</div>' +
    heading('公共设施研判简报', '简报 #' + b.id + ' · 入箱于 ' + fmt(b.time)) +
    '<p class="govuk-body-l">' +
    fmt(b.start) +
    ' 至 ' +
    fmt(b.end) +
    '</p><div class="govuk-grid-row"><div class="govuk-grid-column-two-thirds">' +
    summaryList([
      ['上报线索', b.reports + ' 条'],
      ['涉及事件', b.events.length + ' 个'],
      ['补充事项', b.supplements + ' 条'],
      ['紧急事件', b.urgent + ' 个'],
      ['待复核', b.review + ' 个'],
      [
        '部门分布',
        esc(
          Object.entries(b.departments)
            .map(([d, n]) => d + ' ' + n)
            .join('、') || '无',
        ),
      ],
    ]) +
    (b.summary ? analysis(b, open) : '') +
    '</div></div><h2 class="govuk-heading-m">时段内事件</h2>' +
    (b.events.length
      ? table(
          '时段内事件',
          [
            { text: '事件' },
            { text: '问题类型' },
            { text: '位置' },
            { text: '主责部门' },
            { text: '状态' },
            { text: '时段内线索' },
          ],
          b.events.map((e) => [
            eventLink(e.id),
            esc(e.type) + urgentBadge(e.urgency),
            esc(e.location || '位置待核实'),
            esc(e.department),
            statusTag(e.status),
            e.reportIds.map((r) => '#' + r).join('、'),
          ]),
        )
      : '<p class="govuk-body">时段内没有事件。</p>');
}
function analysis(b, open) {
  const diff = (now, before) => {
    const d = now - before;
    return d > 0 ? '+' + d : String(d);
  };
  return (
    '<h2 class="govuk-heading-m">研判摘要</h2><div class="govuk-inset-text"><p class="govuk-body">' +
    esc(b.summary.text) +
    '</p><p class="govuk-hint govuk-!-margin-bottom-0">' +
    esc(b.summary.method) +
    (b.summary.note ? ' · ' + esc(b.summary.note) : '') +
    '</p></div>' +
    table(
      '与上期对比',
      [{ text: '指标' }, { text: '本期', numeric: true }, { text: '上期', numeric: true }, { text: '变化', numeric: true }],
      [
        ['上报线索', b.reports, b.previous.reports, diff(b.reports, b.previous.reports)],
        ['涉及事件', b.events.length, b.previous.events, diff(b.events.length, b.previous.events)],
        ['紧急事件', b.urgent, b.previous.urgent, diff(b.urgent, b.previous.urgent)],
      ],
      false,
    ) +
    (b.hotspots.length
      ? table(
          '地点分布',
          [{ text: '地点' }, { text: '事件', numeric: true }, { text: '上报', numeric: true }],
          b.hotspots.map((h) => [esc(h.area), h.events, h.reports]),
          false,
        )
      : '') +
    (b.types.length
      ? table(
          '问题类型',
          [{ text: '问题类型' }, { text: '事件', numeric: true }],
          b.types.map((t) => [esc(t.type), t.events]),
          false,
        )
      : '') +
    (b.urgentEvents.length
      ? '<h2 class="govuk-heading-m">紧急事项与处置建议</h2>' +
        b.urgentEvents
          .map(
            (e) =>
              '<h3 class="govuk-heading-s">' +
              eventLink(e.id, 'E-' + e.id + ' ' + e.type) +
              '</h3><p class="govuk-body govuk-!-margin-bottom-2">' +
              esc(e.location || '位置待核实') +
              ' · ' +
              esc(e.department) +
              ' · ' +
              esc(e.status) +
              '</p><p class="govuk-hint">' +
              esc(e.basis.join('；')) +
              '</p><p class="govuk-body">建议：' +
              esc(e.advice) +
              '</p>',
          )
          .join('')
      : '') +
    '<h2 class="govuk-heading-m">超时督办</h2><p class="govuk-hint">统计截至简报生成时。</p>' +
    (b.overdue.length
      ? table(
          '超时督办',
          [
            { text: '事件' },
            { text: '环节' },
            { text: '已等待' },
            { text: '时限' },
            { text: '位置' },
            { text: '主责部门' },
          ],
          b.overdue.map((o) => [
            eventLink(o.id, 'E-' + o.id + ' ' + o.type) + urgentBadge(o.urgency),
            esc(o.stage),
            hours(o.hours),
            hours(o.limit),
            esc(o.location || '位置待核实'),
            esc(o.department),
          ]),
        )
      : '<p class="govuk-body">无超时事项。</p>') +
    trace(b.trace, 'trace-' + b.id, open)
  );
}

// ── 启动与轮询 ──────────────────────────────────────────────────────────
async function poll() {
  if (!key || !state || document.hidden) return;
  try {
    state = await api('state');
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem('operator');
      key = '';
      state = null;
      setNav('queue');
      renderLogin('登录已失效，请重新输入口令');
    }
    return;
  }
  const r = route();
  if (r.view === 'queue' && $('rows')) updateQueue();
  else if (r.view === 'briefs' && $('briefRows')) updateBriefList();
  else if (r.view === 'brief') {
    const b = state.inbox.find((x) => x.id === r.id);
    // 配置文本模型时摘要会稍后写入，简报变化时重绘
    if (b && JSON.stringify(b) !== shownBrief) renderBrief(r.id);
  }
}
setInterval(poll, 5000);
if (key)
  api('state')
    .then((s) => {
      state = s;
      return show();
    })
    .catch((error) => {
      sessionStorage.removeItem('operator');
      key = '';
      renderLogin(error.status === 401 ? '登录已失效，请重新输入口令' : error.message);
    });
else show();

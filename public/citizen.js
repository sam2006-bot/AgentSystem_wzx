import { ErrorSummary, initAll } from '/vendor/govuk/govuk-frontend.min.js';

initAll();
const $ = (id) => document.getElementById(id);
// GOV.UK 上传组件初始化后，id="photo" 归属替代按钮，原文件输入框改为 photo-input
const form = $('report'),
  photo = form.querySelector('input[type=file]'),
  status = $('status'),
  title = document.title;
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
let previewURL = '',
  requestId = '';
form.addEventListener('input', () => {
  requestId = '';
});
function preview() {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = '';
  const file = photo.files[0];
  $('preview').hidden = !file;
  if (file) {
    previewURL = URL.createObjectURL(file);
    $('thumb').src = previewURL;
  }
}
photo.addEventListener('change', preview);
$('remove').onclick = () => {
  photo.value = '';
  requestId = '';
  // 通知 GOV.UK 上传组件刷新「未选择照片」状态
  photo.dispatchEvent(new Event('change'));
  $('photo').focus();
};

// 错误提示遵循 GOV.UK 规范：页面顶部列出错误摘要，对应字段旁显示具体原因
const inputClass = {
  description: 'govuk-textarea--error',
  photo: 'govuk-file-upload--error',
};
function clearErrors() {
  $('errors').innerHTML = '';
  document.title = title;
  for (const el of form.querySelectorAll('.govuk-error-message')) el.remove();
  for (const group of form.querySelectorAll('.govuk-form-group--error'))
    group.classList.remove('govuk-form-group--error');
  for (const [id, cls] of Object.entries(inputClass)) {
    const input = $(id);
    input.classList.remove(cls);
    input.setAttribute(
      'aria-describedby',
      input
        .getAttribute('aria-describedby')
        .replace(' ' + id + '-error', ''),
    );
  }
}
// errors：[{ field?, text }]，field 为字段 id
function showErrors(errors) {
  clearErrors();
  for (const { field, text } of errors) {
    if (!field) continue;
    const input = $(field);
    input.closest('.govuk-form-group').classList.add('govuk-form-group--error');
    input.classList.add(inputClass[field]);
    const message = document.createElement('p');
    message.id = field + '-error';
    message.className = 'govuk-error-message';
    message.innerHTML =
      '<span class="govuk-visually-hidden">错误：</span>' + esc(text);
    (input.closest('.govuk-file-upload-wrapper') || input).before(message);
    input.setAttribute(
      'aria-describedby',
      input.getAttribute('aria-describedby') + ' ' + message.id,
    );
  }
  $('errors').innerHTML =
    '<div class="govuk-error-summary" data-module="govuk-error-summary"><div role="alert"><h2 class="govuk-error-summary__title">提交前请修改以下问题</h2><div class="govuk-error-summary__body"><ul class="govuk-list govuk-error-summary__list">' +
    errors
      .map(
        ({ field, text }) =>
          '<li>' +
          (field
            ? '<a href="#' + field + '">' + esc(text) + '</a>'
            : esc(text)) +
          '</li>',
      )
      .join('') +
    '</ul></div></div></div>';
  document.title = '错误：' + title;
  new ErrorSummary($('errors').firstElementChild);
}
function validate(file, text) {
  const errors = [];
  if (!file && !text)
    errors.push({ field: 'description', text: '请描述问题，或上传一张现场照片' });
  if (text.length > 3000)
    errors.push({ field: 'description', text: '问题描述不能超过 3000 字' });
  if (file && !PHOTO_TYPES.includes(file.type))
    errors.push({ field: 'photo', text: '现场照片须为 JPG、PNG 或 WebP 格式' });
  else if (file && file.size > MAX_PHOTO)
    errors.push({ field: 'photo', text: '现场照片不能超过 5 MB' });
  return errors;
}
function asDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error('照片读取失败，请重新选择'));
    r.readAsDataURL(file);
  });
}
// 差值哈希：缩到 9×8 灰度后比较相邻像素。同一张照片重新压缩、缩放后
// 结果基本不变，后台据此识别「换了压缩方式的同一张图」。
async function photoHash(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = 90;
    canvas.height = 80;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, 90, 80);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, 90, 80);
    const gray = [];
    for (let by = 0; by < 8; by++)
      for (let bx = 0; bx < 9; bx++) {
        let sum = 0;
        for (let y = by * 10; y < by * 10 + 10; y++)
          for (let x = bx * 10; x < bx * 10 + 10; x++) {
            const k = (y * 90 + x) * 4;
            sum += data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
          }
        gray.push(sum);
      }
    let bits = '';
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        bits += gray[r * 9 + c] > gray[r * 9 + c + 1] ? '1' : '0';
    return bits
      .match(/.{4}/g)
      .map((b) => parseInt(b, 2).toString(16))
      .join('');
  } catch {
    return null;
  }
}
function locate() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}
form.onsubmit = async (ev) => {
  ev.preventDefault();
  const file = photo.files[0],
    text = $('description').value.trim();
  const errors = validate(file, text);
  if (errors.length) return showErrors(errors);
  clearErrors();
  requestId ||= crypto.randomUUID();
  const controls = [...form.elements];
  controls.forEach((e) => (e.disabled = true));
  try {
    let geo = null;
    if ($('useGeo').checked) {
      status.textContent = '正在获取定位…';
      geo = await locate();
    }
    status.textContent = file ? '正在上传照片…' : '正在提交…';
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        location: $('location').value,
        asset: $('asset').value,
        requestId,
        image: file ? await asDataURL(file) : null,
        dhash: file ? await photoHash(file) : null,
        geo,
      }),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(result.error || '提交失败，请稍后重试');
    $('receiptId').textContent = '#' + result.reportId;
    $('receiptEvents').textContent =
      '你报告的问题已记录为事件 ' +
      result.events.map((i) => 'E-' + i).join('、') +
      '。';
    $('reportView').hidden = true;
    $('doneView').hidden = false;
    document.title = '问题已提交 - 城市设施服务站';
    $('doneTitle').focus();
    preview();
  } catch (error) {
    status.textContent = '';
    showErrors([
      {
        text:
          error instanceof TypeError
            ? '无法连接服务，请检查网络后重试'
            : error.message,
      },
    ]);
  } finally {
    controls.forEach((e) => (e.disabled = false));
  }
};

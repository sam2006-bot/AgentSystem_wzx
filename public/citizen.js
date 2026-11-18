const $ = (id) => document.getElementById(id);
const form = $('report'),
  photo = $('photo'),
  status = $('status');
let previewURL = '',
  requestId = '';
form.addEventListener('input', () => {
  requestId = '';
  status.textContent = '';
});
function preview() {
  if (previewURL) URL.revokeObjectURL(previewURL);
  const file = photo.files[0];
  $('preview').hidden = !file;
  if (file) {
    previewURL = URL.createObjectURL(file);
    $('thumb').src = previewURL;
  }
}
photo.onchange = preview;
$('remove').onclick = () => {
  photo.value = '';
  requestId = '';
  preview();
};
function asDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(Error('图片读取失败'));
    r.readAsDataURL(file);
  });
}
form.onsubmit = async (ev) => {
  ev.preventDefault();
  const file = photo.files[0],
    text = $('description').value.trim();
  if (!file && !text) {
    status.textContent = '请填写问题描述或选择现场照片';
    return;
  }
  if (file && file.size > 5 * 1024 * 1024) {
    status.textContent = '请选择 5 MB 以内的图片';
    return;
  }
  requestId ||= crypto.randomUUID();
  const controls = [...form.elements];
  controls.forEach((e) => (e.disabled = true));
  status.textContent = file ? '正在读取图片并研判…' : '正在提交…';
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        location: $('location').value,
        asset: $('asset').value,
        requestId,
        image: file ? await asDataURL(file) : null,
      }),
    });
    const result = await res.json();
    if (!res.ok) throw Error(result.error);
    $('receiptText').textContent =
      '线索 #' +
      result.reportId +
      ' 已受理，关联事件 ' +
      result.events.map((i) => 'E-' + i).join('、') +
      '。';
    $('receipt').hidden = false;
    form.reset();
    preview();
    requestId = '';
    status.textContent = '提交成功';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    controls.forEach((e) => (e.disabled = false));
  }
};

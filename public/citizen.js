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
  try {
    let geo = null;
    if ($('useGeo').checked) {
      status.textContent = '正在获取定位…';
      geo = await locate();
    }
    status.textContent = file ? '正在读取图片并研判…' : '正在提交…';
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

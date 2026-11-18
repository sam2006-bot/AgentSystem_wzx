// 在页面渲染前标记浏览器支持情况，供 GOV.UK Frontend 组件样式和脚本判断
document.body.className +=
  ' js-enabled' +
  ('noModule' in HTMLScriptElement.prototype ? ' govuk-frontend-supported' : '');

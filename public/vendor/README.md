# 第三方前端库

本目录由 [scripts/vendor-frontend.mjs](../../scripts/vendor-frontend.mjs) 生成，请勿手工修改。升级版本时修改脚本中的版本号，然后在联网环境运行：

```bash
node scripts/vendor-frontend.mjs
```

| 目录 | 来源 | 用途 |
| --- | --- | --- |
| `govuk/` | [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) 6.6.0 | 市民上报页和管理工作台的基础组件 |
| `moj/` | [MOJ Frontend](https://github.com/ministryofjustice/moj-frontend) 12.0.1 | 管理工作台的办件组件（时间线、提示、徽标等） |

两个库的代码均以 MIT 协议发布。GOV.UK 的王冠标志、GOV.UK 字样和 GDS Transport 字体仅限英国政府服务使用，因此脚本删除了字体文件引用并改用中文字体栈，页面也不使用带王冠的页头和页脚。

## 许可证

### GOV.UK Frontend

```
The MIT License (MIT)

Copyright (C) 2017 Crown Copyright (Government Digital Service)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### MOJ Frontend

```
MIT License

Copyright (c) 2019 Ministry of Justice

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

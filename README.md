# 这顿 校园用餐助手

手机访问：[https://richenyv.github.io/zhedun-web/](https://richenyv.github.io/zhedun-web/)

[分享二维码](https://richenyv.github.io/zhedun-web/assets/share-qr.png)

这是一个适合手机浏览器使用的纯前端交互样品，使用 GitHub Pages 托管，无需登录或安装应用。

## 可以体验什么

- 42 道模拟餐食，按到手预算、等待时间、用餐方式和口味筛选，实时显示匹配数量。
- 对比价格、分量、等待时间和获取方式；收藏餐食或探索新口味。
- 选择规格、数量、预约时段，查看模拟订单进度、取餐码、取消订单和评价。
- 切换中国传媒大学梆子井公寓、校内公寓及中蓝公寓，默认梆子井公寓。
- 查看个人偏好、收藏和用餐记录，数据保存在当前浏览器。

## 演示说明

所有交易、商家资料、优惠、分量及出餐时间均为模拟，食物图片为 AI 生成的同类餐食示意图；不会产生真实支付或配送。图标统一使用手绘 SVG，不使用 Emoji。

换设备、换浏览器或换域名后，本地记录不会自动同步。新域名第一次访问会载入初始演示数据。

## 发布与本地预览

仓库 `main` 分支根目录是 GitHub Pages 发布源；`.nojekyll` 用于直接发布现成静态文件。页面使用 Hash 路由及相对资源路径，支持 `/zhedun-web/` 项目子路径。

通过静态 HTTP 服务预览，不要直接双击 HTML 文件，因为页面使用 JavaScript ES modules：

```text
python -m http.server 4173
```

## 文件

`index.html` 为入口，`app.js` 管理页面与交互，`data.js` 为模拟菜单，`model.js` 为计价、筛选和本地存储，`icons.js` 与 `styles.css` 提供图标和视觉样式，`assets/` 保存本地图片及分享二维码。

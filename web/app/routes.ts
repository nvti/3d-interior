import { type RouteConfig, index, layout, prefix, route } from "@react-router/dev/routes";

export default [
  layout("routes/_site.tsx", [
    index("routes/home.tsx"),
    route("models/:slug", "routes/model.tsx"),
    route("cart", "routes/cart.tsx"),
    route("checkout", "routes/checkout.tsx"),
    route("orders/:id", "routes/order.tsx"),
    route("purchases", "routes/purchases.tsx"),
    route("blog", "routes/blog.tsx"),
    route("blog/:slug", "routes/post.tsx"),
    route("p/:slug", "routes/page.tsx"),
    route("login", "routes/login.tsx"),
    route("register", "routes/register.tsx"),
  ]),
  route("logout", "routes/logout.tsx"),
  route("d/:token", "routes/download.tsx"),

  ...prefix("admin", [
    layout("routes/admin/layout.tsx", [
      index("routes/admin/index.tsx"),
      route("models", "routes/admin/models.tsx"),
      route("models/:id", "routes/admin/model-edit.tsx"),
      route("library", "routes/admin/library.tsx"),
      route("categories", "routes/admin/categories.tsx"),
      route("posts", "routes/admin/posts.tsx"),
      route("posts/:id", "routes/admin/post-edit.tsx"),
      route("orders", "routes/admin/orders.tsx"),
      route("settings", "routes/admin/settings.tsx"),
    ]),
  ]),
] satisfies RouteConfig;

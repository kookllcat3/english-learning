import {
  createRouter,
  createWebHashHistory,
  type RouteRecordRaw,
} from "vue-router";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("../views/HomeView.vue"),
    meta: { title: "英文學習庫" },
  },
  {
    path: "/materials/:id",
    name: "material",
    component: () => import("../views/MaterialView.vue"),
    props: true,
    meta: { title: "素材｜英文學習庫" },
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: "home" },
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = typeof to.meta.title === "string" ? to.meta.title : "英文學習庫";
});

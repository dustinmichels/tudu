import "../style.css";
import { createPinia } from "pinia";
import { createApp } from "vue";
import MobileApp from "./MobileApp.vue";

const app = createApp(MobileApp);
app.use(createPinia());
app.mount("#app");

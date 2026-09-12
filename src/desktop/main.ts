import "../style.css";
import { createPinia } from "pinia";
import { createApp } from "vue";
import DesktopApp from "./DesktopApp.vue";

const app = createApp(DesktopApp);
app.use(createPinia());
app.mount("#app");

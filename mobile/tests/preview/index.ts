import { registerRootComponent } from "expo";
import App from "../../src/App";
import { preview } from "./fixtures";
import { resetStorage } from "./storage";
Object.assign(globalThis, { __ZOTIGO_PREVIEW__: { ...preview, resetStorage } });
registerRootComponent(App);

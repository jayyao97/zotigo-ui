import { startLogging } from "../backend/logging";

// Install diagnostics before loading the server and its dependencies.
startLogging("web");
require("./application");

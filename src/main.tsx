import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/main.css";
import App from "./App.tsx";
import { fetchBranchDirectory } from "./services/branchDirectory";

const root = createRoot(document.getElementById("root")!);
root.render(<StrictMode><App /></StrictMode>);
void fetchBranchDirectory().catch((error) => {
  console.error("Unable to load branch settings", error);
});

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";

// No StrictMode: the WebGL showroom is an imperative singleton and dev
// double-mounting would create two GL contexts + duplicate asset loads.
createRoot(document.getElementById("root")).render(<App />);

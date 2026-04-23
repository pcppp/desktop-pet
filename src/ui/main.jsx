import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import SessionPanelApp from "./SessionPanelApp";
import "./styles.css";

const params = new URLSearchParams(window.location.search);
const isSessionPanel = params.get("panel") === "sessions";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isSessionPanel ? <SessionPanelApp /> : <App />}
  </React.StrictMode>
);

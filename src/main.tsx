import React from "react";
import { createRoot } from "react-dom/client";
import ProfessionalApp from "./ProfessionalApp";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProfessionalApp />
  </React.StrictMode>,
);

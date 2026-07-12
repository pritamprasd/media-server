import { lazy, Suspense } from "react";
import Spinner from "../components/Spinner";

const MuiThemeProvider = lazy(() => import("./MuiThemeProvider"));

export default function MaterialThemeWrapper({ style, mode, children }) {
  if (style !== "material") {
    return children;
  }

  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
          <Spinner size={36} />
        </div>
      }
    >
      <MuiThemeProvider mode={mode}>{children}</MuiThemeProvider>
    </Suspense>
  );
}

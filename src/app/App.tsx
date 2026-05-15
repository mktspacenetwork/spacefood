import React from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { ThemeProvider } from "next-themes";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        disableTransitionOnChange
      >
        <RouterProvider router={router} />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
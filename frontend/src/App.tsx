import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { UserLoginPage } from "./pages/UserLoginPage";
import { UserHomePage } from "./pages/UserHomePage";
import { CREHomePage } from "./pages/CREHomePage";
import { ManagerHomePage } from "./pages/ManagerHomePage";
import { AccessibilityProvider } from "./components/Accessibility";

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <HashRouter>
          <AccessibilityProvider>
          <Routes>
            <Route path="/login" element={<UserLoginPage />} />
            <Route path="/" element={<ProtectedRoute roles={["PACIENTE"]}><UserHomePage /></ProtectedRoute>} />
            <Route path="/cre" element={<ProtectedRoute roles={["FISCAL_CRE", "GESTOR"]}><CREHomePage /></ProtectedRoute>} />
            <Route path="/manager" element={<ProtectedRoute roles={["GESTOR"]}><ManagerHomePage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </AccessibilityProvider>
        </HashRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}

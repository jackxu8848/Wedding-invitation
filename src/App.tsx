import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AdminPage from "./pages/AdminPage";
import InvitationPage from "./pages/InvitationPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<InvitationPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

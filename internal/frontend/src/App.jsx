import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Extensions from "./pages/Extensions";
import Dongles from "./pages/Dongles";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import SMS from "./pages/SMS";
import Terminal from "./pages/Terminal";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="extensions" element={<Extensions />} />
          <Route path="dongles" element={<Dongles />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<Settings />} />
          <Route path="sms" element={<SMS />} />
          <Route path="terminal" element={<Terminal />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

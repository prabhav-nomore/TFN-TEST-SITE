/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import TeamDashboard from './pages/TeamDashboard';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const { teamToken, adminToken } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route path="/" element={!teamToken ? <Login /> : <Navigate to="/team" />} />
        <Route path="/admin/login" element={!adminToken ? <AdminLogin /> : <Navigate to="/admin" />} />
        <Route path="/team" element={teamToken ? <TeamDashboard /> : <Navigate to="/" />} />
        <Route path="/admin" element={adminToken ? <AdminDashboard /> : <Navigate to="/admin/login" />} />
      </Routes>
    </Router>
  );
}

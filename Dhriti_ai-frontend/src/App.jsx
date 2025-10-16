import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Projects from './pages/Projects.jsx';
import AddProject from './pages/AddProject.jsx';
import Tasks from './pages/Tasks.jsx';
import ProjectTaskBoard from './pages/ProjectTaskBoard.jsx';
import ProtectedRoute from './components/ProtectedRoute';
import HomeRedirect from './components/HomeRedirect.jsx';
import JsonToExcel from './pages/JsonToExcel.jsx';
import TaskImport from './pages/TaskImport.jsx';
import TemplateBuilder from './pages/TemplateBuilder.jsx';
import TaskTemplatePlayer from './pages/TaskTemplatePlayer.jsx';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/*"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Users />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Projects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/board"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ProjectTaskBoard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:projectId/board/:tabId"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <ProjectTaskBoard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AddProject />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
        <ProtectedRoute allowedRoles={['user', 'expert', 'vendor', 'admin']}>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools/json-to-excel"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <JsonToExcel />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools/template-builder"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <TemplateBuilder />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates/:templateId/play"
        element={
          <ProtectedRoute allowedRoles={['user', 'expert', 'vendor', 'admin']}>
            <TaskTemplatePlayer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools/task-import"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <TaskImport />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

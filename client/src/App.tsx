import { Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Landing from './pages/Landing';
import EventRoom from './pages/EventRoom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import './App.css';

function ProtectedRoute({ children }: { children: React.ReactNode}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return user ? <Navigate to="/" /> : <>{children}</>;
}

function AppContent() {
  return (
    <Routes>
      <Route path='/login' element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      <Route path='/signup' element={
        <PublicRoute>
          <Signup />
        </PublicRoute>
      } />

      <Route path='/' element={
        <ProtectedRoute>
          <Landing />
        </ProtectedRoute>
      } />
      <Route path='/room/:id' element={
        <ProtectedRoute>
          <EventRoom />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

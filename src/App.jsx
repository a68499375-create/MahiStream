import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import Layout from './components/Layout';
import { DialogProvider } from './components/DialogProvider';
import MaintenanceGate from './components/MaintenanceGate';
import AuthGate, { GoogleLoginPage } from './components/AuthGate';
import { ToastProvider } from './components/Toast';
import NotificationWatcher from './components/NotificationWatcher';

import { AuthProvider } from './context/AuthContext';

import Home from './pages/Home';
import Profile from './pages/Profile';
const Browse = lazy(() => import('./pages/Browse'));
const Search = lazy(() => import('./pages/Search'));
const VideoPlayer = lazy(() => import('./pages/VideoPlayer'));
const Bookmark = lazy(() => import('./pages/Bookmark'));
const History = lazy(() => import('./pages/History'));
const Khusus = lazy(() => import('./pages/Khusus'));
const Settings = lazy(() => import('./pages/Settings'));
const Genres = lazy(() => import('./pages/Genres'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Watchlist = lazy(() => import('./pages/Watchlist'));
const AnimeDetail = lazy(() => import('./pages/AnimeDetail'));
const Admin = lazy(() => import('./pages/Admin'));
const DevPanel = lazy(() => import('./pages/DevPanel'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const UpdateLog = lazy(() => import('./pages/UpdateLog'));

const Terms = lazy(() => import('./pages/Terms'));
const Downloads = lazy(() => import('./pages/Downloads'));
const NotFound = lazy(() => import('./pages/NotFound'));

import { PlayerProvider } from './lib/playerContext.jsx';
import PlayerShell from './components/PlayerShell';

const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-bg">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <NotificationWatcher />
        <MaintenanceGate>
          <AuthGate>
            <AuthProvider>
              <PlayerProvider>
                <DialogProvider>
                  <Suspense fallback={<PageFallback />}>
                    <Routes>
                      <Route element={<Layout />}>
                        <Route path="/video/*" element={<VideoPlayer />} />
                        <Route path="/" element={<Home />} />
                        <Route path="/browse" element={<Browse />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/khusus" element={<Khusus />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/login" element={<GoogleLoginPage standalone />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/dev-panel" element={<DevPanel />} />
                        <Route path="/bookmark" element={<Bookmark />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/genres" element={<Genres />} />
                        <Route path="/ranking" element={<Ranking />} />
                        <Route path="/watchlist" element={<Watchlist />} />
                        <Route path="/anime/:id" element={<AnimeDetail />} />
                        <Route path="/u/:userId" element={<PublicProfile />} />
                        <Route path="/terms" element={<Terms />} />
                        <Route path="/schedule" element={<Schedule />} />
                        <Route path="/downloads" element={<Downloads />} />
                        <Route path="/changelog" element={<UpdateLog />} />
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Routes>
                  </Suspense>
                  <PlayerShell />
                </DialogProvider>
              </PlayerProvider>
            </AuthProvider>
          </AuthGate>
        </MaintenanceGate>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;

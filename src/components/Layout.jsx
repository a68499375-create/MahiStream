import { Outlet } from 'react-router-dom';
import TopBar from './TopBar';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <>
      <TopBar />
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </>
  );
}
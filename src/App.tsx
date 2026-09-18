import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { DefaultLayout } from './components/layout/DefaultLayout';
import { YouTubeSchedule } from './components/YouTubeSchedule';
import { InstagramPage } from './pages/InstagramPage';
import { TikTokPage } from './pages/TikTokPage';
import { PinterestPage } from './pages/PinterestPage';
import { YouTubeToolsPage } from './pages/YouTubeToolsPage';

export function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <HashRouter>
      <Routes>
        <Route element={<DefaultLayout />}>
          <Route path="/" element={<YouTubeSchedule />} />
          <Route path="/youtube-tools" element={<YouTubeToolsPage />} />
          <Route path="/instagram" element={<InstagramPage />} />
          <Route path="/tiktok" element={<TikTokPage />} />
          <Route path="/pinterest" element={<PinterestPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { SettingsModal } from '../SettingsModal';
import { Button } from '../ui/button';
import { Settings, Moon, Sun } from 'lucide-react';
import { Toaster } from 'sonner';

export function DefaultLayout() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const root = document.documentElement;
    return root.classList.contains('dark') ? 'dark' : 'dark'; // default dark
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      const root = document.documentElement;
      if (next === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      return next;
    });
  };

  return (
    <div className="h-screen flex bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-end px-4 border-b border-border bg-background/95 backdrop-blur shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="h-8 text-xs flex items-center gap-1.5"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Cài đặt API</span>
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={theme === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Toast */}
      <Toaster position="bottom-right" richColors theme={theme} />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { YouTubeSchedule } from './components/YouTubeSchedule';
import { SettingsModal } from './components/SettingsModal';
import { Button } from './components/ui/button';
import { Youtube, Settings, Moon, Sun, Monitor } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { youtubeService } from './services/youtube.service';

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Xử lý OAuth code nếu trình duyệt redirect về URL của frontend: http://localhost:1111/youtube/callback?code=...
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const isCallbackPath = window.location.pathname.includes('/youtube/callback');

    if (code && (isCallbackPath || window.location.search.includes('code='))) {
      const processOAuthCode = async () => {
        try {
          toast.loading('Đang kích hoạt liên kết kênh YouTube...');
          const res = await youtubeService.submitAuthCallback(code);
          if (res.success) {
            toast.dismiss();
            toast.success(`Kết nối kênh "${res.channel?.channelTitle || ''}" thành công!`);
            // Kích hoạt giao thức mở và focus ứng dụng Desktop
            try {
              window.location.href = "youtubescheduler://focus";
            } catch (e) { }

            // Tự đóng tab nếu chạy trong trình duyệt web ngoài
            setTimeout(() => {
              try {
                window.close();
              } catch (e) { }
            }, 1200);

            // Dọn sạch URL query và đưa về trang chủ
            window.history.replaceState({}, document.title, window.location.pathname.replace('/youtube/callback', '') || '/');
            // Refresh nhẹ sau 1 giây nếu vẫn ở app desktop
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            toast.dismiss();
            toast.error(res.message || 'Xác thực thất bại');
          }
        } catch (err: any) {
          toast.dismiss();
          toast.error(err?.response?.data?.message || 'Lỗi khi gửi code xác thực lên server');
        }
      };

      processOAuthCode();
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-red-600 rounded-lg text-white shadow">
              <Youtube className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight flex items-center gap-1.5">
                <span>YouTube Scheduler</span>
                <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-red-600/10 text-red-500 border border-red-500/20">
                  Desktop
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Tự động hóa quản lý kênh, đổi metadata, thumbnail và lên lịch công chiếu
              </p>
            </div>
          </div>

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
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto max-w-7xl px-4 py-6">
        <YouTubeSchedule />
      </main>

      {/* Settings Modal */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {/* Toast Notification Provider */}
      <Toaster position="bottom-right" richColors theme={theme} />
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { youtubeService, type AppSettings } from '@/services/youtube.service';
import { Settings, Save, RefreshCw, KeyRound, Globe } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');

  useEffect(() => {
    if (open) {
      loadCurrentSettings();
    }
  }, [open]);

  const loadCurrentSettings = async () => {
    setLoading(true);
    try {
      const settings = await youtubeService.getSettings();
      setClientId(settings.googleClientId || '');
      setClientSecret(settings.googleClientSecret || '');
      setRedirectUri(settings.redirectUri || '');
    } catch (err: any) {
      toast.error('Không thể đọc cài đặt từ server');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await youtubeService.saveSettings({
        googleClientId: clientId.trim(),
        googleClientSecret: clientSecret.trim(),
        redirectUri: redirectUri.trim(),
      });
      toast.success('Đã lưu cấu hình Google OAuth thành công!');
      onOpenChange(false);
    } catch (err: any) {
      toast.error('Lỗi khi lưu cài đặt: ' + (err?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings className="h-5 w-5 text-red-500" />
            Cấu Hình Google API / OAuth2
          </DialogTitle>
          <DialogDescription>
            Thiết lập Google Client ID và Client Secret từ Google Cloud Console để kết nối tài khoản YouTube của bạn.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Đang tải cấu hình...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Google Client ID
              </label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxx.apps.googleusercontent.com"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                Google Client Secret
              </label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxx"
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                Redirect URI (OAuth2 Callback)
              </label>
              <Input
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                placeholder="http://localhost:8696/api/v1/youtube/callback"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Hãy thêm URI này vào "Authorized redirect URIs" trong Google Cloud Console của bạn.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Lưu Cấu Hình
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  youtubeService,
  type YouTubeChannelItem,
  type YouTubeCheckTokenResponse,
} from '@/services/youtube.service';
import {
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Youtube,
  UserCheck,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

interface YouTubeAccountsManagerProps {
  channels?: YouTubeChannelItem[];
  loadingChannels?: boolean;
  onChannelChange?: () => void;
}

export const YouTubeAccountsManager = ({
  channels: externalChannels,
  loadingChannels: externalLoading,
  onChannelChange,
}: YouTubeAccountsManagerProps) => {
  const [internalChannels, setInternalChannels] = useState<YouTubeChannelItem[]>([]);
  const [loadingInternal, setLoadingInternal] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<YouTubeChannelItem | null>(null);

  const channels = externalChannels ?? internalChannels;
  const loading = externalLoading ?? loadingInternal;

  const [tokenStatus, setTokenStatus] = useState<
    Record<string, YouTubeCheckTokenResponse | { loading: boolean }>
  >({});

  const fetchChannels = async () => {
    if (externalChannels !== undefined) {
      if (onChannelChange) onChannelChange();
      return;
    }
    setLoadingInternal(true);
    try {
      const res = await youtubeService.getConnectedChannels();
      if (res.success) {
        setInternalChannels(res.channels || []);
      } else {
        toast.error(res.message || 'Không thể lấy danh sách kênh YouTube');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi tải danh sách kênh YouTube');
    } finally {
      setLoadingInternal(false);
    }
  };

  useEffect(() => {
    if (externalChannels === undefined) {
      fetchChannels();
    }
  }, []);

  // Mở trình duyệt ngoài để đăng nhập Google OAuth
  const handleConnectChannel = async () => {
    try {
      const authUrl = await youtubeService.getAuthUrl();
      if ((window as any).electronAPI?.openExternal) {
        await (window as any).electronAPI.openExternal(authUrl);
      } else {
        window.open(authUrl, '_blank');
      }
      toast.info('Trình duyệt đã mở để bạn đăng nhập Google. Vui lòng cấp quyền cho ứng dụng.');

      // Poll kiểm tra kênh mới sau khi người dùng đăng nhập
      const interval = setInterval(async () => {
        const res = await youtubeService.getConnectedChannels();
        if (res.success && res.channels.length > channels.length) {
          clearInterval(interval);
          toast.success('Đã phát hiện kênh mới kết nối thành công!');
          fetchChannels();
          if (onChannelChange) onChannelChange();

          // Kích hoạt focus cửa sổ Desktop lên trước
          if ((window as any).electronAPI?.focusApp) {
            (window as any).electronAPI.focusApp();
          }
        }
      }, 2000);

      // Dừng poll sau 2 phút
      setTimeout(() => clearInterval(interval), 120000);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể tạo URL đăng nhập');
    }
  };

  const executeDisconnect = async () => {
    if (!deleteConfirmTarget) return;
    const { channelId, channelTitle } = deleteConfirmTarget;

    setDisconnecting(channelId);
    try {
      const res = await youtubeService.disconnectChannel(channelId);
      if (res.success) {
        toast.success(`Đã hủy kết nối kênh "${channelTitle}"`);
        setDeleteConfirmTarget(null);
        fetchChannels();
        if (onChannelChange) onChannelChange();
      } else {
        toast.error(res.message || 'Hủy kết nối thất bại');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi hủy kết nối kênh');
    } finally {
      setDisconnecting(null);
    }
  };

  const checkToken = async (channelId: string) => {
    setTokenStatus((prev) => ({ ...prev, [channelId]: { loading: true } }));
    try {
      const res = await youtubeService.checkChannelToken(channelId);
      setTokenStatus((prev) => ({ ...prev, [channelId]: res }));
      if (res.isWorking) {
        toast.success(`Token của kênh "${res.channelTitle}" đang hoạt động tốt!`);
      } else {
        toast.error(`Token lỗi hoặc hết hạn: ${res.errorMessage}`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi kiểm tra token');
      setTokenStatus((prev) => {
        const copy = { ...prev };
        delete copy[channelId];
        return copy;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Youtube className="h-5 w-5 text-red-500" />
            Kênh YouTube Đã Kết Nối ({channels.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Quản lý các tài khoản YouTube được cấp quyền tự động lên lịch công chiếu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchChannels}
            disabled={loading}
            className="text-xs flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>

          <Button
            size="sm"
            onClick={handleConnectChannel}
            className="bg-red-600 hover:bg-red-700 text-white text-xs flex items-center gap-1.5 shadow"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm Kênh Mới
            <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
          </Button>
        </div>
      </div>

      {loading && channels.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Đang tải danh sách kênh...
        </div>
      ) : channels.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-red-500/30 bg-red-500/5">
          <Youtube className="h-10 w-10 text-red-500 mx-auto mb-2 opacity-60" />
          <p className="font-semibold text-sm text-foreground">Chưa có kênh YouTube nào được kết nối</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Bấm "Thêm Kênh Mới" để liên kết kênh của bạn qua Google OAuth2.
          </p>
          <Button
            size="sm"
            onClick={handleConnectChannel}
            className="mt-4 bg-red-600 hover:bg-red-700 text-white text-xs inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Kết Nối Kênh Ngay
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {channels.map((ch) => {
            const status = tokenStatus[ch.channelId];
            const isLoadingCheck = status && 'loading' in status && status.loading;
            const checkData = status && !('loading' in status) ? (status as YouTubeCheckTokenResponse) : null;

            return (
              <Card
                key={ch.channelId}
                className="p-4 flex flex-col justify-between gap-3 border hover:border-red-500/40 transition-colors shadow-sm bg-card"
              >
                <div className="flex items-start gap-3">
                  {ch.thumbnailUrl ? (
                    <img
                      src={ch.thumbnailUrl}
                      alt={ch.channelTitle}
                      className="w-11 h-11 rounded-full object-cover border shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-red-500/10 text-red-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {ch.channelTitle ? ch.channelTitle.charAt(0).toUpperCase() : 'Y'}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-foreground truncate">{ch.channelTitle}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{ch.channelId}</p>

                    <div className="flex items-center gap-1.5 mt-1">
                      {ch.isExpired ? (
                        <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                          Hết hạn Token
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 text-emerald-500 bg-emerald-500/10">
                          Sẵn sàng
                        </Badge>
                      )}

                      {checkData && (
                        <span
                          className={`text-[10px] flex items-center gap-0.5 ${
                            checkData.isWorking ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'
                          }`}
                        >
                          {checkData.isWorking ? (
                            <>
                              <ShieldCheck className="h-3 w-3" /> OK ({Math.floor(checkData.timeLeftSeconds / 60)}p)
                            </>
                          ) : (
                            <>
                              <ShieldAlert className="h-3 w-3" /> Lỗi Token
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t pt-2 mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => checkToken(ch.channelId)}
                    disabled={Boolean(isLoadingCheck)}
                    className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingCheck ? 'animate-spin' : ''}`} />
                    Kiểm tra
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmTarget(ch)}
                    disabled={disconnecting === ch.channelId}
                    className="text-xs h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Hủy kết nối
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirmTarget)} onOpenChange={(open) => !open && setDeleteConfirmTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Xác nhận hủy kết nối kênh
            </DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn ngắt liên kết kênh{' '}
              <strong className="text-foreground">{deleteConfirmTarget?.channelTitle}</strong>? Các lịch trình
              đã đặt trước trên YouTube vẫn được YouTube giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmTarget(null)}>
              Hủy bỏ
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={Boolean(disconnecting)}
              onClick={executeDisconnect}
              className="flex items-center gap-1.5"
            >
              {disconnecting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
              Đồng ý hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

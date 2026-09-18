import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { tiktokService, type TikTokChannelVideo } from '../services/tiktok.service';
import {
  Loader2,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  User,
  Music,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';

const TikTokIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.02 1.63 4.14 1.02 1.11 2.45 1.8 3.97 1.93v3.86c-1.39-.08-2.77-.57-3.92-1.37a8.03 8.03 0 01-2.43-2.6v7.35c.03 1.54-.36 3.09-1.12 4.43-.8 1.42-2 2.58-3.46 3.3-1.52.76-3.25.99-4.9.68-1.63-.3-3.15-1.2-4.22-2.48a8.3 8.3 0 01-1.74-4.52c-.11-1.65.25-3.32 1.05-4.76.81-1.45 2.06-2.61 3.56-3.3 1.25-.57 2.63-.78 3.98-.62V8.2c-1.02-.15-2.07.03-3 .52a4.42 4.42 0 00-2.22 2.5 4.38 4.38 0 00.32 3.65c.67.99 1.76 1.64 2.94 1.77 1.2.14 2.44-.2 3.34-1 .85-.75 1.34-1.85 1.36-2.98V.02z" />
  </svg>
);

type BulkStatus = 'pending' | 'loading' | 'success' | 'failed';

interface BulkItem {
  videoUrl: string;
  status: BulkStatus;
  progress: number;
  error?: string;
}

export function TikTokPage() {
  const [activeTab, setActiveTab] = useState('channel');

  // Channel state
  const [channelUrl, setChannelUrl] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelVideos, setChannelVideos] = useState<TikTokChannelVideo[]>([]);
  const [channelName, setChannelName] = useState('');
  const [channelVideoLoading, setChannelVideoLoading] = useState<Record<string, { audio?: boolean; video?: boolean }>>({});

  // Audio bulk state
  const [audioUrlText, setAudioUrlText] = useState('');
  const [isAudioFormatted, setIsAudioFormatted] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioData, setAudioData] = useState<BulkItem[]>([]);

  // Video bulk state
  const [videoUrlText, setVideoUrlText] = useState('');
  const [isVideoFormatted, setIsVideoFormatted] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoData, setVideoData] = useState<BulkItem[]>([]);

  const downloadFile = (blobUrl: string, filename: string, blob?: Blob) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (blob) setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  };

  const formatNumber = (n?: number) => (n === undefined || n === null ? '-' : new Intl.NumberFormat().format(n));

  // Channel
  const handleFetchChannel = async () => {
    if (!channelUrl.trim()) { toast.error('Nhập URL kênh TikTok'); return; }
    setChannelLoading(true);
    setChannelVideos([]);
    try {
      const r = await tiktokService.getChannelVideos(channelUrl);
      if (r.success && r.videos) {
        setChannelVideos(r.videos);
        setChannelName(r.channel || '');
        toast.success(`Tìm thấy ${r.videos.length} video`);
      } else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelLoading(false); }
  };

  const handleChannelDownloadAudio = async (url: string, id: string, idx: number) => {
    setChannelVideoLoading(p => ({ ...p, [id]: { ...p[id], audio: true } }));
    try {
      const r = await tiktokService.getAudio(url);
      if (r.success && r.audioUrl) { downloadFile(r.audioUrl, `${idx}.mp3`, r.blob); toast.success(`Tải: ${idx}.mp3`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelVideoLoading(p => ({ ...p, [id]: { ...p[id], audio: false } })); }
  };

  const handleChannelDownloadVideo = async (url: string, id: string, idx: number) => {
    setChannelVideoLoading(p => ({ ...p, [id]: { ...p[id], video: true } }));
    try {
      const r = await tiktokService.getVideo(url);
      if (r.success && r.videoUrl) { downloadFile(r.videoUrl, `${idx}.mp4`, r.blob); toast.success(`Tải: ${idx}.mp4`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelVideoLoading(p => ({ ...p, [id]: { ...p[id], video: false } })); }
  };

  // Bulk helpers
  const processBulk = async (
    type: 'audio' | 'video',
    urlText: string,
    setData: React.Dispatch<React.SetStateAction<BulkItem[]>>,
    setProcessing: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const urls = urlText.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
    if (!urls.length) return;
    setData(urls.map(u => ({ videoUrl: u, status: 'pending', progress: 0 })));
    setProcessing(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = type === 'audio' ? await tiktokService.getAudio(url) : await tiktokService.getVideo(url);
        const dlUrl = type === 'audio' ? r.audioUrl : r.videoUrl;
        if (r.success && dlUrl) {
          setData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'success', progress: 100 } : it));
          downloadFile(dlUrl, `${i + 1}.${type === 'audio' ? 'mp3' : 'mp4'}`, r.blob);
          ok++;
        } else {
          setData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: r.error } : it));
        }
      } catch (e: any) {
        setData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: e.message } : it));
      }
    }
    setProcessing(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length}`);
  };

  const StatusBadge = ({ status, progress, error }: { status: BulkStatus; progress: number; error?: string }) => {
    if (status === 'pending') return <div className="flex items-center gap-1 text-muted-foreground text-xs"><Clock className="h-3 w-3" /> Chờ</div>;
    if (status === 'loading') return <div className="space-y-1"><div className="flex items-center gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> {progress}%</div><Progress value={progress} className="h-1" /></div>;
    if (status === 'success') return <div className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle className="h-3 w-3" /> OK</div>;
    return <div className="flex items-center gap-1 text-red-500 text-xs" title={error}><XCircle className="h-3 w-3" /> Lỗi</div>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2 bg-gradient-to-tr from-zinc-800 to-black rounded-lg text-white shadow-md"><TikTokIcon className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">TikTok Downloader & Tools</h1>
          <p className="text-muted-foreground text-sm">Tải audio, video và quét kênh từ TikTok.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1 max-w-[600px] mb-4">
          <TabsTrigger value="channel" className="flex items-center gap-1.5 py-2"><User className="h-4 w-4" /> Quét kênh</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5 py-2"><Music className="h-4 w-4" /> Tải audio</TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-1.5 py-2"><Video className="h-4 w-4" /> Tải video</TabsTrigger>
        </TabsList>

        {/* Channel Tab */}
        <TabsContent value="channel" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URL kênh TikTok</label>
            <div className="flex gap-2">
              <Input value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.tiktok.com/@username" className="flex-1 h-11" disabled={channelLoading} />
              <Button onClick={handleFetchChannel} disabled={channelLoading} className="h-11">
                {channelLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang quét...</> : 'Quét kênh'}
              </Button>
            </div>
          </Card>

          {channelVideos.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                {channelName && `@${channelName} — `}{channelVideos.length} video
              </h3>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left w-12">#</th>
                      <th className="px-3 py-2 text-left">Tiêu đề</th>
                      <th className="px-3 py-2 text-right w-20">Xem</th>
                      <th className="px-3 py-2 text-right w-20">Thích</th>
                      <th className="px-3 py-2 text-right w-20">BL</th>
                      <th className="px-3 py-2 text-left w-24">Ngày</th>
                      <th className="px-3 py-2 text-left w-36">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelVideos.map((v, i) => {
                      const loading = channelVideoLoading[v.id] || {};
                      return (
                        <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2 max-w-xs truncate">
                            <a href={v.url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1 text-xs">
                              {v.title || v.id} <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          </td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(v.view_count)}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(v.like_count)}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(v.comment_count)}</td>
                          <td className="px-3 py-2 text-xs">{v.created_at ? new Date(v.created_at).toLocaleDateString('vi') : '-'}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.audio} onClick={() => handleChannelDownloadAudio(v.url, v.id, i + 1)}>
                                {loading.audio ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP3'}
                              </Button>
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.video} onClick={() => handleChannelDownloadVideo(v.url, v.id, i + 1)}>
                                {loading.video ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP4'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Audio Tab */}
        <TabsContent value="audio" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs TikTok để tải audio</label>
            <Textarea value={audioUrlText} onChange={e => { setAudioUrlText(e.target.value); setIsAudioFormatted(false); }} placeholder="URLs TikTok..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingAudio} />
            <div className="flex gap-2">
              <Button onClick={() => { const u = audioUrlText.split(/[\s,\n\t]+/).map(s => s.trim()).filter(s => s); setAudioUrlText(u.join(', ')); setIsAudioFormatted(true); toast.success('OK'); }} variant="outline">Định dạng</Button>
              <Button onClick={() => processBulk('audio', audioUrlText, setAudioData, setIsProcessingAudio)} disabled={!isAudioFormatted || isProcessingAudio}>
                {isProcessingAudio ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Audio Hàng Loạt'}
              </Button>
            </div>
          </Card>
          {audioData.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left w-12">#</th><th className="px-3 py-2 text-left">URL</th><th className="px-3 py-2 text-left w-28">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th></tr></thead>
                <tbody>{audioData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50"><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{item.videoUrl}</td><td className="px-3 py-2"><StatusBadge {...item} /></td><td className="px-3 py-2 text-xs text-red-500 truncate max-w-xs">{item.error || ''}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* Video Tab */}
        <TabsContent value="video" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs TikTok để tải video</label>
            <Textarea value={videoUrlText} onChange={e => { setVideoUrlText(e.target.value); setIsVideoFormatted(false); }} placeholder="URLs TikTok..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingVideo} />
            <div className="flex gap-2">
              <Button onClick={() => { const u = videoUrlText.split(/[\s,\n\t]+/).map(s => s.trim()).filter(s => s); setVideoUrlText(u.join(', ')); setIsVideoFormatted(true); toast.success('OK'); }} variant="outline">Định dạng</Button>
              <Button onClick={() => processBulk('video', videoUrlText, setVideoData, setIsProcessingVideo)} disabled={!isVideoFormatted || isProcessingVideo}>
                {isProcessingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Video Hàng Loạt'}
              </Button>
            </div>
          </Card>
          {videoData.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left w-12">#</th><th className="px-3 py-2 text-left">URL</th><th className="px-3 py-2 text-left w-28">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th></tr></thead>
                <tbody>{videoData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50"><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{item.videoUrl}</td><td className="px-3 py-2"><StatusBadge {...item} /></td><td className="px-3 py-2 text-xs text-red-500 truncate max-w-xs">{item.error || ''}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

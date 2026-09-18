import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { instagramService, type InstagramChannelItem, type InstagramChannelResponse } from '../services/instagram.service';
import {
  Instagram,
  Loader2,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  Copy,
  FileSpreadsheet,
  Video,
  ListRestart,
} from 'lucide-react';
import { toast } from 'sonner';

type AudioStatus = 'pending' | 'loading' | 'success' | 'failed';

interface AudioDataItem {
  videoUrl: string;
  status: AudioStatus;
  progress: number;
  audioUrl?: string;
  title?: string;
  error?: string;
}

export function InstagramPage() {
  const [activeTab, setActiveTab] = useState('channel');

  // Channel state
  const [channelInput, setChannelInput] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelData, setChannelData] = useState<InstagramChannelResponse | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [channelRowLoading, setChannelRowLoading] = useState<Record<string, { audio?: boolean; video?: boolean; image?: boolean }>>({});

  // Bulk Audio state
  const [audioUrlText, setAudioUrlText] = useState('');
  const [isAudioFormatted, setIsAudioFormatted] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioData, setAudioData] = useState<AudioDataItem[]>([]);

  // Bulk Video state
  const [videoUrlText, setVideoUrlText] = useState('');
  const [isVideoFormatted, setIsVideoFormatted] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoData, setVideoData] = useState<AudioDataItem[]>([]);

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

  const formatDate = (ts?: number) => {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  // === Channel handlers ===
  const handleGetChannel = async () => {
    if (!channelInput.trim()) { toast.error('Vui lòng nhập link kênh hoặc username'); return; }
    setChannelLoading(true);
    setChannelData(null);
    try {
      const data = await instagramService.getChannel(channelInput, typeFilter === 'all' ? undefined : typeFilter);
      if (data.success) setChannelData(data);
      else toast.error(data.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelLoading(false); }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const r = await instagramService.clearCache();
      if (r.success) toast.success(r.message || `Đã xóa ${r.deletedFilesCount} file cache`);
    } catch (e: any) { toast.error(e.message); }
    finally { setIsClearingCache(false); }
  };

  const handleExportExcel = async () => {
    if (!channelData) return;
    setChannelLoading(true);
    try {
      const r = await instagramService.exportChannelExcel(channelInput, typeFilter === 'all' ? undefined : typeFilter);
      downloadFile(URL.createObjectURL(r.blob), r.filename, r.blob);
      toast.success('Xuất Excel thành công');
    } catch { toast.error('Lỗi xuất Excel'); }
    finally { setChannelLoading(false); }
  };

  const handleExportImages = async () => {
    if (!channelData) return;
    setIsExportingImages(true);
    try {
      const r = await instagramService.exportChannelImagesZip(channelInput, typeFilter === 'all' ? undefined : typeFilter);
      downloadFile(URL.createObjectURL(r.blob), r.filename, r.blob);
      toast.success('Tải ảnh ZIP thành công');
    } catch { toast.error('Lỗi tải ảnh'); }
    finally { setIsExportingImages(false); }
  };

  const handleDownloadChannelAudio = async (shortcode: string, idx: number) => {
    setChannelRowLoading(p => ({ ...p, [shortcode]: { ...p[shortcode], audio: true } }));
    try {
      const r = await instagramService.getAudio(shortcode);
      if (r.success && r.audioUrl) { downloadFile(r.audioUrl, `${idx}.mp3`, r.blob); toast.success(`Tải audio: ${idx}.mp3`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelRowLoading(p => ({ ...p, [shortcode]: { ...p[shortcode], audio: false } })); }
  };

  const handleDownloadChannelVideo = async (shortcode: string, idx: number) => {
    setChannelRowLoading(p => ({ ...p, [shortcode]: { ...p[shortcode], video: true } }));
    try {
      const r = await instagramService.getVideo(shortcode);
      if (r.success && r.videoUrl) { downloadFile(r.videoUrl, `${idx}.mp4`, r.blob); toast.success(`Tải video: ${idx}.mp4`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelRowLoading(p => ({ ...p, [shortcode]: { ...p[shortcode], video: false } })); }
  };

  // === Bulk Audio ===
  const formatAudioUrls = () => {
    if (!audioUrlText.trim()) { toast.error('Nhập URLs'); return; }
    const urls = audioUrlText.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
    setAudioUrlText(urls.join(', '));
    setIsAudioFormatted(true);
    toast.success('Định dạng URL thành công');
  };

  const handleBulkAudio = async () => {
    if (!isAudioFormatted) { toast.error('Định dạng URLs trước'); return; }
    const urls = audioUrlText.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
    if (!urls.length) return;
    const items: AudioDataItem[] = urls.map(u => ({ videoUrl: u, status: 'pending' as const, progress: 0 }));
    setAudioData(items);
    setIsProcessingAudio(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setAudioData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = await instagramService.getAudio(url);
        if (r.success && r.audioUrl) {
          setAudioData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'success', progress: 100, audioUrl: r.audioUrl, title: r.title } : it));
          downloadFile(r.audioUrl, `${i + 1}.mp3`, r.blob);
          ok++;
        } else {
          setAudioData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: r.error } : it));
        }
      } catch (e: any) {
        setAudioData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: e.message } : it));
      }
    }
    setIsProcessingAudio(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length} audio`);
  };

  // === Bulk Video ===
  const formatVideoUrls = () => {
    if (!videoUrlText.trim()) { toast.error('Nhập URLs'); return; }
    const urls = videoUrlText.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
    setVideoUrlText(urls.join(', '));
    setIsVideoFormatted(true);
    toast.success('Định dạng URL thành công');
  };

  const handleBulkVideo = async () => {
    if (!isVideoFormatted) { toast.error('Định dạng URLs trước'); return; }
    const urls = videoUrlText.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
    if (!urls.length) return;
    const items: AudioDataItem[] = urls.map(u => ({ videoUrl: u, status: 'pending' as const, progress: 0 }));
    setVideoData(items);
    setIsProcessingVideo(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setVideoData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = await instagramService.getVideo(url);
        if (r.success && r.videoUrl) {
          setVideoData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'success', progress: 100, audioUrl: r.videoUrl, title: r.title } : it));
          downloadFile(r.videoUrl, `${i + 1}.mp4`, r.blob);
          ok++;
        } else {
          setVideoData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: r.error } : it));
        }
      } catch (e: any) {
        setVideoData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'failed', error: e.message } : it));
      }
    }
    setIsProcessingVideo(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length} video`);
  };

  const StatusBadge = ({ status, progress, error }: { status: AudioStatus; progress: number; error?: string }) => {
    if (status === 'pending') return <div className="flex items-center gap-1 text-muted-foreground text-xs"><Clock className="h-3 w-3" /> Chờ</div>;
    if (status === 'loading') return <div className="space-y-1"><div className="flex items-center gap-1 text-pink-500 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> {progress}%</div><Progress value={progress} className="h-1" /></div>;
    if (status === 'success') return <div className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle className="h-3 w-3" /> OK</div>;
    return <div className="flex items-center gap-1 text-red-500 text-xs" title={error}><XCircle className="h-3 w-3" /> Lỗi</div>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2 bg-gradient-to-tr from-yellow-500 via-pink-500 to-purple-600 rounded-lg text-white shadow-md">
          <Instagram className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-tr from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">Instagram Downloader</h1>
          <p className="text-muted-foreground text-sm">Tải audio, video và quét kênh từ Instagram.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-auto p-1 max-w-[600px] mb-4">
          <TabsTrigger value="channel" className="flex items-center gap-1.5 py-2"><Instagram className="h-4 w-4" /> Thông tin kênh</TabsTrigger>
          <TabsTrigger value="bulk-video" className="flex items-center gap-1.5 py-2"><Video className="h-4 w-4" /> Tải video</TabsTrigger>
          <TabsTrigger value="bulk-audio" className="flex items-center gap-1.5 py-2"><ListRestart className="h-4 w-4" /> Tải audio</TabsTrigger>
        </TabsList>

        {/* Channel Tab */}
        <TabsContent value="channel" className="space-y-4">
          <Card className="p-6">
            <div className="space-y-4">
              <label className="text-sm font-semibold block">Nhập URL kênh hoặc Username Instagram</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Instagram className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input value={channelInput} onChange={e => setChannelInput(e.target.value)} placeholder="Username hoặc URL kênh" className="pl-9 h-11" disabled={channelLoading} />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px] h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    <SelectItem value="image">Ảnh</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="carousel">Carousel</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleGetChannel} disabled={channelLoading} className="h-11 bg-gradient-to-r from-pink-500 to-purple-600 text-white">
                  {channelLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang quét...</> : 'Quét kênh'}
                </Button>
                <Button onClick={handleClearCache} disabled={isClearingCache} variant="outline" className="h-11 text-red-500">
                  {isClearingCache ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xóa cache'}
                </Button>
              </div>
            </div>
          </Card>

          {channelData?.user && (
            <Card className="p-4 flex items-center gap-4">
              <img src={channelData.user.profilePicUrl} alt="" className="h-14 w-14 rounded-full border-2 border-pink-500 object-cover" />
              <div>
                <h2 className="font-bold text-lg">{channelData.user.fullname || channelData.user.username}</h2>
                <p className="text-sm text-pink-600 font-mono">@{channelData.user.username}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span><strong className="text-foreground">{formatNumber(channelData.user.followersCount)}</strong> followers</span>
                  <span><strong className="text-foreground">{formatNumber(channelData.user.followingCount)}</strong> following</span>
                </div>
              </div>
            </Card>
          )}

          {channelData?.items && channelData.items.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Danh sách ({channelData.pagination?.totalCount || channelData.items.length} bài viết)
                </h3>
                <div className="flex gap-2">
                  <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white text-xs h-8">
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Xuất Excel
                  </Button>
                  <Button onClick={handleExportImages} disabled={isExportingImages} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                    {isExportingImages ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                    Tải ảnh ZIP
                  </Button>
                </div>
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium w-12">#</th>
                      <th className="px-3 py-2 text-left font-medium w-14">Ảnh</th>
                      <th className="px-3 py-2 text-left font-medium">Link</th>
                      <th className="px-3 py-2 text-left font-medium w-20">Loại</th>
                      <th className="px-3 py-2 text-left font-medium">Mô tả</th>
                      <th className="px-3 py-2 text-right font-medium w-20">Thích</th>
                      <th className="px-3 py-2 text-right font-medium w-20">Xem</th>
                      <th className="px-3 py-2 text-left font-medium w-24">Ngày</th>
                      <th className="px-3 py-2 text-left font-medium w-32">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelData.items.map((item, i) => {
                      const loading = channelRowLoading[item.shortcode] || {};
                      return (
                        <tr key={item.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{i + 1}</td>
                          <td className="px-3 py-2">
                            {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="w-8 h-12 object-cover rounded" />}
                          </td>
                          <td className="px-3 py-2">
                            <a href={`https://www.instagram.com/p/${item.shortcode}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline text-xs font-mono flex items-center gap-1">
                              {item.shortcode} <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium ${item.type === 'video' ? 'text-blue-500' : item.type === 'carousel' ? 'text-purple-500' : 'text-zinc-500'}`}>
                              {item.type === 'video' ? 'Video' : item.type === 'carousel' ? 'Carousel' : 'Ảnh'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="max-w-[200px] truncate text-xs group flex items-center gap-1" title={item.title}>
                              {item.title || '-'}
                              {item.title && (
                                <button onClick={() => { navigator.clipboard.writeText(item.title); toast.success('Đã copy'); }} className="opacity-0 group-hover:opacity-100">
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(item.likes)}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(item.views)}</td>
                          <td className="px-3 py-2 text-xs">{formatDate(item.takenAt)}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {item.type === 'video' ? (
                                <>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.audio} onClick={() => handleDownloadChannelAudio(item.shortcode, i + 1)}>
                                    {loading.audio ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP3'}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.video} onClick={() => handleDownloadChannelVideo(item.shortcode, i + 1)}>
                                    {loading.video ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP4'}
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.image} onClick={() => { window.open(item.thumbnailUrl, '_blank'); }}>
                                  Ảnh
                                </Button>
                              )}
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

        {/* Bulk Video Tab */}
        <TabsContent value="bulk-video" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập danh sách URLs để tải video</label>
            <Textarea value={videoUrlText} onChange={e => { setVideoUrlText(e.target.value); setIsVideoFormatted(false); }} placeholder="Dán URLs Instagram..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingVideo} />
            <div className="flex gap-2">
              <Button onClick={formatVideoUrls} variant="outline" className="text-pink-600">Định dạng URL</Button>
              <Button onClick={handleBulkVideo} disabled={!isVideoFormatted || isProcessingVideo} className="bg-gradient-to-r from-pink-500 to-purple-600 text-white">
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

        {/* Bulk Audio Tab */}
        <TabsContent value="bulk-audio" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập danh sách URLs để tải audio</label>
            <Textarea value={audioUrlText} onChange={e => { setAudioUrlText(e.target.value); setIsAudioFormatted(false); }} placeholder="Dán URLs Instagram..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingAudio} />
            <div className="flex gap-2">
              <Button onClick={formatAudioUrls} variant="outline" className="text-pink-600">Định dạng URL</Button>
              <Button onClick={handleBulkAudio} disabled={!isAudioFormatted || isProcessingAudio} className="bg-gradient-to-r from-pink-500 to-purple-600 text-white">
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
      </Tabs>
    </div>
  );
}

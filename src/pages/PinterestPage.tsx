import React, { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import {
  pinterestService,
  type PinterestChannelResponse,
  type PinterestChannelItem,
} from '../services/pinterest.service';
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
  Image,
  FileSpreadsheet,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

const PinterestIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em" {...props}>
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.4 7.63 11.16-.1-.95-.2-2.4.04-3.43.22-.93 1.4-5.93 1.4-5.93s-.36-.72-.36-1.77c0-1.66.96-2.9 2.16-2.9 1.02 0 1.51.77 1.51 1.68 0 1.03-.65 2.56-.99 3.98-.28 1.19.6 2.16 1.77 2.16 2.12 0 3.76-2.24 3.76-5.47 0-2.86-2.06-4.86-5-4.86-3.4 0-5.4 2.55-5.4 5.2 0 1.03.4 2.14.9 2.74.1.12.11.23.08.35-.1.39-.31 1.25-.35 1.42-.05.2-.18.24-.4.14-1.5-.7-2.43-2.9-2.43-4.66 0-3.8 2.76-7.28 7.95-7.28 4.17 0 7.42 2.97 7.42 6.95 0 4.14-2.61 7.48-6.24 7.48-1.22 0-2.37-.63-2.76-1.38l-.75 2.86c-.27 1.04-1 2.34-1.5 3.14C9.14 23.75 10.53 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z" />
  </svg>
);

type BulkStatus = 'pending' | 'loading' | 'success' | 'failed';

interface BulkItem {
  videoUrl: string;
  status: BulkStatus;
  progress: number;
  error?: string;
}

export function PinterestPage() {
  const [activeTab, setActiveTab] = useState('channel');

  // Channel state
  const [channelUrl, setChannelUrl] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelData, setChannelData] = useState<PinterestChannelResponse | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [rowLoading, setRowLoading] = useState<Record<string, { audio?: boolean; video?: boolean; image?: boolean }>>({});

  // Bulk states
  const [audioUrlText, setAudioUrlText] = useState('');
  const [isAudioFormatted, setIsAudioFormatted] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioData, setAudioData] = useState<BulkItem[]>([]);

  const [videoUrlText, setVideoUrlText] = useState('');
  const [isVideoFormatted, setIsVideoFormatted] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoData, setVideoData] = useState<BulkItem[]>([]);

  const [imageUrlText, setImageUrlText] = useState('');
  const [isImageFormatted, setIsImageFormatted] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageData, setImageData] = useState<BulkItem[]>([]);

  const downloadFile = (blobUrl: string, filename: string, blob?: Blob) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (blob) setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  };

  const formatNumber = (n?: number) => (n == null ? '-' : new Intl.NumberFormat().format(n));

  // Channel
  const handleGetChannel = async () => {
    if (!channelUrl.trim()) { toast.error('Nhập URL kênh Pinterest'); return; }
    setChannelLoading(true);
    setChannelData(null);
    try {
      const r = await pinterestService.getChannel(channelUrl);
      if (r.success) setChannelData(r);
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setChannelLoading(false); }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    try { const r = await pinterestService.clearCache(); if (r.success) toast.success(r.message); }
    catch (e: any) { toast.error(e.message); }
    finally { setIsClearingCache(false); }
  };

  const handleExportExcel = async () => {
    if (!channelData) return;
    setChannelLoading(true);
    try {
      const r = await pinterestService.exportChannelExcel(channelUrl);
      downloadFile(URL.createObjectURL(r.blob), r.filename, r.blob);
      toast.success('Xuất Excel thành công');
    } catch { toast.error('Lỗi xuất Excel'); }
    finally { setChannelLoading(false); }
  };

  const handleExportImages = async () => {
    if (!channelData) return;
    setIsExportingImages(true);
    try {
      const r = await pinterestService.exportChannelImagesZip(channelUrl);
      downloadFile(URL.createObjectURL(r.blob), r.filename, r.blob);
      toast.success('Tải ảnh ZIP thành công');
    } catch { toast.error('Lỗi tải ảnh'); }
    finally { setIsExportingImages(false); }
  };

  const handleRowDownloadAudio = async (pinUrl: string, id: string, idx: number) => {
    setRowLoading(p => ({ ...p, [id]: { ...p[id], audio: true } }));
    try {
      const r = await pinterestService.getAudio(pinUrl);
      if (r.success && r.audioUrl) { downloadFile(r.audioUrl, `${idx}.mp3`, r.blob); toast.success(`Tải: ${idx}.mp3`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setRowLoading(p => ({ ...p, [id]: { ...p[id], audio: false } })); }
  };

  const handleRowDownloadVideo = async (pinUrl: string, id: string, idx: number) => {
    setRowLoading(p => ({ ...p, [id]: { ...p[id], video: true } }));
    try {
      const r = await pinterestService.getVideo(pinUrl);
      if (r.success && r.videoUrl) { downloadFile(r.videoUrl, `${idx}.mp4`, r.blob); toast.success(`Tải: ${idx}.mp4`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setRowLoading(p => ({ ...p, [id]: { ...p[id], video: false } })); }
  };

  const handleRowDownloadImage = async (pinUrl: string, id: string, idx: number) => {
    setRowLoading(p => ({ ...p, [id]: { ...p[id], image: true } }));
    try {
      const r = await pinterestService.getImage(pinUrl);
      if (r.success && r.imageUrl) { downloadFile(r.imageUrl, `${idx}.jpg`, r.blob); toast.success(`Tải: ${idx}.jpg`); }
      else toast.error(r.error || 'Lỗi');
    } catch (e: any) { toast.error(e.message); }
    finally { setRowLoading(p => ({ ...p, [id]: { ...p[id], image: false } })); }
  };

  // Bulk
  const processBulk = async (
    type: 'audio' | 'video' | 'image',
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
        let dlUrl: string | undefined;
        let blob: Blob | undefined;
        if (type === 'audio') { const r = await pinterestService.getAudio(url); dlUrl = r.audioUrl; blob = r.blob; if (!r.success) throw new Error(r.error); }
        else if (type === 'video') { const r = await pinterestService.getVideo(url); dlUrl = r.videoUrl; blob = r.blob; if (!r.success) throw new Error(r.error); }
        else { const r = await pinterestService.getImage(url); dlUrl = r.imageUrl; blob = r.blob; if (!r.success) throw new Error(r.error); }
        if (dlUrl) {
          setData(p => p.map(it => it.videoUrl === url ? { ...it, status: 'success', progress: 100 } : it));
          const ext = type === 'audio' ? 'mp3' : type === 'video' ? 'mp4' : 'jpg';
          downloadFile(dlUrl, `${i + 1}.${ext}`, blob);
          ok++;
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
    if (status === 'loading') return <div className="space-y-1"><div className="flex items-center gap-1 text-xs text-red-500"><Loader2 className="h-3 w-3 animate-spin" /> {progress}%</div><Progress value={progress} className="h-1" /></div>;
    if (status === 'success') return <div className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle className="h-3 w-3" /> OK</div>;
    return <div className="flex items-center gap-1 text-red-500 text-xs" title={error}><XCircle className="h-3 w-3" /> Lỗi</div>;
  };

  const BulkTable = ({ data }: { data: BulkItem[] }) => (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left w-12">#</th><th className="px-3 py-2 text-left">URL</th><th className="px-3 py-2 text-left w-28">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th></tr></thead>
        <tbody>{data.map((item, i) => (
          <tr key={i} className="border-b border-border/50"><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{item.videoUrl}</td><td className="px-3 py-2"><StatusBadge {...item} /></td><td className="px-3 py-2 text-xs text-red-500 truncate max-w-xs">{item.error || ''}</td></tr>
        ))}</tbody>
      </table>
    </Card>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2 bg-red-600 rounded-lg text-white shadow-md"><PinterestIcon className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-red-600">Pinterest Downloader & Tools</h1>
          <p className="text-muted-foreground text-sm">Tải audio, video, ảnh và quét kênh từ Pinterest.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1 max-w-[700px] mb-4">
          <TabsTrigger value="channel" className="flex items-center gap-1.5 py-2"><User className="h-4 w-4" /> Quét kênh</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5 py-2"><Music className="h-4 w-4" /> Tải audio</TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-1.5 py-2"><Video className="h-4 w-4" /> Tải video</TabsTrigger>
          <TabsTrigger value="image" className="flex items-center gap-1.5 py-2"><Image className="h-4 w-4" /> Tải ảnh</TabsTrigger>
        </TabsList>

        {/* Channel Tab */}
        <TabsContent value="channel" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URL kênh Pinterest</label>
            <div className="flex gap-2">
              <Input value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.pinterest.com/username" className="flex-1 h-11" disabled={channelLoading} />
              <Button onClick={handleGetChannel} disabled={channelLoading} className="h-11 bg-red-600 hover:bg-red-700 text-white">
                {channelLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang quét...</> : 'Quét kênh'}
              </Button>
              <Button onClick={handleClearCache} disabled={isClearingCache} variant="outline" className="h-11 text-red-500">
                {isClearingCache ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Xóa cache'}
              </Button>
            </div>
          </Card>

          {channelData?.user && (
            <Card className="p-4 flex items-center gap-4">
              <div>
                <h2 className="font-bold text-lg">{channelData.user.full_name || channelData.user.username}</h2>
                <p className="text-sm text-red-600 font-mono">@{channelData.user.username}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  <span><strong className="text-foreground">{formatNumber(channelData.user.follower_count)}</strong> followers</span>
                  <span><strong className="text-foreground">{formatNumber(channelData.user.pin_count)}</strong> pins</span>
                </div>
              </div>
            </Card>
          )}

          {channelData?.items && channelData.items.length > 0 && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {channelData.pagination?.totalCount || channelData.items.length} pins
                </h3>
                <div className="flex gap-2">
                  <Button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-700 text-white text-xs h-8">
                    <FileSpreadsheet className="h-4 w-4 mr-1" /> Xuất Excel
                  </Button>
                  <Button onClick={handleExportImages} disabled={isExportingImages} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8">
                    {isExportingImages ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} Tải ảnh ZIP
                  </Button>
                </div>
              </div>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left w-12">#</th>
                      <th className="px-3 py-2 text-left w-16">Ảnh</th>
                      <th className="px-3 py-2 text-left">Tiêu đề</th>
                      <th className="px-3 py-2 text-left w-16">Loại</th>
                      <th className="px-3 py-2 text-right w-16">Repin</th>
                      <th className="px-3 py-2 text-right w-16">Save</th>
                      <th className="px-3 py-2 text-left w-24">Ngày</th>
                      <th className="px-3 py-2 text-left w-40">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelData.items.map((pin, i) => {
                      const loading = rowLoading[pin.id] || {};
                      return (
                        <tr key={pin.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2">
                            {pin.image_url && <img src={pin.image_url} alt="" className="w-10 h-10 object-cover rounded" />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="max-w-[200px] truncate text-xs group flex items-center gap-1">
                              <a href={pin.pin_url} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                                {pin.title || pin.description || pin.id} <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                              {(pin.title || pin.description) && (
                                <button onClick={() => { navigator.clipboard.writeText(pin.title || pin.description || ''); toast.success('Đã copy'); }} className="opacity-0 group-hover:opacity-100">
                                  <Copy className="h-3 w-3 text-muted-foreground" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs font-medium">{pin.is_video ? <span className="text-blue-500">Video</span> : <span className="text-zinc-500">Ảnh</span>}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(pin.repin_count)}</td>
                          <td className="px-3 py-2 text-right text-xs">{formatNumber(pin.save_count)}</td>
                          <td className="px-3 py-2 text-xs">{pin.created_at ? new Date(pin.created_at).toLocaleDateString('vi') : '-'}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              {pin.is_video && (
                                <>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.audio} onClick={() => handleRowDownloadAudio(pin.pin_url, pin.id, i + 1)}>
                                    {loading.audio ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP3'}
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.video} onClick={() => handleRowDownloadVideo(pin.pin_url, pin.id, i + 1)}>
                                    {loading.video ? <Loader2 className="h-3 w-3 animate-spin" /> : 'MP4'}
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={loading.image} onClick={() => handleRowDownloadImage(pin.pin_url, pin.id, i + 1)}>
                                {loading.image ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Ảnh'}
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
            <label className="text-sm font-semibold block mb-2">Nhập URLs Pinterest để tải audio</label>
            <Textarea value={audioUrlText} onChange={e => { setAudioUrlText(e.target.value); setIsAudioFormatted(false); }} placeholder="URLs Pinterest..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingAudio} />
            <div className="flex gap-2">
              <Button onClick={() => { const u = audioUrlText.split(/[\s,\n\t]+/).map(s => s.trim()).filter(s => s); setAudioUrlText(u.join(', ')); setIsAudioFormatted(true); toast.success('OK'); }} variant="outline">Định dạng</Button>
              <Button onClick={() => processBulk('audio', audioUrlText, setAudioData, setIsProcessingAudio)} disabled={!isAudioFormatted || isProcessingAudio} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingAudio ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Audio Hàng Loạt'}
              </Button>
            </div>
          </Card>
          {audioData.length > 0 && <BulkTable data={audioData} />}
        </TabsContent>

        {/* Video Tab */}
        <TabsContent value="video" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs Pinterest để tải video</label>
            <Textarea value={videoUrlText} onChange={e => { setVideoUrlText(e.target.value); setIsVideoFormatted(false); }} placeholder="URLs Pinterest..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingVideo} />
            <div className="flex gap-2">
              <Button onClick={() => { const u = videoUrlText.split(/[\s,\n\t]+/).map(s => s.trim()).filter(s => s); setVideoUrlText(u.join(', ')); setIsVideoFormatted(true); toast.success('OK'); }} variant="outline">Định dạng</Button>
              <Button onClick={() => processBulk('video', videoUrlText, setVideoData, setIsProcessingVideo)} disabled={!isVideoFormatted || isProcessingVideo} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Video Hàng Loạt'}
              </Button>
            </div>
          </Card>
          {videoData.length > 0 && <BulkTable data={videoData} />}
        </TabsContent>

        {/* Image Tab */}
        <TabsContent value="image" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs Pinterest để tải ảnh</label>
            <Textarea value={imageUrlText} onChange={e => { setImageUrlText(e.target.value); setIsImageFormatted(false); }} placeholder="URLs Pinterest..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingImage} />
            <div className="flex gap-2">
              <Button onClick={() => { const u = imageUrlText.split(/[\s,\n\t]+/).map(s => s.trim()).filter(s => s); setImageUrlText(u.join(', ')); setIsImageFormatted(true); toast.success('OK'); }} variant="outline">Định dạng</Button>
              <Button onClick={() => processBulk('image', imageUrlText, setImageData, setIsProcessingImage)} disabled={!isImageFormatted || isProcessingImage} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingImage ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Ảnh Hàng Loạt'}
              </Button>
            </div>
          </Card>
          {imageData.length > 0 && <BulkTable data={imageData} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

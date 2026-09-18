import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { api } from '../services/youtube.service';
import {
  Youtube,
  Loader2,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Music,
  Video,
  List,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

type BulkStatus = 'pending' | 'loading' | 'success' | 'failed';

interface TranscriptItem {
  url: string;
  status: BulkStatus;
  progress: number;
  title?: string;
  transcript?: string;
  error?: string;
}

interface AudioItem {
  url: string;
  status: BulkStatus;
  progress: number;
  error?: string;
}

export function YouTubeToolsPage() {
  const [activeTab, setActiveTab] = useState('transcript');

  // Transcript
  const [transcriptUrls, setTranscriptUrls] = useState('');
  const [isTranscriptFormatted, setIsTranscriptFormatted] = useState(false);
  const [isProcessingTranscript, setIsProcessingTranscript] = useState(false);
  const [transcriptData, setTranscriptData] = useState<TranscriptItem[]>([]);

  // Audio
  const [audioUrls, setAudioUrls] = useState('');
  const [isAudioFormatted, setIsAudioFormatted] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [audioData, setAudioData] = useState<AudioItem[]>([]);

  // Video
  const [videoUrls, setVideoUrls] = useState('');
  const [isVideoFormatted, setIsVideoFormatted] = useState(false);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoDownloadData, setVideoDownloadData] = useState<AudioItem[]>([]);

  // Channel URLs
  const [channelUrl, setChannelUrl] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelVideoUrls, setChannelVideoUrls] = useState<string[]>([]);

  const downloadFile = (blobUrl: string, filename: string, blob?: Blob) => {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (blob) setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  };

  const formatUrlList = (text: string) => {
    return text.split(/[\s,\n\t]+/).map(u => u.trim()).filter(u => u);
  };

  // Transcript handler
  const handleGetTranscripts = async () => {
    const urls = formatUrlList(transcriptUrls);
    if (!urls.length) return;
    setTranscriptData(urls.map(u => ({ url: u, status: 'pending', progress: 0 })));
    setIsProcessingTranscript(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setTranscriptData(p => p.map(it => it.url === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = await api.post('/youtube/transcript', { url });
        if (r.data) {
          setTranscriptData(p => p.map(it => it.url === url ? { ...it, status: 'success', progress: 100, title: r.data.title, transcript: r.data.transcript } : it));
          ok++;
        }
      } catch (e: any) {
        setTranscriptData(p => p.map(it => it.url === url ? { ...it, status: 'failed', error: e.response?.data?.message || e.message } : it));
      }
    }
    setIsProcessingTranscript(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length} transcript`);
  };

  // Audio handler
  const handleGetAudioBulk = async () => {
    const urls = formatUrlList(audioUrls);
    if (!urls.length) return;
    setAudioData(urls.map(u => ({ url: u, status: 'pending', progress: 0 })));
    setIsProcessingAudio(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setAudioData(p => p.map(it => it.url === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = await api.post('/youtube/audio', { url }, { responseType: 'blob' });
        const contentDisposition = r.headers['content-disposition'];
        let filename = `${i + 1}.mp3`;
        if (contentDisposition) {
          const m = contentDisposition.match(/filename="(.+)"/);
          if (m) filename = m[1];
        }
        const blobUrl = URL.createObjectURL(r.data);
        downloadFile(blobUrl, filename, r.data);
        setAudioData(p => p.map(it => it.url === url ? { ...it, status: 'success', progress: 100 } : it));
        ok++;
      } catch (e: any) {
        setAudioData(p => p.map(it => it.url === url ? { ...it, status: 'failed', error: e.response?.data?.message || e.message } : it));
      }
    }
    setIsProcessingAudio(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length} audio`);
  };

  // Video handler
  const handleGetVideoBulk = async () => {
    const urls = formatUrlList(videoUrls);
    if (!urls.length) return;
    setVideoDownloadData(urls.map(u => ({ url: u, status: 'pending', progress: 0 })));
    setIsProcessingVideo(true);
    let ok = 0;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setVideoDownloadData(p => p.map(it => it.url === url ? { ...it, status: 'loading', progress: 30 } : it));
      try {
        const r = await api.post('/youtube/video', { url }, { responseType: 'blob' });
        const contentDisposition = r.headers['content-disposition'];
        let filename = `${i + 1}.mp4`;
        if (contentDisposition) {
          const m = contentDisposition.match(/filename="(.+)"/);
          if (m) filename = m[1];
        }
        const blobUrl = URL.createObjectURL(r.data);
        downloadFile(blobUrl, filename, r.data);
        setVideoDownloadData(p => p.map(it => it.url === url ? { ...it, status: 'success', progress: 100 } : it));
        ok++;
      } catch (e: any) {
        setVideoDownloadData(p => p.map(it => it.url === url ? { ...it, status: 'failed', error: e.response?.data?.message || e.message } : it));
      }
    }
    setIsProcessingVideo(false);
    toast.success(`Hoàn thành: ${ok}/${urls.length} video`);
  };

  // Channel URLs handler
  const handleGetChannelUrls = async () => {
    if (!channelUrl.trim()) { toast.error('Nhập URL kênh YouTube'); return; }
    setChannelLoading(true);
    setChannelVideoUrls([]);
    try {
      const r = await api.post('/youtube/urls', { url: channelUrl });
      if (r.data?.urls) {
        setChannelVideoUrls(r.data.urls);
        toast.success(`Tìm thấy ${r.data.urls.length} video`);
      }
    } catch (e: any) { toast.error(e.response?.data?.message || e.message); }
    finally { setChannelLoading(false); }
  };

  const StatusBadge = ({ status, progress, error }: { status: BulkStatus; progress: number; error?: string }) => {
    if (status === 'pending') return <div className="flex items-center gap-1 text-muted-foreground text-xs"><Clock className="h-3 w-3" /> Chờ</div>;
    if (status === 'loading') return <div className="space-y-1"><div className="flex items-center gap-1 text-red-500 text-xs"><Loader2 className="h-3 w-3 animate-spin" /> {progress}%</div><Progress value={progress} className="h-1" /></div>;
    if (status === 'success') return <div className="flex items-center gap-1 text-green-500 text-xs"><CheckCircle className="h-3 w-3" /> OK</div>;
    return <div className="flex items-center gap-1 text-red-500 text-xs" title={error}><XCircle className="h-3 w-3" /> Lỗi</div>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="p-2 bg-red-600 rounded-lg text-white shadow-md"><Youtube className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">YouTube Downloader & Tools</h1>
          <p className="text-muted-foreground text-sm">Tải transcript, audio, video và lấy danh sách URL kênh YouTube.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-auto p-1 max-w-[700px] mb-4">
          <TabsTrigger value="transcript" className="flex items-center gap-1.5 py-2"><FileText className="h-4 w-4" /> Transcript</TabsTrigger>
          <TabsTrigger value="audio" className="flex items-center gap-1.5 py-2"><Music className="h-4 w-4" /> Tải audio</TabsTrigger>
          <TabsTrigger value="video" className="flex items-center gap-1.5 py-2"><Video className="h-4 w-4" /> Tải video</TabsTrigger>
          <TabsTrigger value="urls" className="flex items-center gap-1.5 py-2"><List className="h-4 w-4" /> URLs kênh</TabsTrigger>
        </TabsList>

        {/* Transcript Tab */}
        <TabsContent value="transcript" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs YouTube để lấy transcript</label>
            <Textarea value={transcriptUrls} onChange={e => { setTranscriptUrls(e.target.value); setIsTranscriptFormatted(false); }} placeholder="URLs YouTube..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingTranscript} />
            <div className="flex gap-2">
              <Button onClick={() => { setTranscriptUrls(formatUrlList(transcriptUrls).join(', ')); setIsTranscriptFormatted(true); toast.success('OK'); }} variant="outline" className="text-red-600">Định dạng</Button>
              <Button onClick={handleGetTranscripts} disabled={!isTranscriptFormatted || isProcessingTranscript} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingTranscript ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang xử lý...</> : 'Lấy Transcript'}
              </Button>
            </div>
          </Card>
          {transcriptData.length > 0 && (
            <div className="space-y-3">
              {transcriptData.map((item, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{i + 1}.</span>
                      <span className="text-xs font-mono truncate max-w-md">{item.url}</span>
                    </div>
                    <StatusBadge {...item} />
                  </div>
                  {item.title && <p className="text-sm font-semibold mb-1">{item.title}</p>}
                  {item.transcript && (
                    <div className="relative">
                      <pre className="text-xs bg-muted p-3 rounded max-h-[200px] overflow-y-auto whitespace-pre-wrap">{item.transcript}</pre>
                      <Button size="sm" variant="ghost" className="absolute top-1 right-1 h-6 px-2" onClick={() => { navigator.clipboard.writeText(item.transcript || ''); toast.success('Đã copy transcript'); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {item.error && <p className="text-xs text-red-500 mt-1">{item.error}</p>}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Audio Tab */}
        <TabsContent value="audio" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs YouTube để tải audio</label>
            <Textarea value={audioUrls} onChange={e => { setAudioUrls(e.target.value); setIsAudioFormatted(false); }} placeholder="URLs YouTube..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingAudio} />
            <div className="flex gap-2">
              <Button onClick={() => { setAudioUrls(formatUrlList(audioUrls).join(', ')); setIsAudioFormatted(true); toast.success('OK'); }} variant="outline" className="text-red-600">Định dạng</Button>
              <Button onClick={handleGetAudioBulk} disabled={!isAudioFormatted || isProcessingAudio} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingAudio ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Audio'}
              </Button>
            </div>
          </Card>
          {audioData.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left w-12">#</th><th className="px-3 py-2 text-left">URL</th><th className="px-3 py-2 text-left w-28">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th></tr></thead>
                <tbody>{audioData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50"><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{item.url}</td><td className="px-3 py-2"><StatusBadge {...item} /></td><td className="px-3 py-2 text-xs text-red-500 truncate max-w-xs">{item.error || ''}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* Video Tab */}
        <TabsContent value="video" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URLs YouTube để tải video</label>
            <Textarea value={videoUrls} onChange={e => { setVideoUrls(e.target.value); setIsVideoFormatted(false); }} placeholder="URLs YouTube..." className="min-h-[120px] font-mono text-sm mb-3" disabled={isProcessingVideo} />
            <div className="flex gap-2">
              <Button onClick={() => { setVideoUrls(formatUrlList(videoUrls).join(', ')); setIsVideoFormatted(true); toast.success('OK'); }} variant="outline" className="text-red-600">Định dạng</Button>
              <Button onClick={handleGetVideoBulk} disabled={!isVideoFormatted || isProcessingVideo} className="bg-red-600 hover:bg-red-700 text-white">
                {isProcessingVideo ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang tải...</> : 'Tải Video'}
              </Button>
            </div>
          </Card>
          {videoDownloadData.length > 0 && (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50"><th className="px-3 py-2 text-left w-12">#</th><th className="px-3 py-2 text-left">URL</th><th className="px-3 py-2 text-left w-28">Trạng thái</th><th className="px-3 py-2 text-left">Lỗi</th></tr></thead>
                <tbody>{videoDownloadData.map((item, i) => (
                  <tr key={i} className="border-b border-border/50"><td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{item.url}</td><td className="px-3 py-2"><StatusBadge {...item} /></td><td className="px-3 py-2 text-xs text-red-500 truncate max-w-xs">{item.error || ''}</td></tr>
                ))}</tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        {/* Channel URLs Tab */}
        <TabsContent value="urls" className="space-y-4">
          <Card className="p-6">
            <label className="text-sm font-semibold block mb-2">Nhập URL kênh YouTube để lấy danh sách video URLs</label>
            <div className="flex gap-2">
              <Input value={channelUrl} onChange={e => setChannelUrl(e.target.value)} placeholder="https://www.youtube.com/@channel" className="flex-1 h-11" disabled={channelLoading} />
              <Button onClick={handleGetChannelUrls} disabled={channelLoading} className="h-11 bg-red-600 hover:bg-red-700 text-white">
                {channelLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang quét...</> : 'Lấy URLs'}
              </Button>
            </div>
          </Card>
          {channelVideoUrls.length > 0 && (
            <Card className="p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold">{channelVideoUrls.length} video URLs</h3>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(channelVideoUrls.join('\n')); toast.success('Đã copy tất cả URLs'); }}>
                  <Copy className="h-3 w-3 mr-1" /> Copy tất cả
                </Button>
              </div>
              <Textarea value={channelVideoUrls.join('\n')} readOnly className="min-h-[200px] font-mono text-xs" />
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

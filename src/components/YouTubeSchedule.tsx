import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  youtubeService,
  type YouTubeChannelItem,
} from '@/services/youtube.service';
import { YouTubeAccountsManager } from './YouTubeAccountsManager';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Sparkles,
  Layers,
  Youtube,
  AlertCircle,
  Video,
  Upload,
  Image as ImageIcon,
  FolderOpen,
  Lock,
  EyeOff,
  FileEdit,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';

export interface BulkYouTubeVideoItem {
  id: string;
  channelId?: string;
  videoId: string;
  title: string;
  description: string;
  tags: string[];
  publishTime: string;
  existingPublishAt?: string;
  status: 'idle' | 'scheduling' | 'success' | 'failed';
  metadataStatus?: 'idle' | 'updating' | 'success' | 'failed';
  privacyStatus?: string;
  videoState?: 'DRAFT' | 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
  isDraft?: boolean;
  uploadStatus?: string | null;
  privacyStatusUpdate?: 'idle' | 'updating' | 'success' | 'failed';
  error?: string;
  channelTitle?: string;
  thumbnailUrl?: string;
  thumbnailFile?: File;
  thumbnailPreview?: string;
  thumbnailFileName?: string;
  thumbnailStatus?: 'idle' | 'updating' | 'success' | 'failed';
}

interface ParsedTxtTitle {
  stt: number;
  title: string;
}

interface ImageSTTItem {
  stt: number;
  file: File;
  fileName: string;
  previewUrl: string;
}

const parseImagesAndMatchSTT = (files: FileList | File[]): ImageSTTItem[] => {
  const fileArray = Array.from(files).filter(
    (file) =>
      file.type.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)
  );

  const items: ImageSTTItem[] = fileArray.map((file, idx) => {
    const match = file.name.match(/(\d+)/);
    const stt = match ? parseInt(match[1], 10) : idx + 1;
    return {
      stt,
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
    };
  });

  items.sort((a, b) => a.stt - b.stt);
  return items;
};

const parseTitlesFromTxt = (text: string): ParsedTxtTitle[] => {
  if (!text || !text.trim()) return [];

  const result: ParsedTxtTitle[] = [];
  const numberedBlockRegex = /(?:^|\n)\s*(\d+)[\.\)]\s*([\s\S]*?)(?=(?:\n\s*\d+[\.\)]|$))/g;
  let match: RegExpExecArray | null;

  while ((match = numberedBlockRegex.exec(text)) !== null) {
    const stt = parseInt(match[1], 10);
    let content = match[2].trim();
    content = content.replace(/\n+/g, ' ').trim();

    if (content) {
      result.push({ stt, title: content });
    }
  }

  if (result.length === 0) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    lines.forEach((line, idx) => {
      const cleaned = line.replace(/^\d+[\.\)]\s*/, '').trim();
      if (cleaned) {
        result.push({ stt: idx + 1, title: cleaned });
      }
    });
  }

  result.sort((a, b) => a.stt - b.stt);
  return result;
};

export const YouTubeSchedule = () => {
  const [channels, setChannels] = useState<YouTubeChannelItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    () => localStorage.getItem('youtube_selected_channel') || ''
  );

  const defaultStartDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState<string>(defaultStartDate);
  const [timeSlots, setTimeSlots] = useState<string[]>(['18:00']);
  const [scheduleMode, setScheduleMode] = useState<'by_day' | 'by_slot'>('by_day');

  const [activeTab, setActiveTab] = useState<'edit' | 'schedule'>('edit');
  const [fetchPrivacy, setFetchPrivacy] = useState<'draft' | 'unlisted'>('draft');
  const [batchPrivacyTarget, setBatchPrivacyTarget] = useState<'unlisted' | 'private'>('unlisted');
  const [isBatchUpdatingPrivacy, setIsBatchUpdatingPrivacy] = useState(false);

  const [videos, setVideos] = useState<BulkYouTubeVideoItem[]>([]);
  const [loadingChannelVideos, setLoadingChannelVideos] = useState(false);

  // Pagination state
  const [pageSize, setPageSize] = useState<50 | 100>(100);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  // pageTokenStack: stack of page-start tokens — index 0 = page 1 (undefined), last = current page
  const [pageTokenStack, setPageTokenStack] = useState<Array<string | undefined>>([]);
  const [totalResults, setTotalResults] = useState<number>(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [txtContent, setTxtContent] = useState('');
  const txtFileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [sttImageItems, setSttImageItems] = useState<ImageSTTItem[]>([]);
  const [isSavingEditTab, setIsSavingEditTab] = useState(false);

  const parsedTxtTitles = parseTitlesFromTxt(txtContent);

  const handleAddTimeSlot = () => {
    const defaultNextTimes = ['08:00', '12:00', '16:00', '18:00', '20:00', '22:00'];
    const existingSet = new Set(timeSlots);
    const available = defaultNextTimes.find((t) => !existingSet.has(t)) || '12:00';
    setTimeSlots((prev) => [...prev, available]);
  };

  const handleRemoveTimeSlot = (index: number) => {
    if (timeSlots.length <= 1) {
      toast.error('Cần giữ lại ít nhất 1 khung giờ công chiếu!');
      return;
    }
    setTimeSlots((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateTimeSlot = (index: number, value: string) => {
    setTimeSlots((prev) => prev.map((t, idx) => (idx === index ? value : t)));
  };

  const handleImageFilesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const parsedImages = parseImagesAndMatchSTT(files);
    if (parsedImages.length === 0) {
      toast.error('Không tìm thấy file ảnh hợp lệ (PNG/JPG/WEBP)!');
      return;
    }

    setSttImageItems(parsedImages);
    toast.success(`Đã nạp ${parsedImages.length} ảnh thumbnail từ folder/files!`);
  };

  const handleApplyImagesToVideos = () => {
    if (sttImageItems.length === 0) {
      toast.error('Chưa có ảnh thumbnail nào được tải lên!');
      return;
    }

    let appliedCount = 0;
    setVideos((prev) =>
      prev.map((v, idx) => {
        const itemSTT = idx + 1;
        const matchedImage = sttImageItems.find((img) => img.stt === itemSTT);
        if (matchedImage) {
          appliedCount++;
          return {
            ...v,
            thumbnailFile: matchedImage.file,
            thumbnailPreview: matchedImage.previewUrl,
            thumbnailFileName: matchedImage.fileName,
            thumbnailStatus: 'idle',
          };
        }
        return v;
      })
    );

    toast.success(`Đã tự động gán thumbnail cho ${appliedCount} video theo STT!`);
  };

  const handleTxtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = (event.target?.result as string) || '';
      setTxtContent(content);
      const parsed = parseTitlesFromTxt(content);
      toast.success(`Đã đọc file "${file.name}" — tìm thấy ${parsed.length} tiêu đề.`);
    };
    reader.onerror = () => {
      toast.error('Lỗi khi đọc file TXT');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleApplyTitlesToVideos = () => {
    if (parsedTxtTitles.length === 0) {
      toast.error('Không có tiêu đề nào để áp dụng!');
      return;
    }

    let appliedCount = 0;
    setVideos((prev) =>
      prev.map((v, idx) => {
        const itemSTT = idx + 1;
        const matchedTitle = parsedTxtTitles.find((pt) => pt.stt === itemSTT);
        if (matchedTitle && matchedTitle.title) {
          appliedCount++;
          return {
            ...v,
            title: matchedTitle.title,
            metadataStatus: 'idle',
          };
        }
        return v;
      })
    );

    toast.success(`Đã cập nhật tiêu đề cho ${appliedCount} video theo STT!`);
  };

  const handleSingleThumbnailChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setVideos((prev) =>
      prev.map((v, idx) =>
        idx === index
          ? {
            ...v,
            thumbnailFile: file,
            thumbnailPreview: previewUrl,
            thumbnailFileName: file.name,
            thumbnailStatus: 'idle',
          }
          : v
      )
    );
    toast.success(`Đã chọn ảnh cho video STT ${index + 1}`);
  };

  const handleSaveAllEditTab = async () => {
    if (!selectedChannelId) {
      toast.error('Vui lòng chọn kênh YouTube trước khi lưu!');
      return;
    }

    const targetVideos = filteredVideos;
    if (targetVideos.length === 0) {
      toast.error('Không có video nào trong danh sách để cập nhật!');
      return;
    }

    setIsSavingEditTab(true);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetVideos.length; i++) {
      const item = targetVideos[i];

      // Update Metadata
      try {
        setVideos((prev) =>
          prev.map((v) => (v.id === item.id ? { ...v, metadataStatus: 'updating' } : v))
        );

        await youtubeService.updateMetadata({
          channelId: selectedChannelId,
          videoId: item.videoId,
          title: item.title,
          description: item.description || '',
          tags: item.tags || [],
        });

        setVideos((prev) =>
          prev.map((v) => (v.id === item.id ? { ...v, metadataStatus: 'success' } : v))
        );
      } catch (err: any) {
        failCount++;
        setVideos((prev) =>
          prev.map((v) => (v.id === item.id ? { ...v, metadataStatus: 'failed', error: err.message } : v))
        );
      }

      // Update Thumbnail
      if (item.thumbnailFile) {
        try {
          setVideos((prev) =>
            prev.map((v) => (v.id === item.id ? { ...v, thumbnailStatus: 'updating' } : v))
          );

          await youtubeService.updateThumbnail(selectedChannelId, item.videoId, item.thumbnailFile);

          setVideos((prev) =>
            prev.map((v) => (v.id === item.id ? { ...v, thumbnailStatus: 'success' } : v))
          );
        } catch (err: any) {
          failCount++;
          setVideos((prev) =>
            prev.map((v) => (v.id === item.id ? { ...v, thumbnailStatus: 'failed', error: err.message } : v))
          );
        }
      }

      successCount++;
    }

    setIsSavingEditTab(false);
    if (failCount === 0) {
      toast.success(`Đã cập nhật metadata & thumbnail thành công cho ${successCount} video!`);
    } else {
      toast.warning(`Hoàn tất: ${successCount} thành công, ${failCount} thất bại.`);
    }
  };

  const fetchConnectedChannels = async () => {
    try {
      const res = await youtubeService.getConnectedChannels();
      if (res.success) {
        const list = res.channels || [];
        setChannels(list);
        if (list.length > 0) {
          const currentValid = list.some((c) => c.channelId === selectedChannelId);
          if (!selectedChannelId || !currentValid) {
            const firstId = list[0].channelId;
            setSelectedChannelId(firstId);
            localStorage.setItem('youtube_selected_channel', firstId);
          }
        } else {
          setSelectedChannelId('');
          localStorage.removeItem('youtube_selected_channel');
          setVideos([]);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchConnectedChannels();

    const onFocus = () => {
      fetchConnectedChannels();
    };

    window.addEventListener('focus', onFocus);
    if ((window as any).electronAPI?.onAppFocused) {
      (window as any).electronAPI.onAppFocused(onFocus);
    }
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const fetchChannelVideos = async (
    channelId: string,
    privacy: 'draft' | 'unlisted' = fetchPrivacy,
    pageToken?: string,
    maxResults: 50 | 100 = pageSize
  ) => {
    if (!channelId) return;
    setLoadingChannelVideos(true);
    try {
      const res = await youtubeService.getChannelVideos(channelId, maxResults, pageToken, privacy);
      if (res.success && res.videos) {
        const mappedVideos: BulkYouTubeVideoItem[] = res.videos.map((v) => ({
          id: v.id,
          channelId,
          videoId: v.id,
          title: v.title,
          description: v.description || '',
          tags: [],
          publishTime: v.publishAt || '',
          existingPublishAt: v.publishAt || undefined,
          status: 'idle',
          metadataStatus: 'idle',
          privacyStatus: v.privacyStatus,
          videoState: v.videoState,
          isDraft: v.isDraft,
          uploadStatus: v.uploadStatus,
          privacyStatusUpdate: 'idle',
          channelTitle: channels.find((c) => c.channelId === channelId)?.channelTitle || '',
          thumbnailUrl: v.thumbnailUrl,
        }));
        setVideos(mappedVideos);
        setNextPageToken(res.nextPageToken ?? null);
        setTotalResults(res.totalResults ?? mappedVideos.length);
        const statusLabel = privacy === 'draft' ? 'Bản nháp' : 'Không công khai';
        toast.success(`Đã tải ${mappedVideos.length} video (${statusLabel}) từ kênh!`);
      } else {
        toast.error(res.message || 'Không thể tải danh sách video của kênh');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi lấy danh sách video kênh');
    } finally {
      setLoadingChannelVideos(false);
    }
  };

  const handleNextPage = () => {
    if (!nextPageToken || !selectedChannelId) return;
    // Push nextPageToken onto the stack (it becomes the start token of the new current page)
    setPageTokenStack((prev) => [...prev, nextPageToken]);
    fetchChannelVideos(selectedChannelId, fetchPrivacy, nextPageToken, pageSize);
  };

  const handlePrevPage = () => {
    if (!selectedChannelId || pageTokenStack.length === 0) return;
    // Pop current page's token — the new top of stack is the previous page's start token
    const newStack = pageTokenStack.slice(0, -1);
    const targetToken = newStack.length > 0 ? newStack[newStack.length - 1] : undefined;
    setPageTokenStack(newStack);
    fetchChannelVideos(selectedChannelId, fetchPrivacy, targetToken, pageSize);
  };


  const handleBatchUpdatePrivacy = async () => {
    if (!selectedChannelId) {
      toast.error('Vui lòng chọn kênh trước!');
      return;
    }
    const targetVideos = filteredVideos;
    if (targetVideos.length === 0) {
      toast.error('Không có video nào trong danh sách!');
      return;
    }

    setIsBatchUpdatingPrivacy(true);
    let successCount = 0;
    let failCount = 0;

    for (const video of targetVideos) {
      setVideos((prev) =>
        prev.map((v) => (v.id === video.id ? { ...v, privacyStatusUpdate: 'updating' } : v))
      );

      try {
        const res = await youtubeService.updatePrivacyStatus({
          channelId: selectedChannelId,
          videoId: video.videoId,
          privacyStatus: batchPrivacyTarget,
        });

        if (res.success) {
          successCount++;
          setVideos((prev) =>
            prev.map((v) =>
              v.id === video.id
                ? {
                  ...v,
                  privacyStatus: batchPrivacyTarget,
                  privacyStatusUpdate: 'success',
                  existingPublishAt: res.publishAt || undefined,
                }
                : v
            )
          );
        } else {
          failCount++;
          setVideos((prev) =>
            prev.map((v) => (v.id === video.id ? { ...v, privacyStatusUpdate: 'failed' } : v))
          );
        }
      } catch {
        failCount++;
        setVideos((prev) =>
          prev.map((v) => (v.id === video.id ? { ...v, privacyStatusUpdate: 'failed' } : v))
        );
      }
    }

    setIsBatchUpdatingPrivacy(false);
    const label =
      batchPrivacyTarget === 'unlisted'
        ? 'Không công khai'
        : 'Riêng tư';
    if (failCount === 0) {
      toast.success(`Đã cập nhật trạng thái "${label}" cho ${successCount} video!`);
    } else {
      toast.warning(`Đã cập nhật: ${successCount} thành công, ${failCount} thất bại.`);
    }
  };

  useEffect(() => {
    if (selectedChannelId) {
      fetchChannelVideos(selectedChannelId);
    }
  }, [selectedChannelId]);

  // Tự động phân bổ lịch chiếu khi startDate, timeSlots hoặc danh sách videos thay đổi
  useEffect(() => {
    if (videos.length === 0 || timeSlots.length === 0) return;

    setVideos((prev) => {
      const sortedSlots = [...timeSlots].sort();
      let currentDate = new Date(startDate);

      return prev.map((item, idx) => {
        let publishDate: Date;

        if (scheduleMode === 'by_slot') {
          const slotIndex = idx % sortedSlots.length;
          const dayOffset = Math.floor(idx / sortedSlots.length);
          const [hours, minutes] = sortedSlots[slotIndex].split(':').map(Number);

          publishDate = new Date(currentDate);
          publishDate.setDate(publishDate.getDate() + dayOffset);
          publishDate.setHours(hours, minutes, 0, 0);
        } else {
          // by_day: Mỗi ngày 1 video theo slot đầu tiên
          const [hours, minutes] = sortedSlots[0].split(':').map(Number);
          publishDate = new Date(currentDate);
          publishDate.setDate(publishDate.getDate() + idx);
          publishDate.setHours(hours, minutes, 0, 0);
        }

        return {
          ...item,
          publishTime: publishDate.toISOString(),
        };
      });
    });
  }, [startDate, timeSlots, scheduleMode, videos.length]);

  const handleStartSchedule = async () => {
    if (!selectedChannelId) {
      toast.error('Vui lòng chọn một kênh YouTube!');
      return;
    }

    const targetVideos = filteredVideos.filter((v) => v.status !== 'success');
    if (targetVideos.length === 0) {
      toast.error('Không có video nào cần lên lịch!');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetVideos.length; i++) {
      const item = targetVideos[i];

      setVideos((prev) =>
        prev.map((v) => (v.id === item.id ? { ...v, status: 'scheduling', error: undefined } : v))
      );

      try {
        const res = await youtubeService.scheduleVideo({
          channelId: selectedChannelId,
          videoId: item.videoId,
          publishTime: item.publishTime,
        });

        if (res.success) {
          successCount++;
          setVideos((prev) =>
            prev.map((v) =>
              v.id === item.id
                ? {
                  ...v,
                  status: 'success',
                  existingPublishAt: res.publishAt || item.publishTime,
                  privacyStatus: res.privacyStatus || 'private',
                }
                : v
            )
          );
        } else {
          failCount++;
          setVideos((prev) =>
            prev.map((v) =>
              v.id === item.id ? { ...v, status: 'failed', error: res.message || 'Lên lịch thất bại' } : v
            )
          );
        }
      } catch (err: any) {
        failCount++;
        setVideos((prev) =>
          prev.map((v) =>
            v.id === item.id
              ? { ...v, status: 'failed', error: err?.response?.data?.message || err.message }
              : v
          )
        );
      }

      setProgress(Math.round(((i + 1) / targetVideos.length) * 100));
    }

    setIsProcessing(false);
    if (failCount === 0) {
      toast.success(`Đã lên lịch thành công cho ${successCount} video!`);
    } else {
      toast.warning(`Hoàn tất: ${successCount} thành công, ${failCount} thất bại.`);
    }
  };

  const filteredVideos = videos;

  return (
    <div className="space-y-6">
      {/* 1. Accounts Manager Section */}
      <YouTubeAccountsManager
        channels={channels}
        onChannelChange={() => {
          fetchConnectedChannels();
        }}
      />

      {/* 2. Channel Selector Bar */}
      {channels.length > 0 && (
        <Card className="p-4 bg-card/60 backdrop-blur border shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2 rounded-lg bg-red-600/10 text-red-600 shrink-0">
                <Youtube className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <label className="text-xs font-semibold text-foreground block">
                  Chọn kênh YouTube thao tác:
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Select
                    value={selectedChannelId}
                    onValueChange={(val) => {
                      setSelectedChannelId(val);
                      localStorage.setItem('youtube_selected_channel', val);
                      // Reset pagination on channel change
                      setPageTokenStack([]);
                      setNextPageToken(null);
                      setTotalResults(0);
                    }}
                  >
                    <SelectTrigger className="w-full md:w-56 h-8 text-xs font-medium">
                      <SelectValue placeholder="Chọn kênh..." />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((ch) => (
                        <SelectItem key={ch.channelId} value={ch.channelId}>
                          <span className="font-semibold">{ch.channelTitle}</span>{' '}
                          <span className="text-muted-foreground text-[10px]">({ch.channelId})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={fetchPrivacy}
                    onValueChange={(val: any) => {
                      setFetchPrivacy(val);
                      // Reset pagination on filter change
                      setPageTokenStack([]);
                      setNextPageToken(null);
                      if (selectedChannelId) {
                        fetchChannelVideos(selectedChannelId, val, undefined, pageSize);
                      }
                    }}
                  >
                    <SelectTrigger className="w-44 h-8 text-xs font-medium">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Bản nháp (Draft)</SelectItem>
                      <SelectItem value="unlisted">Không công khai (Unlisted)</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPageTokenStack([]);
                      fetchChannelVideos(selectedChannelId, fetchPrivacy, undefined, pageSize);
                    }}
                    disabled={loadingChannelVideos || !selectedChannelId}
                    className="h-8 text-xs flex items-center gap-1 shrink-0"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingChannelVideos ? 'animate-spin' : ''}`} />
                    Tải Video
                  </Button>
                </div>
              </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Page size selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Mỗi trang:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => {
                    const newSize = Number(val) as 50 | 100;
                    setPageSize(newSize);
                    setPageTokenStack([]);
                    if (selectedChannelId) {
                      fetchChannelVideos(selectedChannelId, fetchPrivacy, undefined, newSize);
                    }
                  }}
                >
                  <SelectTrigger className="w-20 h-8 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Prev / First page button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={loadingChannelVideos || pageTokenStack.length === 0}
                className="h-8 text-xs flex items-center gap-1 shrink-0"
              >
                ← Trước
              </Button>

              {/* Current page indicator */}
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap px-1">
                Trang {pageTokenStack.length + 1}
              </span>

              {/* Next page button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={loadingChannelVideos || !nextPageToken}
                className="h-8 text-xs flex items-center gap-1 shrink-0"
              >
                Tiếp →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* 3. Main Actions Tabs */}
      {selectedChannelId && (
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md h-10 p-1 mb-4">
            <TabsTrigger value="edit" className="flex items-center gap-2 text-xs">
              <Sparkles className="h-3.5 w-3.5 text-red-500" />
              1. Chỉnh sửa Tiêu đề & Thumbnail
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5 text-red-500" />
              2. Lên Lịch Công Chiếu
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: CHỈNH SỬA METADATA VÀ THUMBNAIL */}
          <TabsContent value="edit" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Import TXT Title Box */}
              <Card className="p-4 space-y-3 bg-card border shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                    <FolderOpen className="h-4 w-4 text-red-500" />
                    Nạp Tiêu Đề Từ File TXT (Theo STT)
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => txtFileInputRef.current?.click()}
                    className="text-xs h-7 gap-1"
                  >
                    <Upload className="h-3 w-3" />
                    Chọn File TXT
                  </Button>
                  <input
                    type="file"
                    ref={txtFileInputRef}
                    accept=".txt"
                    className="hidden"
                    onChange={handleTxtFileUpload}
                  />
                </div>

                <Textarea
                  value={txtContent}
                  onChange={(e) => setTxtContent(e.target.value)}
                  placeholder="Dán hoặc upload nội dung TXT ở đây:&#10;1. Tiêu đề video 1&#10;2. Tiêu đề video 2..."
                  className="h-28 text-xs font-mono"
                />

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Đã nhận diện: <strong className="text-foreground">{parsedTxtTitles.length}</strong> tiêu đề
                  </span>
                  <Button
                    size="sm"
                    onClick={handleApplyTitlesToVideos}
                    disabled={parsedTxtTitles.length === 0 || videos.length === 0}
                    className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Áp Dụng Vào Danh Sách
                  </Button>
                </div>
              </Card>

              {/* Import Folder Thumbnail Box */}
              <Card className="p-4 space-y-3 bg-card border shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-foreground">
                    <ImageIcon className="h-4 w-4 text-red-500" />
                    Nạp Thumbnail Hàng Loạt (1.jpg, 2.png...)
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => folderInputRef.current?.click()}
                    className="text-xs h-7 gap-1"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Chọn Ảnh / Folder
                  </Button>
                  <input
                    type="file"
                    ref={folderInputRef}
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageFilesUpload}
                  />
                </div>

                <div className="h-28 border border-dashed rounded-lg p-3 overflow-y-auto bg-muted/20 flex flex-wrap gap-2 items-center content-start">
                  {sttImageItems.length === 0 ? (
                    <div className="w-full text-center text-xs text-muted-foreground py-6">
                      Chưa chọn ảnh thumbnail nào. Hãy chọn nhiều ảnh có tên chứa số thứ tự (ví dụ: 1.png, 2.jpg).
                    </div>
                  ) : (
                    sttImageItems.map((img) => (
                      <div
                        key={img.fileName}
                        className="relative group border rounded p-1 bg-background flex items-center gap-1.5 text-[11px]"
                      >
                        <img src={img.previewUrl} className="w-6 h-6 object-cover rounded" alt="" />
                        <span className="font-semibold text-red-600">STT {img.stt}:</span>
                        <span className="truncate max-w-[80px] text-muted-foreground">{img.fileName}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Đã nạp: <strong className="text-foreground">{sttImageItems.length}</strong> ảnh
                  </span>
                  <Button
                    size="sm"
                    onClick={handleApplyImagesToVideos}
                    disabled={sttImageItems.length === 0 || videos.length === 0}
                    className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white"
                  >
                    Ghép Vào Danh Sách
                  </Button>
                </div>
              </Card>
            </div>

            {/* Batch Privacy Status & Save Changes Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Batch Status Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-lg bg-card border shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <EyeOff className="h-3.5 w-3.5 text-blue-500" />
                    Đổi trạng thái hiển thị:
                  </span>
                  <Select
                    value={batchPrivacyTarget}
                    onValueChange={(val: any) => setBatchPrivacyTarget(val)}
                  >
                    <SelectTrigger className="w-40 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unlisted">
                        <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                          <EyeOff className="h-3 w-3" /> Không công khai
                        </span>
                      </SelectItem>
                      <SelectItem value="private">
                        <span className="flex items-center gap-1.5 text-purple-600 font-medium">
                          <Lock className="h-3 w-3" /> Riêng tư (Private)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleBatchUpdatePrivacy}
                  disabled={isBatchUpdatingPrivacy || filteredVideos.length === 0}
                  variant="outline"
                  className="text-xs h-7 px-3 gap-1.5 border-blue-500/30 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0"
                >
                  {isBatchUpdatingPrivacy ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Áp Dụng Hàng Loạt
                </Button>
              </div>

              {/* Save All Edit Changes Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-lg bg-card border shadow-sm">
                <p className="text-xs text-muted-foreground truncate">
                  Lưu tiêu đề & ảnh thumbnail cho tất cả video:
                </p>

                <Button
                  onClick={handleSaveAllEditTab}
                  disabled={isSavingEditTab || filteredVideos.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 gap-1.5 shadow shrink-0"
                >
                  {isSavingEditTab ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  Lưu Tiêu Đề & Thumbnail
                </Button>
              </div>
            </div>

            {/* Video Edit Table */}
            <Card className="border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-[11px]">
                    <TableHead className="w-12 text-center">STT</TableHead>
                    <TableHead className="w-32">Thumbnail</TableHead>
                    <TableHead>Tiêu đề & Mô tả</TableHead>
                    <TableHead className="w-44 text-center">Trạng thái hiển thị</TableHead>
                    <TableHead className="w-32 text-center">Lưu Tiêu đề/Ảnh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVideos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                        {loadingChannelVideos
                          ? 'Đang tải danh sách video...'
                          : 'Không có video nào phù hợp với bộ lọc hiện tại.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVideos.map((video, idx) => (
                      <TableRow key={video.id} className="text-xs">
                        <TableCell className="text-center font-bold text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1.5">
                            <div className="w-24 h-14 bg-muted rounded overflow-hidden relative border group">
                              <img
                                src={video.thumbnailPreview || video.thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <label className="text-[10px] text-blue-500 hover:underline cursor-pointer block">
                              Đổi ảnh
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleSingleThumbnailChange(idx, e)}
                              />
                            </label>
                          </div>
                        </TableCell>
                        <TableCell className="space-y-1.5 py-2">
                          <Input
                            value={video.title}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVideos((prev) =>
                                prev.map((v, i) => (i === idx ? { ...v, title: val } : v))
                              );
                            }}
                            className="h-8 text-xs font-semibold"
                            placeholder="Tiêu đề video..."
                          />
                          <Textarea
                            value={video.description}
                            onChange={(e) => {
                              const val = e.target.value;
                              setVideos((prev) =>
                                prev.map((v, i) => (i === idx ? { ...v, description: val } : v))
                              );
                            }}
                            className="h-14 text-xs font-normal"
                            placeholder="Mô tả video..."
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            {video.privacyStatus === 'unlisted' ? (
                              <Badge variant="secondary" className="text-[11px] py-0.5 px-2 text-amber-600 bg-amber-500/10 font-medium inline-flex items-center gap-1">
                                <EyeOff className="h-3 w-3" /> Không công khai
                              </Badge>
                            ) : video.privacyStatus === 'private' ? (
                              <Badge variant="secondary" className="text-[11px] py-0.5 px-2 text-purple-600 bg-purple-500/10 font-medium inline-flex items-center gap-1">
                                <Lock className="h-3 w-3" /> Riêng tư
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[11px] py-0.5 px-2 text-emerald-600 bg-emerald-500/10 font-medium inline-flex items-center gap-1">
                                Công khai
                              </Badge>
                            )}

                            {video.isDraft && (
                              <span className="text-[10px] text-purple-500 font-medium bg-purple-500/10 px-1.5 py-0.5 rounded">
                                Bản nháp (Draft)
                              </span>
                            )}

                            {video.privacyStatusUpdate === 'updating' ? (
                              <span className="text-[10px] text-blue-500 flex items-center gap-1">
                                <RefreshCw className="h-2.5 w-2.5 animate-spin" /> Đang cập nhật...
                              </span>
                            ) : video.privacyStatusUpdate === 'success' ? (
                              <span className="text-[10px] text-emerald-500 font-medium">✓ Đã cập nhật</span>
                            ) : video.privacyStatusUpdate === 'failed' ? (
                              <span className="text-[10px] text-red-500 font-medium">✕ Lỗi đổi trạng thái</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="space-y-1">
                            {video.metadataStatus === 'updating' || video.thumbnailStatus === 'updating' ? (
                              <Badge variant="secondary" className="text-[10px] animate-pulse">
                                Đang lưu...
                              </Badge>
                            ) : video.metadataStatus === 'success' || video.thumbnailStatus === 'success' ? (
                              <Badge className="bg-emerald-600 text-[10px]">Đã lưu</Badge>
                            ) : video.metadataStatus === 'failed' || video.thumbnailStatus === 'failed' ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Lỗi
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Chưa lưu
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TAB 2: LÊN LỊCH CÔNG CHIẾU */}
          <TabsContent value="schedule" className="space-y-4">
            <Card className="p-4 space-y-4 bg-card border shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Ngày bắt đầu */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-red-500" />
                    Ngày bắt đầu công chiếu
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Chế độ phân bổ */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-red-500" />
                    Chế độ phân bổ lịch
                  </label>
                  <Select
                    value={scheduleMode}
                    onValueChange={(v: any) => setScheduleMode(v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="by_slot">Nhiều video trong ngày (Theo khung giờ)</SelectItem>
                      <SelectItem value="by_day">Mỗi ngày 1 video</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Khung giờ công chiếu */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-red-500" />
                      Khung giờ (Time Slots)
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddTimeSlot}
                      className="h-6 text-[11px] px-1.5 text-blue-500"
                    >
                      <Plus className="h-3 w-3 mr-0.5" /> Thêm giờ
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {timeSlots.map((time, idx) => (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-1 bg-muted px-2 py-1 rounded border text-xs"
                      >
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => handleUpdateTimeSlot(idx, e.target.value)}
                          className="bg-transparent text-xs outline-none"
                        />
                        {timeSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTimeSlot(idx)}
                            className="text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  Số video sẽ được lên lịch:{' '}
                  <strong className="text-foreground">{filteredVideos.length}</strong>
                </div>

                <Button
                  onClick={handleStartSchedule}
                  disabled={isProcessing || filteredVideos.length === 0}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 px-6 gap-2 shadow-md"
                >
                  {isProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Đang xử lý ({progress}%)...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      Bắt Đầu Lên Lịch Hàng Loạt
                    </>
                  )}
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-1 pt-1">
                  <Progress value={progress} className="h-2" />
                  <p className="text-[11px] text-muted-foreground text-right">{progress}% hoàn thành</p>
                </div>
              )}
            </Card>

            {/* Video Schedule Table */}
            <Card className="border shadow-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 text-[11px]">
                    <TableHead className="w-12 text-center">STT</TableHead>
                    <TableHead className="w-28">Thumbnail</TableHead>
                    <TableHead>Tiêu đề Video</TableHead>
                    <TableHead className="w-48">Thời gian công chiếu dự kiến</TableHead>
                    <TableHead className="w-36 text-center">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVideos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                        Không có video nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVideos.map((video, idx) => {
                      const formattedTime = video.publishTime
                        ? new Date(video.publishTime).toLocaleString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                        : 'Chưa có lịch';

                      return (
                        <TableRow key={video.id} className="text-xs">
                          <TableCell className="text-center font-bold text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <div className="w-20 h-12 bg-muted rounded overflow-hidden relative border">
                              <img
                                src={video.thumbnailPreview || video.thumbnailUrl}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-semibold text-foreground line-clamp-2">{video.title}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-muted-foreground font-mono">{video.videoId}</span>
                              {video.isDraft ? (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 text-purple-500 bg-purple-500/10 font-medium">
                                  Bản nháp
                                </Badge>
                              ) : video.privacyStatus === 'unlisted' ? (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 text-amber-500 bg-amber-500/10 font-medium">
                                  Không công khai
                                </Badge>
                              ) : video.privacyStatus === 'private' ? (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 text-slate-400 bg-slate-400/10 font-medium">
                                  Riêng tư
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[9px] py-0 px-1 text-emerald-500 bg-emerald-500/10 font-medium">
                                  Công khai
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted/60 font-mono text-[11px] text-foreground border">
                                <Clock className="h-3 w-3 text-red-500" />
                                {formattedTime}
                              </div>
                              {video.existingPublishAt && (
                                <p className="text-[10px] text-emerald-500 font-medium">
                                  ✓ Đã có lịch trên YouTube
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {video.status === 'scheduling' ? (
                              <Badge variant="secondary" className="text-[10px] animate-pulse">
                                Đang lên lịch...
                              </Badge>
                            ) : video.status === 'success' ? (
                              <Badge className="bg-emerald-600 text-[10px] flex items-center gap-1 mx-auto w-fit">
                                <CheckCircle2 className="h-3 w-3" /> Thành công
                              </Badge>
                            ) : video.status === 'failed' ? (
                              <Badge variant="destructive" className="text-[10px] flex items-center gap-1 mx-auto w-fit" title={video.error}>
                                <XCircle className="h-3 w-3" /> Thất bại
                              </Badge>
                            ) : video.existingPublishAt ? (
                              <Badge variant="secondary" className="text-[10px] text-emerald-500 bg-emerald-500/10">
                                Đã lên lịch
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Chờ lên lịch
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

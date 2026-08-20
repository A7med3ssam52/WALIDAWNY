import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

import { uploadManager, type VideoUploadJob } from '../upload/uploadManager';

const ACTIVE_STAGES = new Set(['queued', 'uploading', 'paused']);

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

/** Fixed bottom bar shown while any video upload runs in the background. */
export function BackgroundUploadBanner() {
  const [jobs, setJobs] = useState<VideoUploadJob[]>(() => uploadManager.getSnapshot());

  useEffect(() => {
    void uploadManager.resumeOnLoad();
    return uploadManager.subscribe(setJobs);
  }, []);

  const active = jobs.filter((job) => ACTIVE_STAGES.has(job.stage));
  if (active.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[180] px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="pointer-events-auto mx-auto w-full max-w-lg rounded-xl border border-white/10 bg-[rgba(16,13,40,0.92)] px-4 py-3 shadow-[0_24px_60px_-16px_rgba(2,1,10,0.9),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
        <p className="text-xs font-semibold text-foreground-muted">
          جاري رفع {active.length} فيديو في الخلفية
        </p>
        <ul className="mt-2 flex flex-col gap-2">
          {active.map((job) => (
            <li key={job.jobId} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {job.fileName}
                  </span>
                  <span className="shrink-0 text-xs text-foreground-subtle" dir="ltr">
                    {formatMiB(job.bytesSent)} / {formatMiB(job.bytesTotal)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={job.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`تقدم رفع ${job.fileName}`}
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500 ease-standard"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-foreground-muted">
                {job.progress}%
              </span>
              <button
                type="button"
                aria-label={`إلغاء رفع ${job.fileName}`}
                onClick={() => void uploadManager.cancelJob(job.jobId)}
                className="shrink-0 rounded-md p-1.5 text-foreground-subtle transition-colors hover:bg-white/5 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
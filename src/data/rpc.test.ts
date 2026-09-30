import { describe, expect, it, vi } from 'vitest';

import {
  deleteExamImage,
  deleteSuggestionImage,
  isCloudinaryAvatarPath,
  isCloudinaryExamImagePath,
  isCloudinarySuggestionImagePath,
  parseCloudinaryAvatarPath,
  parseExamImagePointer,
  parseSuggestionImagePointer,
  uploadExamImageToCloudinary,
  uploadSuggestionImageToCloudinary,
} from './rpc';

const EXAM_ID = 'ab000000-0000-0000-0000-000000000001';
const IMAGE_ID = '60000000-0000-0000-0000-000000000001';
const SUG_ID = '5a000000-0000-0000-0000-000000000001';
const SUG_IMAGE_ID = '70000000-0000-0000-0000-0000000000aa';

describe('exam image pointers', () => {
  it('detects Cloudinary exam pointers only', () => {
    expect(isCloudinaryExamImagePath(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`)).toBe(true);
    expect(isCloudinaryExamImagePath(`${EXAM_ID}/${IMAGE_ID}.png`)).toBe(false);
    expect(isCloudinaryExamImagePath('cloudinary:user-test-1/avatar.jpg:1788000000')).toBe(false);
    expect(isCloudinaryExamImagePath(null)).toBe(false);
    expect(isCloudinaryExamImagePath(undefined)).toBe(false);
  });

  it('parses valid exam pointers and rejects the rest', () => {
    expect(parseExamImagePointer(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.webp:42`)).toEqual({
      examId: EXAM_ID,
      imageId: IMAGE_ID,
      format: 'webp',
      version: '42',
    });
    expect(parseExamImagePointer(`${EXAM_ID}/${IMAGE_ID}.png`)).toBeNull();
    expect(parseExamImagePointer(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.gif:42`)).toBeNull();
    expect(parseExamImagePointer(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png`)).toBeNull();
    expect(
      parseExamImagePointer(`cloudinary:exam-images/not-an-exam/${IMAGE_ID}.png:42`),
    ).toBeNull();
  });

  it('keeps avatar pointers separate from exam pointers', () => {
    const avatar = 'cloudinary:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000';
    expect(isCloudinaryAvatarPath(avatar)).toBe(true);
    expect(isCloudinaryExamImagePath(avatar)).toBe(false);
    expect(parseCloudinaryAvatarPath(avatar)).not.toBeNull();
    expect(parseExamImagePointer(avatar)).toBeNull();
  });
});

describe('uploadExamImageToCloudinary', () => {
  it('signs, uploads and returns the bound pointer', async () => {
    const captured: { form: FormData | null } = { form: null };
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/functions/v1/upload-exam-image')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
            cloud_name: 'test-cloud',
            api_key: 'test-key',
            timestamp: '1788000000',
            signature: 'test-signature',
            public_id: `exam-images/${EXAM_ID}/${IMAGE_ID}`,
            exam_id: EXAM_ID,
            image_id: IMAGE_ID,
          }),
        };
      }
      if (target.includes('api.cloudinary.com')) {
        captured.form = (init?.body as FormData | null) ?? null;
        return {
          ok: true,
          status: 200,
          json: async () => ({ format: 'png', version: 1788000000 }),
        };
      }
      throw new Error(`unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = new File([new Uint8Array([1, 2, 3])], 'سؤال-1.PNG', { type: 'image/png' });
    await expect(uploadExamImageToCloudinary(EXAM_ID, file)).resolves.toBe(
      `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`,
    );

    expect(captured.form).not.toBeNull();
    expect(captured.form?.get('public_id')).toBe(`exam-images/${EXAM_ID}/${IMAGE_ID}`);
    expect(captured.form?.get('type')).toBe('authenticated');
    vi.unstubAllGlobals();
  });

  it('rejects a grant for a different exam', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        timestamp: '1788000000',
        signature: 'test-signature',
        public_id: 'exam-images/other-exam/x',
        exam_id: 'other-exam',
        image_id: 'x',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([1])], 'q.jpg', { type: 'image/jpeg' });
    await expect(uploadExamImageToCloudinary(EXAM_ID, file)).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('suggestion image pointers', () => {
  it('detects Cloudinary suggestion pointers only', () => {
    expect(
      isCloudinarySuggestionImagePath(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.jpg:1788000000`),
    ).toBe(true);
    expect(isCloudinarySuggestionImagePath(`${SUG_ID}.jpg`)).toBe(false);
    expect(isCloudinarySuggestionImagePath(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:42`)).toBe(false);
    expect(isCloudinarySuggestionImagePath(null)).toBe(false);
    expect(isCloudinarySuggestionImagePath(undefined)).toBe(false);
  });

  it('parses valid suggestion pointers and rejects the rest', () => {
    expect(
      parseSuggestionImagePointer(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.webp:42`),
    ).toEqual({
      suggestionId: SUG_ID,
      imageId: SUG_IMAGE_ID,
      format: 'webp',
      version: '42',
    });
    expect(parseSuggestionImagePointer('student-1/sug.jpg')).toBeNull();
    expect(
      parseSuggestionImagePointer(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.gif:42`),
    ).toBeNull();
    expect(
      parseSuggestionImagePointer(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.jpg`),
    ).toBeNull();
    expect(
      parseSuggestionImagePointer(`cloudinary:suggestion-images/not-a-sug/${SUG_IMAGE_ID}.jpg:42`),
    ).toBeNull();
  });
});

describe('uploadSuggestionImageToCloudinary', () => {
  it('signs, uploads and returns the bound pointer', async () => {
    const captured: { form: FormData | null } = { form: null };
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/functions/v1/upload-suggestion-image')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
            cloud_name: 'test-cloud',
            api_key: 'test-key',
            timestamp: '1788000000',
            signature: 'test-signature',
            public_id: `suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}`,
            suggestion_id: SUG_ID,
            image_id: SUG_IMAGE_ID,
          }),
        };
      }
      if (target.includes('api.cloudinary.com')) {
        captured.form = (init?.body as FormData | null) ?? null;
        return {
          ok: true,
          status: 200,
          json: async () => ({ format: 'jpg', version: 1788000000 }),
        };
      }
      throw new Error(`unexpected fetch: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    await expect(uploadSuggestionImageToCloudinary(SUG_ID, blob, 'shot.jpg', 'image/jpeg')).resolves.toBe(
      `cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.jpg:1788000000`,
    );

    expect(captured.form).not.toBeNull();
    expect(captured.form?.get('public_id')).toBe(`suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}`);
    expect(captured.form?.get('type')).toBe('authenticated');
    vi.unstubAllGlobals();
  });

  it('rejects a grant for a different suggestion', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        upload_url: 'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
        cloud_name: 'test-cloud',
        api_key: 'test-key',
        timestamp: '1788000000',
        signature: 'test-signature',
        public_id: 'suggestion-images/other-sug/x',
        suggestion_id: 'other-sug',
        image_id: 'x',
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    await expect(uploadSuggestionImageToCloudinary(SUG_ID, blob, 'q.jpg')).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});

describe('deleteSuggestionImage', () => {
  it('calls the delete EF for Cloudinary pointers and never throws', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      deleteSuggestionImage(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.jpg:1788000000`),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/suggestion-image-delete',
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it('skips legacy paths without any fetch', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('must not be called');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteSuggestionImage('student-1/sug.jpg')).resolves.toBeUndefined();
    await expect(deleteSuggestionImage(null)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('swallows EF failures', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: { code: 'destroy_failed' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      deleteSuggestionImage(`cloudinary:suggestion-images/${SUG_ID}/${SUG_IMAGE_ID}.jpg:1788000000`),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe('deleteExamImage', () => {
  it('calls the delete EF for Cloudinary pointers and never throws', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ deleted: true }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      deleteExamImage(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/exam-image-delete',
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it('skips legacy paths without any fetch', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('must not be called');
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(deleteExamImage(`${EXAM_ID}/${IMAGE_ID}.png`)).resolves.toBeUndefined();
    await expect(deleteExamImage(null)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('swallows EF failures', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => ({ error: { code: 'destroy_failed' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      deleteExamImage(`cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`),
    ).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});

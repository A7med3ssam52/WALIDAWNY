// Unit tests for _shared/cloudinary.ts (Phase 10, Cloudinary avatars).
// Pure helpers only — no network, no env. The signature vectors below
// were cross-checked with three independent SHA-1 implementations
// (Node crypto, .NET SHA1, Get-FileHash).

import { assert, assertEqual, deepEqual } from '../_test_helpers.ts';
import {
  AVATAR_DELIVERY_TRANSFORMATION,
  avatarPathFor,
  avatarPublicId,
  buildAuthenticatedDeliveryUrl,
  destroyAvatarAsset,
  EXAM_IMAGE_DELIVERY_TRANSFORMATION,
  examImagePointerFor,
  examImagePublicId,
  parseAvatarPath,
  parseExamImagePointer,
  sha1Hex,
  signDeliveryUrl,
  signUploadParams,
  uploadEndpoint,
} from './cloudinary.ts';

const UID = '70000000-0000-0000-0000-000000000001';
const EXAM_ID = '50000000-0000-0000-0000-000000000001';
const IMAGE_ID = '60000000-0000-0000-0000-000000000001';

Deno.test('cloudinary: avatarPublicId is avatars/<uid>/avatar', () => {
  assertEqual(avatarPublicId(UID), `avatars/${UID}/avatar`);
});

Deno.test('cloudinary: avatarPathFor builds the pointer', () => {
  assertEqual(
    avatarPathFor(UID, 'jpg', '1788000000'),
    `cloudinary:${UID}/avatar.jpg:1788000000`,
  );
});

Deno.test('cloudinary: parseAvatarPath accepts all four extensions', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const parsed = parseAvatarPath(`cloudinary:${UID}/avatar.${ext}:1788000000`);
    assert(parsed !== null, `expected ${ext} to parse`);
    assertEqual(parsed.uid, UID);
    assertEqual(parsed.format, ext);
    assertEqual(parsed.version, '1788000000');
  }
});

Deno.test('cloudinary: parseAvatarPath rejects everything else', () => {
  const bad = [
    null,
    undefined,
    42,
    '',
    `${UID}/avatar.jpg`, // legacy Supabase path
    `cloudinary:${UID}/avatar.gif:1788000000`, // bad ext
    `cloudinary:${UID}/avatar.jpg`, // missing version
    `cloudinary:${UID}/avatar.jpg:latest`, // non-numeric version
    `cloudinary:${UID}/avatar.jpg:`, // empty version
    'cdn:70000000-0000-0000-0000-000000000001/avatar.jpg:1788000000', // wrong prefix
    'cloudinary:not-a-uuid/avatar.jpg:1788000000', // bad uid
    'cloudinary:70000000-0000-0000-0000-000000000004/avatar.jpg:1788000000/extra', // trailing junk
    `CLOUDINARY:${UID}/avatar.jpg:1788000000`, // case-sensitive prefix
  ];
  for (const input of bad) {
    assertEqual(parseAvatarPath(input), null, `expected rejection: ${String(input)}`);
  }
});

Deno.test('cloudinary: sha1Hex matches the reference vector', async () => {
  assertEqual(await sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
});

Deno.test('cloudinary: signUploadParams sorts keys and matches the reference vector', async () => {
  const params = {
    type: 'authenticated',
    timestamp: '1788000000',
    public_id: `avatars/${UID}/avatar`,
    overwrite: 'true',
    invalidate: 'true',
  };
  assertEqual(
    await signUploadParams(params, 'test-secret'),
    '2127c58f00665ab35ae2333ded7557b03c5a285f',
  );
});

Deno.test('cloudinary: signDeliveryUrl matches the reference vector', async () => {
  const toSign = `${AVATAR_DELIVERY_TRANSFORMATION}/v1788000000/avatars/${UID}/avatar.jpg`;
  assertEqual(await signDeliveryUrl(toSign, 'test-secret'), 'XG0a4-QC');
});

Deno.test('cloudinary: delivery URL embeds the signature component', () => {
  const url = buildAuthenticatedDeliveryUrl({
    cloudName: 'demo-cloud',
    publicId: `avatars/${UID}/avatar`,
    format: 'jpg',
    version: '1788000000',
    signature: 'XG0a4-QC',
  });
  assertEqual(
    url,
    `https://res.cloudinary.com/demo-cloud/image/authenticated/s--XG0a4-QC--/${AVATAR_DELIVERY_TRANSFORMATION}/v1788000000/avatars/${UID}/avatar.jpg`,
  );
});

Deno.test('cloudinary: uploadEndpoint targets the image resource type', () => {
  assertEqual(uploadEndpoint('demo-cloud'), 'https://api.cloudinary.com/v1_1/demo-cloud/image/upload');
});

Deno.test('cloudinary: destroyAvatarAsset treats not-found as success', async () => {
  const calls: Array<{ url: string; body: URLSearchParams }> = [];
  const ok = await destroyAvatarAsset({
    cloudName: 'demo-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    publicId: `avatars/${UID}/avatar`,
    timestamp: 1788000000,
    fetchFn: (url, init) => {
      calls.push({ url, body: init.body });
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ result: 'not found' }) });
    },
  });
  assert(deepEqual(ok, { deleted: true }), 'not-found counts as deleted');
  assertEqual(calls.length, 1);
  assert(calls[0].url.includes('/image/destroy'), 'destroy endpoint');
  assertEqual(calls[0].body.get('public_id'), `avatars/${UID}/avatar`);
  assertEqual(calls[0].body.get('type'), 'authenticated');
});

Deno.test('cloudinary: destroyAvatarAsset reports transport failures', async () => {
  const ok = await destroyAvatarAsset({
    cloudName: 'demo-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    publicId: `avatars/${UID}/avatar`,
    timestamp: 1788000000,
    fetchFn: () => Promise.resolve({ status: 400, json: () => Promise.resolve({}) }),
  });
  assert(deepEqual(ok, { deleted: false }), 'transport failure reported');
});

Deno.test('cloudinary: examImagePublicId is exam-images/<exam>/<uuid>', () => {
  assertEqual(examImagePublicId(EXAM_ID, IMAGE_ID), `exam-images/${EXAM_ID}/${IMAGE_ID}`);
});

Deno.test('cloudinary: examImagePointerFor builds the pointer', () => {
  assertEqual(
    examImagePointerFor(EXAM_ID, IMAGE_ID, 'png', '1788000000'),
    `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000`,
  );
});

Deno.test('cloudinary: parseExamImagePointer accepts all four extensions', () => {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const parsed = parseExamImagePointer(
      `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.${ext}:1788000000`,
    );
    assert(parsed !== null, `expected ${ext} to parse`);
    assertEqual(parsed.examId, EXAM_ID);
    assertEqual(parsed.imageId, IMAGE_ID);
    assertEqual(parsed.format, ext);
    assertEqual(parsed.version, '1788000000');
  }
});

Deno.test('cloudinary: parseExamImagePointer rejects everything else', () => {
  const bad = [
    `${EXAM_ID}/${IMAGE_ID}.png`, // legacy Supabase path
    `cloudinary:${UID}/avatar.jpg:1788000000`, // avatar pointer
    `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.gif:1788000000`, // bad ext
    `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png`, // missing version
    `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:latest`, // non-numeric version
    `cloudinary:exam-images/not-an-exam/${IMAGE_ID}.png:1788000000`, // bad exam id
    `cloudinary:exam-images/${EXAM_ID}/not-an-image.png:1788000000`, // bad image id
    `cloudinary:boards/${EXAM_ID}/${IMAGE_ID}.png:1788000000`, // wrong folder
    `cloudinary:exam-images/${EXAM_ID}/${IMAGE_ID}.png:1788000000/extra`, // trailing junk
  ];
  for (const input of bad) {
    assertEqual(parseExamImagePointer(input), null, `expected rejection: ${input}`);
  }
});

Deno.test('cloudinary: exam upload params match the reference vector', async () => {
  const params = {
    type: 'authenticated',
    timestamp: '1788000000',
    public_id: `exam-images/${EXAM_ID}/${IMAGE_ID}`,
    overwrite: 'true',
    invalidate: 'true',
  };
  assertEqual(
    await signUploadParams(params, 'test-secret'),
    'c9d4378c099f6947d859c3cc96c83eeedcf135c4',
  );
});

Deno.test('cloudinary: exam delivery URL matches the reference vector', async () => {
  const toSign =
    `${EXAM_IMAGE_DELIVERY_TRANSFORMATION}/v1788000000/exam-images/${EXAM_ID}/${IMAGE_ID}.png`;
  assertEqual(await signDeliveryUrl(toSign, 'test-secret'), 'reKtufI-');
  const url = buildAuthenticatedDeliveryUrl({
    cloudName: 'demo-cloud',
    publicId: `exam-images/${EXAM_ID}/${IMAGE_ID}`,
    format: 'png',
    version: '1788000000',
    transformation: EXAM_IMAGE_DELIVERY_TRANSFORMATION,
    signature: 'reKtufI-',
  });
  assert(
    url ===
      `https://res.cloudinary.com/demo-cloud/image/authenticated/s--reKtufI---/${EXAM_IMAGE_DELIVERY_TRANSFORMATION}/v1788000000/exam-images/${EXAM_ID}/${IMAGE_ID}.png`,
    `unexpected url: ${url}`,
  );
});

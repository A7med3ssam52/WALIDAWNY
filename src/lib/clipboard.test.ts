import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from './clipboard';

function stubExecCommand(result: boolean) {
  const execCommand = vi.fn(() => result);
  Object.defineProperty(document, 'execCommand', {
    value: execCommand,
    configurable: true,
    writable: true,
  });
  return execCommand;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (document as { execCommand?: unknown }).execCommand;
});

describe('copyText', () => {
  it('uses the async clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await expect(copyText('WLDN-AAAA-BBBB-CCCC')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('WLDN-AAAA-BBBB-CCCC');
  });

  it('falls back to execCommand when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const execCommand = stubExecCommand(true);

    await expect(copyText('WLDN-AAAA-BBBB-CCCC')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand when the clipboard API is missing', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execCommand = stubExecCommand(true);

    await expect(copyText('WLDN-AAAA-BBBB-CCCC')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when both paths fail', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const execCommand = stubExecCommand(false);

    await expect(copyText('WLDN-AAAA-BBBB-CCCC')).resolves.toBe(false);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });
});
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { YouTubeEmbed } from './YouTubeEmbed';

describe('YouTubeEmbed', () => {
  it('renders an iframe with the youtube-nocookie embed url and title', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" title="شرح الفيديو" />);
    const frame = screen.getByTestId('youtube-embed');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(frame).toHaveAttribute('title', 'شرح الفيديو');
    expect(frame).toHaveAttribute('allowfullscreen', '');
  });

  it('falls back to a default title when none is provided', () => {
    render(<YouTubeEmbed videoId="abc123" />);
    expect(screen.getByTestId('youtube-embed')).toHaveAttribute('title', 'فيديو يوتيوب');
  });
});
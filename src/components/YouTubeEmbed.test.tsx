import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { YouTubeEmbed } from './YouTubeEmbed';

describe('YouTubeEmbed', () => {
  it('renders an iframe with the youtube-nocookie embed url and title', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" title="شرح الفيديو" />);
    const frame = screen.getByTestId('youtube-embed');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(frame.getAttribute('src')).toContain('modestbranding=1');
    expect(frame.getAttribute('src')).toContain('rel=0');
    expect(frame.getAttribute('src')).toContain('playsinline=1');
    expect(frame.getAttribute('src')).toContain('iv_load_policy=3');
    expect(frame).toHaveAttribute('title', 'شرح الفيديو');
    expect(frame).toHaveAttribute('allowfullscreen', '');
  });

  it('renders with platform player chrome and visual blocking overlays', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    expect(screen.getByTestId('youtube-embed-wrapper').className).toContain('glass-card');
    const top = screen.getByTestId('youtube-overlay-top');
    const bottom = screen.getByTestId('youtube-overlay-bottom');
    expect(top).toBeInTheDocument();
    expect(bottom).toBeInTheDocument();
    // quick visual hide: overlays must have solid bg to actually hide branding, not just block clicks
    expect(top.className).toContain('bg-black');
    expect(bottom.className).toContain('bg-black');
  });

  it('falls back to a default title when none is provided', () => {
    render(<YouTubeEmbed videoId="abc123" />);
    expect(screen.getByTestId('youtube-embed')).toHaveAttribute('title', 'فيديو الدرس');
  });

  it('does not render any youtube link or opening button', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    expect(screen.queryByText('فتح على يوتيوب')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    const frame = screen.getByTestId('youtube-embed');
    expect(frame.getAttribute('src')).not.toContain('watch?v=');
  });
});

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

  it('renders a clean 16:9 player with no covering overlays', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    expect(screen.getByTestId('youtube-embed-wrapper').className).toContain('glass-card');
    // No overlay may cover the player — controls/fullscreen must stay clickable (RTL-safe).
    expect(screen.queryByTestId('youtube-overlay-top')).not.toBeInTheDocument();
    expect(screen.queryByTestId('youtube-overlay-bottom')).not.toBeInTheDocument();
    // Stable layout: fixed 16:9 box on the container, iframe fills it exactly.
    const frame = screen.getByTestId('youtube-embed');
    expect(frame.className).toContain('absolute');
    expect(frame.className).toContain('inset-0');
    expect(frame.className).toContain('h-full');
    expect(frame.className).toContain('w-full');
    const box = frame.parentElement;
    expect(box?.className).toContain('aspect-video');
    expect(box?.className).toContain('overflow-hidden');
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

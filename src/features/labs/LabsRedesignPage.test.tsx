import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderApp } from '../../test/utils';
import { REDESIGN_TOP_STUDENTS, REDESIGN_UNITS } from './labsRedesignData';

describe('LabsRedesignPage', () => {
  it('renders the Manara hero with CTAs without backend', async () => {
    renderApp('/labs/redesign');

    expect(await screen.findByTestId('labs-redesign', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /عنوان تجريبي ضخم/ })).toBeInTheDocument();
    expect(screen.getByTestId('redesign-hero')).toBeInTheDocument();
    expect(screen.getByTestId('redesign-signup')).toHaveAttribute('href', '/register');
  });

  it('renders all mock units, quotes and sections', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    expect(screen.getByTestId('redesign-units')).toBeInTheDocument();
    for (const unit of REDESIGN_UNITS) {
      expect(screen.getByTestId(unit.id)).toBeInTheDocument();
    }
    expect(screen.getByTestId('redesign-bundle')).toBeInTheDocument();
    expect(screen.getByTestId('redesign-quotes')).toBeInTheDocument();
    expect(
      screen.getAllByText('نص تجريبي قصير لرأي طالب — سطر واحد للمعاينة البصرية فقط.'),
    ).toHaveLength(3);
    expect(screen.getByTestId('redesign-app')).toBeInTheDocument();
    expect(screen.getByTestId('redesign-cta')).toBeInTheDocument();
  });

  it('opens and closes the demo modal', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    fireEvent.click(screen.getByTestId('redesign-demo-open'));
    expect(screen.getByTestId('redesign-demo-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('redesign-demo-close'));
    expect(screen.queryByTestId('redesign-demo-modal')).not.toBeInTheDocument();
  });

  it('filters units by category and updates the count', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    const firstCategory = REDESIGN_UNITS[0].category;
    fireEvent.click(screen.getByTestId(`redesign-filter-${firstCategory}`));
    const expected = REDESIGN_UNITS.filter((unit) => unit.category === firstCategory);
    expect(screen.getByText(`عدد البطاقات المعروضة: ${expected.length.toLocaleString('ar-EG')}`)).toBeInTheDocument();
    for (const unit of expected) {
      expect(screen.getByTestId(unit.id)).toBeInTheDocument();
    }
  });

  it('renders quotes slider controls', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    expect(screen.getByTestId('redesign-quotes-prev')).toBeInTheDocument();
    expect(screen.getByTestId('redesign-quotes-next')).toBeInTheDocument();
  });

  it('opens the mobile drawer as a dialog and closes it with Escape', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'فتح القائمة' }));
    const drawer = await screen.findByTestId('redesign-drawer');
    expect(drawer).toHaveAttribute('role', 'dialog');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('redesign-drawer')).not.toBeInTheDocument();
  });

  it('uses aria-pressed for the filter group', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    expect(screen.getByRole('group', { name: 'فلتر تجريبي للصفوف' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    const firstCategory = REDESIGN_UNITS[0].category;
    fireEvent.click(screen.getByTestId(`redesign-filter-${firstCategory}`));
    expect(screen.getByTestId(`redesign-filter-${firstCategory}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('redesign-filter-الكل')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId(`redesign-filter-${firstCategory}`)).not.toHaveAttribute('aria-selected');
  });

  it('hides the duplicated marquee half from assistive tech', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    const dupes = screen.getAllByText('الطالب ١');
    expect(dupes).toHaveLength(2);
    expect(dupes[0]).toHaveAttribute('aria-hidden', 'false');
    expect(dupes[1]).toHaveAttribute('aria-hidden', 'true');
    const allStudents = screen.getAllByText(/الطالب/);
    expect(allStudents).toHaveLength(REDESIGN_TOP_STUDENTS.length * 2);
    const hiddenCount = allStudents.filter((el) => el.getAttribute('aria-hidden') === 'true').length;
    expect(hiddenCount).toBe(REDESIGN_TOP_STUDENTS.length);
  });

  it('returns focus to the open button after closing the modal', async () => {
    renderApp('/labs/redesign');

    await screen.findByTestId('labs-redesign', {}, { timeout: 5000 });
    const openButton = screen.getByTestId('redesign-demo-open');
    fireEvent.click(openButton);
    expect(await screen.findByTestId('redesign-demo-modal')).toBeInTheDocument();
    const closeButton = screen.getByTestId('redesign-demo-close');
    expect(document.activeElement).toBe(closeButton);
    fireEvent.click(closeButton);
    expect(screen.queryByTestId('redesign-demo-modal')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(openButton);
  });
});

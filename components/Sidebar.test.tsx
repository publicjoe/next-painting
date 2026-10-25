// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

const setup = (names: string[]) => {
  const onAddCategory = vi.fn();
  render(
    <Sidebar
      categories={names.map((name, i) => ({ id: `c${i}`, name }))}
      projects={[]}
      modelsByProject={new Map()}
      selectedCategoryId={null}
      selectedProjectId={null}
      onSelectCategory={() => {}}
      onSelectProject={() => {}}
      onAddCategory={onAddCategory}
      onRenameCategory={() => {}}
      onDeleteCategory={() => {}}
      onExport={() => {}}
      onImport={() => {}}
    />,
  );
  return onAddCategory;
};

const tryAdd = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Add Category' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'New category name' }), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

describe('Sidebar', () => {
  it('is the page h1', () => {
    setup([]);
    expect(screen.getByRole('heading', { level: 1, name: 'Painting Log' })).toBeTruthy();
  });

  it('treats a combining-accent name as a duplicate of the composed one', () => {
    const onAddCategory = setup(['Café']);
    tryAdd('Café');
    expect(screen.getByRole('alert').textContent).toMatch(/already exists/);
    expect(onAddCategory).not.toHaveBeenCalled();
  });

  it('still adds a genuinely different name', () => {
    const onAddCategory = setup(['Café']);
    tryAdd('Cafes');
    expect(onAddCategory).toHaveBeenCalledWith('Cafes');
  });
});

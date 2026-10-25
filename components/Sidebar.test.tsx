// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { HOVER_OPEN_MS } from '@/hooks/useHoverOpen';
import { Sidebar as BareSidebar } from './Sidebar';
import { PaintDndProvider } from './PaintDndProvider';

afterEach(cleanup);

// The sidebar lives inside the app's one drag and drop context (PaintDndProvider), which
// takes the same data and move handlers. These tests are about the sidebar, so it is
// wrapped in a provider that holds no units.
function Sidebar(props: React.ComponentProps<typeof BareSidebar>) {
  return (
    <PaintDndProvider
      categories={props.categories}
      projects={props.projects}
      models={[]}
      onMoveProject={props.onMoveProject}
      onMoveCategory={props.onMoveCategory}
      onMoveModel={() => {}}
    >
      <BareSidebar {...props} />
    </PaintDndProvider>
  );
}

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
      onMoveProject={() => {}}
      onMoveCategory={() => {}}
      expandCategoryId={null}
      onExpanded={() => {}}
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

  describe('Move menus', () => {
    const categories = [
      { id: 'c1', name: 'Space Marines' },
      { id: 'c2', name: 'Orks' },
      { id: 'c3', name: 'Empty' },
    ];
    const projects = [
      { id: 'p1', categoryId: 'c1', name: 'Intercessors' },
      { id: 'p2', categoryId: 'c1', name: 'Hellblasters' },
      { id: 'p3', categoryId: 'c2', name: 'Boyz' },
    ];
    const render3 = (extra: Partial<React.ComponentProps<typeof Sidebar>> = {}) => {
      const onMoveProject = vi.fn();
      const onMoveCategory = vi.fn();
      const props: React.ComponentProps<typeof Sidebar> = {
        categories, projects, modelsByProject: new Map(),
        selectedCategoryId: null, selectedProjectId: null,
        onSelectCategory: () => {}, onSelectProject: () => {}, onAddCategory: () => {},
        onRenameCategory: () => {}, onDeleteCategory: () => {},
        onMoveProject, onMoveCategory, expandCategoryId: null, onExpanded: () => {},
        onExport: () => {}, onImport: () => {}, ...extra,
      };
      const utils = render(<Sidebar {...props} />);
      return { onMoveProject, onMoveCategory, props, ...utils };
    };
    const openMenu = (name: string) => {
      fireEvent.click(screen.getByRole('button', { name }));
      return screen.getByRole('menu');
    };
    const item = (name: string) => screen.getByRole('menuitem', { name });

    it('keeps the project name button and its progress text as before', () => {
      render3({ selectedProjectId: 'p1' });
      const name = screen.getByRole('button', { name: /^Intercessors, 0 of 0 units completed$/ });
      expect(name.getAttribute('aria-current')).toBe('true');
    });

    it('gives every row an always-visible Move button of at least 24 by 24 px', () => {
      render3();
      for (const label of ['Move project Intercessors', 'Move category Orks']) {
        const button = screen.getByRole('button', { name: label });
        expect(button.className).not.toMatch(/opacity-0/);
        expect(button.className).toMatch(/\bmin-h-6\b/);
        expect(button.className).toMatch(/\bmin-w-6\b/);
      }
    });

    it('disables Move up for the first project and Move down for the last', () => {
      render3();
      openMenu('Move project Intercessors');
      expect(item('Move up').getAttribute('aria-disabled')).toBe('true');
      expect(item('Move down').getAttribute('aria-disabled')).toBeNull();
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
      openMenu('Move project Hellblasters');
      expect(item('Move up').getAttribute('aria-disabled')).toBeNull();
      expect(item('Move down').getAttribute('aria-disabled')).toBe('true');
    });

    it('moves a project down within its category, by position among its siblings', () => {
      const { onMoveProject } = render3();
      openMenu('Move project Intercessors');
      fireEvent.click(item('Move down'));
      expect(onMoveProject).toHaveBeenCalledWith('p1', 'c1', 1);
    });

    it('moves a project up within its category', () => {
      const { onMoveProject } = render3();
      openMenu('Move project Hellblasters');
      fireEvent.click(item('Move up'));
      expect(onMoveProject).toHaveBeenCalledWith('p2', 'c1', 0);
    });

    it('does not call the handler for a disabled project option', () => {
      const { onMoveProject } = render3();
      openMenu('Move project Intercessors');
      fireEvent.click(item('Move up'));
      expect(onMoveProject).not.toHaveBeenCalled();
    });

    it('lists Move to every other category and appends to it', () => {
      const { onMoveProject } = render3();
      openMenu('Move project Intercessors');
      const labels = screen.getAllByRole('menuitem').map(i => i.textContent);
      expect(labels).toEqual(['Move up', 'Move down', 'Move to Orks', 'Move to Empty']);
      fireEvent.click(item('Move to Orks'));
      expect(onMoveProject).toHaveBeenCalledWith('p1', 'c2', 1);
    });

    it('moves a project into an empty category at index 0', () => {
      const { onMoveProject } = render3();
      openMenu('Move project Boyz');
      fireEvent.click(item('Move to Empty'));
      expect(onMoveProject).toHaveBeenCalledWith('p3', 'c3', 0);
    });

    it('moves categories up and down among the categories', () => {
      const { onMoveCategory } = render3();
      openMenu('Move category Space Marines');
      expect(item('Move up').getAttribute('aria-disabled')).toBe('true');
      fireEvent.click(item('Move down'));
      expect(onMoveCategory).toHaveBeenLastCalledWith('c1', 1);
      openMenu('Move category Orks');
      fireEvent.click(item('Move up'));
      expect(onMoveCategory).toHaveBeenLastCalledWith('c2', 0);
      openMenu('Move category Empty');
      expect(item('Move down').getAttribute('aria-disabled')).toBe('true');
    });

    it('offers no Move to option on a category menu', () => {
      render3();
      openMenu('Move category Orks');
      expect(screen.getAllByRole('menuitem').map(i => i.textContent)).toEqual(['Move up', 'Move down']);
    });

    it('announces a project move in a polite status region, by name', () => {
      render3();
      const status = within(screen.getByRole('complementary')).getByRole('status');
      expect(status.className).toMatch(/\bsr-only\b/);
      openMenu('Move project Intercessors');
      fireEvent.click(item('Move to Orks'));
      expect(status.textContent).toBe('Moved project "Intercessors" to category "Orks", position 2 of 2.');
      openMenu('Move project Hellblasters');
      fireEvent.click(item('Move up'));
      expect(status.textContent).toBe('Moved project "Hellblasters" to category "Space Marines", position 1 of 2.');
    });

    it('announces a category move', () => {
      render3();
      openMenu('Move category Space Marines');
      fireEvent.click(item('Move down'));
      expect(within(screen.getByRole('complementary')).getByRole('status').textContent).toBe('Moved category "Space Marines", position 2 of 3.');
    });

    it('has no axe violations with menus closed and open', async () => {
      render3();
      const rules = { 'color-contrast': { enabled: false } };
      expect((await axe(document.body, { rules })).violations).toEqual([]);
      openMenu('Move project Intercessors');
      expect((await axe(document.body, { rules })).violations).toEqual([]);
    });

    it('opens a collapsed category when asked to, then calls onExpanded', () => {
      const onExpanded = vi.fn();
      const { rerender, props } = render3({ onExpanded });
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Orks' }));
      expect(screen.queryByRole('list', { name: 'Projects in Orks' })).toBeNull();
      rerender(<Sidebar {...props} onExpanded={onExpanded} expandCategoryId="c2" />);
      expect(screen.getByRole('list', { name: 'Projects in Orks' })).toBeTruthy();
      expect(onExpanded).toHaveBeenCalled();
    });

    it('expands a collapsed target category and focuses the moved, non-viewed project', () => {
      function Harness() {
        const [current, setCurrent] = useState(projects);
        return (
          <Sidebar
            categories={categories} projects={current} modelsByProject={new Map()}
            selectedCategoryId={null} selectedProjectId="p3"
            onSelectCategory={() => {}} onSelectProject={() => {}} onAddCategory={() => {}}
            onRenameCategory={() => {}} onDeleteCategory={() => {}}
            onMoveProject={(id, to) => setCurrent(cur => cur.map(p => (p.id === id ? { ...p, categoryId: to } : p)))}
            onMoveCategory={() => {}} expandCategoryId={null} onExpanded={() => {}}
            onExport={() => {}} onImport={() => {}}
          />
        );
      }
      render(<Harness />);
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Orks' }));
      expect(screen.queryByRole('list', { name: 'Projects in Orks' })).toBeNull();
      openMenu('Move project Intercessors');
      fireEvent.click(item('Move to Orks'));
      const orks = within(screen.getByRole('list', { name: 'Projects in Orks' }));
      expect(document.activeElement).toBe(orks.getByRole('button', { name: 'Move project Intercessors' }));
    });

    it('keeps focus on the moved project Move button after it changes category', () => {
      // Like the real parent, update the projects in the same event as the move
      function Harness() {
        const [current, setCurrent] = useState(projects);
        return (
          <Sidebar
            categories={categories} projects={current} modelsByProject={new Map()}
            selectedCategoryId={null} selectedProjectId={null}
            onSelectCategory={() => {}} onSelectProject={() => {}} onAddCategory={() => {}}
            onRenameCategory={() => {}} onDeleteCategory={() => {}}
            onMoveProject={(id, to) => setCurrent(cur => cur.map(p => (p.id === id ? { ...p, categoryId: to } : p)))}
            onMoveCategory={() => {}} expandCategoryId={null} onExpanded={() => {}}
            onExport={() => {}} onImport={() => {}}
          />
        );
      }
      render(<Harness />);
      openMenu('Move project Intercessors');
      fireEvent.click(item('Move to Orks'));
      const orks = within(screen.getByRole('list', { name: 'Projects in Orks' }));
      expect(document.activeElement).toBe(orks.getByRole('button', { name: 'Move project Intercessors' }));
    });
  });

  // jsdom has no layout, so every rectangle is zero: these tests cover what does
  // not depend on geometry. Pointer drags and real positions are checked in a browser.
  describe('Drag and drop', () => {
    const categories = [
      { id: 'c1', name: 'Space Marines' },
      { id: 'c2', name: 'Orks' },
      { id: 'c3', name: 'Empty' },
    ];
    const projects = [
      { id: 'p1', categoryId: 'c1', name: 'Intercessors' },
      { id: 'p2', categoryId: 'c1', name: 'Hellblasters' },
      { id: 'p3', categoryId: 'c2', name: 'Boyz' },
    ];
    const baseProps = (): React.ComponentProps<typeof Sidebar> => ({
      categories, projects, modelsByProject: new Map(),
      selectedCategoryId: null, selectedProjectId: null,
      onSelectCategory: () => {}, onSelectProject: () => {}, onAddCategory: () => {},
      onRenameCategory: () => {}, onDeleteCategory: () => {},
      onMoveProject: vi.fn(), onMoveCategory: vi.fn(), expandCategoryId: null, onExpanded: () => {},
      onExport: () => {}, onImport: () => {},
    });
    // The keyboard sensor starts listening for keys on the next tick
    const tick = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
    const key = (code: string, target: Element | Document = document) => fireEvent.keyDown(target, { code, key: code === 'Space' ? ' ' : code });
    const pickUp = async (label: string) => {
      const handle = screen.getByRole('button', { name: label });
      handle.focus();
      key('Space', handle);
      await tick();
      return handle;
    };

    it('gives each category and project a focusable, named grip of at least 24 by 24 px', () => {
      render(<Sidebar {...baseProps()} />);
      for (const label of ['Drag Intercessors', 'Drag Boyz', 'Drag Space Marines', 'Drag Empty']) {
        const grip = screen.getByRole('button', { name: label });
        expect(grip.tabIndex).toBe(0);
        expect(grip.className).toMatch(/\bmin-h-6\b/);
        expect(grip.className).toMatch(/\bmin-w-6\b/);
        expect(grip.className).toMatch(/\btouch-none\b/);
        grip.focus();
        expect(document.activeElement).toBe(grip);
      }
    });

    it('unmounts the projects of a collapsed category but keeps its list and aria-controls', () => {
      render(<Sidebar {...baseProps()} />);
      const toggle = screen.getByRole('button', { name: 'Collapse projects in Space Marines' });
      fireEvent.click(toggle);
      const list = document.getElementById(toggle.getAttribute('aria-controls')!);
      expect(list).not.toBeNull();
      expect(list!.hidden).toBe(true);
      expect(list!.children.length).toBe(0);
      expect(screen.queryByText('Intercessors')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Drag Intercessors' })).toBeNull();
    });

    it('gives an empty category a tall drop zone', () => {
      render(<Sidebar {...baseProps()} />);
      const zone = within(screen.getByRole('list', { name: 'Projects in Empty' })).getByText('No projects');
      expect(zone.className).toMatch(/\bmin-h-10\b/);
    });

    it('moves a project with the keyboard, dispatching once on drop', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Intercessors');
      key('ArrowDown');
      key('ArrowDown');
      expect(props.onMoveProject).not.toHaveBeenCalled();
      key('Space');
      expect(props.onMoveProject).toHaveBeenCalledTimes(1);
      expect(props.onMoveProject).toHaveBeenCalledWith('p1', 'c2', 0);
    });

    it('moves a project into an empty category with the keyboard', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Boyz');
      key('ArrowDown');
      key('Enter');
      expect(props.onMoveProject).toHaveBeenCalledWith('p3', 'c3', 0);
    });

    it('moves a project onto a collapsed category with the keyboard, appending to it', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Space Marines' }));
      await pickUp('Drag Boyz');
      key('ArrowUp');
      key('Space');
      expect(props.onMoveProject).toHaveBeenCalledWith('p3', 'c1', 2);
    });

    it('reorders a category with the keyboard', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Space Marines');
      key('ArrowDown');
      key('Space');
      expect(props.onMoveCategory).toHaveBeenCalledWith('c1', 1);
    });

    it('dispatches nothing when Escape cancels a drag', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Intercessors');
      key('ArrowDown');
      key('Escape');
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    it('dispatches nothing when dropped where it started', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Intercessors');
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    it('cancels a drag when the dragged item disappears from the data', async () => {
      const props = baseProps();
      const { rerender } = render(<Sidebar {...props} />);
      await pickUp('Drag Intercessors');
      key('ArrowDown');
      expect(document.querySelector('[data-drag-overlay]')).not.toBeNull();
      // Another tab replaced the data
      rerender(<Sidebar {...props} projects={projects.filter(p => p.id !== 'p1')} />);
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      // Bring the item back, so the drop would resolve to a real move if the drag were still live
      rerender(<Sidebar {...props} />);
      await tick();
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    it('cancels a keyboard drag resting on an empty list when that category disappears', async () => {
      const props = baseProps();
      const { rerender } = render(<Sidebar {...props} />);
      await pickUp('Drag Boyz');
      key('ArrowDown'); // the empty list of c3
      expect(document.querySelector('li.border-blue-400')).not.toBeNull();
      // Another tab deleted the target category
      rerender(<Sidebar {...props} categories={categories.filter(c => c.id !== 'c3')} />);
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      // With the category back, a live drag would drop into it
      rerender(<Sidebar {...props} />);
      await tick();
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    it('cancels a keyboard drag resting on a closed header when that category disappears', async () => {
      const props = baseProps();
      const { rerender } = render(<Sidebar {...props} />);
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Space Marines' }));
      await pickUp('Drag Boyz');
      key('ArrowUp'); // the closed header of c1
      expect(document.querySelector('nav .ring-2')).not.toBeNull();
      rerender(
        <Sidebar {...props} categories={categories.filter(c => c.id !== 'c1')} projects={projects.filter(p => p.categoryId !== 'c1')} />,
      );
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      rerender(<Sidebar {...props} />);
      await tick();
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    it('cancels a keyboard drag on Tab, dispatching nothing', async () => {
      const props = baseProps();
      render(<Sidebar {...props} />);
      await pickUp('Drag Intercessors');
      key('ArrowDown');
      key('ArrowDown');
      key('Tab');
      await tick();
      expect(document.querySelector('[data-drag-overlay]')).toBeNull();
      key('Space');
      expect(props.onMoveProject).not.toHaveBeenCalled();
    });

    // Driven by the keyboard, because jsdom has no layout for a pointer to rest on.
    // The keyboard and the pointer feed the same drop state into the same hover timer.
    describe('resting on a collapsed category', () => {
      beforeEach(() => { vi.useFakeTimers(); });
      afterEach(() => { vi.useRealTimers(); });
      const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
      const pickUpNow = (label: string) => {
        const handle = screen.getByRole('button', { name: label });
        handle.focus();
        key('Space', handle);
        advance(0); // the keyboard sensor listens from the next tick
      };
      const expanded = (name: string) =>
        screen.getByRole('button', { name: new RegExp(`projects in ${name}$`) }).getAttribute('aria-expanded');
      const collapsedSpaceMarines = () => {
        const props = baseProps();
        render(<Sidebar {...props} />);
        fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Space Marines' }));
        pickUpNow('Drag Boyz');
        key('ArrowUp'); // the collapsed header of Space Marines
        return props;
      };

      it('opens it after HOVER_OPEN_MS, and the drop still goes to its end', () => {
        const props = collapsedSpaceMarines();
        advance(HOVER_OPEN_MS - 1);
        expect(expanded('Space Marines')).toBe('false');
        advance(1);
        expect(expanded('Space Marines')).toBe('true');
        key('Space');
        expect(props.onMoveProject).toHaveBeenCalledWith('p3', 'c1', 2);
      });

      it('leaves it shut when the drag moves on before the delay', () => {
        collapsedSpaceMarines();
        advance(HOVER_OPEN_MS - 100);
        key('ArrowDown');
        advance(HOVER_OPEN_MS * 2);
        expect(expanded('Space Marines')).toBe('false');
      });

      it('keeps it open after the drag is cancelled', () => {
        const props = collapsedSpaceMarines();
        advance(HOVER_OPEN_MS);
        key('Escape');
        advance(HOVER_OPEN_MS);
        expect(expanded('Space Marines')).toBe('true');
        expect(props.onMoveProject).not.toHaveBeenCalled();
      });

      it('keeps it open after a drop back where the item started', () => {
        const props = collapsedSpaceMarines();
        advance(HOVER_OPEN_MS);
        key('ArrowDown'); // from the end of Space Marines back to Boyz's own place
        key('Space');
        advance(HOVER_OPEN_MS);
        expect(props.onMoveProject).not.toHaveBeenCalled();
        expect(expanded('Space Marines')).toBe('true');
      });
    });

    it('treats category ids such as constructor and toString as ordinary ids', () => {
      const odd = [{ id: 'constructor', name: 'Necrons' }, { id: 'toString', name: 'Eldar' }];
      render(
        <Sidebar
          {...baseProps()}
          categories={odd}
          projects={[{ id: 'p1', categoryId: 'constructor', name: 'Warriors' }, { id: 'p2', categoryId: 'toString', name: 'Guardians' }]}
        />,
      );
      for (const name of ['Necrons', 'Eldar']) {
        expect(screen.getByRole('button', { name: `Collapse projects in ${name}` }).getAttribute('aria-expanded')).toBe('true');
      }
      expect(screen.getByRole('button', { name: 'Drag Warriors' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Drag Guardians' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Collapse projects in Necrons' }));
      expect(screen.queryByRole('button', { name: 'Drag Warriors' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Expand projects in Necrons' }));
      expect(screen.getByRole('button', { name: 'Drag Warriors' })).toBeTruthy();
    });

    it('offers a separate Move to item for each of two categories with the same name', () => {
      // Import validation allows duplicate names; the add and rename forms do not
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      const props = baseProps();
      render(<Sidebar {...props} categories={[...categories, { id: 'c4', name: 'Orks' }]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Move project Intercessors' }));
      const items = screen.getAllByRole('menuitem', { name: 'Move to Orks' });
      expect(items).toHaveLength(2);
      fireEvent.click(items[1]);
      expect(props.onMoveProject).toHaveBeenCalledWith('p1', 'c4', 0);
      expect(errors.mock.calls.flat().join(' ')).not.toMatch(/same key/);
      errors.mockRestore();
    });

    it('has no axe violations with the grips in place', async () => {
      render(<Sidebar {...baseProps()} />);
      const rules = { 'color-contrast': { enabled: false } };
      expect((await axe(document.body, { rules })).violations).toEqual([]);
    });
  });
});
